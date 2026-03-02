// Tenant & Auth
export enum TenantRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  DESIGNER = 'designer',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

export enum AuthProviderType {
  LOCAL = 'local',
  LDAP = 'ldap',
  KEYCLOAK = 'keycloak',
  OAUTH2 = 'oauth2',
  SAML = 'saml',
}

// Workflow
export enum WorkflowStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived',
}

export enum ActivityType {
  START_EVENT = 'startEvent',
  END_EVENT = 'endEvent',
  USER_TASK = 'userTask',
  SERVICE_TASK = 'serviceTask',
  SCRIPT_TASK = 'scriptTask',
  BUSINESS_RULE_TASK = 'businessRuleTask',
  SEND_TASK = 'sendTask',
  RECEIVE_TASK = 'receiveTask',
  MANUAL_TASK = 'manualTask',
  EXCLUSIVE_GATEWAY = 'exclusiveGateway',
  PARALLEL_GATEWAY = 'parallelGateway',
  INCLUSIVE_GATEWAY = 'inclusiveGateway',
}

export enum GatewayDirection {
  DIVERGING = 'diverging',
  CONVERGING = 'converging',
  MIXED = 'mixed',
}

// Execution
export enum InstanceStatus {
  CREATED = 'created',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
}

export enum TaskStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  DEAD_LETTER = 'dead_letter',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled',
}

export enum TokenStatus {
  ACTIVE = 'active',
  WAITING = 'waiting',
  COMPLETED = 'completed',
  MERGED = 'merged',
  TERMINATED = 'terminated',
}

// Forms
export enum FormFieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'datetime',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  RADIO = 'radio',
}

// SLA
export enum SlaEventType {
  WARNING = 'warning',
  BREACH = 'breach',
  ESCALATION = 'escalation',
}

// Join Requests
export enum JoinRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

// Audit
export enum AuditAction {
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  WORKFLOW_CREATED = 'workflow.created',
  WORKFLOW_UPDATED = 'workflow.updated',
  WORKFLOW_PUBLISHED = 'workflow.published',
  WORKFLOW_DEPRECATED = 'workflow.deprecated',
  WORKFLOW_ARCHIVED = 'workflow.archived',
  WORKFLOW_DELETED = 'workflow.deleted',
  INSTANCE_STARTED = 'instance.started',
  INSTANCE_COMPLETED = 'instance.completed',
  INSTANCE_FAILED = 'instance.failed',
  INSTANCE_CANCELLED = 'instance.cancelled',
  INSTANCE_SUSPENDED = 'instance.suspended',
  INSTANCE_RESUMED = 'instance.resumed',
  TASK_CREATED = 'task.created',
  TASK_CLAIMED = 'task.claimed',
  TASK_UNCLAIMED = 'task.unclaimed',
  TASK_COMPLETED = 'task.completed',
  TASK_ASSIGNED = 'task.assigned',
  TASK_DELEGATED = 'task.delegated',
  TASK_FAILED = 'task.failed',
  TASK_ESCALATED = 'task.escalated',
  TENANT_CREATED = 'tenant.created',
  TENANT_UPDATED = 'tenant.updated',
  MEMBER_INVITED = 'member.invited',
  MEMBER_REMOVED = 'member.removed',
  MEMBER_ROLE_CHANGED = 'member.role_changed',
  LIBRARY_WORKFLOW_SHARED = 'library.workflow_shared',
  LIBRARY_WORKFLOW_IMPORTED = 'library.workflow_imported',
  LIBRARY_WORKFLOW_UNSHARED = 'library.workflow_unshared',
}
