import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../infrastructure/redis/redis.module';
import { DistributedLockService } from '../infrastructure/redis/distributed-lock.service';
import { TransitionDefinitionEntity } from '../infrastructure/database/entities/transition-definition.entity';

export interface GatewayMergeResult {
  allArrived: boolean;
  arrivedCount: number;
  expectedCount: number;
}

@Injectable()
export class GatewayEvaluator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly lockService: DistributedLockService,
  ) {}

  /**
   * XOR diverging: evaluate conditions in order, return first truthy transition.
   * Falls back to default transition if no condition matches.
   */
  evaluateExclusiveDiverging(
    transitions: TransitionDefinitionEntity[],
    variables: Record<string, unknown>,
  ): TransitionDefinitionEntity | null {
    // Try each non-default transition in order
    const conditionalTransitions = transitions.filter((t) => !t.isDefault && t.conditionExpression);
    const defaultTransition = transitions.find((t) => t.isDefault) ?? null;

    for (const transition of conditionalTransitions) {
      if (this.evaluateCondition(transition.conditionExpression!, variables)) {
        return transition;
      }
    }

    // Fall back to default
    return defaultTransition;
  }

  /**
   * AND diverging: return all outgoing transitions (all branches execute).
   */
  evaluateParallelDiverging(
    transitions: TransitionDefinitionEntity[],
  ): TransitionDefinitionEntity[] {
    return transitions;
  }

  /**
   * Register a token arriving at a converging gateway.
   * Returns whether all expected tokens have arrived.
   */
  async registerTokenArrival(
    instanceId: string,
    gatewayId: string,
    tokenId: string,
    expectedCount: number,
  ): Promise<GatewayMergeResult> {
    const setKey = `gateway:merge:${instanceId}:${gatewayId}`;
    const lockKey = `gateway-merge:${instanceId}:${gatewayId}`;

    return this.lockService.withLock(lockKey, 5000, async () => {
      await this.redis.sadd(setKey, tokenId);
      const arrivedCount = await this.redis.scard(setKey);

      const allArrived = arrivedCount >= expectedCount;

      if (allArrived) {
        // Set expiry for cleanup — will be cleared explicitly too
        await this.redis.expire(setKey, 60);
      }

      return { allArrived, arrivedCount, expectedCount };
    });
  }

  /**
   * Clear merge state for a gateway after successful merge.
   */
  async clearMergeState(instanceId: string, gatewayId: string): Promise<void> {
    const setKey = `gateway:merge:${instanceId}:${gatewayId}`;
    await this.redis.del(setKey);
  }

  /**
   * Evaluate a condition expression against variables.
   * MVP uses new Function() — safe because only workflow designers (admin/designer role) author conditions.
   */
  private evaluateCondition(expression: string, variables: Record<string, unknown>): boolean {
    try {
      const fn = new Function(...Object.keys(variables), `return (${expression});`);
      return !!fn(...Object.values(variables));
    } catch {
      return false;
    }
  }
}
