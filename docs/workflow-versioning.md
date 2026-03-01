# Workflow Versioning & Multi-Version Execution

This document defines how FlowEngine manages workflow definition versions, supports concurrent execution of multiple versions, handles multi-client tenancy, integrates with external systems across version boundaries, and enforces state machine transitions with full state history.

---

## 1. Version Lifecycle

Every workflow definition follows a strict version lifecycle. Versions are immutable once published -- edits always create a new version.

### Version State Machine

```
                  ┌──────────────────────────────────────────────────────┐
                  │          WORKFLOW VERSION LIFECYCLE                    │
                  └──────────────────────────────────────────────────────┘

                       create            publish           deprecate
              ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
              │                 │  │                  │  │                  │
              ▼                 │  ▼                  │  ▼                  │
         ┌─────────┐      ┌─────────┐          ┌──────────────┐      ┌──────────┐
         │  DRAFT  │─────►│PUBLISHED│─────────►│ DEPRECATED   │─────►│ ARCHIVED │
         └─────────┘      └─────────┘          └──────────────┘      └──────────┘
              │                │                      │
              │                │                      │
              │ discard        │ new version           │ still has
              ▼                ▼ (creates draft v+1)   │ running instances
         ┌─────────┐      ┌─────────┐                │
         │ DELETED │      │ DRAFT   │                │ (cannot archive
         └─────────┘      │  v+1    │                │  until all complete)
                          └─────────┘                │
                                                      ▼
                                                 Wait for instances
                                                 to complete/cancel
```

### Version States

| State | Description | New Instances? | Running Instances? | Editable? |
|-------|-------------|---------------|-------------------|-----------|
| `draft` | Work-in-progress definition, not yet validated for production use | No | No | Yes |
| `published` | Active version, validated and ready for execution | Yes | Yes | No (create new version instead) |
| `deprecated` | Superseded by a newer version, no longer accepting new instances | No | Yes (existing continue) | No |
| `archived` | Fully retired, all instances completed | No | No | No |
| `deleted` | Draft discarded before publication | No | No | No (removed) |

### Allowed State Transitions

| From | To | Trigger | Conditions |
|------|----|---------|------------|
| `draft` | `published` | Designer publishes | BPMN validation passes, at least one start event and one end event |
| `draft` | `deleted` | Designer discards draft | No instances exist (drafts cannot have instances) |
| `published` | `deprecated` | New version published, or manual deprecation | At least one newer published version exists, or explicit admin action |
| `published` | `published` | (no self-transition) | — |
| `deprecated` | `archived` | Admin archives, or auto-archive | Zero running instances for this version |
| `deprecated` | `published` | Admin re-activates | No other published version with same name (or explicit override) |
| `archived` | (none) | Terminal state | — |

### Auto-Deprecation on Publish

When a new version of a workflow is published, FlowEngine automatically deprecates the previously published version of the same workflow (same `tenant_id` + `name`). This means:

- Only **one version** of a given workflow name can be in `published` state at any time per tenant.
- Existing running instances on the old version **continue executing** on the old version's definition. They are never migrated.
- New instance creation requests use the currently `published` version by default.
- Clients can explicitly request a specific version if needed (see Section 4).

---

## 2. Multi-Version Concurrent Execution

### Problem

When a new workflow version is published, there may be dozens or hundreds of instances still running on the previous version. These must continue executing with the exact definition they started with -- the process model, gateway conditions, task configurations, SLA rules, and form definitions that were in effect when the instance was created.

### Version Pinning

Every workflow instance is pinned to the exact version it was started with. This pinning is immutable for the lifetime of the instance.

```
┌──────────────────────────────────────────────────────────┐
│                VERSION PINNING MODEL                       │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  workflow_instances table:                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ id:                      inst-001                     │ │
│  │ workflow_definition_id:  wf-approval                  │ │
│  │ workflow_definition_version: 3    ◄── pinned at v3    │ │
│  │ status:                  running                      │ │
│  │ started_at:              2024-01-10T09:00:00Z         │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Meanwhile, v4 is published on 2024-01-12:                │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ workflow_definitions table:                            │ │
│  │                                                        │ │
│  │  wf-approval v3  status: deprecated                   │ │
│  │  wf-approval v4  status: published                    │ │
│  │                                                        │ │
│  │  inst-001 continues on v3 definition                  │ │
│  │  New instances start on v4 definition                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### How Version Pinning Works

1. **Instance creation.** When a new workflow instance is created, the system resolves the target version: either the currently published version (default) or a specific version if explicitly requested. The `workflow_definition_id` and `workflow_definition_version` are recorded on the instance and never changed.

2. **Definition loading.** Every time the execution engine processes a step for an instance (task activation, gateway evaluation, token advancement), it loads the workflow definition using the instance's pinned `workflow_definition_id` and `workflow_definition_version` -- not the "latest" version.

3. **Definition caching.** Published and deprecated definitions are cached in Redis with a long TTL (1 hour). Since they are immutable once published, the cache only needs invalidation if a definition is re-activated from deprecated to published (rare).

4. **No migration.** Running instances are never migrated to a new version. If a workflow definition changes in a way that is incompatible with in-flight instances, those instances continue running on the old definition until they complete, fail, or are manually cancelled.

### Concurrent Version Visibility

At any moment, the system may have instances running on multiple versions of the same workflow:

| Workflow | Version | Status | Running Instances |
|----------|---------|--------|-------------------|
| Order Approval | v1 | archived | 0 |
| Order Approval | v2 | deprecated | 12 (completing) |
| Order Approval | v3 | deprecated | 47 (completing) |
| Order Approval | v4 | published | 23 (new) |
| Order Approval | v5 | draft | 0 (being designed) |

### Dashboard Queries

The dashboard and API support filtering instances by version:

```
GET /api/v1/instances?workflowName=order-approval&version=3     → instances on v3
GET /api/v1/instances?workflowName=order-approval&version=all   → all versions
GET /api/v1/instances?workflowName=order-approval               → defaults to all active versions
```

### Version-Aware Metrics

Prometheus metrics include a `version` label so operators can monitor the health and throughput of each version independently:

```
flowengine_workflow_instances_total{workflow="order-approval", version="3", status="running"} 47
flowengine_workflow_instances_total{workflow="order-approval", version="4", status="running"} 23
flowengine_task_duration_seconds{workflow="order-approval", version="3", task="manager-review"} ...
flowengine_task_duration_seconds{workflow="order-approval", version="4", task="manager-review"} ...
```

---

## 3. Multi-Client Tenancy

### Problem

A single tenant may have multiple client applications (e.g., a web portal, a mobile app, a back-office tool, an external partner system) that all interact with the same workflow engine. Each client may have different permissions, rate limits, and integration patterns.

### Client Model

```
┌──────────────────────────────────────────────────────────┐
│                    MULTI-CLIENT TENANCY                    │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Tenant: "Acme Corp"                                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │  Client 1: Web Portal                                 │ │
│  │  ├── API Key: fe_live_web_xxxx                        │ │
│  │  ├── Scopes: workflows:read, instances:*, tasks:*     │ │
│  │  ├── Rate Limit: 300 req/min (Professional)           │ │
│  │  └── IP Whitelist: (none - public access)             │ │
│  │                                                        │ │
│  │  Client 2: Mobile App                                 │ │
│  │  ├── API Key: fe_live_mobile_xxxx                     │ │
│  │  ├── Scopes: instances:read, tasks:*                  │ │
│  │  ├── Rate Limit: 120 req/min (Starter)                │ │
│  │  └── IP Whitelist: (none - public access)             │ │
│  │                                                        │ │
│  │  Client 3: Back-Office Tool                           │ │
│  │  ├── API Key: fe_live_backoffice_xxxx                 │ │
│  │  ├── Scopes: workflows:*, instances:*, tasks:*, sla:* │ │
│  │  ├── Rate Limit: 300 req/min                          │ │
│  │  └── IP Whitelist: 10.0.0.0/8                         │ │
│  │                                                        │ │
│  │  Client 4: ERP Integration                            │ │
│  │  ├── API Key: fe_live_erp_xxxx                        │ │
│  │  ├── Scopes: instances:create, instances:read         │ │
│  │  ├── Rate Limit: 60 req/min (Free)                    │ │
│  │  ├── IP Whitelist: 192.168.1.100                      │ │
│  │  └── Allowed Workflows: ["order-approval"]            │ │
│  │                                                        │ │
│  │  Client 5: Partner Portal (OAuth2 user context)       │ │
│  │  ├── Auth: OAuth2/JWT (not API key)                   │ │
│  │  ├── Role: operator                                   │ │
│  │  └── Groups: ["partner-reviews"]                      │ │
│  │                                                        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Client Identification

Every API request is associated with a client identity through one of two mechanisms:

| Auth Method | Client Identity | Use Case |
|-------------|----------------|----------|
| API Key (`Authorization: Bearer fe_live_xxx`) | Identified by the API key record (name, scopes, limits) | Server-to-server, automated integrations |
| JWT Token (`Authorization: Bearer eyJ...`) | Identified by user + auth provider + session | Interactive users via web/mobile/partner portals |

### Per-Client Configuration

Each API key record (representing a client) can be configured with:

| Setting | Description | Default |
|---------|-------------|---------|
| `name` | Human-readable client identifier | Required |
| `scopes` | Permission scopes granted to this client | Required |
| `ipWhitelist` | CIDR ranges allowed to use this key | Empty (all IPs) |
| `allowedWorkflows` | Workflow definition IDs this client can interact with | Empty (all workflows) |
| `rateLimitTier` | Rate limit tier override for this client | Tenant default |
| `expiresAt` | Key expiration date | None (no expiry) |
| `metadata` | Arbitrary key-value metadata for auditing | `{}` |

### Client-Scoped Audit Trail

All API requests are audit-logged with the client identity:

| Audit Field | API Key Requests | JWT Requests |
|-------------|-----------------|--------------|
| `client_type` | `api_key` | `user_session` |
| `client_id` | API key UUID | User session UUID |
| `client_name` | API key name (e.g., "ERP Integration") | User email |
| `auth_method` | `api_key` | `local`, `ldap`, `keycloak`, `oauth2`, `saml` |
| `scopes_used` | Scopes required for the operation | Permissions from JWT |

### Workflow-Scoped API Keys

A client can be restricted to specific workflows. This is useful for external integrations that should only interact with a specific process:

- If `allowedWorkflows` is empty, the client can access all workflows in the tenant.
- If `allowedWorkflows` contains workflow definition IDs, the client can only:
  - Read those workflow definitions
  - Create instances of those workflows
  - View and interact with tasks from instances of those workflows
  - View SLA events for tasks in those workflows

Any request targeting a workflow not in the allowed list returns an `AUTHZ_RESOURCE_ACCESS_DENIED` error.

---

## 4. External System Integration Across Versions

### Problem

When an external system (ERP, CRM, payment gateway) is integrated with FlowEngine via webhooks, API calls, or message queues, it must handle the fact that workflow versions change over time. The external system may:

- Receive callbacks from instances running on different versions
- Need to start instances on a specific version
- Correlate messages to instances regardless of version

### Version-Aware API

#### Starting an Instance on a Specific Version

By default, `POST /api/v1/instances` starts an instance on the currently published version. External systems can pin to a specific version:

```http
POST /api/v1/instances
Authorization: Bearer fe_live_erp_xxxx
X-Tenant: acme
Content-Type: application/json

{
  "workflowDefinitionId": "wf-order-approval",
  "version": 3,
  "correlationId": "ORDER-12345",
  "variables": {
    "orderId": "12345",
    "amount": 500
  }
}
```

| `version` value | Behavior |
|----------------|----------|
| Omitted | Use the currently `published` version |
| Specific number (e.g., `3`) | Use exactly version 3 (must be `published` or `deprecated`) |
| `"latest"` | Explicit alias for the currently `published` version |

If the requested version is in `draft` or `archived` state, the request fails with a `WORKFLOW_NOT_PUBLISHED` error.

If the requested version is `deprecated`, the instance is created with a response header `X-FlowEngine-Version-Deprecated: true` and a `deprecation` field in the response body warning the client.

#### Version Information in Responses

All instance and task responses include version information so external systems can adapt:

```json
{
  "id": "inst-001",
  "workflowDefinitionId": "wf-order-approval",
  "workflowVersion": 3,
  "workflowVersionStatus": "deprecated",
  "latestPublishedVersion": 4,
  "status": "running",
  "correlationId": "ORDER-12345"
}
```

#### Version Information in Webhook Payloads

Outbound webhook payloads always include the workflow version:

```json
{
  "event": "task.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "taskId": "task-456",
    "instanceId": "inst-001",
    "workflowName": "order-approval",
    "workflowVersion": 3,
    "workflowVersionStatus": "deprecated",
    "taskType": "userTask",
    "taskName": "Manager Review",
    "assignedTo": null,
    "candidateGroups": ["managers"]
  }
}
```

This allows external systems to:
- Route handling logic based on version (e.g., different form fields in v3 vs v4)
- Log which version each interaction belongs to
- Detect when they are interacting with a deprecated version and plan migration

### Correlation Across Versions

External systems use `correlationId` to track business entities across workflow instances regardless of version. The correlation ID is version-agnostic:

```
GET /api/v1/instances?correlationId=ORDER-12345
```

This returns all instances (across all versions) that share the same correlation ID. The response includes the version of each instance so the caller can distinguish them.

### Version Compatibility Contract

When a new version introduces breaking changes to the external integration points (different variable names, different task names, changed webhook payloads), the recommended approach is:

1. **Document breaking changes** in the workflow definition's `metadata.changelog` field.
2. **Use the deprecation period** to allow external systems to update their integration.
3. **Do not archive** the old version until all external systems confirm migration.
4. **Version webhook URLs** if the payload structure changes significantly (e.g., `/webhooks/v3/order-created` vs `/webhooks/v4/order-created`).

---

## 5. Instance & Task State Machine

### Problem

Every workflow instance and task has a well-defined lifecycle. External systems and the UI need to know:
- What state a resource is currently in
- What states it can transition to next
- What state it was in previously

### Workflow Instance State Machine

```
┌──────────────────────────────────────────────────────────┐
│              WORKFLOW INSTANCE STATE MACHINE                │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────┐  start    ┌──────────┐                      │
│  │ CREATED  │─────────►│ RUNNING  │                      │
│  └──────────┘           └──────────┘                      │
│                              │  │  │                      │
│                    complete   │  │  │ error                │
│                    ┌─────────┘  │  └──────────┐           │
│                    │            │              │           │
│                    ▼         suspend           ▼           │
│              ┌───────────┐    │         ┌──────────┐      │
│              │ COMPLETED │    │         │  FAILED  │      │
│              └───────────┘    │         └──────────┘      │
│                               ▼              │            │
│                         ┌───────────┐        │ retry      │
│             cancel      │ SUSPENDED │        │            │
│         ┌───────────────└───────────┘        │            │
│         │                    │               │            │
│         │               resume               │            │
│         │                    │               │            │
│         │                    ▼               │            │
│         │              ┌──────────┐          │            │
│         │              │ RUNNING  │◄─────────┘            │
│         │              └──────────┘                       │
│         │                    │                             │
│         │               cancel                            │
│         ▼                    │                             │
│    ┌───────────┐             │                             │
│    │ CANCELLED │◄────────────┘                             │
│    └───────────┘                                           │
│                                                            │
│  Terminal states: COMPLETED, CANCELLED                     │
│  FAILED can be retried (back to RUNNING) or cancelled     │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Instance State Definitions

| State | Description | Next States | Previous States |
|-------|-------------|-------------|-----------------|
| `created` | Instance record exists, execution not yet started (transient, typically milliseconds) | `running` | (none - initial) |
| `running` | Actively executing, tasks being processed | `completed`, `failed`, `suspended`, `cancelled` | `created`, `suspended`, `failed` (retry) |
| `completed` | All paths reached an end event successfully | (terminal) | `running` |
| `failed` | Execution encountered an unrecoverable error | `running` (retry), `cancelled` | `running` |
| `suspended` | Manually paused by an operator or system | `running` (resume), `cancelled` | `running` |
| `cancelled` | Manually terminated before natural completion | (terminal) | `running`, `failed`, `suspended` |

### Instance State Transition Rules

| Transition | Trigger | Conditions | Side Effects |
|------------|---------|------------|--------------|
| `created` → `running` | Instance start | Start event found in definition | Create initial token, activate first task(s) |
| `running` → `completed` | Last token reaches end event | All active tokens completed | Cancel pending SLA jobs, emit `instance.completed` |
| `running` → `failed` | Task handler throws unrecoverable error | Max retries exhausted, or error is non-retryable | Move failed task to DLQ, emit `instance.failed` |
| `running` → `suspended` | Operator suspends via API | Instance is in `running` state | Pause all active tokens, pause SLA timers |
| `running` → `cancelled` | Operator cancels via API | Instance is in `running` state | Cancel all active tasks, cancel SLA jobs, emit `instance.cancelled` |
| `failed` → `running` | Operator retries from checkpoint | Checkpoint exists for this instance | Resume from last checkpoint, restart SLA monitoring |
| `failed` → `cancelled` | Operator cancels failed instance | Instance is in `failed` state | Clean up DLQ entries, emit `instance.cancelled` |
| `suspended` → `running` | Operator resumes via API | Instance is in `suspended` state | Resume paused tokens, restart SLA timers |
| `suspended` → `cancelled` | Operator cancels suspended instance | Instance is in `suspended` state | Clean up, emit `instance.cancelled` |

### Task Instance State Machine

```
┌──────────────────────────────────────────────────────────┐
│                TASK INSTANCE STATE MACHINE                  │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────┐  activate   ┌──────────┐  complete          │
│  │ PENDING  │────────────►│  ACTIVE  │───────────┐        │
│  └──────────┘              └──────────┘           │        │
│       │                        │   │              │        │
│       │ skip                   │   │ fail         ▼        │
│       ▼                        │   │        ┌───────────┐  │
│  ┌──────────┐                  │   │        │ COMPLETED │  │
│  │ SKIPPED  │                  │   │        └───────────┘  │
│  └──────────┘                  │   ▼                       │
│                                │ ┌──────────┐              │
│                          cancel│ │  FAILED  │              │
│                                │ └──────────┘              │
│                                │      │  │                 │
│                                │      │  │ retry           │
│                                │      │  ▼                 │
│                                │ ┌───────────┐            │
│                                │ │ RETRYING  │──► ACTIVE   │
│                                │ └───────────┘            │
│                                │      │                    │
│                                │      │ max retries        │
│                                │      ▼                    │
│                                │ ┌─────────────┐          │
│                                │ │ DEAD_LETTER │          │
│                                │ └─────────────┘          │
│                                ▼                           │
│                          ┌───────────┐                     │
│                          │ CANCELLED │                     │
│                          └───────────┘                     │
│                                                            │
│  Terminal states: COMPLETED, SKIPPED, DEAD_LETTER,        │
│                   CANCELLED                                │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Task State Definitions

| State | Description | Next States | Previous States |
|-------|-------------|-------------|-----------------|
| `pending` | Task created, waiting to be activated | `active`, `skipped`, `cancelled` | (none - initial) |
| `active` | Task is ready for work (assigned or in group queue) | `completed`, `failed`, `cancelled` | `pending`, `retrying` |
| `completed` | Task finished successfully | (terminal) | `active` |
| `failed` | Task execution failed | `retrying`, `dead_letter`, `cancelled` | `active` |
| `retrying` | Task is being retried after failure | `active`, `failed` | `failed` |
| `skipped` | Task was bypassed due to conditional flow | (terminal) | `pending` |
| `dead_letter` | Task exceeded max retries, requires manual intervention | `cancelled` | `failed` |
| `cancelled` | Task was cancelled (parent instance cancelled or operator action) | (terminal) | `pending`, `active`, `failed`, `dead_letter` |

### Task State Transition Rules

| Transition | Trigger | Conditions | Side Effects |
|------------|---------|------------|--------------|
| `pending` → `active` | Token arrives, handler executes | Previous activity completed | Schedule SLA monitoring, emit `task.created`, notify assignees |
| `pending` → `skipped` | Gateway evaluation skips this path | Condition evaluates to false | Emit `task.skipped` |
| `active` → `completed` | User submits form / service task succeeds | Form validation passes, user authorized | Cancel SLA jobs, record completion, emit `task.completed`, enqueue `CONTINUE_EXECUTION` |
| `active` → `failed` | Handler throws error / timeout | Error occurred during execution | Increment retry count, emit `task.failed` |
| `active` → `cancelled` | Parent instance cancelled | Instance status set to `cancelled` | Cancel SLA jobs, emit `task.cancelled` |
| `failed` → `retrying` | Retry policy allows retry | `retryCount < maxRetries` and error is retryable | Schedule retry with backoff delay |
| `failed` → `dead_letter` | Max retries exhausted | `retryCount >= maxRetries` or error is non-retryable | Move to DLQ, emit `task.dead_letter`, notify operators |
| `failed` → `cancelled` | Operator cancels | Task is in `failed` state | Clean up, emit `task.cancelled` |
| `retrying` → `active` | Retry delay elapsed | Retry job fires | Re-execute task handler |
| `retrying` → `failed` | Retry execution fails | Handler throws again | Increment retry count, re-evaluate retry policy |
| `dead_letter` → `cancelled` | Operator discards from DLQ | Task is in `dead_letter` state | Remove from DLQ, emit `task.cancelled` |

---

## 6. State Transition API

### Querying Current State with Available Transitions

Every instance and task response includes the current state, the available next states, and the previous state:

```http
GET /api/v1/instances/:id
```

```json
{
  "id": "inst-001",
  "workflowDefinitionId": "wf-order-approval",
  "workflowVersion": 3,
  "status": {
    "current": "running",
    "availableTransitions": ["completed", "failed", "suspended", "cancelled"],
    "previous": "created",
    "previousTransitionAt": "2024-01-15T10:30:00Z",
    "previousTransitionBy": "user-123",
    "previousTransitionReason": "Instance started"
  },
  "correlationId": "ORDER-12345",
  "startedAt": "2024-01-15T10:30:00Z"
}
```

```http
GET /api/v1/tasks/:id
```

```json
{
  "id": "task-456",
  "workflowInstanceId": "inst-001",
  "status": {
    "current": "active",
    "availableTransitions": ["completed", "failed", "cancelled"],
    "previous": "pending",
    "previousTransitionAt": "2024-01-15T10:30:01Z",
    "previousTransitionBy": "system",
    "previousTransitionReason": "Task activated by execution engine"
  },
  "assignedTo": "user-789",
  "taskType": "userTask",
  "taskName": "Manager Review"
}
```

### Available Transitions by Role

Not all transitions are available to all users. The `availableTransitions` field is filtered based on the requesting user's role:

| Transition | Required Role | API Endpoint |
|------------|--------------|--------------|
| Instance: `suspend` | `admin`, `operator` | `POST /api/v1/instances/:id/suspend` |
| Instance: `resume` | `admin`, `operator` | `POST /api/v1/instances/:id/resume` |
| Instance: `cancel` | `admin`, `operator` | `POST /api/v1/instances/:id/cancel` |
| Instance: `retry` | `admin`, `operator` | `POST /api/v1/instances/:id/retry` |
| Task: `complete` | `operator` (assignee or candidate) | `POST /api/v1/tasks/:id/complete` |
| Task: `claim` | `operator` (candidate) | `POST /api/v1/tasks/:id/claim` |
| Task: `unclaim` | `operator` (current assignee) | `POST /api/v1/tasks/:id/unclaim` |
| Task: `delegate` | `operator` (current assignee), `admin` | `POST /api/v1/tasks/:id/delegate` |
| Task: `cancel` | `admin` | `POST /api/v1/tasks/:id/cancel` |

### Full State History

The complete state transition history is available for both instances and tasks:

```http
GET /api/v1/instances/:id/history
```

```json
{
  "instanceId": "inst-001",
  "transitions": [
    {
      "id": "hist-001",
      "fromStatus": null,
      "toStatus": "created",
      "changedBy": "user-123",
      "changedAt": "2024-01-15T10:30:00.000Z",
      "reason": "Instance created",
      "metadata": {
        "workflowVersion": 3,
        "correlationId": "ORDER-12345",
        "triggeredBy": "api_request"
      }
    },
    {
      "id": "hist-002",
      "fromStatus": "created",
      "toStatus": "running",
      "changedBy": "system",
      "changedAt": "2024-01-15T10:30:00.050Z",
      "reason": "Execution started",
      "metadata": {
        "startEventId": "StartEvent_1",
        "initialTokenId": "token-001"
      }
    },
    {
      "id": "hist-003",
      "fromStatus": "running",
      "toStatus": "suspended",
      "changedBy": "admin-user-456",
      "changedAt": "2024-01-16T14:00:00Z",
      "reason": "Paused for investigation - customer requested hold",
      "metadata": {
        "suspendedTasks": ["task-456", "task-457"],
        "suspendedTokens": ["token-002", "token-003"]
      }
    },
    {
      "id": "hist-004",
      "fromStatus": "suspended",
      "toStatus": "running",
      "changedBy": "admin-user-456",
      "changedAt": "2024-01-17T09:00:00Z",
      "reason": "Investigation complete, resuming",
      "metadata": {
        "resumedTasks": ["task-456", "task-457"],
        "suspendDurationSeconds": 68400
      }
    }
  ]
}
```

```http
GET /api/v1/tasks/:id/history
```

```json
{
  "taskId": "task-456",
  "transitions": [
    {
      "id": "hist-010",
      "fromStatus": null,
      "toStatus": "pending",
      "changedBy": "system",
      "changedAt": "2024-01-15T10:30:01Z",
      "reason": "Task created by execution engine"
    },
    {
      "id": "hist-011",
      "fromStatus": "pending",
      "toStatus": "active",
      "changedBy": "system",
      "changedAt": "2024-01-15T10:30:01Z",
      "reason": "Task activated",
      "metadata": {
        "assignedTo": null,
        "candidateGroups": ["managers"],
        "slaWarningAt": "2024-01-15T12:30:01Z",
        "slaBreachAt": "2024-01-15T14:30:01Z"
      }
    },
    {
      "id": "hist-012",
      "fromStatus": "active",
      "toStatus": "active",
      "changedBy": "user-789",
      "changedAt": "2024-01-15T11:00:00Z",
      "reason": "Task claimed",
      "metadata": {
        "action": "claim",
        "previousAssignee": null
      }
    },
    {
      "id": "hist-013",
      "fromStatus": "active",
      "toStatus": "completed",
      "changedBy": "user-789",
      "changedAt": "2024-01-15T13:45:00Z",
      "reason": "Task completed with form submission",
      "metadata": {
        "completionResult": { "approved": true, "comment": "Looks good" },
        "durationSeconds": 11700,
        "slaStatus": "within_threshold"
      }
    }
  ]
}
```

---

## 7. State History Storage

### Database Schema

State transitions are recorded in the existing `task_state_history` table (for tasks) and a new `instance_state_history` table (for instances):

```sql
CREATE TABLE instance_state_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_instance_history_instance ON instance_state_history(workflow_instance_id);
CREATE INDEX idx_instance_history_changed ON instance_state_history(changed_at DESC);
CREATE INDEX idx_instance_history_status ON instance_state_history(to_status);
```

### Transition Validation

The state machine is enforced at the service layer. Before any state transition, the service checks the current state against the allowed transitions table. Invalid transitions are rejected with a `EXECUTION_INSTANCE_NOT_RUNNING` or `TASK_NOT_ACTIVE` error (as appropriate), including the current state and the attempted target state in the error details.

---

## 8. Version Deprecation & Archival Automation

### Auto-Archive Policy

Deprecated versions with zero running instances can be automatically archived. The auto-archive job runs as a periodic BullMQ repeatable job (default: every hour).

**Auto-archive algorithm:**

1. Query all workflow definitions in `deprecated` status.
2. For each deprecated definition, count running instances (`status = 'running'` or `status = 'suspended'`).
3. If the count is zero and the definition has been in `deprecated` status for longer than the configured grace period (`VERSION_ARCHIVE_GRACE_PERIOD_HOURS`, default: 72 hours), transition it to `archived`.
4. Record the archive event in the audit log.
5. Emit a `workflow.archived` event.

### Version Cleanup Dashboard

The admin dashboard provides a version lifecycle view:

| Workflow | Version | Status | Instances (Running) | Instances (Total) | Published At | Deprecated At | Age |
|----------|---------|--------|--------------------|--------------------|-------------|--------------|-----|
| Order Approval | v4 | published | 23 | 156 | 2024-01-12 | — | 3 days |
| Order Approval | v3 | deprecated | 47 | 892 | 2023-12-01 | 2024-01-12 | 45 days |
| Order Approval | v2 | deprecated | 2 | 1,234 | 2023-10-15 | 2023-12-01 | 92 days |
| Order Approval | v1 | archived | 0 | 567 | 2023-08-01 | 2023-10-15 | 167 days |

### Environment Variables

```env
# Auto-archive grace period (hours after deprecation before auto-archiving)
VERSION_ARCHIVE_GRACE_PERIOD_HOURS=72

# Auto-archive check interval (ms)
VERSION_ARCHIVE_CHECK_INTERVAL_MS=3600000   # 1 hour

# Maximum concurrent versions in non-archived state per workflow
VERSION_MAX_ACTIVE=5
```

---

## 9. Database Schema for Versioning

The existing `workflow_definitions` table already supports versioning via the `(tenant_id, name, version)` unique constraint. The additional columns and indexes needed:

```sql
-- Add deprecation tracking columns
ALTER TABLE workflow_definitions
  ADD COLUMN deprecated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN deprecated_by UUID REFERENCES users(id),
  ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN archived_by UUID REFERENCES users(id),
  ADD COLUMN changelog TEXT,
  ADD COLUMN previous_version_id UUID REFERENCES workflow_definitions(id);

-- Index for finding the currently published version of a workflow
CREATE UNIQUE INDEX idx_workflow_published
  ON workflow_definitions(tenant_id, name)
  WHERE status = 'published';

-- Index for finding deprecated versions with running instances
CREATE INDEX idx_workflow_deprecated
  ON workflow_definitions(tenant_id, status, deprecated_at)
  WHERE status = 'deprecated';

-- Index for version history queries
CREATE INDEX idx_workflow_version_history
  ON workflow_definitions(tenant_id, name, version DESC);
```

The `idx_workflow_published` unique partial index enforces the rule that only one version of a given workflow name can be in `published` status per tenant, preventing accidental dual-publish scenarios at the database level.
