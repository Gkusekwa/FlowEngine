import { ActivityDefinitionEntity } from '../infrastructure/database/entities/activity-definition.entity';

export type TaskHandlerResult = 'completed' | 'waiting' | 'failed';

export interface TaskExecutionContext {
  tenantId: string;
  workflowInstanceId: string;
  tokenId: string;
  activityDefinition: ActivityDefinitionEntity;
  variables: Record<string, unknown>;
}

export interface TaskHandler {
  execute(context: TaskExecutionContext): Promise<TaskHandlerResult>;
}
