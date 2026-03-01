# API Reference

Base URL: `/api/v1`

All endpoints require authentication via JWT Bearer token unless otherwise noted.

## Authentication

FlowEngine supports multiple authentication providers per tenant.

### Get Auth Providers

Returns available authentication providers for a tenant (public endpoint).

```http
GET /auth/providers?tenant=acme
```

**Response:**
```json
{
  "tenant": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme"
  },
  "providers": [
    {
      "id": "uuid",
      "type": "local",
      "name": "Email & Password",
      "isDefault": true
    },
    {
      "id": "uuid",
      "type": "keycloak",
      "name": "SSO (Keycloak)",
      "isDefault": false,
      "authUrl": "/auth/keycloak/uuid/login"
    },
    {
      "id": "uuid",
      "type": "ldap",
      "name": "Active Directory",
      "isDefault": false
    }
  ]
}
```

### Local Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "tenantSlug": "acme"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "operator",
    "permissions": ["workflows:read", "instances:create"],
    "groups": ["engineering"]
  },
  "tenant": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme"
  }
}
```

### LDAP Login

```http
POST /auth/ldap/:providerId/login
Content-Type: application/json

{
  "username": "jdoe",
  "password": "ldap-password",
  "tenantSlug": "acme"
}
```

**Response:** Same as local login.

### Keycloak/OAuth2 Login

Initiate OAuth2 flow:

```http
GET /auth/keycloak/:providerId/login?tenant=acme
```

**Response:** Redirects to Keycloak login page.

**Callback:**

```http
GET /auth/keycloak/:providerId/callback?code=xxx&state=xxx
```

**Response:** Redirects to app with tokens in URL fragment or sets cookies.

### SAML Login

Initiate SAML flow:

```http
GET /auth/saml/:providerId/login?tenant=acme
```

**Response:** Redirects to IdP with SAML AuthnRequest.

**Callback (POST):**

```http
POST /auth/saml/:providerId/callback
Content-Type: application/x-www-form-urlencoded

SAMLResponse=base64-encoded-response&RelayState=xxx
```

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

### Logout

```http
POST /auth/logout
Authorization: Bearer <token>
```

Invalidates the current session.

### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "https://...",
    "authProvider": "keycloak",
    "role": "designer",
    "permissions": ["workflows:create", "workflows:publish"],
    "groups": ["engineering", "approvers"]
  },
  "tenant": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme",
    "role": "designer"
  },
  "availableTenants": [
    { "id": "uuid", "name": "Acme Corp", "slug": "acme", "role": "designer" },
    { "id": "uuid", "name": "Personal", "slug": "personal", "role": "owner" }
  ]
}
```

### Switch Tenant

```http
POST /auth/switch-tenant
Authorization: Bearer <token>
Content-Type: application/json

{
  "tenantSlug": "personal"
}
```

**Response:** New tokens for the selected tenant.

---

## Tenant Management

### List User's Tenants

```http
GET /tenants
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Acme Corp",
      "slug": "acme",
      "role": "designer",
      "memberCount": 25,
      "workflowCount": 12
    }
  ]
}
```

### Get Tenant

```http
GET /tenants/:slug
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "slug": "acme",
  "settings": {
    "branding": { "primaryColor": "#007bff" },
    "features": { "slaMonitoring": true }
  },
  "subscriptionPlan": "professional",
  "usage": {
    "users": 25,
    "maxUsers": 50,
    "workflows": 12,
    "maxWorkflows": 100,
    "activeInstances": 156
  }
}
```

### Update Tenant Settings (Admin)

```http
PATCH /tenants/:slug
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Acme Corporation",
  "settings": {
    "branding": { "primaryColor": "#0066cc" }
  }
}
```

### List Tenant Members (Admin)

```http
GET /tenants/:slug/members
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user": {
        "id": "uuid",
        "email": "john@acme.com",
        "name": "John Doe"
      },
      "role": "designer",
      "joinedAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### Invite Member (Admin)

```http
POST /tenants/:slug/members/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newuser@acme.com",
  "role": "operator"
}
```

### Update Member Role (Admin)

```http
PATCH /tenants/:slug/members/:userId
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "designer"
}
```

### Remove Member (Admin)

```http
DELETE /tenants/:slug/members/:userId
Authorization: Bearer <token>
```

---

## Auth Provider Management (Admin)

### List Auth Providers

```http
GET /tenants/:slug/auth-providers
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "local",
      "name": "Email & Password",
      "isDefault": true,
      "isActive": true,
      "userCount": 15
    },
    {
      "id": "uuid",
      "type": "ldap",
      "name": "Active Directory",
      "isDefault": false,
      "isActive": true,
      "userCount": 10,
      "lastSyncAt": "2024-01-20T14:00:00Z"
    }
  ]
}
```

### Create Auth Provider

```http
POST /tenants/:slug/auth-providers
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "ldap",
  "name": "Corporate AD",
  "config": {
    "url": "ldap://ad.acme.com:389",
    "baseDn": "dc=acme,dc=com",
    "bindDn": "cn=svc-flowengine,ou=services,dc=acme,dc=com",
    "bindCredential": "password",
    "userSearchBase": "ou=users",
    "userSearchFilter": "(sAMAccountName={{username}})",
    "usernameAttribute": "sAMAccountName",
    "emailAttribute": "mail",
    "nameAttribute": "displayName",
    "groupSearchBase": "ou=groups",
    "groupSearchFilter": "(member={{dn}})",
    "startTls": true,
    "syncInterval": 3600
  }
}
```

### Test Auth Provider Connection

```http
POST /tenants/:slug/auth-providers/:id/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "testUsername": "testuser",
  "testPassword": "testpass"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "userFound": true,
  "userDetails": {
    "dn": "cn=testuser,ou=users,dc=acme,dc=com",
    "email": "testuser@acme.com",
    "name": "Test User",
    "groups": ["engineering", "developers"]
  }
}
```

### Sync Users from Provider

```http
POST /tenants/:slug/auth-providers/:id/sync
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "usersCreated": 5,
    "usersUpdated": 20,
    "usersDeactivated": 2,
    "groupsSynced": 8,
    "duration": 3500
  }
}
```

### Update Auth Provider

```http
PATCH /tenants/:slug/auth-providers/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Corporate Active Directory",
  "isDefault": true
}
```

### Delete Auth Provider

```http
DELETE /tenants/:slug/auth-providers/:id
Authorization: Bearer <token>
```

Only allowed if no users are associated with this provider.

---

## Workflow Definitions

### List Workflows

```http
GET /workflows?status=published&page=1&limit=20
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status: `draft`, `published`, `archived` |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20, max: 100) |
| search | string | Search by name |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Leave Request",
      "description": "Employee leave approval workflow",
      "version": 2,
      "status": "published",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-20T14:30:00Z",
      "publishedAt": "2024-01-20T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### Get Workflow

```http
GET /workflows/:id
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Leave Request",
  "description": "Employee leave approval workflow",
  "version": 2,
  "status": "published",
  "bpmnXml": "<?xml version=\"1.0\"...",
  "parsedDefinition": {
    "activities": [...],
    "transitions": [...],
    "startEventId": "StartEvent_1",
    "endEventIds": ["EndEvent_1"]
  },
  "createdBy": {
    "id": "uuid",
    "name": "Jane Smith"
  },
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-20T14:30:00Z"
}
```

### Create Workflow

```http
POST /workflows
Content-Type: application/json

{
  "name": "Expense Approval",
  "description": "Process for approving employee expenses",
  "bpmnXml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>..."
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "Expense Approval",
  "version": 1,
  "status": "draft",
  "createdAt": "2024-01-21T09:00:00Z"
}
```

### Update Workflow

```http
PUT /workflows/:id
Content-Type: application/json

{
  "name": "Expense Approval v2",
  "description": "Updated process",
  "bpmnXml": "<?xml version=\"1.0\"..."
}
```

Only `draft` workflows can be updated. Returns `409 Conflict` if workflow is published.

### Delete Workflow

```http
DELETE /workflows/:id
```

Only `draft` workflows can be deleted. Returns `409 Conflict` if workflow is published or has instances.

### Publish Workflow

```http
POST /workflows/:id/publish
```

Creates a new published version. The draft becomes the new published version.

**Response:**
```json
{
  "id": "uuid",
  "version": 2,
  "status": "published",
  "publishedAt": "2024-01-21T10:00:00Z"
}
```

### Import BPMN

```http
POST /workflows/:id/import
Content-Type: multipart/form-data

file: <bpmn-file.bpmn>
```

### Export BPMN

```http
GET /workflows/:id/export
Accept: application/xml
```

Returns raw BPMN XML file.

---

## Workflow Instances

### List Instances

```http
GET /instances?status=running&workflowId=uuid&page=1&limit=20
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | `running`, `completed`, `failed`, `cancelled`, `suspended` |
| workflowId | uuid | Filter by workflow definition |
| correlationId | string | Filter by external correlation ID |
| startedAfter | datetime | Filter by start date (ISO 8601) |
| startedBefore | datetime | Filter by start date (ISO 8601) |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "workflowDefinitionId": "uuid",
      "workflowName": "Leave Request",
      "correlationId": "LR-2024-001",
      "status": "running",
      "startedAt": "2024-01-21T08:00:00Z",
      "currentTasks": [
        {
          "id": "uuid",
          "activityName": "Manager Approval",
          "status": "active",
          "assignedTo": "manager@example.com"
        }
      ]
    }
  ],
  "pagination": {...}
}
```

### Get Instance

```http
GET /instances/:id
```

**Response:**
```json
{
  "id": "uuid",
  "workflowDefinitionId": "uuid",
  "workflowDefinitionVersion": 2,
  "correlationId": "LR-2024-001",
  "status": "running",
  "variables": {
    "employeeId": "emp-123",
    "leaveType": "annual",
    "startDate": "2024-02-01",
    "endDate": "2024-02-05",
    "days": 5
  },
  "startedAt": "2024-01-21T08:00:00Z",
  "startedBy": {
    "id": "uuid",
    "name": "John Doe"
  },
  "currentTasks": [
    {
      "id": "uuid",
      "activityDefinition": {
        "id": "uuid",
        "bpmnElementId": "Task_ManagerApproval",
        "type": "userTask",
        "name": "Manager Approval",
        "config": {
          "formFields": [
            { "id": "approved", "type": "boolean", "label": "Approve?", "required": true },
            { "id": "comments", "type": "textarea", "label": "Comments" }
          ]
        }
      },
      "status": "active",
      "assignedTo": "manager@example.com",
      "createdAt": "2024-01-21T08:01:00Z",
      "slaStatus": {
        "isBreached": false,
        "isWarning": false,
        "currentDurationSeconds": 3600,
        "warningThresholdSeconds": 7200,
        "breachThresholdSeconds": 14400,
        "estimatedBreachAt": "2024-01-21T12:01:00Z"
      }
    }
  ],
  "completedTasks": [...],
  "timeline": [
    {
      "type": "workflow_started",
      "timestamp": "2024-01-21T08:00:00Z",
      "actor": "John Doe"
    },
    {
      "type": "task_created",
      "timestamp": "2024-01-21T08:00:05Z",
      "taskName": "Submit Request",
      "taskId": "uuid"
    },
    {
      "type": "task_completed",
      "timestamp": "2024-01-21T08:01:00Z",
      "taskName": "Submit Request",
      "actor": "John Doe"
    }
  ]
}
```

### Start Instance

```http
POST /instances
Content-Type: application/json

{
  "workflowDefinitionId": "uuid",
  "correlationId": "LR-2024-002",
  "variables": {
    "employeeId": "emp-456",
    "leaveType": "sick",
    "startDate": "2024-02-10",
    "endDate": "2024-02-11",
    "days": 2
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "workflowDefinitionId": "uuid",
  "correlationId": "LR-2024-002",
  "status": "running",
  "startedAt": "2024-01-21T11:00:00Z"
}
```

### Cancel Instance

```http
POST /instances/:id/cancel
Content-Type: application/json

{
  "reason": "Request withdrawn by employee"
}
```

### Suspend Instance

```http
POST /instances/:id/suspend
```

### Resume Instance

```http
POST /instances/:id/resume
```

---

## Tasks

### List Tasks

```http
GET /tasks?status=active&assignedTo=me&page=1&limit=20
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | `pending`, `active`, `completed`, `failed`, `skipped` |
| assignedTo | string | `me` for current user, or user ID |
| candidateGroup | string | Filter by candidate group |
| workflowInstanceId | uuid | Filter by instance |
| includeUnassigned | boolean | Include tasks claimable by current user |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "workflowInstanceId": "uuid",
      "workflowName": "Leave Request",
      "correlationId": "LR-2024-001",
      "activityName": "Manager Approval",
      "status": "active",
      "assignedTo": "manager@example.com",
      "createdAt": "2024-01-21T08:01:00Z",
      "dueAt": "2024-01-21T12:01:00Z",
      "slaStatus": {
        "isBreached": false,
        "isWarning": true,
        "currentDurationSeconds": 10800
      }
    }
  ],
  "pagination": {...}
}
```

### Get Task

```http
GET /tasks/:id
```

Returns task with full context including previous states and next possible activities.

**Response:**
```json
{
  "id": "uuid",
  "workflowInstanceId": "uuid",
  "activityDefinition": {
    "id": "uuid",
    "bpmnElementId": "Task_ManagerApproval",
    "type": "userTask",
    "name": "Manager Approval",
    "config": {
      "formKey": "approval-form",
      "formFields": [
        { "id": "approved", "type": "boolean", "label": "Approve Request?", "required": true },
        { "id": "comments", "type": "textarea", "label": "Comments", "required": false }
      ]
    }
  },
  "status": "active",
  "assignedTo": "manager@example.com",
  "variables": {
    "employeeName": "John Doe",
    "leaveType": "annual",
    "days": 5
  },
  "createdAt": "2024-01-21T08:01:00Z",
  "startedAt": "2024-01-21T08:01:00Z",
  "dueAt": "2024-01-21T12:01:00Z",
  "previousStates": [
    {
      "fromStatus": "pending",
      "toStatus": "active",
      "changedAt": "2024-01-21T08:01:00Z",
      "changedBy": null
    }
  ],
  "nextPossibleActivities": [
    {
      "id": "uuid",
      "bpmnElementId": "Task_HRReview",
      "name": "HR Review",
      "condition": "${approved == true && days > 3}"
    },
    {
      "id": "uuid",
      "bpmnElementId": "Task_NotifyEmployee",
      "name": "Notify Employee",
      "condition": "${approved == false}"
    }
  ],
  "slaStatus": {
    "isBreached": false,
    "isWarning": true,
    "currentDurationSeconds": 10800,
    "warningThresholdSeconds": 7200,
    "breachThresholdSeconds": 14400,
    "estimatedBreachAt": "2024-01-21T12:01:00Z",
    "escalationLevel": 0
  }
}
```

### Complete Task

```http
POST /tasks/:id/complete
Content-Type: application/json

{
  "variables": {
    "approved": true,
    "comments": "Approved. Enjoy your leave!"
  },
  "comment": "Reviewed and approved based on team availability"
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "uuid",
  "completedAt": "2024-01-21T11:30:00Z",
  "nextTasks": [
    {
      "id": "uuid",
      "activityName": "HR Review",
      "status": "pending"
    }
  ]
}
```

### Claim Task

```http
POST /tasks/:id/claim
```

Assigns the task to the current user.

### Unclaim Task

```http
POST /tasks/:id/unclaim
```

Removes assignment, making task available for others.

### Assign Task

```http
POST /tasks/:id/assign
Content-Type: application/json

{
  "assignTo": "user-uuid"
}
```

---

## SLA Monitoring

### Get Dashboard

```http
GET /sla/dashboard?workflowId=uuid&timeRange=24h
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| workflowId | uuid | Filter by workflow |
| timeRange | string | `1h`, `24h`, `7d`, `30d` |

**Response:**
```json
{
  "summary": {
    "totalTasksCompleted": 150,
    "slaBreaches": 12,
    "slaWarnings": 25,
    "complianceRate": 92.0,
    "averageCompletionTimeSeconds": 5400
  },
  "byWorkflow": [
    {
      "workflowId": "uuid",
      "workflowName": "Leave Request",
      "totalTasks": 80,
      "breaches": 5,
      "complianceRate": 93.75
    }
  ],
  "timeline": [
    {
      "timestamp": "2024-01-21T00:00:00Z",
      "completed": 15,
      "breaches": 1
    }
  ]
}
```

### List Breaches

```http
GET /sla/breaches?workflowId=uuid&severity=breach&acknowledged=false
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "taskInstanceId": "uuid",
      "taskName": "Manager Approval",
      "workflowInstanceId": "uuid",
      "correlationId": "LR-2024-001",
      "eventType": "breach",
      "thresholdSeconds": 14400,
      "actualDurationSeconds": 18000,
      "escalationLevel": 1,
      "acknowledged": false,
      "createdAt": "2024-01-21T12:01:00Z"
    }
  ],
  "pagination": {...}
}
```

### Acknowledge Breach

```http
POST /sla/breaches/:id/acknowledge
Content-Type: application/json

{
  "note": "Acknowledged - manager was on leave, reassigned to deputy"
}
```

---

## WebSocket Events

Connect to `/ws` for real-time updates.

### Subscribe to Instance

```json
{
  "action": "subscribe",
  "channel": "instance",
  "instanceId": "uuid"
}
```

### Events

```json
// Task created
{
  "event": "task.created",
  "data": {
    "taskId": "uuid",
    "instanceId": "uuid",
    "activityName": "Manager Approval"
  }
}

// Task completed
{
  "event": "task.completed",
  "data": {
    "taskId": "uuid",
    "instanceId": "uuid",
    "completedBy": "user@example.com"
  }
}

// SLA warning
{
  "event": "sla.warning",
  "data": {
    "taskId": "uuid",
    "instanceId": "uuid",
    "currentDurationSeconds": 7200,
    "threshold": 7200
  }
}

// SLA breach
{
  "event": "sla.breach",
  "data": {
    "taskId": "uuid",
    "instanceId": "uuid",
    "currentDurationSeconds": 14500,
    "threshold": 14400
  }
}

// Workflow completed
{
  "event": "workflow.completed",
  "data": {
    "instanceId": "uuid",
    "status": "completed"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "field": "variables.approved",
      "message": "approved is required"
    }
  ],
  "requestId": "req-abc123",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Operation not allowed in current state |
| 413 | Payload Too Large - File or request body exceeds limit |
| 422 | Unprocessable Entity - Business rule violation |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 502 | Bad Gateway - Upstream service unavailable |
| 503 | Service Unavailable - System overloaded or in maintenance |

### Domain-Specific Error Codes

Each error response includes a machine-readable `code` field for programmatic handling.

**Authentication Errors (AUTH_*):**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_TOKEN_EXPIRED` | 401 | JWT access token has expired; use refresh token |
| `AUTH_TOKEN_INVALID` | 401 | Token signature invalid or malformed |
| `AUTH_REFRESH_EXPIRED` | 401 | Refresh token expired; re-authenticate |
| `AUTH_PROVIDER_UNAVAILABLE` | 503 | External auth provider (LDAP/Keycloak) is unreachable |
| `AUTH_ACCOUNT_LOCKED` | 403 | Account locked after too many failed attempts |
| `AUTH_TENANT_INACTIVE` | 403 | Tenant has been deactivated |
| `AUTH_INSUFFICIENT_SCOPE` | 403 | API key lacks required permission scope |

**Workflow Errors (WF_*):**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `WF_DEFINITION_NOT_FOUND` | 404 | Workflow definition does not exist |
| `WF_DEFINITION_NOT_PUBLISHED` | 422 | Workflow exists but is not in published state |
| `WF_INSTANCE_NOT_FOUND` | 404 | Workflow instance does not exist |
| `WF_INSTANCE_ALREADY_COMPLETED` | 409 | Cannot modify a completed workflow instance |
| `WF_INSTANCE_CANCELLED` | 409 | Workflow instance has been cancelled |
| `WF_INSTANCE_SUSPENDED` | 409 | Workflow instance is suspended; resume before modifying |
| `WF_CORRELATION_DUPLICATE` | 409 | Workflow with this correlation ID already exists |
| `WF_VARIABLE_TYPE_MISMATCH` | 422 | Variable value does not match expected type |
| `WF_EXPRESSION_ERROR` | 422 | Condition expression failed to evaluate |
| `WF_NO_MATCHING_CONDITION` | 500 | Exclusive gateway has no matching condition and no default flow |
| `WF_MAX_INSTANCES_EXCEEDED` | 429 | Tenant has reached maximum concurrent workflow instances |
| `WF_VERSION_CONFLICT` | 409 | Concurrent modification detected; refresh and retry |
| `WF_MIGRATION_INCOMPATIBLE` | 422 | Instance cannot be migrated to target version |

**Task Errors (TASK_*):**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TASK_NOT_FOUND` | 404 | Task does not exist |
| `TASK_NOT_ASSIGNED` | 403 | Task is not assigned to the requesting user |
| `TASK_ALREADY_COMPLETED` | 409 | Task has already been completed |
| `TASK_ALREADY_CLAIMED` | 409 | Task was claimed by another user (race condition) |
| `TASK_FORM_VALIDATION_FAILED` | 422 | Submitted form data does not pass validation rules |
| `TASK_DELEGATION_CIRCULAR` | 422 | Delegation would create a circular delegation chain |
| `TASK_DELEGATION_TARGET_INVALID` | 404 | Delegation target user does not exist or is inactive |
| `TASK_TIMEOUT_EXPIRED` | 409 | Task timed out while awaiting completion |
| `TASK_FILE_UPLOAD_FAILED` | 500 | File upload failed during task completion |
| `TASK_FILE_QUARANTINED` | 422 | Uploaded file failed virus scan |
| `TASK_SCRIPT_TIMEOUT` | 500 | Script task exceeded execution time limit |
| `TASK_SCRIPT_MEMORY_EXCEEDED` | 500 | Script task exceeded memory limit |

**SLA Errors (SLA_*):**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SLA_DEFINITION_NOT_FOUND` | 404 | SLA definition does not exist |
| `SLA_SHIFT_CONFLICT` | 409 | Shift definitions overlap for the same time period |
| `SLA_NO_ACTIVE_SHIFT` | 422 | No business hours shift covers the current time |

**Integration Errors (INT_*):**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INT_WEBHOOK_SIGNATURE_INVALID` | 401 | Inbound webhook signature verification failed |
| `INT_WEBHOOK_ENDPOINT_UNREACHABLE` | 502 | Outbound webhook delivery failed |
| `INT_CONNECTOR_ERROR` | 502 | External connector returned an error |
| `INT_CONNECTOR_TIMEOUT` | 504 | External connector did not respond in time |
| `INT_CIRCUIT_BREAKER_OPEN` | 503 | Circuit breaker is open for the target service |
| `INT_RESPONSE_TOO_LARGE` | 502 | External service response exceeds size limit |
| `INT_RESPONSE_PARSE_ERROR` | 502 | External service returned unparseable response |

**AI Service Errors (AI_*):**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AI_PROVIDER_UNAVAILABLE` | 503 | AI provider API is unreachable |
| `AI_PROVIDER_RATE_LIMITED` | 429 | AI provider rate limit exceeded |
| `AI_PROVIDER_KEY_INVALID` | 503 | AI provider API key is invalid or expired |
| `AI_INVALID_OUTPUT` | 500 | AI generated invalid BPMN/JSON output |
| `AI_PROMPT_INJECTION` | 400 | Prompt injection pattern detected in input |
| `AI_INPUT_TOO_LONG` | 400 | Input exceeds maximum length (10,000 characters) |
| `AI_QUOTA_EXCEEDED` | 429 | Tenant AI usage quota exceeded for current period |

**File Storage Errors (FILE_*):**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `FILE_TOO_LARGE` | 413 | File exceeds maximum upload size |
| `FILE_TYPE_NOT_ALLOWED` | 422 | File MIME type is not in the allowed list |
| `FILE_STORAGE_FULL` | 507 | Storage quota exceeded |
| `FILE_NOT_FOUND` | 404 | Referenced file does not exist in storage |
| `FILE_VIRUS_DETECTED` | 422 | File failed virus/malware scan |

### Error Response Examples

**Task claim race condition:**
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "code": "TASK_ALREADY_CLAIMED",
  "message": "Task was claimed by another user",
  "details": {
    "taskId": "task-uuid",
    "claimedBy": "other-user-uuid",
    "claimedAt": "2024-01-15T10:30:00Z"
  },
  "requestId": "req-abc123"
}
```

**Workflow expression evaluation failure:**
```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "code": "WF_EXPRESSION_ERROR",
  "message": "Failed to evaluate gateway condition",
  "details": {
    "gatewayId": "Gateway_approval_check",
    "expression": "${amount > threshold}",
    "error": "Variable 'threshold' is undefined",
    "instanceId": "instance-uuid"
  },
  "requestId": "req-def456"
}
```

**Form validation failure:**
```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "code": "TASK_FORM_VALIDATION_FAILED",
  "message": "Form validation failed",
  "details": [
    {
      "field": "email",
      "rule": "format",
      "message": "Must be a valid email address",
      "value": "not-an-email"
    },
    {
      "field": "amount",
      "rule": "minimum",
      "message": "Must be greater than 0",
      "value": -5
    }
  ],
  "requestId": "req-ghi789"
}
```

**Rate limit exceeded:**
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "details": {
    "limit": 120,
    "remaining": 0,
    "resetAt": "2024-01-15T10:31:00Z",
    "retryAfterSeconds": 45
  },
  "requestId": "req-jkl012"
}
```

**Circuit breaker open:**
```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "code": "INT_CIRCUIT_BREAKER_OPEN",
  "message": "Circuit breaker is open for target service",
  "details": {
    "service": "payment-gateway",
    "failureCount": 5,
    "openedAt": "2024-01-15T10:25:00Z",
    "estimatedRecovery": "2024-01-15T10:26:00Z"
  },
  "requestId": "req-mno345"
}
```

---

## Task Delegation

### Delegate Task

```http
POST /tasks/:id/delegate
Content-Type: application/json

{
  "toUserId": "user-uuid",
  "reason": "Manager on leave, delegating to deputy"
}
```

**Response:**
```json
{
  "success": true,
  "delegation": {
    "id": "uuid",
    "taskInstanceId": "uuid",
    "fromUserId": "uuid",
    "toUserId": "uuid",
    "reason": "Manager on leave, delegating to deputy",
    "createdAt": "2024-01-21T10:00:00Z"
  }
}
```

### Get Active Delegations

```http
GET /delegations?type=active&userId=me
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| type | string | `active`, `outgoing`, `incoming`, `all` |
| userId | string | `me` or user ID |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "delegationType": "task",
      "fromUser": { "id": "uuid", "name": "John Doe" },
      "toUser": { "id": "uuid", "name": "Jane Smith" },
      "task": {
        "id": "uuid",
        "name": "Manager Approval",
        "workflowName": "Leave Request"
      },
      "reason": "Manager on leave",
      "validFrom": "2024-01-21T00:00:00Z",
      "validUntil": null,
      "isActive": true
    }
  ]
}
```

### Create Out-of-Office Delegation

```http
POST /delegations/out-of-office
Content-Type: application/json

{
  "toUserId": "user-uuid",
  "validFrom": "2024-02-01T00:00:00Z",
  "validUntil": "2024-02-15T23:59:59Z",
  "reason": "Annual leave"
}
```

### Cancel Delegation

```http
DELETE /delegations/:id
```

---

## Dead Letter Queue (Admin)

### List DLQ Items

```http
GET /admin/dlq?queue=workflow-execution&status=pending&page=1&limit=20
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| queue | string | Queue name filter |
| status | string | `pending`, `retried`, `resolved`, `discarded` |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "queueName": "workflow-execution",
      "jobId": "job-123",
      "jobName": "CONTINUE_EXECUTION",
      "jobData": {
        "workflowInstanceId": "uuid",
        "tokenId": "uuid"
      },
      "errorMessage": "Connection timeout to external service",
      "errorStack": "Error: ETIMEDOUT...",
      "failedAt": "2024-01-21T10:30:00Z",
      "retryCount": 5,
      "status": "pending",
      "createdAt": "2024-01-21T10:30:00Z"
    }
  ],
  "summary": {
    "totalPending": 12,
    "byQueue": {
      "workflow-execution": 5,
      "task-processing": 4,
      "notifications": 3
    }
  },
  "pagination": {...}
}
```

### Get DLQ Item

```http
GET /admin/dlq/:id
```

### Retry DLQ Item

```http
POST /admin/dlq/:id/retry
Content-Type: application/json

{
  "modifiedJobData": {
    "retryWithBackoff": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "newJobId": "job-456",
  "status": "retried"
}
```

### Resolve DLQ Item (Mark as Handled)

```http
POST /admin/dlq/:id/resolve
Content-Type: application/json

{
  "resolutionNotes": "Manually processed the workflow instance"
}
```

### Discard DLQ Item

```http
POST /admin/dlq/:id/discard
Content-Type: application/json

{
  "reason": "Duplicate job, original completed successfully"
}
```

### Bulk DLQ Operations

```http
POST /admin/dlq/bulk
Content-Type: application/json

{
  "action": "retry",
  "ids": ["uuid1", "uuid2", "uuid3"],
  "filter": {
    "queue": "workflow-execution",
    "status": "pending",
    "failedBefore": "2024-01-20T00:00:00Z"
  }
}
```

### Get DLQ Summary

```http
GET /admin/dlq/summary
```

**Response:**
```json
{
  "queues": [
    {
      "queueName": "workflow-execution",
      "total": 15,
      "pending": 10,
      "retried": 3,
      "resolved": 2,
      "oldestFailure": "2024-01-19T08:00:00Z"
    }
  ],
  "totalPending": 25,
  "alertThreshold": 50,
  "alertTriggered": false
}
```

---

## Audit Logs (Admin)

### List Audit Logs

```http
GET /admin/audit-logs?action=task.completed&resourceType=task_instance&startDate=2024-01-01
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| userId | uuid | Filter by user |
| action | string | Filter by action (e.g., `task.completed`, `workflow.created`) |
| resourceType | string | Filter by resource type |
| resourceId | uuid | Filter by specific resource |
| startDate | datetime | Start of date range |
| endDate | datetime | End of date range |
| requestId | string | Filter by request correlation ID |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userName": "John Doe",
      "action": "task.completed",
      "resourceType": "task_instance",
      "resourceId": "uuid",
      "resourceName": "Manager Approval",
      "oldValues": { "status": "active" },
      "newValues": { "status": "completed", "completedBy": "uuid" },
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "requestId": "req-12345",
      "createdAt": "2024-01-21T11:30:00Z"
    }
  ],
  "pagination": {...}
}
```

### Get Audit Log Entry

```http
GET /admin/audit-logs/:id
```

### Export Audit Logs

```http
POST /admin/audit-logs/export
Content-Type: application/json

{
  "format": "csv",
  "filters": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z"
  },
  "destination": "download"
}
```

**Response:**
```json
{
  "exportId": "uuid",
  "status": "processing",
  "downloadUrl": null
}
```

### Get Export Status

```http
GET /admin/audit-logs/export/:exportId
```

**Response:**
```json
{
  "exportId": "uuid",
  "status": "completed",
  "downloadUrl": "/api/v1/admin/audit-logs/export/uuid/download",
  "expiresAt": "2024-01-22T11:30:00Z",
  "recordCount": 15420
}
```

---

## Workflow Metrics

### Get Workflow Metrics

```http
GET /metrics/workflows/:workflowId?period=daily&startDate=2024-01-01&endDate=2024-01-31
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| period | string | `hourly`, `daily`, `weekly`, `monthly` |
| startDate | date | Start date (ISO 8601) |
| endDate | date | End date (ISO 8601) |

**Response:**
```json
{
  "workflowId": "uuid",
  "workflowName": "Leave Request",
  "period": "daily",
  "metrics": [
    {
      "periodStart": "2024-01-21T00:00:00Z",
      "periodEnd": "2024-01-21T23:59:59Z",
      "instancesStarted": 25,
      "instancesCompleted": 22,
      "instancesFailed": 1,
      "instancesCancelled": 2,
      "avgDurationSeconds": 14400,
      "p50DurationSeconds": 10800,
      "p95DurationSeconds": 28800,
      "slaWarnings": 5,
      "slaBreaches": 2,
      "slaComplianceRate": 91.0
    }
  ],
  "aggregated": {
    "totalInstances": 500,
    "avgComplianceRate": 92.5,
    "avgDurationSeconds": 15200
  }
}
```

### Get System Metrics

```http
GET /metrics/system
```

**Response:**
```json
{
  "queues": {
    "workflow-execution": { "depth": 15, "processing": 10, "failed": 2 },
    "task-processing": { "depth": 8, "processing": 20, "failed": 0 },
    "sla-monitoring": { "depth": 50, "processing": 20, "failed": 1 }
  },
  "database": {
    "activeConnections": 25,
    "idleConnections": 5,
    "avgQueryTimeMs": 12
  },
  "workers": {
    "active": 5,
    "idle": 3,
    "total": 8
  },
  "instances": {
    "running": 156,
    "completedToday": 89,
    "failedToday": 3
  }
}
```

---

## Webhooks

### List Webhook Configs

```http
GET /webhooks?direction=outbound
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Slack Notifications",
      "direction": "outbound",
      "url": "https://hooks.slack.com/services/...",
      "triggerEvents": ["workflow.completed", "sla.breach"],
      "isActive": true,
      "lastTriggeredAt": "2024-01-21T10:00:00Z",
      "successCount": 150,
      "failureCount": 2
    }
  ]
}
```

### Create Webhook Config

```http
POST /webhooks
Content-Type: application/json

{
  "name": "PagerDuty Alerts",
  "direction": "outbound",
  "url": "https://events.pagerduty.com/v2/enqueue",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "authType": "api_key",
  "authConfig": {
    "header": "Authorization",
    "value": "Token token=xxxx"
  },
  "triggerEvents": ["sla.breach", "workflow.failed"],
  "payloadTemplate": {
    "routing_key": "your-routing-key",
    "event_action": "trigger",
    "payload": {
      "summary": "{{event.type}}: {{task.name}}",
      "severity": "critical",
      "source": "flowengine"
    }
  },
  "retryEnabled": true,
  "maxRetries": 3
}
```

### Test Webhook

```http
POST /webhooks/:id/test
Content-Type: application/json

{
  "testEvent": "sla.breach",
  "testData": {
    "taskId": "test-123",
    "taskName": "Test Task"
  }
}
```

**Response:**
```json
{
  "success": true,
  "responseStatus": 200,
  "responseBody": "...",
  "latencyMs": 245
}
```

### Update Webhook

```http
PATCH /webhooks/:id
Content-Type: application/json

{
  "isActive": false
}
```

### Delete Webhook

```http
DELETE /webhooks/:id
```

### Get Inbound Webhook URL

```http
GET /webhooks/:id/endpoint
```

**Response:**
```json
{
  "webhookId": "uuid",
  "endpointUrl": "https://api.flowengine.com/webhooks/inbound/abc123",
  "secretKey": "whsec_...",
  "instructions": "Send POST requests to this URL with HMAC-SHA256 signature"
}
```

---

## Event Triggers

### List Event Triggers

```http
GET /triggers?workflowId=uuid&type=cron
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Weekly Report",
      "workflowDefinitionId": "uuid",
      "workflowName": "Generate Report",
      "triggerType": "cron",
      "config": {
        "expression": "0 9 * * MON",
        "timezone": "America/New_York"
      },
      "isActive": true,
      "lastTriggeredAt": "2024-01-15T09:00:00Z",
      "nextTriggerAt": "2024-01-22T09:00:00Z",
      "triggerCount": 52
    }
  ]
}
```

### Create Event Trigger

```http
POST /triggers
Content-Type: application/json

{
  "name": "Daily Cleanup",
  "workflowDefinitionId": "uuid",
  "triggerType": "cron",
  "config": {
    "expression": "0 2 * * *",
    "timezone": "UTC"
  },
  "inputVariables": {
    "cleanupType": "expired_sessions",
    "retentionDays": 30
  }
}
```

### Update Event Trigger

```http
PATCH /triggers/:id
Content-Type: application/json

{
  "config": {
    "expression": "0 3 * * *"
  },
  "isActive": true
}
```

### Manually Fire Trigger

```http
POST /triggers/:id/fire
Content-Type: application/json

{
  "overrideVariables": {
    "forceRun": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "workflowInstanceId": "uuid",
  "triggeredAt": "2024-01-21T11:00:00Z"
}
```

### Delete Event Trigger

```http
DELETE /triggers/:id
```

---

## API Keys (Admin)

### List API Keys

```http
GET /admin/api-keys
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Integration API Key",
      "keyPrefix": "fe_live_ab",
      "scopes": ["workflows:read", "instances:write"],
      "rateLimitPerMinute": 120,
      "rateLimitPerDay": 10000,
      "isActive": true,
      "expiresAt": null,
      "lastUsedAt": "2024-01-21T10:30:00Z",
      "usageCount": 15420,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Create API Key

```http
POST /admin/api-keys
Content-Type: application/json

{
  "name": "Order Processing Integration",
  "description": "API key for order management system",
  "scopes": ["instances:write", "tasks:read", "tasks:write"],
  "allowedWorkflows": ["uuid1", "uuid2"],
  "allowedIps": ["10.0.0.0/8"],
  "rateLimitPerMinute": 120,
  "rateLimitPerDay": 10000,
  "expiresAt": "2025-01-01T00:00:00Z"
}
```

**Response:**
```json
{
  "apiKey": {
    "id": "uuid",
    "name": "Order Processing Integration",
    "keyPrefix": "fe_live_xy",
    "scopes": ["instances:write", "tasks:read", "tasks:write"],
    "createdAt": "2024-01-21T11:00:00Z"
  },
  "secretKey": "fe_live_xyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Note:** The `secretKey` is only returned once on creation. Store it securely.

### Get API Key Usage

```http
GET /admin/api-keys/:id/usage?period=daily&days=30
```

**Response:**
```json
{
  "apiKeyId": "uuid",
  "name": "Order Processing Integration",
  "usage": [
    {
      "date": "2024-01-21",
      "requests": 1542,
      "errors": 12,
      "avgLatencyMs": 45
    }
  ],
  "totals": {
    "requests": 45000,
    "errors": 150,
    "errorRate": 0.33
  }
}
```

### Revoke API Key

```http
POST /admin/api-keys/:id/revoke
Content-Type: application/json

{
  "reason": "Security rotation"
}
```

### Delete API Key

```http
DELETE /admin/api-keys/:id
```

---

## Connectors

### List Connectors

```http
GET /connectors?type=email
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "connectorType": "email",
      "name": "SendGrid",
      "isActive": true,
      "isVerified": true,
      "lastVerifiedAt": "2024-01-20T10:00:00Z",
      "lastUsedAt": "2024-01-21T09:30:00Z"
    }
  ]
}
```

### Create Connector

```http
POST /connectors
Content-Type: application/json

{
  "connectorType": "slack",
  "name": "Slack Workspace",
  "config": {
    "botToken": "xoxb-...",
    "defaultChannel": "#workflow-alerts",
    "signingSecret": "..."
  }
}
```

### Test Connector

```http
POST /connectors/:id/test
Content-Type: application/json

{
  "testMessage": "This is a test from FlowEngine"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Test message sent successfully",
  "details": {
    "channel": "#workflow-alerts",
    "timestamp": "1705842600.123456"
  }
}
```

### Update Connector

```http
PATCH /connectors/:id
Content-Type: application/json

{
  "config": {
    "defaultChannel": "#alerts"
  }
}
```

### Delete Connector

```http
DELETE /connectors/:id
```

---

## Shifts & Business Hours

### Get Current Shift

```http
GET /shifts/current?timezone=America/New_York
```

**Response:**
```json
{
  "currentShift": {
    "name": "morning",
    "displayName": "Morning Shift",
    "startTime": "2024-01-21T06:00:00-05:00",
    "endTime": "2024-01-21T14:00:00-05:00",
    "remainingMinutes": 225
  },
  "nextShift": {
    "name": "afternoon",
    "displayName": "Afternoon Shift",
    "startTime": "2024-01-21T14:00:00-05:00",
    "endTime": "2024-01-21T22:00:00-05:00"
  },
  "assignedUsers": ["user-id-1", "user-id-2"],
  "assignedGroups": ["support-team-a"],
  "activeTasks": 23,
  "tasksDueSoon": 5
}
```

### Get Shift Schedule

```http
GET /shifts/schedule?startDate=2024-01-21&endDate=2024-01-27
```

**Response:**
```json
{
  "shifts": {
    "morning": {
      "name": "Morning Shift",
      "hours": { "start": "06:00", "end": "14:00" },
      "color": "#4CAF50"
    },
    "afternoon": {
      "name": "Afternoon Shift",
      "hours": { "start": "14:00", "end": "22:00" },
      "color": "#2196F3"
    }
  },
  "schedule": [
    {
      "date": "2024-01-21",
      "dayOfWeek": "Sunday",
      "shifts": ["morning"],
      "isHoliday": false
    },
    {
      "date": "2024-01-22",
      "dayOfWeek": "Monday",
      "shifts": ["morning", "afternoon"],
      "isHoliday": false
    }
  ]
}
```

### Update Shift Configuration (Admin)

```http
PUT /admin/shifts/config
Content-Type: application/json

{
  "mode": "shifts",
  "timezone": "America/New_York",
  "shifts": {
    "morning": {
      "name": "Morning Shift",
      "hours": { "start": "06:00", "end": "14:00" }
    },
    "afternoon": {
      "name": "Afternoon Shift",
      "hours": { "start": "14:00", "end": "22:00" }
    }
  },
  "schedule": {
    "monday": ["morning", "afternoon"],
    "tuesday": ["morning", "afternoon"],
    "wednesday": ["morning", "afternoon"],
    "thursday": ["morning", "afternoon"],
    "friday": ["morning"],
    "saturday": [],
    "sunday": []
  },
  "holidays": ["2024-12-25", "2025-01-01"]
}
```

### Update Shift Assignments (Admin)

```http
PUT /admin/shifts/assignments
Content-Type: application/json

{
  "morning": {
    "users": ["user-id-1", "user-id-2"],
    "groups": ["support-team-a"]
  },
  "afternoon": {
    "users": ["user-id-3", "user-id-4"],
    "groups": ["support-team-b"]
  }
}
```

### Initiate Shift Handoff

```http
POST /shifts/handoff
Content-Type: application/json

{
  "taskIds": ["uuid1", "uuid2"],
  "toShift": "afternoon",
  "handoffNote": "Pending approval from customer, expected response by 3pm"
}
```

**Response:**
```json
{
  "success": true,
  "handoffs": [
    {
      "taskId": "uuid1",
      "fromShift": "morning",
      "toShift": "afternoon",
      "newAssignee": "user-id-3"
    }
  ]
}
```

### Get Shift Metrics

```http
GET /shifts/metrics?date=2024-01-21
```

**Response:**
```json
{
  "date": "2024-01-21",
  "shifts": [
    {
      "name": "morning",
      "tasksCreated": 45,
      "tasksCompleted": 38,
      "avgCompletionTimeSeconds": 2400,
      "slaCompliance": 94.7,
      "handoffsOut": 5
    },
    {
      "name": "afternoon",
      "tasksCreated": 52,
      "tasksCompleted": 48,
      "avgCompletionTimeSeconds": 2100,
      "slaCompliance": 96.2,
      "handoffsIn": 5,
      "handoffsOut": 3
    }
  ]
}
```

---

## GraphQL API

FlowEngine also provides a GraphQL endpoint at `/graphql`.

### Endpoint

```http
POST /graphql
Content-Type: application/json
Authorization: Bearer <token>

{
  "query": "...",
  "variables": {...}
}
```

### Example Queries

**Get workflow with instances:**
```graphql
query GetWorkflow($id: ID!) {
  workflow(id: $id) {
    id
    name
    status
    version
    instances(first: 10, status: RUNNING) {
      edges {
        node {
          id
          correlationId
          status
          startedAt
          currentTasks {
            id
            name
            status
            assignedTo {
              name
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

**Get my tasks:**
```graphql
query MyTasks($first: Int, $after: String) {
  myTasks(first: $first, after: $after) {
    edges {
      node {
        id
        name
        status
        dueAt
        slaStatus {
          isBreached
          isWarning
          currentDurationSeconds
        }
        workflowInstance {
          correlationId
          workflow {
            name
          }
        }
      }
    }
  }
}
```

### Example Mutations

**Complete task:**
```graphql
mutation CompleteTask($id: ID!, $result: JSON, $comment: String) {
  completeTask(id: $id, result: $result, comment: $comment) {
    success
    task {
      id
      status
      completedAt
    }
    nextTasks {
      id
      name
    }
  }
}
```

**Start workflow:**
```graphql
mutation StartWorkflow($input: StartWorkflowInput!) {
  startWorkflow(input: $input) {
    id
    status
    startedAt
    currentTasks {
      id
      name
    }
  }
}
```

### Subscriptions

```graphql
subscription TaskUpdates($userId: ID!) {
  taskAssigned(userId: $userId) {
    id
    name
    workflowInstance {
      correlationId
    }
  }
}

subscription InstanceUpdates($instanceId: ID!) {
  instanceUpdated(id: $instanceId) {
    status
    currentTasks {
      id
      status
    }
  }
}

subscription SLAAlerts($workflowId: ID) {
  slaEvent(workflowId: $workflowId) {
    type
    task {
      id
      name
    }
    thresholdSeconds
    currentDurationSeconds
  }
}
```

### GraphQL Playground

Access the GraphQL Playground at `/graphql` in development mode for interactive query building and schema exploration.

---

## AI Service

AI-powered workflow design, form generation, and optimization features.

### Generate Workflow from Natural Language

```http
POST /ai/workflows/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "Create an employee onboarding workflow that collects personal information, assigns equipment, sets up accounts, and schedules orientation",
  "options": {
    "complexity": "moderate",
    "includeErrorHandling": true,
    "includeSLA": true,
    "includeNotifications": true,
    "style": "parallel"
  }
}
```

**Response:**
```json
{
  "success": true,
  "workflowDefinition": {
    "name": "Employee Onboarding",
    "description": "AI-generated employee onboarding workflow",
    "bpmnXml": "<?xml version=\"1.0\"...",
    "activities": [
      {
        "type": "userTask",
        "name": "Collect Personal Information",
        "config": {
          "formFields": [...]
        }
      }
    ]
  },
  "explanation": "This workflow handles employee onboarding with parallel processing for equipment and account setup...",
  "suggestions": [
    "Consider adding a manager approval step for equipment over $1000",
    "You may want to add IT verification for account creation"
  ],
  "tokens": {
    "prompt": 256,
    "completion": 1024,
    "total": 1280
  }
}
```

### Generate Form Schema

```http
POST /ai/forms/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "description": "Create a form for expense reimbursement with receipt upload, expense category, amount, date, and description",
  "options": {
    "includeFileUploads": true,
    "includeConditionalLogic": true,
    "maxFields": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "formSchema": [
    {
      "id": "expenseCategory",
      "type": "select",
      "label": "Expense Category",
      "required": true,
      "options": [
        { "value": "travel", "label": "Travel" },
        { "value": "meals", "label": "Meals & Entertainment" },
        { "value": "supplies", "label": "Office Supplies" },
        { "value": "other", "label": "Other" }
      ]
    },
    {
      "id": "amount",
      "type": "number",
      "label": "Amount",
      "required": true,
      "min": 0,
      "validation": { "min": 0.01 }
    },
    {
      "id": "receipt",
      "type": "file",
      "label": "Receipt",
      "required": true,
      "accept": "image/*,.pdf",
      "maxSize": "10MB"
    },
    {
      "id": "otherDescription",
      "type": "textarea",
      "label": "Description",
      "showIf": "${expenseCategory == 'other'}",
      "required": true
    }
  ],
  "explanation": "Generated form includes conditional logic for 'Other' category...",
  "tokens": {
    "prompt": 128,
    "completion": 512,
    "total": 640
  }
}
```

### Analyze and Optimize Workflow

```http
POST /ai/workflows/:id/analyze
Content-Type: application/json
Authorization: Bearer <token>

{
  "analysisType": "optimize",
  "includeMetrics": true
}
```

**Response:**
```json
{
  "success": true,
  "suggestions": [
    {
      "type": "performance",
      "priority": "high",
      "title": "Add parallel processing",
      "description": "Tasks 'Notify HR' and 'Notify IT' can run in parallel to reduce overall workflow duration by ~25%",
      "affectedActivities": ["Task_NotifyHR", "Task_NotifyIT"],
      "estimatedImpact": "25% faster completion"
    },
    {
      "type": "reliability",
      "priority": "medium",
      "title": "Add error boundary",
      "description": "The external API call in 'Sync to HRIS' should have error handling with retry logic",
      "affectedActivities": ["Task_SyncHRIS"]
    },
    {
      "type": "sla",
      "priority": "medium",
      "title": "Adjust SLA threshold",
      "description": "Based on historical data, the approval task SLA of 4 hours is breached 35% of the time. Consider extending to 8 hours or adding escalation",
      "affectedActivities": ["Task_ManagerApproval"]
    }
  ],
  "validationIssues": [
    {
      "severity": "warning",
      "activityId": "Gateway_1",
      "message": "Exclusive gateway has no default flow - may cause workflow to stall if no conditions match",
      "suggestion": "Add a default sequence flow"
    }
  ],
  "tokens": {
    "prompt": 2048,
    "completion": 768,
    "total": 2816
  }
}
```

### Chat with AI Assistant

```http
POST /ai/chat
Content-Type: application/json
Authorization: Bearer <token>

{
  "sessionId": "uuid",
  "message": "How can I add an approval step that requires two managers to approve?",
  "workflowContext": {
    "workflowDefinitionId": "uuid"
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "To implement dual-manager approval, you have a few options:\n\n1. **Sequential Approval**: Add two user tasks in sequence, each assigned to different managers...\n\n2. **Parallel Approval**: Use a parallel gateway to create two approval tasks simultaneously...",
    "timestamp": "2024-01-21T11:00:00Z"
  },
  "workflowActions": [
    {
      "type": "modify_workflow",
      "description": "Add parallel manager approval pattern",
      "payload": {
        "suggestedBpmnChanges": "..."
      }
    }
  ],
  "tokens": {
    "prompt": 512,
    "completion": 384,
    "total": 896
  }
}
```

### List Chat Sessions

```http
GET /ai/chat/sessions?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Approval workflow design",
      "messageCount": 12,
      "workflowContext": {
        "workflowDefinitionId": "uuid",
        "workflowName": "Purchase Approval"
      },
      "createdAt": "2024-01-21T09:00:00Z",
      "updatedAt": "2024-01-21T11:00:00Z"
    }
  ],
  "pagination": {...}
}
```

### Get Chat Session

```http
GET /ai/chat/sessions/:sessionId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Approval workflow design",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "How do I create a multi-level approval?",
      "timestamp": "2024-01-21T09:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Multi-level approval can be implemented using...",
      "timestamp": "2024-01-21T09:00:05Z",
      "metadata": {
        "tokens": 256,
        "model": "claude-3-sonnet"
      }
    }
  ],
  "workflowContext": {
    "workflowDefinitionId": "uuid"
  },
  "createdAt": "2024-01-21T09:00:00Z",
  "updatedAt": "2024-01-21T11:00:00Z"
}
```

### Delete Chat Session

```http
DELETE /ai/chat/sessions/:sessionId
Authorization: Bearer <token>
```

### Get AI Usage Statistics (Admin)

```http
GET /admin/ai/usage?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

**Response:**
```json
{
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "summary": {
    "totalRequests": 1250,
    "successfulRequests": 1180,
    "failedRequests": 70,
    "totalTokens": 2500000,
    "estimatedCost": 125.00
  },
  "byProvider": {
    "anthropic": {
      "requests": 800,
      "tokens": 1600000,
      "cost": 80.00
    },
    "openai": {
      "requests": 450,
      "tokens": 900000,
      "cost": 45.00
    }
  },
  "byOperation": {
    "workflow_generation": {
      "requests": 200,
      "tokens": 800000
    },
    "form_generation": {
      "requests": 350,
      "tokens": 400000
    },
    "optimization": {
      "requests": 150,
      "tokens": 600000
    },
    "chat": {
      "requests": 550,
      "tokens": 700000
    }
  }
}
```

### Configure AI Providers (Admin)

```http
GET /admin/ai/providers
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "providerType": "anthropic",
      "name": "Anthropic Claude",
      "isDefault": true,
      "isActive": true,
      "config": {
        "model": "claude-3-sonnet-20240229",
        "maxTokens": 4096
      },
      "rateLimits": {
        "requestsPerMinute": 60,
        "tokensPerMinute": 100000
      }
    },
    {
      "id": "uuid",
      "providerType": "ollama",
      "name": "Self-hosted Llama",
      "isDefault": false,
      "isActive": true,
      "config": {
        "baseUrl": "http://localhost:11434",
        "model": "llama3"
      }
    }
  ]
}
```

### Create AI Provider (Admin)

```http
POST /admin/ai/providers
Content-Type: application/json
Authorization: Bearer <token>

{
  "providerType": "openai",
  "name": "OpenAI GPT-4",
  "config": {
    "apiKey": "sk-...",
    "model": "gpt-4-turbo",
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "rateLimits": {
    "requestsPerMinute": 60,
    "tokensPerMinute": 100000
  },
  "isDefault": false
}
```

### Update AI Provider (Admin)

```http
PATCH /admin/ai/providers/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "isDefault": true,
  "config": {
    "model": "gpt-4o"
  }
}
```

### Test AI Provider (Admin)

```http
POST /admin/ai/providers/:id/test
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "latencyMs": 450,
  "modelResponse": "Connection successful. Model is responding correctly.",
  "modelInfo": {
    "model": "gpt-4-turbo",
    "maxContextLength": 128000
  }
}
```

### Delete AI Provider (Admin)

```http
DELETE /admin/ai/providers/:id
Authorization: Bearer <token>
```

Only allowed if provider is not the default and not currently in use.
