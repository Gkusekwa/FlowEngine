# Operations Guide

This document defines FlowEngine's operational infrastructure: database migration strategy, structured logging and log aggregation, Prometheus alerting rules, disaster recovery procedures, and audit log lifecycle management.

---

## 1. Database Migration Strategy

### Migration Tool

FlowEngine uses **TypeORM migrations** for all schema changes. Migrations are versioned, ordered, and applied automatically as part of the deployment pipeline.

### Migration File Structure

```
packages/database/
├── migrations/
│   ├── 1700000000000-InitialSchema.ts
│   ├── 1700000001000-AddUserSessions.ts
│   ├── 1700000002000-AddSLAEscalationLevel.ts
│   ├── 1700000003000-AddAuditLogPartitioning.ts
│   └── ...
├── seeds/
│   ├── 001-default-tenant.ts
│   └── 002-default-roles.ts
└── ormconfig.ts
```

### Migration Naming Convention

```
{timestamp}-{DescriptiveName}.ts

Examples:
1700000000000-InitialSchema.ts
1700000001000-AddApiKeysTable.ts
1700000002000-AddIndexOnTaskInstancesStatus.ts
1700000003000-AlterWorkflowDefinitionsAddChecksum.ts
```

### Migration Template

Each migration implements the TypeORM `MigrationInterface` with an `up` method for applying changes and a `down` method for reverting them. The `up` method executes raw SQL statements to create tables, add columns, and build indexes. The `down` method reverses those operations, typically by dropping the created tables or columns. For example, a migration to add an `api_keys` table would issue a `CREATE TABLE` statement defining columns such as `id` (UUID primary key), `tenant_id` (foreign key to tenants), `name`, `key_prefix`, `key_hash` (unique), `scopes` (JSONB), `ip_whitelist` (JSONB), `allowed_workflows` (JSONB), and timestamp columns for `expires_at`, `last_used_at`, `created_at`, and `revoked_at`. It would then create indexes on `key_hash` (filtered to non-revoked keys) and `tenant_id`. The `down` method would drop the `api_keys` table.

### Migration Execution

```bash
# Run pending migrations
npm run db:migrate

# Revert the last migration
npm run db:migrate:revert

# Generate a migration from entity changes (development only)
npm run db:migrate:generate -- -n AddNewColumn

# Show migration status
npm run db:migrate:show
```

### Kubernetes Migration Job

Migrations run as a Kubernetes Job before the API deployment rolls out:

```yaml
# k8s/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: flowengine-migration-{{ .Release.Revision }}
  annotations:
    helm.sh/hook: pre-upgrade,pre-install
    helm.sh/hook-weight: "-1"
    helm.sh/hook-delete-policy: before-hook-creation
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 300  # 5 minute timeout
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migration
          image: {{ .Values.api.image }}
          command: ["node", "dist/migration-runner.js"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: flowengine-secrets
                  key: database-url
```

### Zero-Downtime Migration Rules

To ensure migrations do not cause downtime:

| Operation | Safe? | Notes |
|-----------|-------|-------|
| `CREATE TABLE` | Yes | New tables don't affect running queries |
| `ADD COLUMN` (nullable, no default) | Yes | PostgreSQL adds without rewrite |
| `ADD COLUMN` (with default) | Yes (PG 11+) | PG 11+ adds without rewrite |
| `ADD INDEX CONCURRENTLY` | Yes | Non-blocking index creation |
| `DROP COLUMN` | Careful | Deploy code that ignores the column first, then drop |
| `RENAME COLUMN` | No | Deploy code that reads both names first |
| `ALTER COLUMN TYPE` | No | Requires table rewrite - use add+migrate+drop |
| `DROP TABLE` | No | Ensure no code references it first |
| `ADD NOT NULL` | No | Fails if existing rows have NULLs - backfill first |

### Multi-Phase Migration Pattern

For breaking changes, use a 3-phase approach:

```
Phase 1 (Migration): Add new column/table, keep old
Phase 2 (Deploy): Code reads from both, writes to both
Phase 3 (Cleanup): Drop old column/table after all instances updated
```

### Rollback Procedures

```bash
# 1. Identify the failed migration
npm run db:migrate:show

# 2. Revert the last applied migration
npm run db:migrate:revert

# 3. If multiple migrations need reverting
npm run db:migrate:revert  # Run multiple times

# 4. For emergency rollback in production
kubectl exec -it flowengine-api-0 -- node dist/migration-runner.js revert
```

---

## 2. Structured Logging

### Log Format

All FlowEngine services emit structured JSON logs to stdout. Log aggregation tools (ELK, Loki, Datadog) ingest these directly.

The logger is configured using the Winston logging library, integrated via `nest-winston`. In production, logs are emitted as JSON; in development, they are colorized and printed in a human-readable simple format. Each log entry automatically includes an ISO-format timestamp and, if applicable, a full error stack trace. Default metadata fields attached to every log message include the service name (from the `SERVICE_NAME` environment variable, defaulting to `flowengine-api`), the application version (from `APP_VERSION`, defaulting to `unknown`), and the current environment (from `NODE_ENV`, defaulting to `development`).

### Log Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "message": "Task completed",
  "service": "flowengine-api",
  "version": "1.2.0",
  "environment": "production",
  "requestId": "req-7f3a-4b2c-9d1e",
  "traceId": "abc123def456",
  "spanId": "789ghi",
  "tenantId": "tenant-abc",
  "userId": "user-123",
  "context": {
    "module": "TaskCompletionService",
    "method": "completeTask",
    "taskId": "task-456",
    "workflowInstanceId": "inst-789",
    "durationMs": 245
  }
}
```

### Log Levels by Module

| Module | Default Level | Verbose Level | Notes |
|--------|--------------|---------------|-------|
| HTTP requests | `info` | `debug` | Log method, path, status, duration |
| Authentication | `info` | `debug` | Log login/logout, never log credentials |
| Workflow execution | `info` | `debug` | Log state transitions |
| Task operations | `info` | `debug` | Log claim/complete/delegate |
| SLA monitoring | `info` | `debug` | Log warnings and breaches |
| Gateway evaluation | `info` | `debug` | Log condition results |
| Expression engine | `warn` | `debug` | Only log errors and sandbox violations |
| External integrations | `info` | `debug` | Log request/response (sanitized) |
| Database queries | `warn` | `debug` | Only slow queries (>500ms) by default |
| BullMQ workers | `info` | `debug` | Log job start/complete/fail |

### Request Logging Middleware

The request logging middleware is implemented as a NestJS middleware that intercepts every incoming HTTP request. When a request arrives, the middleware records the start time and either extracts the `X-Request-Id` header or generates a new UUID as the request identifier. This request ID is attached to the request object for downstream use and sent back to the client via the `X-Request-Id` response header.

When the response finishes, the middleware calculates the request duration and assembles a log payload containing the request ID, HTTP method, path, status code, duration in milliseconds, tenant ID (from the `X-Tenant` header), user agent, client IP address, and response content length. The log level is chosen based on the outcome: responses with status codes 500 or above are logged at the `error` level with the message "Request failed"; status codes 400 and above are logged at the `warn` level as "Request rejected"; responses that took longer than 1000 milliseconds are logged at the `warn` level as "Slow request"; and all other responses are logged at the `info` level as "Request completed".

### Environment Variables

```env
# Logging
LOG_LEVEL=info                        # Global minimum log level
LOG_FORMAT=json                       # json (production) or text (development)
LOG_SLOW_QUERY_THRESHOLD_MS=500       # Log queries slower than this
SERVICE_NAME=flowengine-api           # Service identifier in logs
APP_VERSION=1.2.0                     # Application version in logs
```

---

## 3. Log Aggregation

### ELK Stack (Elasticsearch, Logstash, Kibana)

```yaml
# k8s/filebeat-daemonset.yaml (ships container logs to Elasticsearch)
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: filebeat
spec:
  template:
    spec:
      containers:
        - name: filebeat
          image: docker.elastic.co/beats/filebeat:8.11.0
          volumeMounts:
            - name: varlog
              mountPath: /var/log
            - name: containers
              mountPath: /var/lib/docker/containers
              readOnly: true
          env:
            - name: ELASTICSEARCH_HOST
              value: elasticsearch.monitoring.svc:9200
```

### Grafana Loki (Lightweight Alternative)

```yaml
# k8s/promtail-config.yaml
scrape_configs:
  - job_name: flowengine
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app
    pipeline_stages:
      - json:
          expressions:
            level: level
            requestId: requestId
            tenantId: tenantId
            module: context.module
      - labels:
          level:
          tenantId:
          module:
```

---

## 4. Prometheus Alerting Rules

```yaml
# k8s/prometheus-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: flowengine-alerts
spec:
  groups:
    # ─── Application Health ───────────────────────────────
    - name: flowengine.health
      rules:
        - alert: FlowEngineAPIDown
          expr: up{job="flowengine-api"} == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "FlowEngine API is down"
            description: "No healthy API instances for 1 minute"
            runbook: "https://wiki.internal/runbooks/flowengine-api-down"

        - alert: FlowEngineWorkerDown
          expr: up{job="flowengine-worker"} == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "All FlowEngine workers are down"
            description: "No healthy worker instances for 2 minutes. Job processing has stopped."

        - alert: FlowEngineHighErrorRate
          expr: |
            (
              sum(rate(flowengine_http_requests_total{status=~"5.."}[5m]))
              /
              sum(rate(flowengine_http_requests_total[5m]))
            ) > 0.05
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "FlowEngine error rate above 5%"
            description: "{{ $value | humanizePercentage }} of requests returning 5xx"

        - alert: FlowEngineHighLatency
          expr: |
            histogram_quantile(0.95,
              sum(rate(flowengine_http_request_duration_seconds_bucket[5m])) by (le)
            ) > 2
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "FlowEngine P95 latency above 2s"
            description: "95th percentile request latency is {{ $value }}s"

    # ─── Database ──────────────────────────────────────────
    - name: flowengine.database
      rules:
        - alert: DatabaseConnectionPoolExhausted
          expr: flowengine_db_pool_active_connections / flowengine_db_pool_max_connections > 0.9
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Database connection pool >90% utilized"
            description: "{{ $value | humanizePercentage }} of connections in use"

        - alert: DatabaseSlowQueries
          expr: rate(flowengine_db_slow_queries_total[5m]) > 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Elevated slow database queries"
            description: "{{ $value }} slow queries per second (>500ms)"

        - alert: DatabaseDeadlocks
          expr: increase(flowengine_db_deadlocks_total[15m]) > 5
          for: 1m
          labels:
            severity: warning
          annotations:
            summary: "Database deadlocks detected"
            description: "{{ $value }} deadlocks in the last 15 minutes"

    # ─── Redis / Queues ────────────────────────────────────
    - name: flowengine.queues
      rules:
        - alert: RedisUnavailable
          expr: flowengine_redis_connected == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "Redis connection lost"
            description: "FlowEngine cannot connect to Redis. Queues and caching are offline."

        - alert: QueueDepthHigh
          expr: flowengine_queue_depth{queue="workflow-execution"} > 1000
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Workflow execution queue depth is high"
            description: "{{ $value }} jobs pending in workflow-execution queue"

        - alert: QueueDepthCritical
          expr: flowengine_queue_depth{queue="workflow-execution"} > 5000
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Workflow execution queue critically backed up"
            description: "{{ $value }} jobs pending. Workers may be down or overwhelmed."

        - alert: DeadLetterQueueGrowing
          expr: increase(flowengine_dead_letter_queue_total[1h]) > 10
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Dead letter queue is growing"
            description: "{{ $value }} new DLQ entries in the last hour. Investigate failures."

    # ─── SLA Monitoring ────────────────────────────────────
    - name: flowengine.sla
      rules:
        - alert: SLABreachRateHigh
          expr: |
            (
              sum(increase(flowengine_sla_breaches_total[1h]))
              /
              sum(increase(flowengine_tasks_completed_total[1h]))
            ) > 0.1
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "SLA breach rate above 10%"
            description: "{{ $value | humanizePercentage }} of completed tasks breached SLA"

        - alert: SLAEscalationFailed
          expr: increase(flowengine_sla_escalation_failures_total[30m]) > 0
          for: 1m
          labels:
            severity: warning
          annotations:
            summary: "SLA escalation failed"
            description: "{{ $value }} escalation failures in the last 30 minutes"

    # ─── Workflow Execution ────────────────────────────────
    - name: flowengine.execution
      rules:
        - alert: StuckWorkflowInstances
          expr: flowengine_stuck_instances_total > 0
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Stuck workflow instances detected"
            description: "{{ $value }} instances have had no progress for >1 hour"

        - alert: GatewayDeadlocks
          expr: increase(flowengine_gateway_deadlocks_total[1h]) > 0
          for: 1m
          labels:
            severity: warning
          annotations:
            summary: "Gateway deadlock detected"
            description: "{{ $value }} parallel gateway deadlocks in the last hour"

        - alert: HighWorkflowFailureRate
          expr: |
            (
              sum(rate(flowengine_workflow_instances_total{status="failed"}[30m]))
              /
              sum(rate(flowengine_workflow_instances_total[30m]))
            ) > 0.05
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "Workflow failure rate above 5%"
            description: "{{ $value | humanizePercentage }} of workflow instances failing"

    # ─── External Integrations ─────────────────────────────
    - name: flowengine.integrations
      rules:
        - alert: CircuitBreakerOpen
          expr: flowengine_circuit_breaker_state{state="open"} > 0
          for: 1m
          labels:
            severity: warning
          annotations:
            summary: "Circuit breaker open for {{ $labels.service }}"
            description: "External service {{ $labels.service }} has tripped the circuit breaker"

        - alert: WebhookDeliveryFailureRate
          expr: |
            (
              sum(rate(flowengine_webhook_deliveries_total{status="failed"}[30m]))
              /
              sum(rate(flowengine_webhook_deliveries_total[30m]))
            ) > 0.2
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Webhook delivery failure rate above 20%"

    # ─── Security ──────────────────────────────────────────
    - name: flowengine.security
      rules:
        - alert: HighAuthFailureRate
          expr: rate(flowengine_auth_failures_total[5m]) > 10
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Elevated authentication failure rate"
            description: "{{ $value }} auth failures per second. Possible brute-force attempt."

        - alert: RefreshTokenReuse
          expr: increase(flowengine_refresh_token_reuse_total[1h]) > 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "Refresh token reuse detected"
            description: "Possible token theft. {{ $value }} reuse attempts in the last hour."
```

### Distributed Tracing (OpenTelemetry)

FlowEngine integrates OpenTelemetry for distributed tracing across all services. This enables end-to-end request tracking through the workflow execution pipeline.

**Configuration:**

```typescript
// src/telemetry/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: process.env.SERVICE_NAME || 'flowengine-api',
});

sdk.start();
```

**Kubernetes Deployment with Jaeger:**

```yaml
# k8s/jaeger.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
    spec:
      containers:
        - name: jaeger
          image: jaegertracing/all-in-one:1.50
          ports:
            - containerPort: 16686  # UI
            - containerPort: 4318   # OTLP HTTP
          env:
            - name: COLLECTOR_OTLP_ENABLED
              value: "true"
```

**Trace Context Propagation:**

All HTTP requests and BullMQ jobs automatically propagate trace context via W3C Trace Context headers (`traceparent`, `tracestate`).

---

## 5. Disaster Recovery

### Backup Strategy

```
┌──────────────────────────────────────────────────────────┐
│                    Backup Architecture                     │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  PostgreSQL                                                │
│  ├── Continuous WAL Archiving → S3 (point-in-time)       │
│  ├── Daily pg_dump (logical backup) → S3 (retention: 30d)│
│  └── Weekly full backup → S3 Glacier (retention: 1 year) │
│                                                            │
│  Redis                                                     │
│  ├── RDB snapshots every 15 minutes                       │
│  ├── AOF persistence (every second fsync)                 │
│  └── Daily export to S3 (retention: 7 days)              │
│                                                            │
│  File Storage (S3/Azure/GCS)                              │
│  ├── Cross-region replication enabled                     │
│  └── Versioning enabled (retention: 90 days)             │
│                                                            │
│  Secrets / Configuration                                   │
│  ├── Kubernetes Secrets backed up via Velero              │
│  └── ConfigMaps versioned in Git                         │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### PostgreSQL Backup Configuration

```yaml
# k8s/postgres-backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: flowengine-db-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: postgres:18-alpine
              command:
                - /bin/sh
                - -c
                - |
                  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
                  FILENAME="flowengine_${TIMESTAMP}.sql.gz"
                  pg_dump "$DATABASE_URL" | gzip > "/tmp/${FILENAME}"
                  aws s3 cp "/tmp/${FILENAME}" "s3://${BACKUP_BUCKET}/postgres/${FILENAME}"
                  echo "Backup completed: ${FILENAME}"
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: flowengine-secrets
                      key: database-url
                - name: BACKUP_BUCKET
                  value: flowengine-backups
          restartPolicy: OnFailure
```

### Backup Verification

```yaml
# k8s/backup-verify-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: flowengine-backup-verify
spec:
  schedule: "0 6 * * 1"  # Weekly Monday at 6 AM UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: verify
              image: flowengine-backup-verifier:latest
              command:
                - /bin/sh
                - -c
                - |
                  # Download latest backup
                  LATEST=$(aws s3 ls s3://${BACKUP_BUCKET}/postgres/ | sort | tail -1 | awk '{print $4}')
                  aws s3 cp "s3://${BACKUP_BUCKET}/postgres/${LATEST}" /tmp/backup.sql.gz

                  # Restore to temporary database
                  createdb -h localhost flowengine_verify
                  gunzip -c /tmp/backup.sql.gz | psql -h localhost flowengine_verify

                  # Run integrity checks
                  psql -h localhost flowengine_verify -c "SELECT COUNT(*) FROM tenants;"
                  psql -h localhost flowengine_verify -c "SELECT COUNT(*) FROM workflow_definitions;"
                  psql -h localhost flowengine_verify -c "SELECT COUNT(*) FROM workflow_instances;"

                  # Cleanup
                  dropdb -h localhost flowengine_verify
                  echo "Backup verification passed"
          restartPolicy: OnFailure
```

### Recovery Procedures

#### Scenario 1: Database Corruption / Data Loss

```bash
# 1. Stop API and worker deployments
kubectl scale deployment flowengine-api --replicas=0
kubectl scale deployment flowengine-worker --replicas=0

# 2. Identify the recovery point
aws s3 ls s3://flowengine-backups/postgres/ | sort | tail -5

# 3. Restore from backup
BACKUP_FILE="flowengine_20240115_020000.sql.gz"
aws s3 cp "s3://flowengine-backups/postgres/${BACKUP_FILE}" /tmp/

# 4. Restore to database
gunzip -c "/tmp/${BACKUP_FILE}" | psql "${DATABASE_URL}"

# 5. Run any pending migrations
kubectl run migration --image=flowengine-api --command -- node dist/migration-runner.js

# 6. Restart services
kubectl scale deployment flowengine-api --replicas=3
kubectl scale deployment flowengine-worker --replicas=2

# 7. Verify health
curl https://api.flowengine.io/health/detailed
```

#### Scenario 2: Redis Data Loss

```bash
# Redis data loss is less critical because Redis is used for caching and queues.
# Cached data repopulates automatically. In-flight jobs need attention.

# 1. Check Redis health
redis-cli -h redis.svc ping

# 2. If Redis is fully down, restart the pod
kubectl delete pod flowengine-redis-0

# 3. After Redis recovers, restart workers to re-register repeatable jobs
kubectl rollout restart deployment flowengine-worker

# 4. Check for stuck workflow instances
# The self-healing engine will detect and recover stuck instances
curl https://api.flowengine.io/health/workers
```

#### Scenario 3: Full Cluster Recovery

```bash
# 1. Restore Kubernetes cluster (via Velero or cluster backup)
velero restore create --from-backup daily-backup-20240115

# 2. Verify all persistent volumes are restored
kubectl get pvc

# 3. Verify database connectivity
kubectl exec -it flowengine-postgres-0 -- psql -U flowengine -c "SELECT 1"

# 4. Run migrations (in case backup was slightly behind)
kubectl create job --from=cronjob/flowengine-migration flowengine-migration-recovery

# 5. Scale up services
kubectl scale deployment flowengine-api --replicas=3
kubectl scale deployment flowengine-worker --replicas=2

# 6. Verify end-to-end health
curl https://api.flowengine.io/health/detailed
```

### Recovery Time Objectives

| Scenario | RTO | RPO | Notes |
|----------|-----|-----|-------|
| Single pod failure | < 1 min | 0 | Kubernetes auto-restart |
| Database failover | < 5 min | 0 | Streaming replication |
| Full DB restore from backup | < 30 min | < 24 hours | Daily backup |
| Point-in-time recovery (WAL) | < 1 hour | < 1 min | Continuous archiving |
| Full cluster recovery | < 2 hours | < 24 hours | Velero + DB restore |

---

## 6. Audit Log Lifecycle Management

### Problem

The `audit_logs` table grows continuously and can become a performance bottleneck. Without lifecycle management, the table will degrade query performance and consume excessive storage.

### Partitioning Strategy

Audit logs are partitioned by month using PostgreSQL native table partitioning:

```sql
-- Convert audit_logs to a partitioned table
-- Run this as a migration (one-time)

-- 1. Create the partitioned parent table
CREATE TABLE audit_logs_partitioned (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 2. Create partitions for each month
-- Automated via cron job (see below)
CREATE TABLE audit_logs_2024_01
  PARTITION OF audit_logs_partitioned
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE audit_logs_2024_02
  PARTITION OF audit_logs_partitioned
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- ... (created automatically by partition maintenance job)

-- 3. Indexes on each partition (created automatically)
CREATE INDEX idx_audit_logs_2024_01_tenant ON audit_logs_2024_01(tenant_id);
CREATE INDEX idx_audit_logs_2024_01_action ON audit_logs_2024_01(action);
CREATE INDEX idx_audit_logs_2024_01_resource ON audit_logs_2024_01(resource_type, resource_id);
CREATE INDEX idx_audit_logs_2024_01_created ON audit_logs_2024_01(created_at DESC);
```

### Automatic Partition Maintenance

The partition manager is a maintenance service responsible for creating and dropping monthly partitions on the `audit_logs_partitioned` table. It is executed as a scheduled cron job (see the Kubernetes CronJob below).

When invoked, the partition manager performs two operations:

1. **Create future partitions.** It creates partitions for the current month and the next three months to ensure that incoming audit log records always have a valid partition to land in. For each month, it issues a `CREATE TABLE IF NOT EXISTS ... PARTITION OF` statement defining the date range, and then creates indexes on `tenant_id` and `action` for the new partition. If the partition already exists, the operation is silently skipped.

2. **Drop expired partitions.** It reads the retention period from the `AUDIT_LOG_RETENTION_MONTHS` environment variable (defaulting to 24 months). It queries `pg_inherits` to list all child partitions of the parent table, extracts the year and month from each partition name (e.g., `audit_logs_2023_01`), and compares the partition date against the retention cutoff. Partitions older than the cutoff are dropped. If the `AUDIT_ARCHIVE_BUCKET` environment variable is set, the partition data is archived to S3 before the table is dropped.

### Partition Maintenance Cron Job

```yaml
# k8s/partition-maintenance-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: flowengine-partition-maintenance
spec:
  schedule: "0 3 1 * *"  # 1st of each month at 3 AM UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: maintenance
              image: {{ .Values.api.image }}
              command: ["node", "dist/maintenance/partition-runner.js"]
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: flowengine-secrets
                      key: database-url
                - name: AUDIT_LOG_RETENTION_MONTHS
                  value: "24"
                - name: AUDIT_ARCHIVE_BUCKET
                  value: "flowengine-audit-archive"
          restartPolicy: OnFailure
```

### Additional Tables to Partition

| Table | Partition Key | Retention | Notes |
|-------|--------------|-----------|-------|
| `audit_logs` | `created_at` (monthly) | 24 months | Compliance requirement |
| `task_state_history` | `changed_at` (monthly) | 12 months | Operational data |
| `sla_events` | `created_at` (monthly) | 12 months | SLA compliance records |
| `trace_spans` | `created_at` (daily) | 7 days | High-volume diagnostic data |
| `workflow_metrics` | `recorded_at` (monthly) | 6 months | Aggregated performance data |

### Trace Data Cleanup

```yaml
# k8s/trace-cleanup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: flowengine-trace-cleanup
spec:
  schedule: "30 3 * * *"  # Daily at 3:30 AM UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: cleanup
              image: {{ .Values.api.image }}
              command:
                - /bin/sh
                - -c
                - |
                  psql "$DATABASE_URL" -c "
                    DELETE FROM trace_spans
                    WHERE created_at < NOW() - INTERVAL '${TRACE_RETENTION_DAYS:-7} days';
                  "
          restartPolicy: OnFailure
```

### Environment Variables

```env
# Audit log lifecycle
AUDIT_LOG_RETENTION_MONTHS=24         # How long to keep audit logs
AUDIT_ARCHIVE_BUCKET=flowengine-audit # S3 bucket for archived partitions

# Trace data lifecycle
TRACE_RETENTION_DAYS=7                # How long to keep trace spans

# Task history lifecycle
TASK_HISTORY_RETENTION_MONTHS=12      # How long to keep state history

# Backup
BACKUP_BUCKET=flowengine-backups
BACKUP_RETENTION_DAYS=30
BACKUP_VERIFY_ENABLED=true
```

---

## 7. Operational Runbook Quick Reference

| Alert | First Response | Escalation |
|-------|---------------|------------|
| `FlowEngineAPIDown` | Check pod logs, restart deployment | Page on-call engineer |
| `FlowEngineWorkerDown` | Check pod logs, check Redis connectivity | Page on-call engineer |
| `DatabaseConnectionPoolExhausted` | Check active queries (`pg_stat_activity`), kill long-running | Increase pool size |
| `RedisUnavailable` | Check Redis pod, restart if needed | Workers auto-reconnect |
| `QueueDepthCritical` | Scale up workers, check for stuck jobs | Investigate job failures |
| `DeadLetterQueueGrowing` | Review DLQ entries in admin UI, fix root cause | Manual retry or discard |
| `StuckWorkflowInstances` | Check self-healing engine logs | Manual instance recovery |
| `GatewayDeadlocks` | Identify stuck branch, consider force-merge | Manual intervention |
| `CircuitBreakerOpen` | Check external service health | Contact service owner |
| `HighAuthFailureRate` | Check for brute-force, review IPs | Block IPs if confirmed |
| `RefreshTokenReuse` | Revoke entire token family | Investigate compromised account |
