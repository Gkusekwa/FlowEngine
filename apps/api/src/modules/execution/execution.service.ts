import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { WorkflowInstanceEntity } from '../../infrastructure/database/entities/workflow-instance.entity';
import { WorkflowDefinitionEntity } from '../../infrastructure/database/entities/workflow-definition.entity';
import { TaskInstanceEntity } from '../../infrastructure/database/entities/task-instance.entity';
import { ExecutionTokenEntity } from '../../infrastructure/database/entities/execution-token.entity';
import { TaskStateHistoryEntity } from '../../infrastructure/database/entities/task-state-history.entity';
import { DistributedLockService } from '../../infrastructure/redis/distributed-lock.service';
import { EXECUTION_QUEUE } from '../../infrastructure/queues/queue.module';
import { ExecutionJobType } from '../../infrastructure/queues/queue.constants';
import { TokenManager } from '../../engine/token.manager';
import { EventsGateway } from '../websocket/events.gateway';
import { AuditService } from '../audit/audit.service';
import { StartInstanceDto } from './dto/start-instance.dto';
import { InstanceStatus, WorkflowStatus, AuditAction, ErrorCodes } from '@flowengine/shared';

@Injectable()
export class ExecutionService {
  constructor(
    @InjectRepository(WorkflowInstanceEntity)
    private readonly instanceRepo: Repository<WorkflowInstanceEntity>,
    @InjectRepository(WorkflowDefinitionEntity)
    private readonly workflowRepo: Repository<WorkflowDefinitionEntity>,
    @InjectRepository(TaskInstanceEntity)
    private readonly taskRepo: Repository<TaskInstanceEntity>,
    @InjectRepository(ExecutionTokenEntity)
    private readonly tokenRepo: Repository<ExecutionTokenEntity>,
    @InjectRepository(TaskStateHistoryEntity)
    private readonly historyRepo: Repository<TaskStateHistoryEntity>,
    @Inject(EXECUTION_QUEUE) private readonly executionQueue: Queue,
    private readonly lockService: DistributedLockService,
    private readonly tokenManager: TokenManager,
    private readonly eventsGateway: EventsGateway,
    private readonly auditService: AuditService,
  ) {}

  async startWorkflow(
    tenantId: string,
    userId: string,
    dto: StartInstanceDto,
  ): Promise<WorkflowInstanceEntity> {
    // Verify workflow is published
    const workflow = await this.workflowRepo.findOne({
      where: { id: dto.workflowDefinitionId, tenantId },
    });
    if (!workflow) {
      throw new NotFoundException({ code: ErrorCodes.WF_NOT_FOUND, message: 'Workflow not found' });
    }
    if (workflow.status !== WorkflowStatus.PUBLISHED) {
      throw new BadRequestException({
        code: ErrorCodes.WF_NOT_PUBLISHED,
        message: 'Only published workflows can be started',
      });
    }

    // Create instance
    const instance = this.instanceRepo.create({
      tenantId,
      workflowDefinitionId: dto.workflowDefinitionId,
      status: InstanceStatus.CREATED,
      variables: dto.variables || {},
      startedBy: userId,
      correlationId: dto.correlationId || null,
    });

    const saved = await this.instanceRepo.save(instance);

    // Enqueue start execution
    await this.executionQueue.add(
      ExecutionJobType.START_WORKFLOW,
      { tenantId, instanceId: saved.id },
      { jobId: `start-${saved.id}` },
    );

    // Emit WebSocket event
    this.eventsGateway.emitInstanceStatus(tenantId, saved.id, InstanceStatus.CREATED);

    // Audit log
    this.auditService.log({
      tenantId,
      userId,
      action: AuditAction.INSTANCE_STARTED,
      resourceType: 'instance',
      resourceId: saved.id,
      newValues: {
        workflowDefinitionId: dto.workflowDefinitionId,
        workflowName: workflow.name,
        correlationId: dto.correlationId,
      },
    });

    return saved;
  }

  async findAll(
    tenantId: string,
    options: {
      status?: InstanceStatus;
      workflowDefinitionId?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{ items: WorkflowInstanceEntity[]; total: number; page: number; pageSize: number }> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;

    const qb = this.instanceRepo
      .createQueryBuilder('instance')
      .leftJoinAndSelect('instance.workflowDefinition', 'definition')
      .where('instance.tenantId = :tenantId', { tenantId });

    if (options.status) {
      qb.andWhere('instance.status = :status', { status: options.status });
    }
    if (options.workflowDefinitionId) {
      qb.andWhere('instance.workflowDefinitionId = :wfId', { wfId: options.workflowDefinitionId });
    }

    qb.orderBy('instance.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async findOne(tenantId: string, id: string): Promise<WorkflowInstanceEntity> {
    const instance = await this.instanceRepo.findOne({
      where: { id, tenantId },
      relations: ['workflowDefinition', 'tasks', 'tokens'],
    });
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCodes.INSTANCE_NOT_FOUND,
        message: 'Workflow instance not found',
      });
    }
    return instance;
  }

  async cancelInstance(tenantId: string, id: string): Promise<WorkflowInstanceEntity> {
    return this.lockService.withLock(`instance:${id}`, 10000, async () => {
      const instance = await this.instanceRepo.findOne({ where: { id, tenantId } });
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCodes.INSTANCE_NOT_FOUND,
          message: 'Workflow instance not found',
        });
      }
      if (instance.status === InstanceStatus.COMPLETED || instance.status === InstanceStatus.CANCELLED) {
        throw new BadRequestException({
          code: ErrorCodes.INSTANCE_INVALID_STATE,
          message: `Cannot cancel instance in ${instance.status} state`,
        });
      }

      await this.tokenManager.terminateAllTokens(id);
      await this.instanceRepo.update(id, {
        status: InstanceStatus.CANCELLED,
        completedAt: new Date(),
      });

      this.eventsGateway.emitInstanceStatus(tenantId, id, InstanceStatus.CANCELLED);
      this.auditService.log({
        tenantId,
        action: AuditAction.INSTANCE_CANCELLED,
        resourceType: 'instance',
        resourceId: id,
      });

      return this.instanceRepo.findOneOrFail({ where: { id } });
    });
  }

  async suspendInstance(tenantId: string, id: string): Promise<WorkflowInstanceEntity> {
    return this.lockService.withLock(`instance:${id}`, 10000, async () => {
      const instance = await this.instanceRepo.findOne({ where: { id, tenantId } });
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCodes.INSTANCE_NOT_FOUND,
          message: 'Workflow instance not found',
        });
      }
      if (instance.status !== InstanceStatus.RUNNING) {
        throw new BadRequestException({
          code: ErrorCodes.INSTANCE_INVALID_STATE,
          message: 'Only running instances can be suspended',
        });
      }

      await this.instanceRepo.update(id, { status: InstanceStatus.SUSPENDED });

      this.eventsGateway.emitInstanceStatus(tenantId, id, InstanceStatus.SUSPENDED);
      this.auditService.log({
        tenantId,
        action: AuditAction.INSTANCE_SUSPENDED,
        resourceType: 'instance',
        resourceId: id,
      });

      return this.instanceRepo.findOneOrFail({ where: { id } });
    });
  }

  async resumeInstance(tenantId: string, id: string): Promise<WorkflowInstanceEntity> {
    return this.lockService.withLock(`instance:${id}`, 10000, async () => {
      const instance = await this.instanceRepo.findOne({ where: { id, tenantId } });
      if (!instance) {
        throw new NotFoundException({
          code: ErrorCodes.INSTANCE_NOT_FOUND,
          message: 'Workflow instance not found',
        });
      }
      if (instance.status !== InstanceStatus.SUSPENDED) {
        throw new BadRequestException({
          code: ErrorCodes.INSTANCE_INVALID_STATE,
          message: 'Only suspended instances can be resumed',
        });
      }

      await this.instanceRepo.update(id, { status: InstanceStatus.RUNNING });

      this.eventsGateway.emitInstanceStatus(tenantId, id, InstanceStatus.RUNNING);
      this.auditService.log({
        tenantId,
        action: AuditAction.INSTANCE_RESUMED,
        resourceType: 'instance',
        resourceId: id,
      });

      return this.instanceRepo.findOneOrFail({ where: { id } });
    });
  }

  async getTimeline(
    tenantId: string,
    instanceId: string,
  ): Promise<TaskStateHistoryEntity[]> {
    // Verify instance belongs to tenant
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId, tenantId } });
    if (!instance) {
      throw new NotFoundException({
        code: ErrorCodes.INSTANCE_NOT_FOUND,
        message: 'Workflow instance not found',
      });
    }

    return this.historyRepo
      .createQueryBuilder('history')
      .innerJoin('history.taskInstance', 'task')
      .where('task.workflowInstanceId = :instanceId', { instanceId })
      .orderBy('history.changedAt', 'ASC')
      .getMany();
  }
}
