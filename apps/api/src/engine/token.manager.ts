import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionTokenEntity } from '../infrastructure/database/entities/execution-token.entity';
import { TokenStatus } from '@flowengine/shared';

@Injectable()
export class TokenManager {
  constructor(
    @InjectRepository(ExecutionTokenEntity)
    private readonly tokenRepo: Repository<ExecutionTokenEntity>,
  ) {}

  async createRootToken(workflowInstanceId: string, activityId: string): Promise<ExecutionTokenEntity> {
    const token = this.tokenRepo.create({
      workflowInstanceId,
      currentActivityId: activityId,
      status: TokenStatus.ACTIVE,
    });
    return this.tokenRepo.save(token);
  }

  async forkTokens(
    parentToken: ExecutionTokenEntity,
    targetActivityIds: string[],
    forkGatewayId: string,
  ): Promise<ExecutionTokenEntity[]> {
    const tokens = targetActivityIds.map((activityId) =>
      this.tokenRepo.create({
        workflowInstanceId: parentToken.workflowInstanceId,
        parentTokenId: parentToken.id,
        currentActivityId: activityId,
        status: TokenStatus.ACTIVE,
        forkGatewayId,
      }),
    );
    return this.tokenRepo.save(tokens);
  }

  async moveToken(tokenId: string, targetActivityId: string): Promise<void> {
    await this.tokenRepo.update(tokenId, {
      currentActivityId: targetActivityId,
      status: TokenStatus.ACTIVE,
    });
  }

  async completeToken(tokenId: string): Promise<void> {
    await this.tokenRepo.update(tokenId, {
      status: TokenStatus.COMPLETED,
      completedAt: new Date(),
    });
  }

  async setWaiting(tokenId: string): Promise<void> {
    await this.tokenRepo.update(tokenId, {
      status: TokenStatus.WAITING,
    });
  }

  async mergeToken(tokenId: string): Promise<void> {
    await this.tokenRepo.update(tokenId, {
      status: TokenStatus.MERGED,
      completedAt: new Date(),
    });
  }

  async terminateToken(tokenId: string): Promise<void> {
    await this.tokenRepo.update(tokenId, {
      status: TokenStatus.TERMINATED,
      completedAt: new Date(),
    });
  }

  async findById(tokenId: string): Promise<ExecutionTokenEntity | null> {
    return this.tokenRepo.findOne({ where: { id: tokenId } });
  }

  async findActiveTokens(workflowInstanceId: string): Promise<ExecutionTokenEntity[]> {
    return this.tokenRepo.find({
      where: { workflowInstanceId, status: TokenStatus.ACTIVE },
    });
  }

  async findWaitingTokens(workflowInstanceId: string): Promise<ExecutionTokenEntity[]> {
    return this.tokenRepo.find({
      where: { workflowInstanceId, status: TokenStatus.WAITING },
    });
  }

  async allTokensCompleted(workflowInstanceId: string): Promise<boolean> {
    const activeCount = await this.tokenRepo.count({
      where: [
        { workflowInstanceId, status: TokenStatus.ACTIVE },
        { workflowInstanceId, status: TokenStatus.WAITING },
      ],
    });
    return activeCount === 0;
  }

  async terminateAllTokens(workflowInstanceId: string): Promise<void> {
    await this.tokenRepo.update(
      { workflowInstanceId, status: TokenStatus.ACTIVE },
      { status: TokenStatus.TERMINATED, completedAt: new Date() },
    );
    await this.tokenRepo.update(
      { workflowInstanceId, status: TokenStatus.WAITING },
      { status: TokenStatus.TERMINATED, completedAt: new Date() },
    );
  }
}
