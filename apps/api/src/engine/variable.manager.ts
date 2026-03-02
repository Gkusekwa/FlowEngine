import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowInstanceEntity } from '../infrastructure/database/entities/workflow-instance.entity';

@Injectable()
export class VariableManager {
  constructor(
    @InjectRepository(WorkflowInstanceEntity)
    private readonly instanceRepo: Repository<WorkflowInstanceEntity>,
  ) {}

  async getVariables(instanceId: string): Promise<Record<string, unknown>> {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId },
      select: ['id', 'variables'],
    });
    return instance?.variables ?? {};
  }

  async mergeVariables(instanceId: string, newVars: Record<string, unknown>): Promise<Record<string, unknown>> {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId },
      select: ['id', 'variables'],
    });
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    const merged = { ...instance.variables, ...newVars };
    await this.instanceRepo.update(instanceId, { variables: merged as any });
    return merged;
  }

  /**
   * Merge variables from multiple token branches at a join gateway.
   * Uses last-writer-wins: later token variables override earlier ones.
   */
  mergeAtJoin(tokenVariableSets: Record<string, unknown>[]): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const vars of tokenVariableSets) {
      Object.assign(merged, vars);
    }
    return merged;
  }
}
