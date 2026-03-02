// Queue names
export const WORKFLOW_EXECUTION_QUEUE = 'workflow-execution';
export const TASK_PROCESSING_QUEUE = 'task-processing';
export const SLA_MONITORING_QUEUE = 'sla-monitoring';

// Job types for workflow execution queue
export enum ExecutionJobType {
  START_WORKFLOW = 'start-workflow',
  CONTINUE_EXECUTION = 'continue-execution',
}

// Job types for task processing queue
export enum TaskJobType {
  EXECUTE_SERVICE_TASK = 'execute-service-task',
}

// Job types for SLA monitoring queue
export enum SlaJobType {
  CHECK_WARNING = 'check-warning',
  CHECK_BREACH = 'check-breach',
  CHECK_ESCALATION = 'check-escalation',
}

// Job data interfaces
export interface StartWorkflowJobData {
  tenantId: string;
  instanceId: string;
}

export interface ContinueExecutionJobData {
  tenantId: string;
  instanceId: string;
  tokenId: string;
  result?: Record<string, unknown>;
}

export interface ExecuteServiceTaskJobData {
  tenantId: string;
  instanceId: string;
  tokenId: string;
  taskId: string;
  activityDefinitionId: string;
}

export interface SlaCheckJobData {
  tenantId: string;
  taskInstanceId: string;
  slaDefinitionId: string;
  thresholdSeconds: number;
  escalationLevel?: number;
}
