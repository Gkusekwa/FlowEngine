# Error Code Registry & Standardized Response Formats

This document defines the complete error code taxonomy, standardized response envelope, and error handling contracts for the FlowEngine API.

---

## Standardized Response Envelope

All API responses follow a consistent envelope structure. Both success and error responses use the same top-level shape so clients can parse them uniformly.

### Success Response

The success response envelope contains the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | Yes | Always `true` for successful responses |
| `data` | object or array | Yes | The response payload |
| `meta` | object | No | Pagination metadata (see below) |
| `requestId` | string | Yes | Unique identifier for request tracing |

The optional `meta` object contains pagination fields:

| Field | Type | Description |
|-------|------|-------------|
| `page` | number | Current page number |
| `pageSize` | number | Number of items per page |
| `totalCount` | number | Total number of matching items |
| `totalPages` | number | Total number of pages |
| `cursor` | string | Cursor for cursor-based pagination |

**Example:**
```json
{
  "success": true,
  "data": {
    "id": "inst-abc-123",
    "status": "running",
    "correlationId": "ORDER-12345",
    "startedAt": "2024-01-15T10:30:00Z"
  },
  "requestId": "req-7f3a-4b2c-9d1e"
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [
    { "id": "task-001", "status": "active" },
    { "id": "task-002", "status": "pending" }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 47,
    "totalPages": 3
  },
  "requestId": "req-8a2b-5c3d-1e4f"
}
```

### Error Response

The error response envelope contains the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | Yes | Always `false` for error responses |
| `error` | object | Yes | Error details (see below) |
| `requestId` | string | Yes | Unique identifier for request tracing |

The `error` object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Machine-readable error code (e.g. `"AUTH_TOKEN_EXPIRED"`) |
| `message` | string | Yes | Human-readable description |
| `details` | object | No | Structured context (field errors, limits, etc.) |
| `target` | string | No | The field or resource that caused the error |
| `retryable` | boolean | Yes | Whether the client should retry |
| `retryAfterSeconds` | number | No | Suggested retry delay (for rate limits, transient failures) |
| `documentationUrl` | string | No | Link to relevant docs |

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request body contains invalid fields",
    "details": {
      "fields": [
        { "field": "email", "message": "Must be a valid email address", "value": "not-an-email" },
        { "field": "name", "message": "Required field is missing" }
      ]
    },
    "retryable": false,
    "documentationUrl": "/docs/api-reference#validation"
  },
  "requestId": "req-1a2b-3c4d-5e6f"
}
```

---

## Error Code Format Convention

All error codes use `SCREAMING_SNAKE_CASE` and follow the pattern:

```
{CATEGORY}_{SPECIFIC_ERROR}
```

Categories map to HTTP status codes as follows:

| Category | HTTP Status | Description |
|----------|-------------|-------------|
| `AUTH_*` | 401 | Authentication failures |
| `AUTHZ_*` | 403 | Authorization / permission failures |
| `VALIDATION_*` | 400 | Input validation errors |
| `RESOURCE_*` | 404 / 409 | Resource not found or conflict |
| `RATE_*` | 429 | Rate limiting |
| `WORKFLOW_*` | 400 / 409 / 422 | Workflow definition errors |
| `EXECUTION_*` | 400 / 409 / 422 | Workflow execution errors |
| `TASK_*` | 400 / 409 / 422 | Task-level errors |
| `GATEWAY_*` | 422 / 500 | Gateway evaluation errors |
| `SLA_*` | 400 / 422 | SLA monitoring errors |
| `FORM_*` | 400 / 422 | Form submission errors |
| `FILE_*` | 400 / 413 / 422 | File upload/download errors |
| `EXPRESSION_*` | 400 / 422 | Expression evaluation errors |
| `INTEGRATION_*` | 502 / 503 / 504 | External service errors |
| `TENANT_*` | 400 / 403 / 404 | Multi-tenancy errors |
| `AI_*` | 422 / 502 / 503 | AI service errors |
| `SYSTEM_*` | 500 / 503 | Internal system errors |

---

## Complete Error Code Registry

### Authentication Errors (401)

| Code | Message | Retryable | Details |
|------|---------|-----------|---------|
| `AUTH_TOKEN_MISSING` | Authorization header is required | No | — |
| `AUTH_TOKEN_MALFORMED` | Authorization token is malformed | No | `{ expected: "Bearer <token>" }` |
| `AUTH_TOKEN_EXPIRED` | Access token has expired | No | `{ expiredAt: "<ISO timestamp>" }` |
| `AUTH_TOKEN_REVOKED` | Token has been revoked | No | `{ revokedAt: "<ISO timestamp>" }` |
| `AUTH_TOKEN_INVALID_SIGNATURE` | Token signature verification failed | No | — |
| `AUTH_REFRESH_TOKEN_EXPIRED` | Refresh token has expired | No | — |
| `AUTH_REFRESH_TOKEN_REUSED` | Refresh token was already used (possible theft) | No | `{ family: "<token family id>" }` |
| `AUTH_CREDENTIALS_INVALID` | Email or password is incorrect | No | — |
| `AUTH_ACCOUNT_LOCKED` | Account is locked due to too many failed attempts | No | `{ lockedUntil: "<ISO timestamp>", failedAttempts: 5 }` |
| `AUTH_ACCOUNT_DISABLED` | User account has been disabled | No | — |
| `AUTH_EMAIL_NOT_VERIFIED` | Email address has not been verified | No | — |
| `AUTH_PROVIDER_UNAVAILABLE` | Authentication provider is unreachable | Yes | `{ provider: "ldap", timeout: 5000 }` |
| `AUTH_LDAP_BIND_FAILED` | Failed to bind to LDAP server | Yes | `{ server: "<host>" }` |
| `AUTH_LDAP_USER_NOT_FOUND` | User not found in LDAP directory | No | — |
| `AUTH_SSO_CALLBACK_FAILED` | SSO callback validation failed | No | `{ provider: "keycloak", reason: "<detail>" }` |
| `AUTH_SAML_ASSERTION_INVALID` | SAML assertion is invalid or expired | No | `{ issuer: "<issuer>" }` |
| `AUTH_API_KEY_INVALID` | API key is invalid or does not exist | No | — |
| `AUTH_API_KEY_EXPIRED` | API key has expired | No | `{ expiredAt: "<ISO timestamp>" }` |
| `AUTH_API_KEY_SCOPE_INSUFFICIENT` | API key does not have the required scope | No | `{ required: "workflows:write", granted: ["workflows:read"] }` |

### Authorization Errors (403)

| Code | Message | Retryable | Details |
|------|---------|-----------|---------|
| `AUTHZ_INSUFFICIENT_ROLE` | Your role does not permit this action | No | `{ required: "admin", current: "operator" }` |
| `AUTHZ_INSUFFICIENT_PERMISSION` | You lack the required permission | No | `{ required: "workflows:delete", granted: ["workflows:read"] }` |
| `AUTHZ_TENANT_ACCESS_DENIED` | You do not have access to this tenant | No | `{ tenantId: "<uuid>" }` |
| `AUTHZ_RESOURCE_ACCESS_DENIED` | You do not have access to this resource | No | `{ resourceType: "workflow", resourceId: "<uuid>" }` |
| `AUTHZ_TASK_NOT_ASSIGNED` | You are not assigned to this task and not in candidate groups | No | `{ taskId: "<uuid>", assignedTo: "<uuid>", candidateGroups: ["<group>"] }` |
| `AUTHZ_IP_NOT_WHITELISTED` | Request origin IP is not in the API key's whitelist | No | `{ ip: "<ip>", allowed: ["10.0.0.0/8"] }` |

### Validation Errors (400)

| Code | Message | Retryable | Details |
|------|---------|-----------|---------|
| `VALIDATION_FAILED` | Request body contains invalid fields | No | `{ fields: [{ field, message, value? }] }` |
| `VALIDATION_REQUIRED_FIELD` | A required field is missing | No | `{ field: "<name>" }` |
| `VALIDATION_INVALID_FORMAT` | Field value does not match expected format | No | `{ field: "<name>", expected: "<format>", actual: "<value>" }` |
| `VALIDATION_OUT_OF_RANGE` | Numeric value is outside allowed range | No | `{ field: "<name>", min?: number, max?: number, actual: number }` |
| `VALIDATION_STRING_TOO_LONG` | String exceeds maximum length | No | `{ field: "<name>", maxLength: number, actualLength: number }` |
| `VALIDATION_INVALID_ENUM` | Value is not one of the allowed options | No | `{ field: "<name>", allowed: ["a","b"], actual: "<value>" }` |
| `VALIDATION_INVALID_UUID` | Expected a valid UUID | No | `{ field: "<name>", value: "<value>" }` |
| `VALIDATION_INVALID_JSON` | Request body is not valid JSON | No | `{ parseError: "<detail>" }` |
| `VALIDATION_PAYLOAD_TOO_LARGE` | Request body exceeds maximum allowed size | No | `{ maxBytes: 1048576, actualBytes: 2097152 }` |

### Resource Errors (404 / 409)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `RESOURCE_NOT_FOUND` | 404 | The requested resource does not exist | No | `{ resourceType: "<type>", resourceId: "<id>" }` |
| `RESOURCE_ALREADY_EXISTS` | 409 | A resource with this identifier already exists | No | `{ resourceType: "<type>", conflictField: "<field>", conflictValue: "<value>" }` |
| `RESOURCE_VERSION_CONFLICT` | 409 | Resource was modified by another request | Yes | `{ currentVersion: 3, requestedVersion: 2 }` |
| `RESOURCE_ARCHIVED` | 410 | Resource has been archived and is no longer available | No | `{ resourceType: "<type>", archivedAt: "<ISO timestamp>" }` |

### Rate Limiting Errors (429)

| Code | Message | Retryable | Details |
|------|---------|-----------|---------|
| `RATE_LIMIT_EXCEEDED` | Too many requests | Yes | `{ limit: 120, window: "60s", retryAfterSeconds: 15 }` |
| `RATE_LIMIT_BURST_EXCEEDED` | Burst rate limit exceeded | Yes | `{ burstLimit: 20, retryAfterSeconds: 2 }` |
| `RATE_LIMIT_TENANT_QUOTA` | Tenant request quota exceeded | Yes | `{ plan: "starter", dailyLimit: 10000, used: 10000 }` |

### Workflow Definition Errors (400 / 409 / 422)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `WORKFLOW_BPMN_PARSE_ERROR` | 400 | BPMN XML is malformed or cannot be parsed | No | `{ line?: number, column?: number, parseError: "<detail>" }` |
| `WORKFLOW_BPMN_VALIDATION_ERROR` | 422 | BPMN definition has structural errors | No | `{ errors: [{ elementId, elementType, message }] }` |
| `WORKFLOW_NO_START_EVENT` | 422 | Workflow definition has no start event | No | — |
| `WORKFLOW_MULTIPLE_START_EVENTS` | 422 | Workflow definition has multiple start events (unsupported) | No | `{ startEvents: ["<elementId>", "<elementId>"] }` |
| `WORKFLOW_NO_END_EVENT` | 422 | Workflow has paths that never reach an end event | No | `{ unreachableFrom: ["<elementId>"] }` |
| `WORKFLOW_CIRCULAR_FLOW` | 422 | Workflow contains a circular path with no exit condition | No | `{ cycle: ["<elementId>", "<elementId>", "..."] }` |
| `WORKFLOW_ORPHAN_ELEMENTS` | 422 | Elements are not connected to the main flow | No | `{ orphanedElements: ["<elementId>"] }` |
| `WORKFLOW_GATEWAY_MISMATCH` | 422 | Fork gateway has no corresponding join gateway | No | `{ gatewayId: "<elementId>", gatewayType: "parallel" }` |
| `WORKFLOW_UNSUPPORTED_ELEMENT` | 422 | BPMN element type is not supported | No | `{ elementId: "<id>", elementType: "<type>" }` |
| `WORKFLOW_NOT_PUBLISHED` | 400 | Workflow must be published before creating instances | No | `{ workflowId: "<uuid>", status: "draft" }` |
| `WORKFLOW_ALREADY_PUBLISHED` | 409 | This version is already published | No | `{ workflowId: "<uuid>", version: 3 }` |
| `WORKFLOW_HAS_ACTIVE_INSTANCES` | 409 | Cannot archive workflow with running instances | No | `{ workflowId: "<uuid>", activeInstances: 5 }` |

### Execution Errors (400 / 409 / 422 / 500)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `EXECUTION_INSTANCE_NOT_RUNNING` | 409 | Workflow instance is not in a running state | No | `{ instanceId: "<uuid>", status: "completed" }` |
| `EXECUTION_INSTANCE_SUSPENDED` | 409 | Workflow instance is suspended | No | `{ instanceId: "<uuid>", suspendedAt: "<ISO timestamp>" }` |
| `EXECUTION_TOKEN_INVALID_STATE` | 409 | Execution token is not in a valid state for this operation | No | `{ tokenId: "<uuid>", status: "completed", expected: "active" }` |
| `EXECUTION_TOKEN_ORPHANED` | 500 | Execution token reached a dead end with no outgoing transitions | No | `{ tokenId: "<uuid>", activityId: "<elementId>" }` |
| `EXECUTION_MAX_STEPS_EXCEEDED` | 422 | Workflow execution exceeded maximum step count (possible infinite loop) | No | `{ instanceId: "<uuid>", maxSteps: 10000, currentStep: 10001 }` |
| `EXECUTION_VARIABLE_TYPE_MISMATCH` | 422 | Variable type does not match expected type | No | `{ variable: "<name>", expected: "number", actual: "string" }` |
| `EXECUTION_VARIABLE_NOT_FOUND` | 422 | Referenced variable does not exist in scope | No | `{ variable: "<name>", scope: "process" }` |
| `EXECUTION_COMPENSATION_FAILED` | 500 | Compensation handler failed during rollback | Yes | `{ activityId: "<elementId>", compensationType: "script", error: "<detail>" }` |
| `EXECUTION_CHECKPOINT_CORRUPTED` | 500 | Checkpoint data is corrupted and cannot be restored | No | `{ checkpointId: "<uuid>", instanceId: "<uuid>" }` |
| `EXECUTION_CHECKPOINT_NOT_FOUND` | 404 | No checkpoint exists for this instance | No | `{ instanceId: "<uuid>" }` |

### Task Errors (400 / 409 / 422)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `TASK_NOT_ACTIVE` | 409 | Task is not in an active state | No | `{ taskId: "<uuid>", status: "completed", expected: "active" }` |
| `TASK_ALREADY_CLAIMED` | 409 | Task has already been claimed by another user | No | `{ taskId: "<uuid>", claimedBy: "<uuid>", claimedAt: "<ISO timestamp>" }` |
| `TASK_ALREADY_COMPLETED` | 409 | Task has already been completed | No | `{ taskId: "<uuid>", completedBy: "<uuid>", completedAt: "<ISO timestamp>" }` |
| `TASK_CLAIM_LOCK_TIMEOUT` | 503 | Could not acquire lock to claim task (try again) | Yes | `{ taskId: "<uuid>", retryAfterSeconds: 1 }` |
| `TASK_COMPLETION_LOCK_TIMEOUT` | 503 | Could not acquire lock to complete task (try again) | Yes | `{ taskId: "<uuid>", retryAfterSeconds: 1 }` |
| `TASK_HANDLER_NOT_FOUND` | 500 | No handler registered for this task type | No | `{ activityType: "<type>" }` |
| `TASK_HANDLER_EXECUTION_FAILED` | 500 | Task handler threw an unexpected error | Yes | `{ activityType: "<type>", error: "<detail>" }` |
| `TASK_TIMEOUT` | 408 | Task execution exceeded the configured timeout | Yes | `{ taskId: "<uuid>", timeoutMs: 30000 }` |
| `TASK_IN_DEAD_LETTER` | 422 | Task is in the dead letter queue and requires manual intervention | No | `{ taskId: "<uuid>", retryCount: 5, lastError: "<detail>" }` |
| `TASK_DELEGATE_FAILED` | 422 | Cannot delegate task to specified user | No | `{ taskId: "<uuid>", targetUser: "<uuid>", reason: "user not in candidate groups" }` |

### Gateway Errors (422 / 500)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `GATEWAY_NO_MATCHING_CONDITION` | 422 | No outgoing transition condition evaluated to true and no default flow is defined | No | `{ gatewayId: "<elementId>", evaluatedConditions: [{ transitionId, expression, result }] }` |
| `GATEWAY_MERGE_TIMEOUT` | 500 | Parallel gateway timed out waiting for all incoming tokens | Yes | `{ gatewayId: "<elementId>", expected: 3, received: 2, waitedMs: 7200000 }` |
| `GATEWAY_MERGE_DEADLOCK` | 500 | Parallel gateway detected a deadlock (branch will never complete) | No | `{ gatewayId: "<elementId>", stuckBranches: ["<tokenId>"] }` |
| `GATEWAY_CONDITION_EVAL_ERROR` | 422 | Error evaluating gateway condition expression | No | `{ gatewayId: "<elementId>", expression: "<expr>", error: "<detail>" }` |

### SLA Errors (400 / 422)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `SLA_DEFINITION_INVALID` | 400 | SLA definition has invalid thresholds | No | `{ reason: "warning threshold must be less than breach threshold" }` |
| `SLA_ALREADY_ACKNOWLEDGED` | 409 | This SLA event has already been acknowledged | No | `{ slaEventId: "<uuid>", acknowledgedAt: "<ISO timestamp>" }` |
| `SLA_ESCALATION_FAILED` | 500 | Escalation action failed (notification or reassignment) | Yes | `{ slaEventId: "<uuid>", escalationLevel: 2, error: "<detail>" }` |
| `SLA_BUSINESS_HOURS_INVALID` | 400 | Business hours configuration is invalid | No | `{ reason: "shift end time must be after start time" }` |
| `SLA_TIMEZONE_INVALID` | 400 | Specified timezone is not recognized | No | `{ timezone: "<value>", supported: "IANA timezone database" }` |

### Form Errors (400 / 422)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `FORM_VALIDATION_FAILED` | 422 | Form submission has validation errors | No | `{ errors: [{ fieldId, fieldLabel, rule, message }] }` |
| `FORM_REQUIRED_FIELD_MISSING` | 422 | A required form field was not submitted | No | `{ fieldId: "<id>", fieldLabel: "<label>" }` |
| `FORM_FIELD_TYPE_MISMATCH` | 422 | Submitted value does not match the field's expected type | No | `{ fieldId: "<id>", expectedType: "number", actualType: "string" }` |
| `FORM_FIELD_PATTERN_MISMATCH` | 422 | Submitted value does not match the field's regex pattern | No | `{ fieldId: "<id>", pattern: "<regex>", value: "<submitted>" }` |
| `FORM_CUSTOM_VALIDATION_FAILED` | 422 | Custom validation expression evaluated to false | No | `{ fieldId: "<id>", expression: "<expr>", message: "<custom message>" }` |
| `FORM_DEFINITION_NOT_FOUND` | 404 | Form definition could not be resolved | No | `{ formKey: "<key>", taskId: "<uuid>" }` |

### File Errors (400 / 413 / 422)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `FILE_TOO_LARGE` | 413 | File exceeds the maximum allowed size | No | `{ maxBytes: 52428800, actualBytes: 104857600, filename: "<name>" }` |
| `FILE_TYPE_NOT_ALLOWED` | 422 | File MIME type is not in the allowed list | No | `{ mimeType: "<type>", allowed: ["image/*", "application/pdf"], filename: "<name>" }` |
| `FILE_INFECTED` | 422 | File was flagged by virus scanner | No | `{ filename: "<name>", threat: "<virus name>" }` |
| `FILE_UPLOAD_FAILED` | 500 | File could not be written to storage | Yes | `{ provider: "s3", error: "<detail>" }` |
| `FILE_NOT_FOUND` | 404 | Requested file does not exist or has been deleted | No | `{ fileId: "<uuid>" }` |
| `FILE_DOWNLOAD_FAILED` | 500 | File could not be retrieved from storage | Yes | `{ fileId: "<uuid>", provider: "s3", error: "<detail>" }` |
| `FILE_CHECKSUM_MISMATCH` | 500 | Downloaded file checksum does not match stored checksum | Yes | `{ fileId: "<uuid>", expected: "<hash>", actual: "<hash>" }` |
| `FILE_STORAGE_QUOTA_EXCEEDED` | 413 | Tenant file storage quota has been exceeded | No | `{ quotaBytes: number, usedBytes: number }` |

### Expression Errors (400 / 422)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `EXPRESSION_SYNTAX_ERROR` | 400 | Expression has a syntax error | No | `{ expression: "<expr>", position: number, message: "<detail>" }` |
| `EXPRESSION_EVAL_ERROR` | 422 | Expression evaluation failed at runtime | No | `{ expression: "<expr>", error: "<detail>", variables: {} }` |
| `EXPRESSION_TIMEOUT` | 422 | Expression evaluation exceeded maximum execution time | No | `{ expression: "<expr>", timeoutMs: 5000 }` |
| `EXPRESSION_FORBIDDEN_OPERATION` | 400 | Expression uses a disallowed operation | No | `{ expression: "<expr>", forbidden: "<operation>", reason: "sandbox restriction" }` |
| `EXPRESSION_RESULT_TYPE_INVALID` | 422 | Expression returned an unexpected type | No | `{ expression: "<expr>", expected: "boolean", actual: "object" }` |

### Integration / External Service Errors (502 / 503 / 504)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `INTEGRATION_CONNECTION_FAILED` | 502 | Cannot connect to external service | Yes | `{ service: "<name>", url: "<url>", error: "<detail>" }` |
| `INTEGRATION_TIMEOUT` | 504 | External service did not respond within the timeout | Yes | `{ service: "<name>", url: "<url>", timeoutMs: 10000 }` |
| `INTEGRATION_RESPONSE_INVALID` | 502 | External service returned an unparseable response | Yes | `{ service: "<name>", statusCode: 200, contentType: "<type>" }` |
| `INTEGRATION_RESPONSE_TOO_LARGE` | 502 | External service response exceeds the maximum size | No | `{ service: "<name>", maxBytes: 10485760, actualBytes: number }` |
| `INTEGRATION_AUTH_FAILED` | 502 | Authentication to external service failed | No | `{ service: "<name>", authMethod: "oauth2" }` |
| `INTEGRATION_CIRCUIT_OPEN` | 503 | Circuit breaker is open for this service (too many recent failures) | Yes | `{ service: "<name>", failureCount: 5, retryAfterSeconds: 30 }` |
| `INTEGRATION_WEBHOOK_DELIVERY_FAILED` | 502 | Outbound webhook delivery failed | Yes | `{ webhookId: "<uuid>", url: "<url>", statusCode: 500, attempt: 3 }` |
| `INTEGRATION_WEBHOOK_SIGNATURE_INVALID` | 400 | Inbound webhook HMAC signature is invalid | No | `{ webhookId: "<uuid>" }` |
| `INTEGRATION_MESSAGE_BROKER_UNAVAILABLE` | 503 | Message broker is unreachable | Yes | `{ broker: "kafka", error: "<detail>", retryAfterSeconds: 5 }` |
| `INTEGRATION_SSRF_BLOCKED` | 400 | Service task URL targets a blocked network range | No | `{ url: "<url>", reason: "internal network addresses are not allowed" }` |

### Tenant Errors (400 / 403 / 404)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `TENANT_NOT_FOUND` | 404 | Tenant does not exist | No | `{ tenantSlug: "<slug>" }` |
| `TENANT_DISABLED` | 403 | Tenant account has been disabled | No | `{ tenantId: "<uuid>" }` |
| `TENANT_USER_LIMIT_REACHED` | 400 | Tenant has reached the maximum number of users | No | `{ maxUsers: 10, currentUsers: 10, plan: "free" }` |
| `TENANT_WORKFLOW_LIMIT_REACHED` | 400 | Tenant has reached the maximum number of workflow definitions | No | `{ maxWorkflows: 50, currentWorkflows: 50, plan: "free" }` |
| `TENANT_HEADER_MISSING` | 400 | X-Tenant header is required for multi-tenant requests | No | — |
| `TENANT_HEADER_INVALID` | 400 | X-Tenant header value does not match an active tenant | No | `{ provided: "<value>" }` |

### AI Service Errors (422 / 502 / 503)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `AI_PROVIDER_UNAVAILABLE` | 503 | AI provider is unreachable | Yes | `{ provider: "anthropic", retryAfterSeconds: 10 }` |
| `AI_RATE_LIMITED` | 429 | AI provider rate limit exceeded | Yes | `{ provider: "openai", retryAfterSeconds: 30 }` |
| `AI_RESPONSE_INVALID` | 502 | AI provider returned an unparseable response | Yes | `{ provider: "<name>", model: "<model>" }` |
| `AI_CONTENT_FILTERED` | 422 | AI provider refused the request due to content policy | No | `{ provider: "<name>", reason: "content_filter" }` |
| `AI_TOKEN_LIMIT_EXCEEDED` | 422 | Input exceeds the AI model's token limit | No | `{ provider: "<name>", maxTokens: 4096, estimatedTokens: 5200 }` |
| `AI_GENERATION_FAILED` | 500 | AI workflow generation produced invalid output | Yes | `{ provider: "<name>", attempt: 2, error: "<detail>" }` |
| `AI_NOT_CONFIGURED` | 400 | No AI provider is configured for this tenant | No | — |

### System Errors (500 / 503)

| Code | HTTP | Message | Retryable | Details |
|------|------|---------|-----------|---------|
| `SYSTEM_INTERNAL_ERROR` | 500 | An unexpected internal error occurred | Yes | `{ reference: "<uuid for support>" }` |
| `SYSTEM_DATABASE_UNAVAILABLE` | 503 | Database connection is unavailable | Yes | `{ retryAfterSeconds: 5 }` |
| `SYSTEM_DATABASE_DEADLOCK` | 500 | Database deadlock detected (operation was rolled back) | Yes | `{ retryAfterSeconds: 1 }` |
| `SYSTEM_DATABASE_POOL_EXHAUSTED` | 503 | Database connection pool is exhausted | Yes | `{ poolSize: 20, activeConnections: 20, retryAfterSeconds: 2 }` |
| `SYSTEM_REDIS_UNAVAILABLE` | 503 | Redis connection is unavailable | Yes | `{ retryAfterSeconds: 5 }` |
| `SYSTEM_QUEUE_UNAVAILABLE` | 503 | Job queue is unavailable | Yes | `{ queue: "workflow-execution", retryAfterSeconds: 5 }` |
| `SYSTEM_LOCK_ACQUISITION_FAILED` | 503 | Could not acquire distributed lock | Yes | `{ lockKey: "<key>", retryAfterSeconds: 2 }` |
| `SYSTEM_MAINTENANCE_MODE` | 503 | System is in maintenance mode | Yes | `{ message: "<maintenance message>", estimatedEndTime: "<ISO timestamp>" }` |

---

## HTTP Status Code Summary

| Status | Usage | Error Categories |
|--------|-------|------------------|
| **200** | Successful GET, PUT, PATCH | — |
| **201** | Successful POST (resource created) | — |
| **204** | Successful DELETE (no content) | — |
| **400** | Invalid request structure or parameters | `VALIDATION_*`, `TENANT_*`, `EXPRESSION_*` |
| **401** | Authentication failure | `AUTH_*` |
| **403** | Authorization failure | `AUTHZ_*`, `TENANT_DISABLED` |
| **404** | Resource not found | `RESOURCE_NOT_FOUND`, `FILE_NOT_FOUND`, `FORM_DEFINITION_NOT_FOUND` |
| **408** | Request/task timeout | `TASK_TIMEOUT` |
| **409** | State conflict | `RESOURCE_*_CONFLICT`, `TASK_ALREADY_*`, `WORKFLOW_ALREADY_*` |
| **410** | Resource archived/gone | `RESOURCE_ARCHIVED` |
| **413** | Payload too large | `FILE_TOO_LARGE`, `VALIDATION_PAYLOAD_TOO_LARGE` |
| **422** | Semantically invalid request | `WORKFLOW_*`, `FORM_*`, `GATEWAY_*`, `EXECUTION_*` |
| **429** | Rate limited | `RATE_*`, `AI_RATE_LIMITED` |
| **500** | Internal server error | `SYSTEM_*`, `EXECUTION_*`, `TASK_HANDLER_*` |
| **502** | Bad gateway (external service failure) | `INTEGRATION_*`, `AI_RESPONSE_INVALID` |
| **503** | Service unavailable | `SYSTEM_*_UNAVAILABLE`, `INTEGRATION_CIRCUIT_OPEN` |
| **504** | Gateway timeout | `INTEGRATION_TIMEOUT` |

---

## HTTP Response Headers

All responses include the following standard headers:

| Header | Description | Example |
|--------|-------------|---------|
| `X-Request-Id` | Unique identifier for tracing | `req-7f3a-4b2c-9d1e` |
| `X-Tenant-Id` | Resolved tenant identifier | `tenant-abc-123` |
| `X-RateLimit-Limit` | Maximum requests allowed in window | `120` |
| `X-RateLimit-Remaining` | Requests remaining in current window | `87` |
| `X-RateLimit-Reset` | Unix timestamp when the window resets | `1704067260` |
| `Retry-After` | Seconds to wait before retrying (on 429/503 only) | `15` |

---

## Client Error Handling Guide

### Recommended Client Retry Strategy

Clients should implement a retry loop with the following behavior:

1. **Send the request** and parse the JSON response body.
2. **Check `success`**: if `true`, the operation succeeded -- return the result.
3. **If `success` is `false`**, inspect `error.retryable`:
   - If `retryable` is `false`, the error is permanent. Surface it to the user or caller immediately. Do not retry.
   - If `retryable` is `true`, proceed to step 4.
4. **Determine the retry delay**: use `error.retryAfterSeconds` if present; otherwise fall back to the `Retry-After` response header; otherwise default to 1 second.
5. **Wait** for the computed delay, then retry the request.
6. **Limit retries** to a maximum of 3 attempts. If all attempts fail, surface the last error to the caller.

For production clients, consider adding exponential backoff with jitter on top of the suggested delay to avoid thundering-herd effects when many clients retry simultaneously.

### Error Code to User Message Mapping

Clients should map error codes to user-friendly messages appropriate for their UI. The `message` field in the error response is suitable for developer and operator audiences. For end-user-facing applications, maintain a separate mapping from error codes to display-friendly text. The following table provides recommended user-facing messages for common error codes:

| Error Code | Suggested User-Facing Message |
|------------|-------------------------------|
| `AUTH_TOKEN_EXPIRED` | Your session has expired. Please sign in again. |
| `AUTH_CREDENTIALS_INVALID` | The email or password you entered is incorrect. |
| `AUTH_ACCOUNT_LOCKED` | Your account has been temporarily locked. Please try again later. |
| `AUTHZ_TASK_NOT_ASSIGNED` | This task is assigned to another user. |
| `TASK_ALREADY_COMPLETED` | This task has already been completed. |
| `RATE_LIMIT_EXCEEDED` | Too many requests. Please wait a moment and try again. |
| `FILE_TOO_LARGE` | The file you selected is too large. Please choose a smaller file. |
| `FILE_INFECTED` | The uploaded file was flagged as unsafe and cannot be accepted. |
| `FORM_VALIDATION_FAILED` | Please correct the highlighted errors and try again. |

For any error code not present in the mapping, fall back to displaying the `message` field from the error response.
