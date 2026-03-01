# External Application Integration Guide

This guide explains how to integrate your application with FlowEngine to automate business processes.

## Quick Start

### 1. Get API Credentials

Request an API key from your FlowEngine administrator:

```bash
# Your admin will provide:
# - API Key: fe_live_xxxxxxxxxxxxxxxxxx
# - Tenant Slug: your-company
# - Base URL: https://flowengine.your-company.com/api/v1
```

### 2. Test Connection

```bash
curl -X GET "https://flowengine.your-company.com/api/v1/workflows" \
  -H "Authorization: Bearer fe_live_xxxxxxxxxxxxxxxxxx" \
  -H "X-Tenant: your-company"
```

### 3. Start a Workflow

```bash
curl -X POST "https://flowengine.your-company.com/api/v1/instances" \
  -H "Authorization: Bearer fe_live_xxxxxxxxxxxxxxxxxx" \
  -H "X-Tenant: your-company" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowDefinitionId": "workflow-uuid",
    "correlationId": "ORDER-12345",
    "variables": {
      "orderId": "12345",
      "amount": 500,
      "customer": "john@example.com"
    }
  }'
```

---

## Authentication Methods

### Option 1: API Key (Recommended for Server-to-Server)

```http
GET /api/v1/workflows
Authorization: Bearer fe_live_xxxxxxxxxxxxxxxxxx
X-Tenant: your-company
```

**Best for:** Backend services, scheduled jobs, integrations

### Option 2: OAuth2/JWT (For User Context)

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "service@your-app.com",
  "password": "service-password",
  "tenantSlug": "your-company"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

Use the access token:
```http
GET /api/v1/workflows
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Best for:** Applications acting on behalf of users

---

## Common Integration Patterns

### Pattern 1: Fire-and-Forget Workflow

Start a workflow and don't wait for completion.

```http
POST /api/v1/instances
Authorization: Bearer {api_key}
X-Tenant: your-company
Content-Type: application/json

{
  "workflowDefinitionId": "order-approval-workflow-id",
  "correlationId": "ORDER-12345",
  "variables": {
    "orderId": "12345",
    "amount": 500,
    "customerId": "cust-789",
    "items": [{"sku": "ITEM-001", "qty": 2}]
  }
}
```

**Response (201 Created):**
```json
{
  "id": "instance-uuid",
  "status": "active",
  "correlationId": "ORDER-12345",
  "startedAt": "2024-01-15T10:30:00Z"
}
```

### Pattern 2: Webhook-Triggered Workflow

Configure FlowEngine to start workflows when your app sends a webhook.

**Step 1: Create an inbound webhook in FlowEngine**

```http
POST /api/v1/webhooks
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "name": "Order Created Webhook",
  "direction": "inbound",
  "triggerWorkflowId": "order-approval-workflow-id",
  "inputMapping": {
    "orderId": "$.body.id",
    "amount": "$.body.total",
    "customer": "$.body.customer.email"
  }
}
```

**Response:**
```json
{
  "id": "webhook-uuid",
  "endpointUrl": "https://flowengine.example.com/webhooks/inbound/abc123",
  "secretKey": "whsec_xxxxx"
}
```

**Step 2: Send webhook from your app**

```http
POST https://flowengine.example.com/webhooks/inbound/abc123
Content-Type: application/json
X-Webhook-Signature: sha256={hmac_sha256_of_body_using_secret_key}

{
  "id": "12345",
  "total": 500,
  "customer": { "email": "john@example.com" }
}
```

The signature is an HMAC-SHA256 hash of the request body using the `secretKey` returned during webhook creation.

### Pattern 3: Poll for Workflow Status

Check workflow status periodically.

```http
GET /api/v1/instances/{instanceId}
Authorization: Bearer {api_key}
X-Tenant: your-company
```

**Response:**
```json
{
  "id": "instance-uuid",
  "status": "completed",
  "correlationId": "ORDER-12345",
  "startedAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T11:15:00Z",
  "variables": {
    "orderId": "12345",
    "approved": true,
    "approvedBy": "manager@example.com"
  }
}
```

**Possible status values:** `active`, `completed`, `failed`, `cancelled`, `waiting`, `suspended`

**Recommended polling interval:** 5 seconds for short-lived workflows, 30-60 seconds for long-running workflows. Prefer webhooks over polling where possible.

### Pattern 4: Subscribe to Real-Time Events

Use WebSockets for real-time updates.

**Connection:**
```
wss://flowengine.example.com/ws?token={api_key}&tenant=your-company
```

**Subscribe to events:**
```json
{
  "action": "subscribe",
  "channel": "workflow",
  "correlationId": "ORDER-12345"
}
```

**Event types received:**

| Event | Description |
|-------|-------------|
| `workflow.started` | Workflow instance created |
| `workflow.completed` | Workflow finished successfully |
| `workflow.failed` | Workflow terminated with error |
| `task.created` | New user task awaiting action |
| `task.completed` | Task was completed |
| `sla.warning` | SLA approaching breach threshold |
| `sla.breach` | SLA was breached |

**Example event payload:**
```json
{
  "event": "workflow.completed",
  "timestamp": "2024-01-15T11:15:00Z",
  "data": {
    "instanceId": "instance-uuid",
    "correlationId": "ORDER-12345",
    "status": "completed",
    "variables": {
      "approved": true
    }
  }
}
```

### Pattern 5: Complete Tasks Programmatically

For service tasks or automated approvals.

**Step 1: List pending tasks**

```http
GET /api/v1/tasks?status=active&assignedTo=auto-approver-user-id
Authorization: Bearer {api_key}
X-Tenant: your-company
```

**Step 2: Get task details**

```http
GET /api/v1/tasks/{taskId}
Authorization: Bearer {api_key}
X-Tenant: your-company
```

**Response:**
```json
{
  "id": "task-uuid",
  "name": "Approve Order",
  "status": "active",
  "assignedTo": "auto-approver-user-id",
  "variables": {
    "orderId": "12345",
    "amount": 75
  }
}
```

**Step 3: Complete the task**

```http
POST /api/v1/tasks/{taskId}/complete
Authorization: Bearer {api_key}
X-Tenant: your-company
Content-Type: application/json

{
  "variables": {
    "approved": true,
    "approvedBy": "auto-approver",
    "approvalMethod": "automatic"
  },
  "comment": "Auto-approved: amount under threshold"
}
```

### Pattern 6: Receive Outbound Webhooks

Get notified when workflow events occur.

**Step 1: Create outbound webhook in FlowEngine**

```http
POST /api/v1/webhooks
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "name": "Order Status Updates",
  "direction": "outbound",
  "url": "https://your-app.com/webhooks/flowengine",
  "method": "POST",
  "triggerEvents": ["workflow.completed", "task.completed", "sla.breach"],
  "authType": "bearer",
  "authConfig": {
    "token": "your-webhook-secret"
  },
  "payloadTemplate": {
    "event": "{{event.type}}",
    "orderId": "{{instance.variables.orderId}}",
    "status": "{{instance.status}}",
    "result": "{{instance.variables}}"
  }
}
```

**Step 2: Handle webhooks in your app**

Your webhook endpoint will receive POST requests with the configured payload. FlowEngine includes an `X-Webhook-Signature` header containing an HMAC-SHA256 signature of the request body for verification.

**Expected webhook payload:**
```json
{
  "event": "workflow.completed",
  "orderId": "12345",
  "status": "completed",
  "result": {
    "approved": true,
    "approvedBy": "manager@example.com"
  }
}
```

**Webhook delivery guarantees:**
- At-least-once delivery
- Automatic retries with exponential backoff (3 attempts)
- Failed deliveries logged for manual review
- Webhook endpoint must respond with 2xx status within 30 seconds

---

## GraphQL Integration

For flexible queries, use the GraphQL API.

```graphql
# Get workflow with current tasks
query GetOrderWorkflow($correlationId: String!) {
  instances(filter: { correlationId: $correlationId }) {
    edges {
      node {
        id
        status
        variables
        startedAt
        currentTasks {
          id
          name
          status
          assignedTo {
            name
            email
          }
          slaStatus {
            isBreached
            currentDurationSeconds
            estimatedBreachAt
          }
        }
      }
    }
  }
}
```

**GraphQL endpoint:** `https://flowengine.example.com/graphql`

**Required headers:**
```http
Authorization: Bearer {api_key}
X-Tenant: your-company
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Check request payload |
| 401 | Unauthorized | Check API key/token |
| 403 | Forbidden | Check permissions/scopes |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | State conflict (e.g., task already completed) |
| 422 | Validation Error | Check business rules |
| 429 | Rate Limited | Slow down requests |
| 500 | Server Error | Retry with backoff |

### Error Response Format

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "field": "variables.amount",
      "message": "amount must be a positive number"
    }
  ],
  "requestId": "req-12345"
}
```

### Retry Strategy

Integrations should implement exponential backoff for retryable errors:

| Attempt | Delay | Applies To |
|---------|-------|------------|
| 1 | 1 second + jitter | 429, 500, 502, 503, 504 |
| 2 | 2 seconds + jitter | 429, 500, 502, 503, 504 |
| 3 | 4 seconds + jitter | 429, 500, 502, 503, 504 |

**Non-retryable errors (4xx except 429):** Do not retry. Fix the request before retrying.

**Jitter:** Add random delay (0-1 second) to prevent thundering herd.

---

## Rate Limiting

FlowEngine enforces rate limits based on your API key tier:

| Tier | Requests/Min | Requests/Day |
|------|--------------|--------------|
| Free | 60 | 1,000 |
| Starter | 120 | 10,000 |
| Professional | 300 | 50,000 |
| Enterprise | Custom | Custom |

### Rate Limit Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 115
X-RateLimit-Reset: 1705842600
```

When rate limited (429 response), wait until the `X-RateLimit-Reset` timestamp (Unix epoch seconds) before retrying.

---

## Correlation IDs

Use correlation IDs to link FlowEngine workflows to your application's records. This allows you to look up workflow status using your own identifiers rather than FlowEngine's internal UUIDs.

**Starting a workflow with a correlation ID:**
```http
POST /api/v1/instances
Content-Type: application/json

{
  "workflowId": "order-approval",
  "correlationId": "ORDER-12345",
  "variables": { "orderId": "12345", "amount": 500 }
}
```

**Looking up a workflow by correlation ID:**
```http
GET /api/v1/instances?correlationId=ORDER-12345
```

**Best practices:**
- Use a consistent naming convention (e.g., `ORDER-{id}`, `INVOICE-{id}`)
- Correlation IDs must be unique per workflow definition within a tenant
- Store the FlowEngine `instanceId` in your database alongside your record for bidirectional lookup

---

## Best Practices

### 1. Use Idempotency

Prevent duplicate workflows by checking for existing instances with the same correlation ID before starting a new one. If a workflow with the given correlation ID already exists, return the existing instance instead of creating a duplicate.

### 2. Store Instance IDs

Save FlowEngine instance IDs in your application database to enable direct lookups without searching by correlation ID:

```sql
ALTER TABLE orders ADD COLUMN workflow_instance_id VARCHAR(36);
```

### 3. Handle Failures Gracefully

When a workflow start request fails:
- Log the error with full context for debugging
- Mark the record in your system for manual processing
- Alert the operations team for persistent failures
- Do not silently swallow errors

### 4. Use Webhooks for Async Updates

Prefer outbound webhooks over polling for workflow status updates. Webhooks provide immediate notification without the overhead of repeated API calls.

### 5. Secure Your Integration

- Store API keys in environment variables, never in source code
- Rotate API keys regularly
- Always validate webhook signatures before processing
- Use scoped API keys with minimal permissions:

| Scope | Use Case |
|-------|----------|
| `instances:write` | Starting workflows |
| `instances:read` | Checking workflow status |
| `tasks:read` | Listing pending tasks |
| `tasks:write` | Completing tasks |

---

## Troubleshooting

### Common Issues

**"Unauthorized" errors**
- Check API key is correct
- Verify `X-Tenant` header matches your tenant
- Ensure API key hasn't expired

**"Workflow not found" errors**
- Verify workflow ID is correct
- Check workflow is in "published" status
- Ensure you have access to the workflow

**Webhooks not received**
- Verify webhook URL is publicly accessible
- Check webhook is active in FlowEngine
- Verify signature validation logic

**Rate limiting**
- Implement exponential backoff
- Cache frequently accessed data
- Use webhooks instead of polling

### Debug Mode

Set the `X-Debug: true` header on API requests to receive additional diagnostic information in the response headers:

```http
GET /api/v1/instances/{id}
Authorization: Bearer {api_key}
X-Tenant: your-company
X-Debug: true
```

### Support

- Check API documentation at `/docs` or `/swagger`
- Use GraphQL Playground at `/graphql` for query testing
- Contact your FlowEngine administrator for API key issues

---

## Analytics & Business Intelligence Integration

FlowEngine provides multiple ways to connect workflow data to BI and analytics tools for reporting, dashboards, and data analysis.

### Data Access Options

| Method | Use Case | Real-time | Tools Supported |
|--------|----------|-----------|-----------------|
| Direct Database | Full data access, complex queries | Near real-time | All BI tools |
| REST API | Selective data, application integration | Real-time | Custom, PowerBI |
| GraphQL API | Flexible queries, nested data | Real-time | Custom, Hasura |
| Data Export | Batch processing, data warehousing | Scheduled | All BI tools |
| Streaming | Real-time dashboards, alerts | Real-time | Kafka consumers |

---

### Database Schema for Analytics

FlowEngine exposes analytics-friendly views in the `analytics` schema:

```sql
-- Key analytics views available:
analytics.workflow_instances_summary
analytics.task_performance_metrics
analytics.sla_compliance_report
analytics.user_productivity
analytics.process_bottlenecks
analytics.daily_volume_trends
```

**Workflow Instances Summary:**
```sql
CREATE VIEW analytics.workflow_instances_summary AS
SELECT
  wi.id AS instance_id,
  wd.key AS workflow_key,
  wd.name AS workflow_name,
  wd.version AS workflow_version,
  wi.correlation_id,
  wi.status,
  wi.started_at,
  wi.completed_at,
  EXTRACT(EPOCH FROM (wi.completed_at - wi.started_at)) AS duration_seconds,
  wi.started_by,
  wi.tenant_id,
  jsonb_extract_path_text(wi.variables, 'amount')::numeric AS amount,
  jsonb_extract_path_text(wi.variables, 'department') AS department,
  jsonb_extract_path_text(wi.variables, 'priority') AS priority,
  (SELECT COUNT(*) FROM task_instances ti WHERE ti.workflow_instance_id = wi.id) AS total_tasks,
  (SELECT COUNT(*) FROM task_instances ti WHERE ti.workflow_instance_id = wi.id AND ti.status = 'completed') AS completed_tasks
FROM workflow_instances wi
JOIN workflow_definitions wd ON wi.workflow_definition_id = wd.id;
```

**Task Performance Metrics:**
```sql
CREATE VIEW analytics.task_performance_metrics AS
SELECT
  ti.id AS task_id,
  ad.name AS task_name,
  ad.type AS task_type,
  wi.correlation_id,
  wd.name AS workflow_name,
  ti.status,
  ti.assigned_to,
  ti.created_at,
  ti.started_at,
  ti.completed_at,
  EXTRACT(EPOCH FROM (ti.started_at - ti.created_at)) AS wait_time_seconds,
  EXTRACT(EPOCH FROM (ti.completed_at - ti.started_at)) AS work_time_seconds,
  EXTRACT(EPOCH FROM (ti.completed_at - ti.created_at)) AS total_time_seconds,
  ss.warning_threshold_seconds,
  ss.breach_threshold_seconds,
  CASE
    WHEN EXTRACT(EPOCH FROM (ti.completed_at - ti.created_at)) > ss.breach_threshold_seconds THEN 'breached'
    WHEN EXTRACT(EPOCH FROM (ti.completed_at - ti.created_at)) > ss.warning_threshold_seconds THEN 'warning'
    ELSE 'on_time'
  END AS sla_status,
  ti.tenant_id
FROM task_instances ti
JOIN activity_definitions ad ON ti.activity_definition_id = ad.id
JOIN workflow_instances wi ON ti.workflow_instance_id = wi.id
JOIN workflow_definitions wd ON wi.workflow_definition_id = wd.id
LEFT JOIN sla_definitions ss ON ss.activity_definition_id = ad.id;
```

---

### Power BI Integration

#### Option 1: Direct Database Connection

1. Open Power BI Desktop
2. Click **Get Data** → **PostgreSQL database**
3. Enter connection details:
   ```
   Server: flowengine-db.your-company.com
   Database: flowengine
   ```
4. Select tables/views from the `analytics` schema

#### Option 2: REST API Connection

Use Power Query M to connect via the REST API:

```
Server: https://flowengine.your-company.com/api/v1
Authorization: Bearer {api_key}
Tenant: your-company
Endpoint: /instances?status=completed&limit=1000&include=variables,tasks
```

**Sample Power BI DAX Measures:**
```dax
// Average Process Duration (hours)
Avg Process Duration =
AVERAGEX(
    workflow_instances,
    DATEDIFF(workflow_instances[started_at], workflow_instances[completed_at], HOUR)
)

// SLA Compliance Rate
SLA Compliance Rate =
DIVIDE(
    COUNTROWS(FILTER(task_metrics, task_metrics[sla_status] = "on_time")),
    COUNTROWS(task_metrics),
    0
)

// Active Workflows
Active Workflows =
CALCULATE(
    COUNTROWS(workflow_instances),
    workflow_instances[status] IN {"active", "waiting"}
)

// Tasks Completed Today
Tasks Today =
CALCULATE(
    COUNTROWS(task_metrics),
    task_metrics[completed_at] >= TODAY()
)
```

**Recommended Dashboard Pages:**

| Page | Visuals |
|------|---------|
| Executive Summary | Active workflows card, SLA compliance card, tasks today card, volume trend line chart, status pie chart |
| SLA Performance | Compliance gauge (target: 95%), average duration bar chart, SLA status detail table |
| User Productivity | Tasks completed bar chart by user, hourly heatmap |

---

### Metabase Integration

#### Database Connection Setup

1. Navigate to **Admin** → **Databases** → **Add database**
2. Configure PostgreSQL connection:

```yaml
Database type: PostgreSQL
Display name: FlowEngine Analytics
Host: flowengine-db.your-company.com
Port: 5432
Database name: flowengine
Username: analytics_reader
Password: ********
Schemas: analytics
```

#### Pre-built Questions (Queries)

**Workflow Volume by Day:**
```sql
SELECT
  DATE_TRUNC('day', started_at) AS date,
  workflow_name,
  COUNT(*) AS workflows_started,
  COUNT(*) FILTER (WHERE status = 'completed') AS workflows_completed,
  AVG(duration_seconds) / 3600.0 AS avg_duration_hours
FROM analytics.workflow_instances_summary
WHERE started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', started_at), workflow_name
ORDER BY date DESC;
```

**SLA Performance by Task:**
```sql
SELECT
  task_name,
  workflow_name,
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE sla_status = 'on_time') AS on_time,
  COUNT(*) FILTER (WHERE sla_status = 'warning') AS warnings,
  COUNT(*) FILTER (WHERE sla_status = 'breached') AS breaches,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sla_status = 'on_time') / COUNT(*), 1) AS compliance_pct,
  ROUND(AVG(total_time_seconds) / 60, 1) AS avg_minutes
FROM analytics.task_performance_metrics
WHERE completed_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY task_name, workflow_name
ORDER BY compliance_pct ASC;
```

**User Workload Distribution:**
```sql
SELECT
  assigned_to,
  COUNT(*) AS tasks_assigned,
  COUNT(*) FILTER (WHERE status = 'completed') AS tasks_completed,
  COUNT(*) FILTER (WHERE status = 'active') AS tasks_pending,
  ROUND(AVG(work_time_seconds) / 60, 1) AS avg_work_minutes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sla_status = 'on_time') /
        NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0), 1) AS sla_compliance
FROM analytics.task_performance_metrics
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
  AND assigned_to IS NOT NULL
GROUP BY assigned_to
ORDER BY tasks_pending DESC;
```

---

### Apache Superset Integration

#### Database Connection

1. Go to **Data** → **Databases** → **+ Database**
2. Select **PostgreSQL**
3. Configure SQLAlchemy URI:

```
postgresql://analytics_reader:password@flowengine-db.your-company.com:5432/flowengine
```

**Advanced Configuration:**
```json
{
  "metadata_params": {},
  "engine_params": {
    "connect_args": {
      "options": "-csearch_path=analytics,public"
    }
  },
  "metadata_cache_timeout": {},
  "schemas_allowed_for_csv_upload": []
}
```

#### Virtual Datasets

Create virtual datasets for complex analytics:

**Process Efficiency Dataset:**
```sql
WITH process_stats AS (
  SELECT
    workflow_name,
    DATE_TRUNC('week', started_at) AS week,
    COUNT(*) AS total_instances,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    AVG(duration_seconds) AS avg_duration,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) AS median_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds) AS p95_duration
  FROM analytics.workflow_instances_summary
  WHERE started_at >= CURRENT_DATE - INTERVAL '12 weeks'
  GROUP BY workflow_name, DATE_TRUNC('week', started_at)
)
SELECT
  *,
  ROUND(100.0 * completed / NULLIF(total_instances, 0), 1) AS completion_rate,
  ROUND(avg_duration / 3600, 2) AS avg_hours,
  ROUND(median_duration / 3600, 2) AS median_hours,
  ROUND(p95_duration / 3600, 2) AS p95_hours
FROM process_stats;
```

**Task Queue Health Dataset:**
```sql
SELECT
  task_name,
  task_type,
  workflow_name,
  COUNT(*) FILTER (WHERE status = 'active') AS pending,
  COUNT(*) FILTER (WHERE status = 'active' AND
    EXTRACT(EPOCH FROM (NOW() - created_at)) > warning_threshold_seconds) AS at_risk,
  COUNT(*) FILTER (WHERE status = 'active' AND
    EXTRACT(EPOCH FROM (NOW() - created_at)) > breach_threshold_seconds) AS breached,
  AVG(wait_time_seconds) FILTER (WHERE status = 'completed') AS avg_wait_seconds,
  MAX(EXTRACT(EPOCH FROM (NOW() - created_at))) FILTER (WHERE status = 'active') AS oldest_task_seconds
FROM analytics.task_performance_metrics
GROUP BY task_name, task_type, workflow_name
HAVING COUNT(*) FILTER (WHERE status = 'active') > 0
ORDER BY breached DESC, at_risk DESC;
```

#### Recommended Dashboard Layout

| Row | Visuals | Width |
|-----|---------|-------|
| 1 | Active workflows count, Completion rate gauge, SLA compliance gauge, Tasks today count | 3+3+3+3 |
| 2 | Workflow volume timeseries, Status distribution pie | 8+4 |
| 3 | SLA by task bar chart, User productivity bar chart | 6+6 |
| 4 | Bottleneck heatmap | 12 |

---

### Tableau Integration

#### Tableau Desktop Connection

1. Open Tableau Desktop
2. Connect to **PostgreSQL**
3. Enter server details:
   - Server: `flowengine-db.your-company.com`
   - Database: `flowengine`
   - Schema: `analytics`

#### Custom SQL for Initial Extract

```sql
SELECT
  wi.id,
  wi.correlation_id,
  wd.name AS workflow_name,
  wd.key AS workflow_key,
  wi.status,
  wi.started_at,
  wi.completed_at,
  EXTRACT(EPOCH FROM (wi.completed_at - wi.started_at)) / 3600.0 AS duration_hours,
  wi.started_by,
  wi.tenant_id,
  wi.variables->>'department' AS department,
  wi.variables->>'region' AS region,
  (wi.variables->>'amount')::numeric AS amount,
  wi.variables->>'priority' AS priority,
  wi.variables->>'category' AS category,
  (SELECT COUNT(*) FROM task_instances t WHERE t.workflow_instance_id = wi.id) AS total_tasks,
  (SELECT COUNT(*) FROM task_instances t WHERE t.workflow_instance_id = wi.id AND t.status = 'completed') AS completed_tasks,
  (SELECT COUNT(*) FROM sla_events s WHERE s.workflow_instance_id = wi.id AND s.event_type = 'breach') AS sla_breaches
FROM workflow_instances wi
JOIN workflow_definitions wd ON wi.workflow_definition_id = wd.id
WHERE wi.started_at >= DATEADD('month', -6, CURRENT_DATE)
```

#### Recommended Calculated Fields

| Field | Formula |
|-------|---------|
| Process Cycle Time (Days) | `DATEDIFF('day', [Started At], [Completed At])` |
| SLA Status | `IF [Duration Hours] <= [SLA Target Hours] THEN "On Time" ELSEIF [Duration Hours] <= [SLA Target Hours] * 1.2 THEN "Warning" ELSE "Breached" END` |
| Completion Rate | `SUM(IF [Status] = "completed" THEN 1 ELSE 0 END) / COUNT([Id])` |
| Rolling 7-Day Average | `WINDOW_AVG(SUM([Count]), -6, 0)` |

#### Tableau Server Publishing

```bash
tabcmd publish "FlowEngine_Dashboard.twbx" \
  --name "FlowEngine Operations" \
  --project "Operations" \
  --db-username "analytics_reader" \
  --db-password "********" \
  --save-db-password \
  --refresh-enabled \
  --refresh-frequency daily
```

---

### Real-Time Streaming Analytics

For real-time dashboards, FlowEngine can stream events to message queues.

#### Kafka Integration

**Producer Configuration (FlowEngine side):**
```json
{
  "analytics": {
    "streaming": {
      "enabled": true,
      "provider": "kafka",
      "kafka": {
        "brokers": ["kafka1.example.com:9092", "kafka2.example.com:9092"],
        "topics": {
          "workflowEvents": "flowengine.analytics.workflows",
          "taskEvents": "flowengine.analytics.tasks",
          "slaEvents": "flowengine.analytics.sla"
        },
        "compression": "snappy",
        "batchSize": 100,
        "lingerMs": 50
      }
    }
  }
}
```

**Event Schema:**
```json
{
  "type": "workflow.completed",
  "timestamp": "2024-01-15T14:30:00Z",
  "tenantId": "your-company",
  "data": {
    "instanceId": "uuid",
    "workflowKey": "order-approval",
    "correlationId": "ORDER-12345",
    "status": "completed",
    "durationSeconds": 3600,
    "variables": {
      "amount": 500,
      "approved": true
    },
    "taskCount": 5,
    "slaBreaches": 0
  }
}
```

**Available Kafka Topics:**

| Topic | Events | Key |
|-------|--------|-----|
| `flowengine.analytics.workflows` | workflow.started, workflow.completed, workflow.failed | correlationId |
| `flowengine.analytics.tasks` | task.created, task.assigned, task.completed | taskId |
| `flowengine.analytics.sla` | sla.warning, sla.breach, sla.resolved | instanceId |

---

### Data Export API

For batch analytics and data warehousing:

**Export Workflow Data:**
```http
GET /api/v1/analytics/export/workflows
Authorization: Bearer {api_key}
X-Tenant: your-company

Query Parameters:
  format: csv | json | parquet
  startDate: 2024-01-01
  endDate: 2024-01-31
  workflows: order-approval,invoice-processing
  includeVariables: true
  includeTaskMetrics: true
```

**Export Response (JSON):**
```json
{
  "exportId": "export-uuid",
  "status": "processing",
  "format": "parquet",
  "estimatedRows": 150000,
  "downloadUrl": null,
  "expiresAt": null
}
```

**Check Export Status:**
```http
GET /api/v1/analytics/export/export-uuid
```

**Download When Ready:**
```json
{
  "exportId": "export-uuid",
  "status": "completed",
  "format": "parquet",
  "rows": 147832,
  "sizeBytes": 52428800,
  "downloadUrl": "https://flowengine.example.com/exports/export-uuid.parquet",
  "expiresAt": "2024-01-16T14:30:00Z"
}
```

**Scheduled Exports:**
```http
POST /api/v1/analytics/exports/scheduled
Content-Type: application/json

{
  "name": "Daily Workflow Export",
  "schedule": "0 2 * * *",
  "format": "parquet",
  "destination": {
    "type": "s3",
    "bucket": "your-data-lake",
    "path": "flowengine/workflows/",
    "partitionBy": ["date", "workflow_key"]
  },
  "query": {
    "dateRange": "previous_day",
    "workflows": ["*"],
    "includeVariables": true,
    "includeTaskMetrics": true
  }
}
```

---

### Common Analytics Metrics

| Metric | Description | SQL/Formula |
|--------|-------------|-------------|
| **Process Cycle Time** | Total time from start to completion | `completed_at - started_at` |
| **Wait Time** | Time task spent unassigned | `started_at - created_at` |
| **Work Time** | Time from assignment to completion | `completed_at - started_at` |
| **Throughput** | Workflows completed per time period | `COUNT(*) / time_period` |
| **SLA Compliance** | % of tasks completed within SLA | `on_time_tasks / total_tasks * 100` |
| **First-Time Right** | % completed without rework/rejection | `no_rejection / total * 100` |
| **Bottleneck Score** | Avg wait time / Avg total time | `avg_wait / avg_total` |
| **User Utilization** | Tasks completed / Available capacity | `completed / (hours * capacity)` |

---

### Security Considerations

**Read-Only Analytics User:**
```sql
-- Create analytics-specific database user
CREATE USER analytics_reader WITH PASSWORD 'secure_password';

-- Grant access only to analytics schema
GRANT USAGE ON SCHEMA analytics TO analytics_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO analytics_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
  GRANT SELECT ON TABLES TO analytics_reader;

-- Restrict access to sensitive data
REVOKE SELECT ON analytics.audit_logs FROM analytics_reader;
```

**Row-Level Security for Multi-Tenant:**
```sql
-- Enable RLS
ALTER TABLE analytics.workflow_instances_summary ENABLE ROW LEVEL SECURITY;

-- Create policy for tenant isolation
CREATE POLICY tenant_isolation ON analytics.workflow_instances_summary
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- Set tenant context in connection
SET app.tenant_id = 'your-company';
```

**IP Whitelisting:**
```json
{
  "analytics": {
    "allowedIPs": [
      "10.0.0.0/8",
      "192.168.1.100",
      "your-bi-server.example.com"
    ],
    "requireSSL": true
  }
}
```

---

## AI Agent Integration

FlowEngine supports AI-powered assistants to help users design workflows and create forms using natural language. This section covers the AI integration architecture and configuration.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FlowEngine Web UI                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Workflow Editor │  │  Form Designer  │  │   AI Chat Panel     │  │
│  │   (bpmn-js)     │  │                 │  │                     │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │             │
│           └────────────────────┴──────────────────────┘             │
│                                │                                    │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     FlowEngine API      │
                    │   /api/v1/ai/*          │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   AI Service Layer      │
                    │  ┌──────────────────┐   │
                    │  │ Prompt Templates │   │
                    │  │ Context Builder  │   │
                    │  │ Response Parser  │   │
                    │  └──────────────────┘   │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐   ┌─────────▼─────────┐   ┌────────▼────────┐
│    OpenAI       │   │    Anthropic      │   │   Azure OpenAI  │
│   GPT-4/4o      │   │   Claude 3.5      │   │   GPT-4         │
└─────────────────┘   └───────────────────┘   └─────────────────┘
```

### LLM Provider Configuration

Configure AI providers in your environment or configuration file:

**Environment Variables:**

```env
# Primary AI Provider
AI_PROVIDER=openai                    # openai | anthropic | azure | ollama
AI_MODEL=gpt-4o                       # Model identifier

# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...                 # Optional

# Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-...

# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Ollama (Self-hosted) Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:70b

# AI Service Settings
AI_MAX_TOKENS=4096
AI_TEMPERATURE=0.7
AI_TIMEOUT_MS=30000
AI_RATE_LIMIT_RPM=60                  # Requests per minute
AI_CACHE_TTL_SECONDS=3600             # Cache similar requests
```

### AI Features

| Feature | Endpoint | Description |
|---------|----------|-------------|
| Workflow Design | `POST /api/v1/ai/workflow/design` | Generate BPMN workflow from natural language |
| Workflow Optimization | `POST /api/v1/ai/workflow/optimize` | Analyze workflow and suggest improvements |
| Workflow Explanation | `POST /api/v1/ai/workflow/explain` | Generate natural language explanation of BPMN |
| Form Generation | `POST /api/v1/ai/form/generate` | Generate form schema from description |
| Field Suggestion | `POST /api/v1/ai/form/suggest-fields` | Suggest form fields based on task context |
| Interactive Chat | `POST /api/v1/ai/chat` | Conversational workflow assistant |

### AI-Assisted Workflow Design

The workflow design assistant converts natural language process descriptions into valid BPMN 2.0 XML.

**Request:**
```http
POST /api/v1/ai/workflow/design
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "description": "Create an employee onboarding workflow: 1. HR submits new employee details, 2. IT sets up accounts in parallel, 3. Manager assigns mentor, 4. Employee completes training, 5. HR conducts 30-day check-in, 6. 90-day review",
  "industry": "Technology",
  "complexity": "moderate",
  "includeErrorHandling": true,
  "includeSLA": true
}
```

**Response:**
```json
{
  "bpmnXml": "<?xml version=\"1.0\"?>...",
  "explanation": "The workflow includes parallel IT setup tasks, SLA timers on critical approvals, and error boundary events for timeout handling.",
  "suggestedVariables": [
    {
      "name": "employeeId",
      "type": "string",
      "description": "New employee identifier"
    },
    {
      "name": "startDate",
      "type": "date",
      "description": "Employee start date"
    },
    {
      "name": "mentorId",
      "type": "string",
      "description": "Assigned mentor user ID"
    }
  ],
  "suggestedForms": [
    {
      "taskId": "UserTask_submit_details",
      "taskName": "Submit Employee Details",
      "fields": [
        { "key": "fullName", "label": "Full Name", "type": "text", "required": true },
        { "key": "email", "label": "Email", "type": "email", "required": true },
        { "key": "department", "label": "Department", "type": "select", "required": true }
      ]
    }
  ],
  "warnings": ["Consider adding an escalation path if IT setup takes longer than 48 hours"]
}
```

**BPMN element ID conventions used by the AI:**

| Element Type | ID Pattern | Example |
|-------------|------------|---------|
| Start events | `StartEvent_N` | `StartEvent_1` |
| End events | `EndEvent_N` | `EndEvent_1` |
| User tasks | `UserTask_descriptive_name` | `UserTask_submit_details` |
| Service tasks | `ServiceTask_descriptive_name` | `ServiceTask_send_email` |
| Gateways | `Gateway_descriptive_name` | `Gateway_approval_decision` |
| Sequence flows | `Flow_source_target` | `Flow_start_submit` |

### AI-Assisted Form Generation

The form design assistant creates JSON Schema-based form definitions for workflow user tasks.

**Request:**
```http
POST /api/v1/ai/form/generate
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "description": "Customer feedback form with rating, comments, and follow-up preference",
  "taskContext": "Post-service feedback collection",
  "formType": "data_entry",
  "style": "compact"
}
```

**Response:**
```json
{
  "schema": {
    "type": "object",
    "required": ["rating", "feedbackType"],
    "properties": {
      "rating": {
        "type": "integer",
        "title": "Overall Rating",
        "description": "Rate your experience from 1-5",
        "minimum": 1,
        "maximum": 5
      },
      "feedbackType": {
        "type": "string",
        "title": "Feedback Type",
        "enum": ["praise", "suggestion", "complaint"]
      },
      "comments": {
        "type": "string",
        "title": "Comments",
        "maxLength": 2000
      },
      "followUp": {
        "type": "boolean",
        "title": "Request Follow-up",
        "default": false
      }
    }
  },
  "uiSchema": {
    "ui:order": ["rating", "feedbackType", "comments", "followUp"],
    "rating": { "ui:widget": "radio" },
    "comments": { "ui:widget": "textarea", "ui:placeholder": "Share your experience..." },
    "followUp": { "ui:help": "Check this if you'd like a representative to contact you" }
  },
  "explanation": "Compact feedback form with required rating and type, optional comments and follow-up toggle.",
  "validationRules": [
    {
      "field": "comments",
      "rule": "required_if",
      "message": "Please provide details for complaints",
      "expression": "{ \"if\": [{ \"==\": [{ \"var\": \"feedbackType\" }, \"complaint\"] }, true, false] }"
    }
  ]
}
```

**Supported form widgets:**

| Widget | Description |
|--------|-------------|
| `text` | Single line text input |
| `textarea` | Multi-line text |
| `number` | Numeric input |
| `select` | Dropdown selection |
| `radio` | Radio button group |
| `checkbox` | Single checkbox |
| `checkboxes` | Multiple checkboxes |
| `date` | Date picker |
| `datetime` | Date and time picker |
| `file` | File upload |
| `signature` | Signature capture |
| `richtext` | Rich text editor |

### Interactive Chat Assistant

The chat assistant supports conversational workflow design with context awareness.

**Request:**
```http
POST /api/v1/ai/chat
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "sessionId": "chat-session-uuid",
  "message": "Add an approval step before IT setup that requires manager sign-off",
  "context": {
    "workflowId": "workflow-uuid",
    "currentBpmnXml": "<?xml version=\"1.0\"?>...",
    "selectedElement": "ServiceTask_it_setup"
  }
}
```

**Response:**
```json
{
  "message": "I've added a manager approval task before the IT setup. The approval uses an exclusive gateway - if rejected, the process returns to HR for revision.",
  "actions": [
    {
      "type": "update_workflow",
      "payload": {
        "bpmnXml": "<?xml version=\"1.0\"?>..."
      }
    }
  ]
}
```

**Action types returned by the chat assistant:**

| Action Type | Description |
|-------------|-------------|
| `update_workflow` | Updates the BPMN XML in the editor |
| `update_form` | Updates the form schema |
| `update_form_ui` | Updates the form UI schema |
| `navigate` | Navigates to a different view |
| `highlight_element` | Highlights a BPMN element in the editor |

### Prompt Templates

FlowEngine uses structured prompt templates for consistent AI behavior. Templates can be customized per tenant.

**Available template categories:**

| Template | Purpose | Temperature |
|----------|---------|-------------|
| `WORKFLOW_DESIGN` | BPMN generation from descriptions | 0.3 |
| `FORM_GENERATION` | JSON Schema form creation | 0.3 |
| `WORKFLOW_OPTIMIZATION` | Process improvement suggestions | 0.5 |
| `NATURAL_LANGUAGE_QUERY` | Workflow data queries | 0.3 |

**Custom prompt override:**
```http
PUT /api/v1/admin/ai/prompts/{templateKey}
Content-Type: application/json

{
  "systemPrompt": "Custom system prompt for this tenant...",
  "examples": [
    { "input": "Example input", "output": "Expected output format" }
  ]
}
```

### AI Rate Limiting and Caching

AI requests are rate-limited per user and per tenant to manage costs:

| Tier | Requests/Min | Monthly Token Limit |
|------|-------------|---------------------|
| Free | 10 | 100,000 |
| Professional | 30 | 1,000,000 |
| Enterprise | Custom | Custom |

**Caching behavior:**
- Similar prompts (same description and context) return cached responses
- Cache TTL is configurable (default: 1 hour)
- Cache key is computed from a SHA-256 hash of the prompt and context
- Cache can be bypassed with the `X-No-Cache: true` header

### AI Security Considerations

**Input validation:**
- Maximum input length: 10,000 characters
- Prompt injection patterns are detected and blocked
- All text fields are sanitized before sending to LLM providers

**Output sanitization:**
- Script injection patterns removed from AI responses
- Generated BPMN XML validated against BPMN 2.0 schema
- Generated JSON Schema validated before applying to forms

**Data privacy:**
- No workflow data is stored by LLM providers (stateless API calls)
- Sensitive variable values can be redacted before sending to AI
- Self-hosted models (Ollama) available for air-gapped environments

### AI Usage Tracking

AI usage is tracked for billing and optimization:

```http
GET /api/v1/admin/ai/usage?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer {admin_api_key}
```

**Response:**
```json
{
  "summary": [
    {
      "feature": "workflow_design",
      "requestCount": 245,
      "totalInputTokens": 125000,
      "totalOutputTokens": 350000,
      "totalCost": 4.75,
      "avgLatencyMs": 3200
    },
    {
      "feature": "form_generation",
      "requestCount": 180,
      "totalInputTokens": 85000,
      "totalOutputTokens": 220000,
      "totalCost": 3.10,
      "avgLatencyMs": 2100
    }
  ]
}
```

### AI Best Practices

1. **Prompt Engineering**
   - Use clear, structured system prompts
   - Include examples for consistent output format
   - Specify constraints and validation rules

2. **Error Handling**
   - Gracefully handle API failures with fallback suggestions
   - Display meaningful error messages to users
   - Log errors for continuous improvement

3. **User Experience**
   - Show loading states during generation
   - Allow users to modify AI suggestions before applying
   - Provide undo/redo for AI-applied changes

4. **Cost Management**
   - Cache similar requests to reduce API calls
   - Use appropriate model tiers (smaller models for simple tasks)
   - Set usage quotas per tenant to prevent cost overruns

5. **Security**
   - Validate all AI-generated outputs before applying
   - Sanitize generated code and schemas
   - Never expose API keys to the client
