import {
  TenantRole,
  AuthProviderType,
  WorkflowStatus,
  ActivityType,
  GatewayDirection,
  InstanceStatus,
  TaskStatus,
  TokenStatus,
  FormFieldType,
  SlaEventType,
} from './enums';

// --- Auth & Tenant ---

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  tenantSlug: string;
  role: TenantRole;
  permissions: string[];
  authProvider: AuthProviderType;
  groups: string[];
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: UserProfile;
  tenant: TenantSummary;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: TenantRole;
  permissions: string[];
  groups: string[];
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
}

// --- API Response Envelope ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// --- Workflow Definition ---

export interface WorkflowDefinitionSummary {
  id: string;
  name: string;
  description?: string;
  version: number;
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDefinitionDto {
  id: string;
  activityId: string;
  type: ActivityType;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  formFields?: FormFieldDefinition[];
  position?: { x: number; y: number };
}

export interface TransitionDefinitionDto {
  id: string;
  sourceActivityId: string;
  targetActivityId: string;
  conditionExpression?: string;
  isDefault?: boolean;
  order?: number;
}

export interface FormFieldDefinition {
  id: string;
  type: FormFieldType;
  label: string;
  key: string;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  description?: string;
  options?: SelectOption[];
  validation?: FormFieldValidation;
  showIf?: string;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface FormFieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
}

// --- Execution ---

export interface WorkflowInstanceSummary {
  id: string;
  workflowDefinitionId: string;
  workflowName: string;
  version: number;
  status: InstanceStatus;
  startedBy: string;
  startedAt: string;
  completedAt?: string;
  variables: Record<string, unknown>;
}

export interface TaskInstanceSummary {
  id: string;
  workflowInstanceId: string;
  activityId: string;
  activityName: string;
  activityType: ActivityType;
  status: TaskStatus;
  assignedTo?: string;
  assignedToName?: string;
  candidateGroups?: string[];
  formFields?: FormFieldDefinition[];
  dueDate?: string;
  priority?: number;
  createdAt: string;
  completedAt?: string;
}

export interface TaskCompletionRequest {
  result: Record<string, unknown>;
  comment?: string;
}

// --- SLA ---

export interface SlaDefinitionDto {
  activityId: string;
  warningThreshold: string;
  breachThreshold: string;
  escalationRules?: EscalationRule[];
}

export interface EscalationRule {
  level: number;
  delayAfterBreach: string;
  action: 'reassign' | 'notify';
  target: string;
}

export interface SlaDefinitionInput {
  bpmnElementId: string;
  warningThresholdSeconds: number | null;
  breachThresholdSeconds: number;
  escalationRules?: EscalationRule[];
  notificationChannels?: string[];
}

// --- Activity Config Input ---

export interface ActivityConfigInput {
  bpmnElementId: string;
  config: Record<string, unknown>;
}

// --- Gateway ---

export interface GatewayConfig {
  direction: GatewayDirection;
  defaultFlowId?: string;
}

// --- Service Task ---

export interface HttpServiceConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffType: 'fixed' | 'exponential' | 'linear';
  initialDelay: number;
  maxDelay: number;
  multiplier?: number;
}

// --- WebSocket Events ---

export enum WsEvent {
  TASK_CREATED = 'task:created',
  TASK_ASSIGNED = 'task:assigned',
  TASK_COMPLETED = 'task:completed',
  INSTANCE_STATUS = 'instance:status',
  SLA_WARNING = 'sla:warning',
  SLA_BREACH = 'sla:breach',
}
