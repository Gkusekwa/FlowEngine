import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowInstanceEntity } from '../infrastructure/database/entities/workflow-instance.entity';
import { ActivityDefinitionEntity } from '../infrastructure/database/entities/activity-definition.entity';
import { TransitionDefinitionEntity } from '../infrastructure/database/entities/transition-definition.entity';
import { DistributedLockService } from '../infrastructure/redis/distributed-lock.service';
import { TokenManager } from './token.manager';
import { VariableManager } from './variable.manager';
import { GatewayEvaluator } from './gateway.evaluator';
import { TaskExecutorRegistry } from './task-executor.registry';
import { TaskExecutionContext } from './engine.interfaces';
import { ActivityType, InstanceStatus, TokenStatus, GatewayDirection } from '@flowengine/shared';

@Injectable()
export class ExecutionEngineService {
  private readonly logger = new Logger(ExecutionEngineService.name);

  constructor(
    @InjectRepository(WorkflowInstanceEntity)
    private readonly instanceRepo: Repository<WorkflowInstanceEntity>,
    @InjectRepository(ActivityDefinitionEntity)
    private readonly activityRepo: Repository<ActivityDefinitionEntity>,
    @InjectRepository(TransitionDefinitionEntity)
    private readonly transitionRepo: Repository<TransitionDefinitionEntity>,
    private readonly tokenManager: TokenManager,
    private readonly variableManager: VariableManager,
    private readonly gatewayEvaluator: GatewayEvaluator,
    private readonly taskExecutorRegistry: TaskExecutorRegistry,
    private readonly lockService: DistributedLockService,
  ) {}

  /**
   * Start execution of a workflow instance.
   * Finds the start event, creates the root token, and begins advancing.
   */
  async startExecution(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    // Find the start event for this workflow definition
    const startEvent = await this.activityRepo.findOne({
      where: {
        workflowDefinitionId: instance.workflowDefinitionId,
        type: ActivityType.START_EVENT,
      },
    });
    if (!startEvent) throw new Error(`No start event found for workflow ${instance.workflowDefinitionId}`);

    // Set instance to RUNNING
    await this.instanceRepo.update(instanceId, {
      status: InstanceStatus.RUNNING,
      startedAt: new Date(),
    });

    // Create root token at start event
    const token = await this.tokenManager.createRootToken(instanceId, startEvent.id);

    this.logger.log(`Started execution for instance ${instanceId}, token ${token.id} at ${startEvent.name || startEvent.bpmnElementId}`);

    // Advance the token
    await this.advanceToken(tenantId, instanceId, token.id);
  }

  /**
   * Advance a token through the workflow graph.
   * This is the core execution loop.
   * Public method acquires lock, then delegates to internal implementation.
   */
  async advanceToken(tenantId: string, instanceId: string, tokenId: string): Promise<void> {
    await this.lockService.withLock(`instance:${instanceId}`, 30000, async () => {
      await this._advanceTokenInternal(tenantId, instanceId, tokenId);
    });
  }

  /**
   * Internal token advancement - called from within a lock.
   * Handles recursive advancement without re-acquiring the lock.
   */
  private async _advanceTokenInternal(tenantId: string, instanceId: string, tokenId: string): Promise<void> {
    const token = await this.tokenManager.findById(tokenId);
    if (!token || token.status !== TokenStatus.ACTIVE) {
      this.logger.warn(`Token ${tokenId} is not active, skipping advancement`);
      return;
    }

    const activity = await this.activityRepo.findOne({
      where: { id: token.currentActivityId! },
    });
    if (!activity) throw new Error(`Activity ${token.currentActivityId} not found`);

    this.logger.debug(`Advancing token ${tokenId} at activity ${activity.name || activity.bpmnElementId} (${activity.type})`);

    // Check if this is a gateway
    if (this.isGateway(activity.type)) {
      await this.handleGateway(tenantId, instanceId, tokenId, activity);
      return;
    }

    // Get the handler for this activity type
    const handler = this.taskExecutorRegistry.getHandler(activity.type);
    if (!handler) {
      this.logger.error(`No handler registered for activity type: ${activity.type}`);
      await this.failInstance(instanceId, `No handler for activity type: ${activity.type}`);
      return;
    }

    // Build execution context
    const variables = await this.variableManager.getVariables(instanceId);
    const context: TaskExecutionContext = {
      tenantId,
      workflowInstanceId: instanceId,
      tokenId,
      activityDefinition: activity,
      variables,
    };

    // Execute the handler
    const result = await handler.execute(context);

    switch (result) {
      case 'completed':
        await this.moveToNext(tenantId, instanceId, tokenId, activity);
        break;
      case 'waiting':
        await this.tokenManager.setWaiting(tokenId);
        this.logger.debug(`Token ${tokenId} is now waiting at ${activity.name || activity.bpmnElementId}`);
        break;
      case 'failed':
        await this.failInstance(instanceId, `Activity ${activity.name || activity.bpmnElementId} failed`);
        break;
    }
  }

  /**
   * Continue execution after an external event (e.g., task completion).
   * Called when a waiting token should resume.
   */
  async continueExecution(
    tenantId: string,
    instanceId: string,
    tokenId: string,
    result?: Record<string, unknown>,
  ): Promise<void> {
    // Merge result variables if provided
    if (result && Object.keys(result).length > 0) {
      await this.variableManager.mergeVariables(instanceId, result);
    }

    const token = await this.tokenManager.findById(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);

    const activity = await this.activityRepo.findOne({
      where: { id: token.currentActivityId! },
    });
    if (!activity) throw new Error(`Activity ${token.currentActivityId} not found`);

    // Reactivate the token and move to next
    await this.tokenManager.moveToken(tokenId, token.currentActivityId!);
    await this.moveToNext(tenantId, instanceId, tokenId, activity);
  }

  /**
   * Move a token to the next activity in the workflow.
   */
  private async moveToNext(
    tenantId: string,
    instanceId: string,
    tokenId: string,
    currentActivity: ActivityDefinitionEntity,
  ): Promise<void> {
    // Check if this is an end event
    if (currentActivity.type === ActivityType.END_EVENT) {
      await this.tokenManager.completeToken(tokenId);
      await this.checkInstanceCompletion(instanceId);
      return;
    }

    // Find outgoing transitions
    const outgoing = await this.transitionRepo.find({
      where: { sourceActivityId: currentActivity.id },
    });

    if (outgoing.length === 0) {
      // Dead end — complete token and check instance
      this.logger.warn(`No outgoing transitions from ${currentActivity.bpmnElementId}, completing token`);
      await this.tokenManager.completeToken(tokenId);
      await this.checkInstanceCompletion(instanceId);
      return;
    }

    // Single outgoing transition — move token there
    if (outgoing.length === 1) {
      const targetActivity = await this.activityRepo.findOne({
        where: { id: outgoing[0].targetActivityId },
      });
      if (!targetActivity) throw new Error(`Target activity ${outgoing[0].targetActivityId} not found`);

      await this.tokenManager.moveToken(tokenId, targetActivity.id);
      // Release lock before recursive call
    }

    // For single transition, advance again (already within lock)
    if (outgoing.length === 1) {
      await this._advanceTokenInternal(tenantId, instanceId, tokenId);
    }
  }

  /**
   * Handle gateway logic (XOR, AND diverge/converge).
   */
  private async handleGateway(
    tenantId: string,
    instanceId: string,
    tokenId: string,
    gateway: ActivityDefinitionEntity,
  ): Promise<void> {
    const incoming = await this.transitionRepo.find({
      where: { targetActivityId: gateway.id },
    });
    const outgoing = await this.transitionRepo.find({
      where: { sourceActivityId: gateway.id },
    });

    const direction = this.getGatewayDirection(incoming.length, outgoing.length);

    if (gateway.type === ActivityType.EXCLUSIVE_GATEWAY) {
      if (direction === GatewayDirection.DIVERGING || direction === GatewayDirection.MIXED) {
        await this.handleExclusiveDiverging(tenantId, instanceId, tokenId, outgoing);
      } else {
        // Converging XOR — pass through (no merge needed)
        await this.moveToNext(tenantId, instanceId, tokenId, gateway);
      }
    } else if (gateway.type === ActivityType.PARALLEL_GATEWAY) {
      if (direction === GatewayDirection.DIVERGING) {
        await this.handleParallelDiverging(tenantId, instanceId, tokenId, gateway, outgoing);
      } else if (direction === GatewayDirection.CONVERGING) {
        await this.handleParallelConverging(tenantId, instanceId, tokenId, gateway, incoming, outgoing);
      } else {
        // Mixed — treat as diverging for MVP
        await this.handleParallelDiverging(tenantId, instanceId, tokenId, gateway, outgoing);
      }
    }
  }

  private async handleExclusiveDiverging(
    tenantId: string,
    instanceId: string,
    tokenId: string,
    outgoing: TransitionDefinitionEntity[],
  ): Promise<void> {
    const variables = await this.variableManager.getVariables(instanceId);
    const selectedTransition = this.gatewayEvaluator.evaluateExclusiveDiverging(outgoing, variables);

    if (!selectedTransition) {
      await this.failInstance(instanceId, 'No matching transition at exclusive gateway');
      return;
    }

    const targetActivity = await this.activityRepo.findOne({
      where: { id: selectedTransition.targetActivityId },
    });
    if (!targetActivity) throw new Error(`Target activity ${selectedTransition.targetActivityId} not found`);

    await this.tokenManager.moveToken(tokenId, targetActivity.id);
    await this._advanceTokenInternal(tenantId, instanceId, tokenId);
  }

  private async handleParallelDiverging(
    tenantId: string,
    instanceId: string,
    tokenId: string,
    gateway: ActivityDefinitionEntity,
    outgoing: TransitionDefinitionEntity[],
  ): Promise<void> {
    const transitions = this.gatewayEvaluator.evaluateParallelDiverging(outgoing);
    const targetActivityIds = transitions.map((t) => t.targetActivityId);

    // Complete the parent token
    await this.tokenManager.completeToken(tokenId);

    // Get the parent token to use as fork source
    const parentToken = await this.tokenManager.findById(tokenId);
    if (!parentToken) throw new Error(`Token ${tokenId} not found for forking`);

    // Fork into N child tokens
    const childTokens = await this.tokenManager.forkTokens(parentToken, targetActivityIds, gateway.id);

    this.logger.log(`Parallel fork at ${gateway.bpmnElementId}: created ${childTokens.length} tokens`);

    // Advance each child token (already within lock)
    for (const childToken of childTokens) {
      await this._advanceTokenInternal(tenantId, instanceId, childToken.id);
    }
  }

  private async handleParallelConverging(
    tenantId: string,
    instanceId: string,
    tokenId: string,
    gateway: ActivityDefinitionEntity,
    incoming: TransitionDefinitionEntity[],
    outgoing: TransitionDefinitionEntity[],
  ): Promise<void> {
    const token = await this.tokenManager.findById(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);

    const expectedCount = incoming.length;
    const mergeResult = await this.gatewayEvaluator.registerTokenArrival(
      instanceId,
      gateway.id,
      tokenId,
      expectedCount,
    );

    // Mark this token as merged
    await this.tokenManager.mergeToken(tokenId);

    this.logger.debug(`Parallel merge at ${gateway.bpmnElementId}: ${mergeResult.arrivedCount}/${mergeResult.expectedCount}`);

    if (mergeResult.allArrived) {
      // All branches done — clear merge state and create continuation token
      await this.gatewayEvaluator.clearMergeState(instanceId, gateway.id);

      if (outgoing.length > 0) {
        const targetActivity = await this.activityRepo.findOne({
          where: { id: outgoing[0].targetActivityId },
        });
        if (!targetActivity) throw new Error(`Target activity ${outgoing[0].targetActivityId} not found`);

        // Create a new continuation token
        const continuationToken = await this.tokenManager.createRootToken(instanceId, targetActivity.id);
        await this._advanceTokenInternal(tenantId, instanceId, continuationToken.id);
      } else {
        await this.checkInstanceCompletion(instanceId);
      }
    }
    // If not all arrived, just wait — other branches will trigger this method when they arrive
  }

  /**
   * Check if all tokens are done and complete the instance if so.
   */
  private async checkInstanceCompletion(instanceId: string): Promise<void> {
    const allDone = await this.tokenManager.allTokensCompleted(instanceId);
    if (allDone) {
      await this.instanceRepo.update(instanceId, {
        status: InstanceStatus.COMPLETED,
        completedAt: new Date(),
      });
      this.logger.log(`Instance ${instanceId} completed`);
    }
  }

  /**
   * Mark an instance as failed and terminate all active tokens.
   */
  async failInstance(instanceId: string, reason: string): Promise<void> {
    this.logger.error(`Instance ${instanceId} failed: ${reason}`);
    await this.tokenManager.terminateAllTokens(instanceId);
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId }, select: ['id', 'metadata'] });
    const metadata = { ...(instance?.metadata ?? {}), failureReason: reason };
    await this.instanceRepo.update(instanceId, {
      status: InstanceStatus.FAILED,
      completedAt: new Date(),
      metadata,
    });
  }

  private isGateway(type: ActivityType): boolean {
    return type === ActivityType.EXCLUSIVE_GATEWAY ||
      type === ActivityType.PARALLEL_GATEWAY ||
      type === ActivityType.INCLUSIVE_GATEWAY;
  }

  private getGatewayDirection(incomingCount: number, outgoingCount: number): GatewayDirection {
    if (incomingCount <= 1 && outgoingCount > 1) return GatewayDirection.DIVERGING;
    if (incomingCount > 1 && outgoingCount <= 1) return GatewayDirection.CONVERGING;
    return GatewayDirection.MIXED;
  }
}
