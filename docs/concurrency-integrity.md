# Concurrency & Data Integrity Guide

This document defines FlowEngine's concurrency control mechanisms, distributed locking strategies, race condition mitigations, and data integrity guarantees. It covers parallel gateway token merging, task claim/completion races, workflow definition version conflicts, and SLA job scheduling races.

---

## 1. Distributed Locking Strategy

FlowEngine uses Redis-backed distributed locks (Redlock algorithm) for all operations that require mutual exclusion across multiple API or worker instances.

### Lock Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Distributed Lock Service                  │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Provider: Redis (Redlock algorithm via ioredis)          │
│                                                            │
│  Lock Key Naming Convention:                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  lock:{resource-type}:{resource-id}:{operation}       │ │
│  │                                                        │ │
│  │  Examples:                                             │ │
│  │  • lock:task:{taskId}:claim                           │ │
│  │  • lock:task:{taskId}:complete                        │ │
│  │  • lock:gateway:{instanceId}:{gatewayId}:merge        │ │
│  │  • lock:workflow:{workflowId}:publish                 │ │
│  │  • lock:instance:{instanceId}:advance                 │ │
│  │  • lock:sla:{taskId}:check                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Default Settings:                                         │
│  • Lock TTL: 10 seconds (auto-released if holder crashes) │
│  • Retry count: 3                                          │
│  • Retry delay: 200ms (with jitter)                       │
│  • Drift factor: 0.01                                      │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Lock Service Behavior

The `DistributedLockService` wraps the Redlock algorithm and exposes a `withLock` method that executes a callback while holding a distributed lock. The service operates as follows:

**Lock acquisition (`withLock`):**

1. Merge any caller-supplied options (TTL, retry count, retry delay) with the defaults (TTL 10 000 ms, 3 retries, 200 ms retry delay).
2. Attempt to acquire the Redlock lock on the given key with the resolved TTL and retry settings.
3. If acquisition fails because the resource is already locked, throw a `SYSTEM_LOCK_ACQUISITION_FAILED` error with a `retryAfterSeconds` hint of 2 seconds.
4. If acquisition succeeds, execute the callback.
5. After the callback completes (whether it succeeds or throws), release the lock in a `finally` block. If the release fails (e.g., the lock already expired naturally), the failure is silently ignored.

**Lock extension (`extendLock`):**

- For long-running operations that may exceed the initial TTL, callers can extend an existing lock by a specified number of milliseconds. This delegates directly to the Redlock `extend` method.

---

## 2. Parallel Gateway Token Merging

### Problem

When a parallel (AND) gateway forks execution into multiple branches, the corresponding join gateway must wait for **all** branch tokens to arrive before continuing. This requires:
- Atomic counting of arrived tokens
- Preventing duplicate processing if two tokens arrive simultaneously
- Handling branches that fail or hang indefinitely

### Flow

```
Fork Gateway                              Join Gateway
     │                                         │
     ├──► Token A ──► Service Task ──────────► │
     │                                         │ Wait for all 3
     ├──► Token B ──► User Task ─────────────► │ tokens to arrive
     │                                         │
     └──► Token C ──► Script Task ───────────► │
                                               │
                                         ┌─────┴─────┐
                                         │  Merge &   │
                                         │  Continue  │
                                         └───────────┘
```

### Token Arrival Handling

The `ParallelGatewayHandler` processes each token that arrives at a join gateway. The merge state (which tokens have arrived) is tracked in a Redis set, and the entire arrival-check-merge sequence is protected by a distributed lock. The algorithm is:

1. Acquire a distributed lock on `lock:gateway:{instanceId}:{gatewayId}:merge` with a 15-second TTL.
2. Atomically add the arriving token ID to the Redis set `gateway-merge:{instanceId}:{gatewayId}` using `SADD`.
3. If `SADD` returns 0, this token was already recorded (duplicate arrival). Return immediately without continuing.
4. Read the total number of arrived tokens from the Redis set using `SCARD`.
5. If the total is less than the expected count, record the token arrival in the database and return. Execution does not continue yet.
6. If all tokens have arrived:
   - Retrieve all arrived token IDs from the Redis set using `SMEMBERS`.
   - Merge variables from all branch tokens (see merge strategy below).
   - Update all branch tokens in the database to status `merged` with a completion timestamp.
   - Delete the Redis set to clean up merge state.
   - Record the gateway merge event in the audit log.
   - Return a result indicating execution should continue, along with the merged variables.
7. Release the distributed lock (automatic on callback completion).

**Variable merge strategy:** Variables are merged using a last-writer-wins approach with deterministic ordering. The handler loads the current workflow instance variables, then iterates over tokens sorted by creation time (oldest first). For each token, it looks up the associated task instance's completion result and merges those variables into the accumulated set. Later branches overwrite earlier ones for any conflicting keys.

### Timeout & Deadlock Detection

A `GatewayTimeoutMonitor` runs as a periodic BullMQ repeatable job to detect parallel gateways that are stuck waiting for tokens that may never arrive. Its behavior is:

**Periodic check cycle (runs every `GATEWAY_CHECK_INTERVAL_MS`):**

1. Scan for all active gateway merge states that have been waiting longer than expected.
2. For each stuck gateway:
   - Parse the instance ID and gateway ID from the Redis key.
   - Calculate how long the gateway has been waiting since the first token arrived.
   - Look up the configured timeout for this gateway.
   - If the wait time has not yet exceeded the timeout, skip it.
3. If the timeout is exceeded, inspect all branch statuses:
   - If any branch has a `failed` token, classify the situation as `branch_failed`.
   - If any branch is `active` but has had no activity for longer than the timeout, classify as `branch_stuck`.
   - If branches are still actively running but just taking a long time, emit a warning event without taking action.

**Deadlock handling:**

1. Record the deadlock event in the audit log, including the gateway ID, the reason (`branch_failed` or `branch_stuck`), the expected and arrived token counts, and how many branches are missing.
2. Emit a `gateway.deadlock` event on the event bus for real-time monitoring.
3. If the `GATEWAY_FORCE_MERGE_ENABLED` flag is set to `true`:
   - Log a `GATEWAY_FORCE_MERGED` audit entry listing the arrived tokens and how many are missing.
   - Instruct the execution engine to continue from the gateway using only the tokens that did arrive (partial merge).
4. If force-merge is not enabled, suspend the workflow instance with a descriptive reason and notify operators.

### Environment Variables

```env
# Parallel gateway timeout (ms). Gateways waiting longer are flagged.
GATEWAY_MERGE_TIMEOUT_MS=7200000       # 2 hours default

# Check interval for stuck gateways
GATEWAY_CHECK_INTERVAL_MS=60000        # 1 minute

# Allow force-merge when gateway is deadlocked (use with caution)
GATEWAY_FORCE_MERGE_ENABLED=false
```

---

## 3. Task Claim Race Conditions

### Problem

When a task is assigned to a group (candidate groups), multiple users may attempt to claim it simultaneously. Without coordination, two users could both believe they own the task.

### Claim Algorithm

The `TaskClaimService` uses a distributed lock per task to serialize claim attempts. The procedure for `claimTask(taskId, userId)` is:

1. Acquire a distributed lock on `lock:task:{taskId}:claim` with a 5-second TTL (claims should be fast).
2. Load the current task state from the database (inside the lock, to get a consistent read).
3. If the task does not exist, throw a `ResourceNotFoundError`.
4. Verify the task status is `active`. If it is not, throw a `TASK_NOT_ACTIVE` conflict error including the current status.
5. Check whether the task is already claimed by a different user. If `assignedTo` is set and is not the requesting user, throw a `TASK_ALREADY_CLAIMED` conflict error including who claimed it and when.
6. Verify the requesting user is authorized -- they must be either in the task's candidate users list or a member of one of its candidate groups. If not, throw an `AUTHZ_TASK_NOT_ASSIGNED` authorization error.
7. Perform a conditional database update: update the task's `assignedTo` and `assignedAt` only where `id = taskId AND assignedTo IS NULL AND status = 'active'`. This is a belt-and-suspenders optimistic check in case of an extremely narrow race.
8. If the conditional update affected zero rows, another request managed to claim the task between the check and the update. Throw a `TASK_ALREADY_CLAIMED` conflict error.
9. Record a `TASK_CLAIMED` audit log entry with the user ID, resource type, and resource ID.
10. Emit a `task.claimed` event on the event bus.
11. Return the refreshed task instance from the database.

### Unclaim Algorithm

The `unclaimTask(taskId, userId)` operation also acquires the same distributed lock (`lock:task:{taskId}:claim`) and then:

1. Load the task and verify `assignedTo` matches the requesting user. If not, throw an `AUTHZ_RESOURCE_ACCESS_DENIED` authorization error.
2. Set `assignedTo` and `assignedAt` to null on the task record.
3. Emit a `task.unclaimed` event on the event bus.
4. Return the refreshed task instance.

### Task Completion Race Conditions

The `TaskCompletionService` uses a separate lock key (`lock:task:{taskId}:complete`) with a 10-second TTL to serialize completion attempts. The algorithm for `completeTask(taskId, input, userId)` is:

1. Acquire the distributed lock on `lock:task:{taskId}:complete`.
2. Load the task from the database and check its status:
   - If status is `completed`, throw a `TASK_ALREADY_COMPLETED` conflict error with details of who completed it and when.
   - If status is anything other than `active`, throw a `TASK_NOT_ACTIVE` conflict error.
3. Verify the user is authorized to complete the task (must be the assignee or otherwise permitted).
4. If the task has an associated form definition, validate the submitted variables against the form schema. If validation fails, throw a `FORM_VALIDATION_FAILED` error (HTTP 422) with the specific validation errors.
5. Perform a conditional database update: set the task to `completed` with a completion timestamp, the completing user, the result variables, and any comment -- but only where `id = taskId AND status = 'active'`. If zero rows are affected, throw a `TASK_ALREADY_COMPLETED` conflict error.
6. Record the status transition in the task history (from `active` to `completed`, including who made the change and the submitted variables).
7. Cancel all SLA monitoring jobs for this task.
8. Emit a `task.completed` event on the event bus.
9. Enqueue a `CONTINUE_EXECUTION` job with the workflow instance ID, completed task ID, and the output variables so the execution engine can advance the workflow.

---

## 4. Workflow Definition Version Conflicts

### Problem

Multiple designers may edit the same workflow definition simultaneously. Without version control, one designer's changes silently overwrite another's.

### Optimistic Concurrency Control

FlowEngine uses optimistic locking via a `version` counter on workflow definitions. Every update must include the expected version; if it doesn't match, the update is rejected.

**Update algorithm (`updateWorkflow`):**

1. Attempt a conditional database update on the workflow definition where `id = workflowId AND version = expectedVersion`. If the condition matches, apply the new name, description, BPMN XML, and parsed definition, increment the version by one, and update the timestamp.
2. If zero rows are affected, the version has changed since the client last read it. Load the current workflow definition:
   - If it does not exist, throw a `ResourceNotFoundError`.
   - Otherwise, throw a `RESOURCE_VERSION_CONFLICT` conflict error including the current version, the requested (stale) version, and who last modified the resource and when.

**Publish algorithm (`publishWorkflow`):**

1. Acquire a distributed lock on `lock:workflow:{workflowId}:publish` to prevent concurrent publish operations.
2. Load the workflow definition from the database.
3. If the status is already `published`, throw a `WORKFLOW_ALREADY_PUBLISHED` conflict error.
4. If the status is not `draft`, throw a validation error indicating only drafts can be published.
5. Validate the BPMN XML for structural correctness. If validation fails, throw a `WORKFLOW_BPMN_VALIDATION_ERROR` (HTTP 422) with the specific errors.
6. Update the workflow status to `published` and set the `publishedAt` timestamp.
7. Return the updated workflow definition.

### API Contract for Optimistic Locking

```http
PUT /api/v1/workflows/:id
Content-Type: application/json
If-Match: "3"

{
  "name": "Updated Workflow",
  "bpmnXml": "<definitions>...</definitions>"
}
```

Response on conflict:

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_VERSION_CONFLICT",
    "message": "Resource was modified by another request",
    "details": {
      "currentVersion": 4,
      "requestedVersion": 3,
      "lastModifiedBy": "user-uuid",
      "lastModifiedAt": "2024-01-15T14:30:00Z"
    },
    "retryable": true,
    "retryAfterSeconds": 0
  },
  "requestId": "req-abc-123"
}
```

The client should:
1. Re-fetch the latest version
2. Show a diff to the user
3. Allow the user to merge or overwrite

---

## 5. SLA Job Scheduling Race Conditions

### Problem

SLA monitoring schedules BullMQ jobs for warning and breach thresholds when a task becomes active. Race conditions can occur when:
1. A task completes just as the SLA warning job fires
2. A task is reassigned and SLA thresholds change mid-flight
3. Multiple SLA definitions apply to the same task

### Schedule Monitoring Algorithm

The `SLASchedulingService` schedules SLA monitoring jobs when a task becomes active. The procedure for `scheduleMonitoring(taskId, slaDefinition)` is:

1. Acquire a distributed lock on `lock:sla:{taskId}:schedule`.
2. Re-check that the task is still in `active` status (it may have completed between task creation and this scheduling call). If not active, return immediately without scheduling.
3. Schedule a `CHECK_SLA_WARNING` delayed job in the BullMQ SLA queue if the SLA definition includes a warning threshold. The delay is the warning threshold in milliseconds. The job ID follows the pattern `sla-warning:{taskId}:{slaDefinitionId}`. Configure `removeOnComplete: true` and `removeOnFail: false`.
4. Schedule a `CHECK_SLA_BREACH` delayed job with a delay equal to the breach threshold in milliseconds. Job ID pattern: `sla-breach:{taskId}:{slaDefinitionId}`.
5. If the SLA definition includes escalation rules, schedule a `CHECK_SLA_ESCALATION` job for each escalation level with appropriate delays. Job ID pattern: `sla-escalation:{taskId}:{slaDefinitionId}:L{level}`.
6. Store all scheduled job IDs in a Redis set at key `sla-jobs:{taskId}` so they can be found later for cancellation.

### Cancel Monitoring Algorithm

The `cancelMonitoring(taskId)` procedure (called on task completion, cancellation, or reassignment) is:

1. Acquire the same distributed lock on `lock:sla:{taskId}:schedule` to avoid racing with a concurrent schedule operation.
2. Retrieve all job IDs from the Redis set `sla-jobs:{taskId}`.
3. For each job ID, look up the job in the BullMQ queue and remove it. If the job has already been processed or removed, silently ignore the error.
4. Delete the Redis set `sla-jobs:{taskId}`.

### SLA Job Execution (with task-still-active guard)

The `SLACheckProcessor` handles SLA check jobs when they fire. The critical behavior for a warning check is:

1. **Re-verify task status.** Load the task from the database. If it no longer exists or its status is not `active`, discard the job silently. This is the essential guard against the race where a task completes just before the SLA job fires.
2. Calculate the actual elapsed time since the task became active, accounting for business hours if configured.
3. Load the SLA definition from the database.
4. If the actual elapsed time is still less than the warning threshold (possible if the task was paused and resumed), reschedule the warning check with the remaining delay and return.
5. Check whether a warning event has already been recorded for this task and SLA definition (idempotency guard via database lookup). If so, return without taking action.
6. Record a new SLA warning event in the database with the task ID, SLA definition ID, event type `warning`, the configured threshold, and the actual elapsed duration.
7. Send SLA warning notifications via the notification service.
8. Emit an `sla.warning` event on the event bus with the task ID, instance ID, threshold, and actual duration.

---

## 6. Workflow Instance Advancement Lock

### Problem

When a task completes, the execution engine advances the workflow to the next activity. If multiple tasks complete simultaneously (e.g., parallel branches), multiple `CONTINUE_EXECUTION` jobs may try to advance the same instance.

### Advancement Algorithm

The `ExecutionEngineService` uses a per-instance distributed lock to serialize advancement. The procedure for `continueExecution(data)` is:

1. Acquire a distributed lock on `lock:instance:{workflowInstanceId}:advance` with a 30-second TTL (advancement may involve multiple database operations).
2. Load the workflow instance from the database. If its status is not `running` (it may have been cancelled or suspended while the job was queued), return without taking action.
3. Find the execution token associated with the completed task. If the token's status is not `waiting`, it has already been processed (duplicate job). Return without taking action.
4. Merge the task's output variables into the workflow instance's variable scope using a shallow merge (output variables overwrite existing keys) and persist the updated variables.
5. Mark the token as `completed` with a completion timestamp.
6. Look up the current activity definition from the token and find all outgoing transitions from that activity.
7. Evaluate each outgoing transition's conditions against the current variable scope to determine which activities should be activated next.
8. For each next activity, create new execution tokens and activate the corresponding tasks or gateways.

---

## 7. Database-Level Integrity Constraints

Beyond application-level locking, the database enforces integrity through constraints:

### Unique Constraints (Prevent Duplicate Records)

```sql
-- Prevent duplicate task claims (belt-and-suspenders with app lock)
-- No SQL constraint needed - assignedTo is a simple column update

-- Prevent duplicate workflow definitions
ALTER TABLE workflow_definitions
  ADD CONSTRAINT uq_workflow_tenant_name_version
  UNIQUE (tenant_id, name, version);

-- Prevent duplicate SLA events for the same trigger
CREATE UNIQUE INDEX uq_sla_event_unique
  ON sla_events (task_instance_id, sla_definition_id, event_type, escalation_level)
  WHERE acknowledged = FALSE;

-- Prevent duplicate token merges
CREATE UNIQUE INDEX uq_token_merge
  ON execution_tokens (workflow_instance_id, fork_gateway_id, status)
  WHERE status = 'merged';
```

### Advisory Locks (PostgreSQL)

For operations that span multiple tables and need serialization beyond row-level locks:

```sql
-- Use advisory locks for workflow instance advancement
-- The lock ID is derived from the instance UUID
SELECT pg_advisory_xact_lock(hashtext(instance_id::text));
```

Advisory locks are used within a database transaction. The pattern is to begin a transaction, acquire the advisory lock using `pg_advisory_xact_lock(hashtext(instanceId))`, execute the critical section, and then commit (or roll back) the transaction. The advisory lock is released automatically when the transaction ends, ensuring no lock leaks even if the operation fails.

### Transaction Isolation

For operations requiring serializable isolation (e.g., gateway token counting), FlowEngine runs the critical section inside a transaction set to `SERIALIZABLE` isolation level. Within this transaction, the token count for a given gateway is read and, if all expected tokens have arrived, the merge is performed. The serializable isolation level guarantees that concurrent transactions attempting the same count-and-merge sequence will be detected and one will be rolled back, preventing duplicate merges.

---

## 8. Idempotency

All critical operations are designed to be idempotent - safe to retry without side effects:

| Operation | Idempotency Key | Strategy |
|-----------|----------------|----------|
| Task claim | `taskId + userId` | Check `assignedTo` before update |
| Task complete | `taskId` | Check `status !== 'completed'` before update |
| SLA warning | `taskId + slaDefId + eventType` | Unique index prevents duplicate events |
| Gateway merge | `tokenId in Redis set` | Redis SADD returns 0 for duplicates |
| Webhook delivery | `webhookId + eventId` | Deduplication key in outbound queue |
| Workflow start | `correlationId` | Optional idempotency via correlation ID check |

### Webhook Idempotency Keys

Outbound webhooks include idempotency headers so receivers can deduplicate in case of retries:

- `X-FlowEngine-Idempotency-Key` is set to `{webhookId}:{eventId}:{attempt}`, providing a unique key per delivery attempt.
- `X-FlowEngine-Event-Id` is set to the event ID, allowing receivers to identify the logical event regardless of retry attempt number.

---

## 9. Concurrency Configuration Reference

| Setting | Env Variable | Default | Description |
|---------|-------------|---------|-------------|
| Lock TTL (general) | `LOCK_DEFAULT_TTL_MS` | `10000` | Default distributed lock timeout |
| Lock retry count | `LOCK_RETRY_COUNT` | `3` | Acquisition retry attempts |
| Lock retry delay | `LOCK_RETRY_DELAY_MS` | `200` | Delay between retries (with jitter) |
| Gateway merge timeout | `GATEWAY_MERGE_TIMEOUT_MS` | `7200000` | 2 hours before flagging stuck gateway |
| Gateway check interval | `GATEWAY_CHECK_INTERVAL_MS` | `60000` | How often to check for stuck gateways |
| Force-merge enabled | `GATEWAY_FORCE_MERGE_ENABLED` | `false` | Auto-merge stuck gateways |
| Task claim lock TTL | `TASK_CLAIM_LOCK_TTL_MS` | `5000` | Lock timeout for claim operations |
| Task complete lock TTL | `TASK_COMPLETE_LOCK_TTL_MS` | `10000` | Lock timeout for completion |
| Instance advance lock TTL | `INSTANCE_ADVANCE_LOCK_TTL_MS` | `30000` | Lock timeout for execution advancement |
| Max execution steps | `EXECUTION_MAX_STEPS` | `10000` | Circuit breaker for infinite loops |
| DB transaction isolation | `DB_TRANSACTION_ISOLATION` | `READ COMMITTED` | Default transaction isolation level |
