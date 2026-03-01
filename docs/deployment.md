# Deployment Guide

This guide covers deploying FlowEngine in various environments, from local development to production Kubernetes clusters.

## Prerequisites

- Docker 24+
- Docker Compose 2.20+ (for local development)
- Kubernetes 1.28+ (for production)
- Helm 3.12+ (optional, for K8s deployment)
- PostgreSQL 15+
- Redis 7+

---

## Local Development

### Using Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: flowengine
      POSTGRES_PASSWORD: flowengine
      POSTGRES_DB: flowengine
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flowengine"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://flowengine:flowengine@postgres:5432/flowengine
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: dev-secret-change-in-production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    command: ["node", "dist/worker.js"]
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://flowengine:flowengine@postgres:5432/flowengine
      REDIS_HOST: redis
      REDIS_PORT: 6379
      WORKER_CONCURRENCY: 10
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      replicas: 2

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "5173:80"
    environment:
      VITE_API_URL: http://localhost:3000/api/v1

volumes:
  postgres_data:
  redis_data:
```

### Starting the Stack

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f api worker

# Run database migrations
docker compose exec api npm run db:migrate

# Stop all services
docker compose down
```

---

## Docker Images

### API Dockerfile

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci

# Build application
COPY . .
RUN npm run build -w apps/api

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 flowengine

# Copy built application
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

USER flowengine

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### Web Dockerfile

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build -w apps/web

# Production image
FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Configuration

```nginx
# apps/web/nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # API proxy (if needed)
    location /api/ {
        proxy_pass http://api:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://api:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Kubernetes Deployment

### Namespace and ConfigMap

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: flowengine
---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: flowengine-config
  namespace: flowengine
data:
  NODE_ENV: "production"
  API_PORT: "3000"
  WORKER_CONCURRENCY: "10"
  LOG_LEVEL: "info"
```

### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: flowengine-secrets
  namespace: flowengine
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:password@postgres-service:5432/flowengine"
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  JWT_SECRET: "your-production-secret-here"
```

### API Deployment

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flowengine-api
  namespace: flowengine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: flowengine-api
  template:
    metadata:
      labels:
        app: flowengine-api
    spec:
      containers:
        - name: api
          image: flowengine/api:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: flowengine-config
            - secretRef:
                name: flowengine-secrets
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: flowengine-api-service
  namespace: flowengine
spec:
  selector:
    app: flowengine-api
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

### Worker Deployment

```yaml
# k8s/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flowengine-worker
  namespace: flowengine
spec:
  replicas: 5
  selector:
    matchLabels:
      app: flowengine-worker
  template:
    metadata:
      labels:
        app: flowengine-worker
    spec:
      containers:
        - name: worker
          image: flowengine/api:latest
          command: ["node", "dist/worker.js"]
          envFrom:
            - configMapRef:
                name: flowengine-config
            - secretRef:
                name: flowengine-secrets
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            exec:
              command:
                - node
                - dist/health-check.js
            initialDelaySeconds: 30
            periodSeconds: 30
```

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: flowengine-api-hpa
  namespace: flowengine
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: flowengine-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: flowengine-worker-hpa
  namespace: flowengine
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: flowengine-worker
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: redis_bullmq_queue_depth
          selector:
            matchLabels:
              queue: workflow-execution
        target:
          type: AverageValue
          averageValue: "100"
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: flowengine-ingress
  namespace: flowengine
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/websocket-services: flowengine-api-service
spec:
  tls:
    - hosts:
        - flowengine.example.com
      secretName: flowengine-tls
  rules:
    - host: flowengine.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: flowengine-api-service
                port:
                  number: 3000
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: flowengine-api-service
                port:
                  number: 3000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: flowengine-web-service
                port:
                  number: 80
```

---

## Database Setup

### PostgreSQL on Kubernetes

```yaml
# k8s/postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: flowengine
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: username
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: password
            - name: POSTGRES_DB
              value: flowengine
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: standard
        resources:
          requests:
            storage: 20Gi
```

### Running Migrations

```bash
# Create a migration job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: flowengine-migrate
  namespace: flowengine
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: flowengine/api:latest
          command: ["npm", "run", "db:migrate"]
          envFrom:
            - secretRef:
                name: flowengine-secrets
      restartPolicy: Never
  backoffLimit: 3
EOF

# Check migration status
kubectl logs -f job/flowengine-migrate -n flowengine
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_HOST` | Redis hostname | `redis-service` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | `your-secure-random-string` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `API_PORT` | API server port | `3000` |
| `WORKER_CONCURRENCY` | Jobs per worker | `10` |
| `LOG_LEVEL` | Logging level | `info` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW` | Rate limit window (ms) | `60000` |

---

## Monitoring

### Prometheus Metrics

The API exposes metrics at `/metrics`:

```yaml
# k8s/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: flowengine-monitor
  namespace: flowengine
spec:
  selector:
    matchLabels:
      app: flowengine-api
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### Key Metrics

- `workflow_instances_total` - Total workflow instances by status
- `task_instances_total` - Total tasks by status
- `sla_breaches_total` - Total SLA breaches
- `task_duration_seconds` - Task completion time histogram
- `queue_depth` - BullMQ queue depths
- `http_request_duration_seconds` - API latency

### Grafana Dashboard

Import the provided dashboard from `k8s/grafana-dashboard.json` for:
- Workflow execution metrics
- SLA compliance rates
- Queue processing rates
- API latency percentiles

---

## Backup and Recovery

### Database Backup

```bash
# Backup
kubectl exec -n flowengine postgres-0 -- \
  pg_dump -U flowengine flowengine | gzip > backup-$(date +%Y%m%d).sql.gz

# Restore
gunzip -c backup-20240121.sql.gz | \
  kubectl exec -i -n flowengine postgres-0 -- \
  psql -U flowengine flowengine
```

### Scheduled Backups

```yaml
# k8s/backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: flowengine-backup
  namespace: flowengine
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: postgres:15-alpine
              command:
                - /bin/sh
                - -c
                - |
                  pg_dump -h postgres-service -U flowengine flowengine | \
                  gzip | aws s3 cp - s3://backups/flowengine-$(date +%Y%m%d).sql.gz
              envFrom:
                - secretRef:
                    name: postgres-secrets
                - secretRef:
                    name: aws-credentials
          restartPolicy: OnFailure
```

---

## Troubleshooting

### Common Issues

**1. Workers not processing jobs**
```bash
# Check worker logs
kubectl logs -l app=flowengine-worker -n flowengine

# Check Redis connection
kubectl exec -it redis-0 -n flowengine -- redis-cli ping

# Check queue status
kubectl exec -it flowengine-api-xxx -n flowengine -- \
  node -e "const Bull = require('bullmq'); ..."
```

**2. Database connection errors**
```bash
# Test database connectivity
kubectl exec -it flowengine-api-xxx -n flowengine -- \
  node -e "const { Pool } = require('pg'); new Pool().query('SELECT 1');"

# Check connection pool
kubectl exec -it postgres-0 -n flowengine -- \
  psql -U flowengine -c "SELECT count(*) FROM pg_stat_activity;"
```

**3. High memory usage**
```bash
# Check pod resources
kubectl top pods -n flowengine

# Increase limits if needed
kubectl set resources deployment flowengine-worker \
  --limits=memory=1Gi -n flowengine
```

### Health Checks

```bash
# API health
curl http://flowengine.example.com/health

# Detailed health
curl http://flowengine.example.com/health/detailed
```

Response:
```json
{
  "status": "healthy",
  "components": {
    "database": { "status": "up", "latency": 5 },
    "redis": { "status": "up", "latency": 2 },
    "workers": { "status": "up", "active": 5 }
  },
  "version": "1.0.0",
  "uptime": 86400
}
```
