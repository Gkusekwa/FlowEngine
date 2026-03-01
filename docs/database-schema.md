# Database Schema

## Multi-Tenancy Model

FlowEngine uses a **shared database, shared schema** multi-tenancy model with row-level security (RLS). Each tenant's data is isolated via `tenant_id` foreign keys and PostgreSQL RLS policies.

```
┌─────────────────────┐
│      tenants        │
├─────────────────────┤
│ id (PK)             │◄─────────────────────────────────────┐
│ name                │                                       │
│ slug (unique)       │       ┌─────────────────────┐        │
│ settings (JSONB)    │       │   auth_providers    │        │
│ is_active           │       ├─────────────────────┤        │
│ created_at          │       │ id (PK)             │        │
└─────────────────────┘       │ tenant_id (FK)      │────────┤
         │                    │ type                │        │
         │                    │ name                │        │
         │ 1:N                │ config (JSONB)      │        │
         ▼                    │ is_default          │        │
┌─────────────────────┐       │ is_active           │        │
│  tenant_memberships │       └─────────────────────┘        │
├─────────────────────┤                                       │
│ id (PK)             │       ┌─────────────────────┐        │
│ tenant_id (FK)      │       │       users         │        │
│ user_id (FK)        │       ├─────────────────────┤        │
│ role                │       │ id (PK)             │        │
│ created_at          │       │ tenant_id (FK)      │────────┤
└─────────────────────┘       │ email               │        │
         │                    │ name                │        │
         │                    │ auth_provider_id    │        │
         └───────────────────►│ external_id         │        │
                              │ role                │        │
                              │ created_at          │        │
                              └─────────────────────┘        │
                                      │                       │
┌─────────────────────┐               │                       │
│  workflow_definitions│◄──────────────┘                       │
├─────────────────────┤                                       │
│ id (PK)             │                                       │
│ tenant_id (FK)      │───────────────────────────────────────┘
│ name                │
│ description         │
│ version             │
│ status              │
│ bpmn_xml            │
│ parsed_definition   │
│ created_by (FK)     │
│ created_at          │
│ updated_at          │
│ published_at        │
└─────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────┐       ┌─────────────────────┐
│ activity_definitions│       │transition_definitions│
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ workflow_def_id (FK)│       │ workflow_def_id (FK)│
│ bpmn_element_id     │◄──────│ bpmn_element_id     │
│ type                │       │ source_activity (FK)│──┐
│ name                │       │ target_activity (FK)│──┤
│ config (JSONB)      │       │ condition_expression│  │
│ position (JSONB)    │       │ is_default          │  │
│ created_at          │       └─────────────────────┘  │
└─────────────────────┘              ▲                 │
         │                           └─────────────────┘
         │ 1:1
         ▼
┌─────────────────────┐
│   sla_definitions   │
├─────────────────────┤
│ id (PK)             │
│ activity_def_id (FK)│
│ warning_threshold_s │
│ breach_threshold_s  │
│ escalation_rules    │
│ notification_channels│
│ created_at          │
│ updated_at          │
└─────────────────────┘

┌─────────────────────┐       ┌─────────────────────┐
│ workflow_instances  │       │   task_instances    │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │──┐    │ id (PK)             │
│ workflow_def_id (FK)│  │    │ workflow_inst_id(FK)│◄─┐
│ workflow_def_version│  │    │ activity_def_id(FK) │  │
│ correlation_id      │  │    │ status              │  │
│ status              │  │    │ assigned_to (FK)    │  │
│ variables (JSONB)   │  │    │ assigned_group      │  │
│ started_at          │  │    │ variables (JSONB)   │  │
│ completed_at        │  │    │ started_at          │  │
│ started_by (FK)     │  │    │ completed_at        │  │
│ metadata (JSONB)    │  │    │ due_at              │  │
└─────────────────────┘  │    │ completed_by (FK)   │  │
                         │    │ completion_result   │  │
                         │    │ completion_comment  │  │
                         │    │ retry_count         │  │
                         │    │ created_at          │  │
                         │    └─────────────────────┘  │
                         │             │               │
                         │             │ 1:N           │
                         │             ▼               │
                         │    ┌─────────────────────┐  │
                         │    │ task_state_history  │  │
                         │    ├─────────────────────┤  │
                         │    │ id (PK)             │  │
                         │    │ task_instance_id(FK)│  │
                         │    │ from_status         │  │
                         │    │ to_status           │  │
                         │    │ changed_by (FK)     │  │
                         │    │ changed_at          │  │
                         │    │ reason              │  │
                         │    │ metadata (JSONB)    │  │
                         │    └─────────────────────┘  │
                         │                             │
                         │    ┌─────────────────────┐  │
                         │    │    sla_events       │  │
                         │    ├─────────────────────┤  │
                         │    │ id (PK)             │  │
                         │    │ task_instance_id(FK)│  │
                         │    │ sla_definition_id   │  │
                         │    │ event_type          │  │
                         │    │ threshold_seconds   │  │
                         │    │ actual_duration_s   │  │
                         │    │ escalation_level    │  │
                         │    │ notification_sent   │  │
                         │    │ notification_sent_at│  │
                         │    │ created_at          │  │
                         │    └─────────────────────┘  │
                         │                             │
                         │    ┌─────────────────────┐  │
                         └───►│  execution_tokens   │  │
                              ├─────────────────────┤  │
                              │ id (PK)             │  │
                              │ workflow_inst_id(FK)│──┘
                              │ parent_token_id(FK) │──┐
                              │ current_activity_id │  │
                              │ status              │  │
                              │ fork_gateway_id     │  │
                              │ created_at          │  │
                              │ completed_at        │  │
                              └─────────────────────┘  │
                                       ▲               │
                                       └───────────────┘
```

## Table Definitions

### tenants

Organizations or accounts in the multi-tenant system.

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,  -- URL-safe identifier
    settings JSONB DEFAULT '{}',
    subscription_plan VARCHAR(50) DEFAULT 'free',
    max_users INTEGER DEFAULT 10,
    max_workflows INTEGER DEFAULT 50,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings structure:
-- {
--   "branding": { "logo": "url", "primaryColor": "#007bff" },
--   "features": { "slaMonitoring": true, "apiAccess": true },
--   "notifications": { "defaultChannels": ["email"] }
-- }

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = TRUE;
```

### auth_providers

Authentication provider configurations per tenant.

```sql
CREATE TABLE auth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,  -- 'local', 'ldap', 'keycloak', 'oauth2', 'saml'
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- Type: 'local' (username/password)
-- Config: { "passwordPolicy": { "minLength": 8, "requireSpecial": true } }

-- Type: 'ldap'
-- Config: {
--   "url": "ldap://ldap.example.com:389",
--   "baseDn": "dc=example,dc=com",
--   "bindDn": "cn=admin,dc=example,dc=com",
--   "bindCredential": "encrypted-password",
--   "userSearchBase": "ou=users",
--   "userSearchFilter": "(uid={{username}})",
--   "usernameAttribute": "uid",
--   "emailAttribute": "mail",
--   "nameAttribute": "cn",
--   "groupSearchBase": "ou=groups",
--   "groupSearchFilter": "(member={{dn}})",
--   "groupNameAttribute": "cn",
--   "startTls": true,
--   "syncInterval": 3600
-- }

-- Type: 'keycloak'
-- Config: {
--   "serverUrl": "https://keycloak.example.com",
--   "realm": "flowengine",
--   "clientId": "flowengine-app",
--   "clientSecret": "encrypted-secret",
--   "adminUsername": "admin",
--   "adminPassword": "encrypted-password",
--   "syncRoles": true,
--   "roleMapping": { "realm-admin": "admin", "workflow-designer": "designer" }
-- }

-- Type: 'oauth2' (generic OAuth2/OIDC)
-- Config: {
--   "authorizationUrl": "https://provider.com/oauth/authorize",
--   "tokenUrl": "https://provider.com/oauth/token",
--   "userInfoUrl": "https://provider.com/oauth/userinfo",
--   "clientId": "client-id",
--   "clientSecret": "encrypted-secret",
--   "scopes": ["openid", "email", "profile"],
--   "userIdClaim": "sub",
--   "emailClaim": "email",
--   "nameClaim": "name"
-- }

-- Type: 'saml'
-- Config: {
--   "entityId": "https://flowengine.example.com/saml/metadata",
--   "ssoUrl": "https://idp.example.com/saml/sso",
--   "certificate": "-----BEGIN CERTIFICATE-----...",
--   "signatureAlgorithm": "sha256",
--   "attributeMapping": { "email": "mail", "name": "displayName" }
-- }

CREATE INDEX idx_auth_providers_tenant ON auth_providers(tenant_id);
CREATE INDEX idx_auth_providers_type ON auth_providers(type);
CREATE INDEX idx_auth_providers_default ON auth_providers(tenant_id, is_default) WHERE is_default = TRUE;
```

### tenant_memberships

Maps users to tenants with tenant-specific roles.

```sql
CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'operator',
    permissions JSONB DEFAULT '[]',  -- Additional fine-grained permissions
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- Roles: 'owner', 'admin', 'designer', 'operator', 'viewer'
-- Permissions: ["workflows:create", "workflows:delete", "instances:cancel", etc.]

CREATE INDEX idx_tenant_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id);
CREATE INDEX idx_tenant_memberships_role ON tenant_memberships(role);
```

### workflow_definitions

Stores workflow templates with BPMN XML and parsed representation.

```sql
CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    bpmn_xml TEXT NOT NULL,
    parsed_definition JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, name, version)
);

-- Status values: 'draft', 'published', 'archived'

CREATE INDEX idx_workflow_definitions_tenant ON workflow_definitions(tenant_id);
CREATE INDEX idx_workflow_definitions_status ON workflow_definitions(tenant_id, status);
CREATE INDEX idx_workflow_definitions_name ON workflow_definitions(tenant_id, name);
CREATE INDEX idx_workflow_definitions_created ON workflow_definitions(tenant_id, created_at DESC);
```

### activity_definitions

Individual steps/nodes within a workflow.

```sql
CREATE TABLE activity_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    bpmn_element_id VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    config JSONB DEFAULT '{}',
    position JSONB DEFAULT '{"x": 0, "y": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_definition_id, bpmn_element_id)
);

-- Type values: 'startEvent', 'endEvent', 'userTask', 'serviceTask',
--              'scriptTask', 'exclusiveGateway', 'parallelGateway', 'inclusiveGateway'

-- Config structure for userTask:
-- {
--   "assignee": "user-id or expression",
--   "candidateGroups": ["group1", "group2"],
--   "formKey": "form-identifier",
--   "formFields": [
--     { "id": "field1", "type": "text", "label": "Field 1", "required": true }
--   ]
-- }

CREATE INDEX idx_activity_definitions_workflow ON activity_definitions(workflow_definition_id);
CREATE INDEX idx_activity_definitions_type ON activity_definitions(type);
```

### transition_definitions

Connections/flows between activities.

```sql
CREATE TABLE transition_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    bpmn_element_id VARCHAR(255) NOT NULL,
    source_activity_id UUID NOT NULL REFERENCES activity_definitions(id) ON DELETE CASCADE,
    target_activity_id UUID NOT NULL REFERENCES activity_definitions(id) ON DELETE CASCADE,
    condition_expression TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_definition_id, bpmn_element_id)
);

-- condition_expression examples:
-- "${approved == true}"
-- "${amount > 10000}"
-- "${priority == 'high' && department == 'finance'}"

CREATE INDEX idx_transition_definitions_source ON transition_definitions(source_activity_id);
CREATE INDEX idx_transition_definitions_target ON transition_definitions(target_activity_id);
```

### sla_definitions

SLA rules attached to activities.

```sql
CREATE TABLE sla_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_definition_id UUID NOT NULL REFERENCES activity_definitions(id) ON DELETE CASCADE,
    warning_threshold_seconds INTEGER,
    breach_threshold_seconds INTEGER NOT NULL,
    escalation_rules JSONB DEFAULT '[]',
    notification_channels JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(activity_definition_id)
);

-- escalation_rules structure:
-- [
--   {
--     "level": 1,
--     "triggerAfterSeconds": 7200,
--     "assignTo": "manager-user-id",
--     "notifyUsers": ["user1", "user2"],
--     "notifyGroups": ["managers"]
--   }
-- ]

-- notification_channels structure:
-- [
--   { "type": "email", "config": { "template": "sla-breach" } },
--   { "type": "slack", "config": { "channel": "#alerts" } }
-- ]

CREATE INDEX idx_sla_definitions_activity ON sla_definitions(activity_definition_id);
```

### workflow_instances

Running or completed workflow executions.

```sql
CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id),
    workflow_definition_version INTEGER NOT NULL,
    correlation_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'running',
    variables JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    started_by UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}'
);

-- Status values: 'running', 'completed', 'failed', 'cancelled', 'suspended'

CREATE INDEX idx_workflow_instances_tenant ON workflow_instances(tenant_id);
CREATE INDEX idx_workflow_instances_definition ON workflow_instances(tenant_id, workflow_definition_id);
CREATE INDEX idx_workflow_instances_status ON workflow_instances(tenant_id, status);
CREATE INDEX idx_workflow_instances_correlation ON workflow_instances(tenant_id, correlation_id);
CREATE INDEX idx_workflow_instances_started ON workflow_instances(tenant_id, started_at DESC);
CREATE INDEX idx_workflow_instances_active ON workflow_instances(tenant_id, status) WHERE status = 'running';
```

### task_instances

Individual tasks within a workflow instance.

```sql
CREATE TABLE task_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    activity_definition_id UUID NOT NULL REFERENCES activity_definitions(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    assigned_to UUID REFERENCES users(id),
    assigned_group VARCHAR(255),
    variables JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    due_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES users(id),
    completion_result JSONB,
    completion_comment TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Status values: 'pending', 'active', 'completed', 'failed', 'skipped'

CREATE INDEX idx_task_instances_workflow ON task_instances(workflow_instance_id);
CREATE INDEX idx_task_instances_status ON task_instances(status);
CREATE INDEX idx_task_instances_assigned ON task_instances(assigned_to);
CREATE INDEX idx_task_instances_group ON task_instances(assigned_group);
CREATE INDEX idx_task_instances_due ON task_instances(due_at) WHERE status IN ('pending', 'active');
CREATE INDEX idx_task_instances_active ON task_instances(status, created_at DESC) WHERE status IN ('pending', 'active');
```

### task_state_history

Audit trail for task state changes.

```sql
CREATE TABLE task_state_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_instance_id UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_task_history_task ON task_state_history(task_instance_id);
CREATE INDEX idx_task_history_changed ON task_state_history(changed_at DESC);
```

### sla_events

Records of SLA warnings, breaches, and escalations.

```sql
CREATE TABLE sla_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_instance_id UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
    sla_definition_id UUID REFERENCES sla_definitions(id),
    event_type VARCHAR(50) NOT NULL,
    threshold_seconds INTEGER NOT NULL,
    actual_duration_seconds INTEGER,
    escalation_level INTEGER DEFAULT 0,
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event types: 'warning', 'breach', 'escalation'

CREATE INDEX idx_sla_events_task ON sla_events(task_instance_id);
CREATE INDEX idx_sla_events_type ON sla_events(event_type);
CREATE INDEX idx_sla_events_created ON sla_events(created_at DESC);
CREATE INDEX idx_sla_events_unacknowledged ON sla_events(acknowledged, created_at DESC) WHERE acknowledged = FALSE;
```

### execution_tokens

Tracks parallel execution branches.

```sql
CREATE TABLE execution_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    parent_token_id UUID REFERENCES execution_tokens(id),
    current_activity_id UUID REFERENCES activity_definitions(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    fork_gateway_id UUID REFERENCES activity_definitions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Status values: 'active', 'waiting', 'completed', 'merged'

CREATE INDEX idx_execution_tokens_workflow ON execution_tokens(workflow_instance_id);
CREATE INDEX idx_execution_tokens_status ON execution_tokens(status);
CREATE INDEX idx_execution_tokens_parent ON execution_tokens(parent_token_id);
CREATE INDEX idx_execution_tokens_activity ON execution_tokens(current_activity_id);
```

### users

User accounts with support for multiple authentication providers.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),              -- NULL for external auth providers
    auth_provider_id UUID REFERENCES auth_providers(id),
    external_id VARCHAR(255),                -- ID from external provider (LDAP DN, Keycloak sub, etc.)
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip VARCHAR(45),
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',             -- Provider-specific user data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(email, auth_provider_id)          -- Same email can exist across providers
);

-- metadata for LDAP users:
-- { "dn": "cn=john,ou=users,dc=example,dc=com", "groups": ["developers", "managers"] }

-- metadata for Keycloak users:
-- { "realmRoles": ["admin"], "clientRoles": {"flowengine": ["designer"]} }

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_provider ON users(auth_provider_id);
CREATE INDEX idx_users_external ON users(auth_provider_id, external_id);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;
```

### user_sessions

Active user sessions for session management.

```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,        -- Hashed refresh token
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
```

### user_groups

Groups for user organization and task assignment.

```sql
CREATE TABLE user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    external_id VARCHAR(255),                -- Synced group ID from LDAP/Keycloak
    auth_provider_id UUID REFERENCES auth_providers(id),
    is_synced BOOLEAN DEFAULT FALSE,         -- TRUE if managed by external provider
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_user_groups_tenant ON user_groups(tenant_id);
CREATE INDEX idx_user_groups_external ON user_groups(auth_provider_id, external_id);
```

### user_group_memberships

Maps users to groups.

```sql
CREATE TABLE user_group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    is_synced BOOLEAN DEFAULT FALSE,         -- TRUE if managed by external provider
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, group_id)
);

CREATE INDEX idx_user_group_memberships_user ON user_group_memberships(user_id);
CREATE INDEX idx_user_group_memberships_group ON user_group_memberships(group_id);
```

---

## Row-Level Security (RLS) Policies

Enable tenant isolation at the database level using PostgreSQL RLS.

### Enable RLS on Tables

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_providers ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (optional, for extra security)
ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;
```

### Create Policies

```sql
-- Workflow definitions: users can only see their tenant's workflows
CREATE POLICY tenant_isolation_workflow_definitions ON workflow_definitions
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Workflow instances: users can only see their tenant's instances
CREATE POLICY tenant_isolation_workflow_instances ON workflow_instances
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Auth providers: users can only see their tenant's providers
CREATE POLICY tenant_isolation_auth_providers ON auth_providers
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- User groups: users can only see their tenant's groups
CREATE POLICY tenant_isolation_user_groups ON user_groups
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### Setting Tenant Context

```sql
-- Set tenant context at the start of each request (in application code)
SET LOCAL app.current_tenant = 'tenant-uuid-here';

-- Or using a function
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tenant_uuid::text, true);
END;
$$ LANGUAGE plpgsql;

-- Usage
SELECT set_tenant_context('123e4567-e89b-12d3-a456-426614174000');
```

### Bypass RLS for Admin Operations

```sql
-- Create a superuser role that bypasses RLS
CREATE ROLE flowengine_admin BYPASSRLS;

-- Grant to application service account for cross-tenant operations
GRANT flowengine_admin TO flowengine_service;
```

---

---

## Reliability & Fault Tolerance Tables

### compensation_handlers

Defines rollback/undo actions for activities to support saga pattern.

```sql
CREATE TABLE compensation_handlers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_definition_id UUID NOT NULL REFERENCES activity_definitions(id) ON DELETE CASCADE,
    handler_type VARCHAR(50) NOT NULL,    -- 'script', 'service', 'workflow'
    config JSONB NOT NULL DEFAULT '{}',
    execution_order INTEGER DEFAULT 0,     -- Order when multiple handlers exist
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- handler_type: 'script' config:
-- { "language": "javascript", "code": "// rollback logic" }

-- handler_type: 'service' config:
-- { "endpoint": "http://service/rollback", "method": "POST", "headers": {} }

-- handler_type: 'workflow' config:
-- { "workflowDefinitionId": "uuid", "inputMapping": {} }

CREATE INDEX idx_compensation_handlers_activity ON compensation_handlers(activity_definition_id);
```

### workflow_checkpoints

State snapshots for resuming long-running workflows after failures.

```sql
CREATE TABLE workflow_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    checkpoint_number INTEGER NOT NULL,
    state_snapshot JSONB NOT NULL,         -- Serialized workflow state
    variables_snapshot JSONB NOT NULL,     -- Workflow variables at checkpoint
    active_tokens JSONB NOT NULL,          -- Execution token states
    compressed BOOLEAN DEFAULT FALSE,
    compression_algorithm VARCHAR(20),     -- 'gzip', 'lz4', etc.
    size_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_instance_id, checkpoint_number)
);

-- state_snapshot structure:
-- {
--   "currentActivities": ["activity-id-1", "activity-id-2"],
--   "completedActivities": ["activity-id-0"],
--   "taskStates": { "task-id": { "status": "active", "assignedTo": "user-id" } }
-- }

CREATE INDEX idx_workflow_checkpoints_instance ON workflow_checkpoints(workflow_instance_id);
CREATE INDEX idx_workflow_checkpoints_latest ON workflow_checkpoints(workflow_instance_id, checkpoint_number DESC);
```

### dead_letter_queue

Failed jobs that exhausted retry attempts for manual inspection.

```sql
CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    queue_name VARCHAR(100) NOT NULL,      -- 'workflow-execution', 'task-processing', etc.
    job_id VARCHAR(255) NOT NULL,
    job_name VARCHAR(255),
    job_data JSONB NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    retry_count INTEGER DEFAULT 0,
    original_queue VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'retried', 'resolved', 'discarded'
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dlq_tenant ON dead_letter_queue(tenant_id);
CREATE INDEX idx_dlq_status ON dead_letter_queue(tenant_id, status);
CREATE INDEX idx_dlq_queue ON dead_letter_queue(tenant_id, queue_name);
CREATE INDEX idx_dlq_failed ON dead_letter_queue(failed_at DESC);
CREATE INDEX idx_dlq_pending ON dead_letter_queue(tenant_id, status, created_at DESC) WHERE status = 'pending';
```

### retry_attempts

History of retry attempts for failed jobs.

```sql
CREATE TABLE retry_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_reference_id VARCHAR(255) NOT NULL,  -- Reference to BullMQ job or task
    job_type VARCHAR(100) NOT NULL,          -- 'workflow_execution', 'service_task', 'notification'
    attempt_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,             -- 'success', 'failed', 'timeout'
    error_message TEXT,
    error_code VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_retry_attempts_job ON retry_attempts(job_reference_id);
CREATE INDEX idx_retry_attempts_type ON retry_attempts(job_type);
CREATE INDEX idx_retry_attempts_status ON retry_attempts(status);
CREATE INDEX idx_retry_attempts_created ON retry_attempts(created_at DESC);
```

### task_delegations

Task delegation and out-of-office records.

```sql
CREATE TABLE task_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_instance_id UUID REFERENCES task_instances(id) ON DELETE CASCADE,  -- NULL for out-of-office rules
    delegation_type VARCHAR(50) NOT NULL,    -- 'task', 'out_of_office', 'permanent'
    from_user_id UUID NOT NULL REFERENCES users(id),
    to_user_id UUID NOT NULL REFERENCES users(id),
    reason TEXT,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,    -- NULL for permanent delegations
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- delegation_type:
-- 'task' - One-time delegation of a specific task
-- 'out_of_office' - Automatic delegation during absence period
-- 'permanent' - Standing delegation (e.g., manager backup)

CREATE INDEX idx_task_delegations_tenant ON task_delegations(tenant_id);
CREATE INDEX idx_task_delegations_task ON task_delegations(task_instance_id);
CREATE INDEX idx_task_delegations_from ON task_delegations(from_user_id);
CREATE INDEX idx_task_delegations_to ON task_delegations(to_user_id);
CREATE INDEX idx_task_delegations_active ON task_delegations(tenant_id, is_active, valid_from, valid_until)
    WHERE is_active = TRUE;
```

---

## Observability Tables

### audit_logs

Immutable audit trail for all system actions.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),  -- NULL for system-level events
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,            -- 'workflow.created', 'task.completed', 'user.login'
    resource_type VARCHAR(100) NOT NULL,     -- 'workflow_definition', 'task_instance', 'user'
    resource_id UUID,
    resource_name VARCHAR(255),
    old_values JSONB,                        -- Previous state (for updates)
    new_values JSONB,                        -- New state
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(255),                 -- Correlation ID for request tracing
    session_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- action examples:
-- 'workflow.created', 'workflow.published', 'workflow.deleted'
-- 'instance.started', 'instance.completed', 'instance.cancelled'
-- 'task.assigned', 'task.completed', 'task.delegated'
-- 'user.login', 'user.logout', 'user.password_changed'
-- 'tenant.settings_updated', 'auth_provider.configured'

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_request ON audit_logs(request_id);

-- Partition by month for large deployments
-- CREATE TABLE audit_logs_y2024m01 PARTITION OF audit_logs
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### workflow_metrics

Aggregated metrics per workflow for analytics and dashboards.

```sql
CREATE TABLE workflow_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    period_type VARCHAR(20) NOT NULL,        -- 'hourly', 'daily', 'weekly', 'monthly'

    -- Instance metrics
    instances_started INTEGER DEFAULT 0,
    instances_completed INTEGER DEFAULT 0,
    instances_failed INTEGER DEFAULT 0,
    instances_cancelled INTEGER DEFAULT 0,

    -- Duration metrics (in seconds)
    avg_duration_seconds NUMERIC(12, 2),
    min_duration_seconds INTEGER,
    max_duration_seconds INTEGER,
    p50_duration_seconds INTEGER,
    p95_duration_seconds INTEGER,
    p99_duration_seconds INTEGER,

    -- Task metrics
    total_tasks_created INTEGER DEFAULT 0,
    total_tasks_completed INTEGER DEFAULT 0,
    avg_task_duration_seconds NUMERIC(12, 2),

    -- SLA metrics
    sla_warnings INTEGER DEFAULT 0,
    sla_breaches INTEGER DEFAULT 0,
    sla_compliance_rate NUMERIC(5, 2),       -- Percentage

    -- Error metrics
    error_count INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    dlq_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_definition_id, period_start, period_type)
);

CREATE INDEX idx_workflow_metrics_tenant ON workflow_metrics(tenant_id);
CREATE INDEX idx_workflow_metrics_workflow ON workflow_metrics(workflow_definition_id);
CREATE INDEX idx_workflow_metrics_period ON workflow_metrics(period_start, period_type);
CREATE INDEX idx_workflow_metrics_compliance ON workflow_metrics(tenant_id, sla_compliance_rate);
```

### trace_spans

Distributed tracing data for end-to-end request tracking.

```sql
CREATE TABLE trace_spans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id VARCHAR(32) NOT NULL,           -- OpenTelemetry trace ID
    span_id VARCHAR(16) NOT NULL,            -- OpenTelemetry span ID
    parent_span_id VARCHAR(16),
    operation_name VARCHAR(255) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    span_kind VARCHAR(20),                   -- 'server', 'client', 'producer', 'consumer', 'internal'

    -- Timing
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,

    -- Context
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),
    workflow_instance_id UUID REFERENCES workflow_instances(id),
    task_instance_id UUID REFERENCES task_instances(id),

    -- Status
    status_code VARCHAR(20),                 -- 'ok', 'error', 'unset'
    status_message TEXT,

    -- Attributes and events
    attributes JSONB DEFAULT '{}',
    events JSONB DEFAULT '[]',               -- Span events/logs

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- attributes example:
-- { "http.method": "POST", "http.url": "/api/v1/tasks/123/complete", "http.status_code": 200 }

-- events example:
-- [{ "name": "task.validated", "timestamp": "...", "attributes": {} }]

CREATE INDEX idx_trace_spans_trace ON trace_spans(trace_id);
CREATE INDEX idx_trace_spans_parent ON trace_spans(parent_span_id);
CREATE INDEX idx_trace_spans_operation ON trace_spans(operation_name);
CREATE INDEX idx_trace_spans_time ON trace_spans(start_time DESC);
CREATE INDEX idx_trace_spans_workflow ON trace_spans(workflow_instance_id);
CREATE INDEX idx_trace_spans_task ON trace_spans(task_instance_id);
CREATE INDEX idx_trace_spans_status ON trace_spans(status_code) WHERE status_code = 'error';

-- Retention: Consider partitioning or automatic cleanup for traces
-- DELETE FROM trace_spans WHERE created_at < NOW() - INTERVAL '7 days';
```

---

## Integration Tables

### webhook_configs

Inbound and outbound webhook configurations.

```sql
CREATE TABLE webhook_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    direction VARCHAR(20) NOT NULL,          -- 'inbound', 'outbound'

    -- Inbound webhook settings
    endpoint_path VARCHAR(255),              -- Generated path for inbound webhooks
    secret_key VARCHAR(255),                 -- For signature verification

    -- Outbound webhook settings
    url VARCHAR(500),
    method VARCHAR(10) DEFAULT 'POST',
    headers JSONB DEFAULT '{}',
    auth_type VARCHAR(50),                   -- 'none', 'basic', 'bearer', 'api_key', 'oauth2'
    auth_config JSONB DEFAULT '{}',          -- Encrypted credentials

    -- Trigger configuration
    trigger_events JSONB DEFAULT '[]',       -- Events that trigger this webhook
    payload_template JSONB,                  -- Custom payload mapping

    -- Retry settings
    retry_enabled BOOLEAN DEFAULT TRUE,
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, name)
);

-- trigger_events examples:
-- ['workflow.started', 'workflow.completed', 'task.completed', 'sla.breach']

-- auth_config for different auth types:
-- basic: { "username": "...", "password": "encrypted" }
-- bearer: { "token": "encrypted" }
-- api_key: { "header": "X-API-Key", "value": "encrypted" }
-- oauth2: { "tokenUrl": "...", "clientId": "...", "clientSecret": "encrypted" }

CREATE INDEX idx_webhook_configs_tenant ON webhook_configs(tenant_id);
CREATE INDEX idx_webhook_configs_direction ON webhook_configs(direction);
CREATE INDEX idx_webhook_configs_active ON webhook_configs(tenant_id, is_active) WHERE is_active = TRUE;
```

### event_triggers

Scheduled and event-based workflow triggers.

```sql
CREATE TABLE event_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50) NOT NULL,       -- 'cron', 'webhook', 'message_queue', 'database_change'
    config JSONB NOT NULL DEFAULT '{}',

    -- Input mapping
    input_variables JSONB DEFAULT '{}',      -- Variables to pass to workflow
    correlation_id_expression VARCHAR(255),  -- Expression to extract correlation ID

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    next_trigger_at TIMESTAMP WITH TIME ZONE,  -- For cron triggers
    trigger_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, name)
);

-- trigger_type: 'cron' config:
-- { "expression": "0 9 * * MON", "timezone": "America/New_York" }

-- trigger_type: 'webhook' config:
-- { "webhookConfigId": "uuid", "pathPattern": "/orders/*" }

-- trigger_type: 'message_queue' config:
-- { "broker": "kafka", "topic": "orders.created", "groupId": "flowengine" }

-- trigger_type: 'database_change' config:
-- { "table": "orders", "operation": "INSERT", "filter": { "status": "pending" } }

CREATE INDEX idx_event_triggers_tenant ON event_triggers(tenant_id);
CREATE INDEX idx_event_triggers_workflow ON event_triggers(workflow_definition_id);
CREATE INDEX idx_event_triggers_type ON event_triggers(trigger_type);
CREATE INDEX idx_event_triggers_next ON event_triggers(next_trigger_at) WHERE is_active = TRUE;
```

### api_keys

Public API key management for external integrations.

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    key_prefix VARCHAR(10) NOT NULL,         -- First 10 chars of key (for identification)
    key_hash VARCHAR(255) NOT NULL,          -- Hashed full key

    -- Permissions
    scopes JSONB DEFAULT '[]',               -- ['workflows:read', 'instances:write', etc.]
    allowed_workflows JSONB,                 -- NULL = all, or specific workflow IDs
    allowed_ips JSONB,                       -- IP whitelist

    -- Rate limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 10000,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, name)
);

-- scopes examples:
-- ['workflows:read', 'workflows:write', 'instances:read', 'instances:write',
--  'tasks:read', 'tasks:write', 'sla:read', 'webhooks:manage']

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_active ON api_keys(tenant_id, is_active) WHERE is_active = TRUE;
```

### event_subscriptions

Kafka/NATS topic subscriptions for event streaming.

```sql
CREATE TABLE event_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    broker_type VARCHAR(50) NOT NULL,        -- 'kafka', 'nats', 'rabbitmq', 'redis_streams'

    -- Connection settings
    connection_config JSONB NOT NULL,        -- Broker-specific connection details

    -- Subscription settings (for consuming)
    subscribe_topics JSONB DEFAULT '[]',
    consumer_group VARCHAR(255),

    -- Publishing settings (for producing)
    publish_topics JSONB DEFAULT '[]',       -- Events to publish and their topics

    -- Event filtering
    event_filter JSONB,                      -- Filter which events to publish/subscribe

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    messages_received INTEGER DEFAULT 0,
    messages_published INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- connection_config for Kafka:
-- { "brokers": ["kafka:9092"], "ssl": true, "sasl": { "mechanism": "PLAIN", "username": "...", "password": "encrypted" } }

-- connection_config for NATS:
-- { "servers": ["nats://localhost:4222"], "token": "encrypted" }

-- publish_topics example:
-- [
--   { "event": "workflow.completed", "topic": "flowengine.workflows.completed" },
--   { "event": "sla.breach", "topic": "flowengine.sla.breaches" }
-- ]

CREATE INDEX idx_event_subscriptions_tenant ON event_subscriptions(tenant_id);
CREATE INDEX idx_event_subscriptions_broker ON event_subscriptions(broker_type);
CREATE INDEX idx_event_subscriptions_active ON event_subscriptions(tenant_id, is_active) WHERE is_active = TRUE;
```

### connector_configs

Pre-built connector configurations for common integrations.

```sql
CREATE TABLE connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connector_type VARCHAR(100) NOT NULL,    -- 'email', 'slack', 'teams', 'rest', 'database', 's3'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',      -- Connector-specific configuration

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,       -- Connection verified successfully
    last_verified_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, name)
);

-- connector_type: 'email' config:
-- { "provider": "smtp", "host": "smtp.example.com", "port": 587, "secure": true,
--   "auth": { "user": "...", "pass": "encrypted" }, "from": "noreply@example.com" }

-- connector_type: 'slack' config:
-- { "webhookUrl": "https://hooks.slack.com/...", "botToken": "encrypted", "defaultChannel": "#general" }

-- connector_type: 'teams' config:
-- { "webhookUrl": "https://outlook.office.com/webhook/..." }

-- connector_type: 'rest' config:
-- { "baseUrl": "https://api.example.com", "auth": { "type": "bearer", "token": "encrypted" },
--   "defaultHeaders": { "Content-Type": "application/json" } }

-- connector_type: 'database' config:
-- { "type": "postgresql", "host": "...", "port": 5432, "database": "...",
--   "username": "...", "password": "encrypted", "ssl": true }

-- connector_type: 's3' config:
-- { "region": "us-east-1", "bucket": "my-bucket",
--   "accessKeyId": "...", "secretAccessKey": "encrypted" }

CREATE INDEX idx_connector_configs_tenant ON connector_configs(tenant_id);
CREATE INDEX idx_connector_configs_type ON connector_configs(connector_type);
CREATE INDEX idx_connector_configs_active ON connector_configs(tenant_id, is_active) WHERE is_active = TRUE;
```

---

## Additional Useful Queries

### Get workflow execution timeline

```sql
SELECT
    'instance_started' as event_type,
    wi.started_at as event_time,
    NULL as activity_name,
    jsonb_build_object('status', wi.status, 'started_by', u.name) as details
FROM workflow_instances wi
LEFT JOIN users u ON wi.started_by = u.id
WHERE wi.id = $1

UNION ALL

SELECT
    'task_' || tsh.to_status as event_type,
    tsh.changed_at as event_time,
    ad.name as activity_name,
    jsonb_build_object('from_status', tsh.from_status, 'changed_by', u.name, 'reason', tsh.reason) as details
FROM task_state_history tsh
JOIN task_instances ti ON tsh.task_instance_id = ti.id
JOIN activity_definitions ad ON ti.activity_definition_id = ad.id
LEFT JOIN users u ON tsh.changed_by = u.id
WHERE ti.workflow_instance_id = $1

UNION ALL

SELECT
    'sla_' || se.event_type as event_type,
    se.created_at as event_time,
    ad.name as activity_name,
    jsonb_build_object('level', se.escalation_level, 'threshold', se.threshold_seconds) as details
FROM sla_events se
JOIN task_instances ti ON se.task_instance_id = ti.id
JOIN activity_definitions ad ON ti.activity_definition_id = ad.id
WHERE ti.workflow_instance_id = $1

ORDER BY event_time ASC;
```

### Get DLQ summary by queue

```sql
SELECT
    queue_name,
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'retried') as retried,
    COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
    COUNT(*) FILTER (WHERE status = 'discarded') as discarded,
    MIN(failed_at) as oldest_failure,
    MAX(failed_at) as newest_failure
FROM dead_letter_queue
WHERE tenant_id = current_setting('app.current_tenant')::uuid
GROUP BY queue_name
ORDER BY pending DESC;
```

### Get active delegations for user

```sql
SELECT
    td.*,
    from_user.name as from_user_name,
    to_user.name as to_user_name,
    ti.id as task_id,
    ad.name as task_name
FROM task_delegations td
JOIN users from_user ON td.from_user_id = from_user.id
JOIN users to_user ON td.to_user_id = to_user.id
LEFT JOIN task_instances ti ON td.task_instance_id = ti.id
LEFT JOIN activity_definitions ad ON ti.activity_definition_id = ad.id
WHERE td.tenant_id = current_setting('app.current_tenant')::uuid
  AND td.is_active = TRUE
  AND (td.from_user_id = $1 OR td.to_user_id = $1)
  AND (td.valid_until IS NULL OR td.valid_until > NOW())
ORDER BY td.created_at DESC;
```

### Get API key usage statistics

```sql
SELECT
    ak.name,
    ak.key_prefix,
    ak.scopes,
    ak.rate_limit_per_minute,
    ak.rate_limit_per_day,
    ak.usage_count,
    ak.last_used_at,
    ak.expires_at,
    CASE
        WHEN ak.expires_at IS NOT NULL AND ak.expires_at < NOW() THEN 'expired'
        WHEN NOT ak.is_active THEN 'revoked'
        ELSE 'active'
    END as status
FROM api_keys ak
WHERE ak.tenant_id = current_setting('app.current_tenant')::uuid
ORDER BY ak.usage_count DESC;
```

### Get connector health status

```sql
SELECT
    connector_type,
    name,
    is_active,
    is_verified,
    last_verified_at,
    last_used_at,
    error_message,
    CASE
        WHEN NOT is_active THEN 'disabled'
        WHEN error_message IS NOT NULL THEN 'error'
        WHEN NOT is_verified THEN 'unverified'
        WHEN last_used_at < NOW() - INTERVAL '24 hours' THEN 'stale'
        ELSE 'healthy'
    END as health_status
FROM connector_configs
WHERE tenant_id = current_setting('app.current_tenant')::uuid
ORDER BY connector_type, name;
```

---

## RLS Policies for New Tables

```sql
-- Enable RLS on new tables
ALTER TABLE compensation_handlers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE trace_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_configs ENABLE ROW LEVEL SECURITY;

-- Create policies for tenant isolation
CREATE POLICY tenant_isolation_dead_letter_queue ON dead_letter_queue
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_task_delegations ON task_delegations
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_workflow_metrics ON workflow_metrics
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_trace_spans ON trace_spans
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_webhook_configs ON webhook_configs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_event_triggers ON event_triggers
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_api_keys ON api_keys
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_event_subscriptions ON event_subscriptions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_connector_configs ON connector_configs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid);
```
