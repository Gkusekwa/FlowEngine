# FlowEngine - Enterprise Workflow Engine with SLA Monitoring

A modern, distributed workflow engine built with Node.js/TypeScript that supports BPMN 2.0 diagrams, real-time SLA monitoring, AI-assisted design, and a beautiful React-based UI. Designed for horizontal scalability, multi-tenancy, and enterprise-grade reliability.

## Features

### Core Workflow Engine

- **Visual Workflow Designer** - Drag-and-drop BPMN editor with bpmn-js
- **BPMN 2.0 Support** - Import/export standard BPMN XML files
- **Token-Based Execution** - Parallel flow support with fork/join gateways
- **Distributed Architecture** - Horizontally scalable with Redis/BullMQ
- **Complete Audit Trail** - Full state history for compliance
- **Fault Tolerance** - Retry policies, compensation handlers, circuit breakers
- **Transaction Reconciliation** - Automatic consistency checks between workflow state and external systems
- **Workflow Self-Healing** - Detects and recovers stuck, stale, or orphaned workflow instances

### Comprehensive Task Types

- **User Tasks** - Human tasks with dynamic forms, file uploads, and assignment
- **Service Tasks** - Automated HTTP calls, scripts, custom implementations
- **Script Tasks** - JavaScript, Groovy, Python execution in sandboxed environment
- **Business Rule Tasks** - DMN decision table evaluation
- **Send Tasks** - Multi-channel notifications (Email, Slack, Teams, SMS, Webhook)
- **Receive Tasks** - Wait for messages, signals, or webhooks
- **Manual Tasks** - Track external/offline work with instructions

### Dynamic Forms & File Handling

- **Rich Form Builder** - Text, number, date, select, multi-select, file upload fields
- **File Upload Support** - Multiple files, drag-and-drop, progress tracking
- **File Validation** - Type checking, size limits, virus scanning
- **External Storage** - S3, Azure Blob, Google Cloud Storage, MinIO, local filesystem
- **Metadata Extraction** - Automatic extraction for images and documents
- **Thumbnail Generation** - Automatic thumbnails for uploaded images

### SLA & Monitoring

- **SLA Monitoring** - Per-step SLA tracking with warnings, breaches, and escalations
- **Shift-Based Scheduling** - Support for rotating shifts with automatic handoffs
- **Business Hours** - Exclude non-working time from SLA calculations
- **Real-time Updates** - WebSocket-based live status updates

### AI-Powered Features

- **AI Workflow Designer** - Generate BPMN workflows from natural language descriptions
- **AI Form Generator** - Create form schemas from descriptions
- **Workflow Optimization** - AI-suggested improvements for existing workflows
- **Interactive Chat Assistant** - Conversational workflow design and assistance
- **Multi-Provider Support** - OpenAI, Anthropic, Azure OpenAI, Ollama (self-hosted)

### Integrations

- **Analytics & BI** - Connect to Power BI, Metabase, Superset, Tableau
- **Webhooks** - Inbound and outbound webhook configurations
- **Event Streaming** - Kafka, NATS, RabbitMQ, Redis Streams
- **API Keys** - Secure programmatic access with scopes and rate limits
- **Connectors** - Pre-built integrations for Email, Slack, Teams, databases

### Multi-Tenancy & Security

- **Multi-Tenant Architecture** - Shared database with row-level security
- **Authentication Providers** - Local, LDAP, Keycloak, OAuth2, SAML
- **Role-Based Access Control** - Granular permissions per tenant
- **API Rate Limiting** - Configurable per-key and per-user limits

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Gkusekwa/FlowEngine.git
cd FlowEngine

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database and Redis connection details

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/flowengine

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API
API_PORT=3000
JWT_SECRET=your-secret-key

# Frontend
VITE_API_URL=http://localhost:3000/api/v1
```

## Project Structure

```
FlowEngine/
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── workflow/    # Workflow definition service
│   │   │   │   ├── execution/   # Execution engine
│   │   │   │   ├── task/        # Task management
│   │   │   │   └── sla/         # SLA monitoring
│   │   │   ├── infrastructure/
│   │   │   │   ├── database/    # TypeORM entities & migrations
│   │   │   │   └── queues/      # BullMQ configuration
│   │   │   └── workers/         # Background job workers
│   │   └── package.json
│   │
│   └── web/                 # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── workflow-editor/
│       │   │   ├── dashboard/
│       │   │   └── sla-monitoring/
│       │   ├── hooks/
│       │   ├── stores/
│       │   └── services/
│       └── package.json
│
├── packages/
│   └── shared/              # Shared types and utilities
│
├── docs/                    # Documentation
└── docker-compose.yml       # Local development setup
```

## Documentation

### Architecture & Design

- [Architecture Overview](./architecture.md) - System architecture, components, data flow
- [BPMN Support](./bpmn-support.md) - Supported BPMN elements and task configurations
- [Task Execution Mechanics](./task-execution.md) - Internal execution engine details
- [Domain Models](./domain-models.md) - TypeScript interfaces and types
- [Database Schema](./database-schema.md) - Entity relationships and migrations
- [Workflow Versioning](./workflow-versioning.md) - Multi-version execution, version lifecycle, multi-client tenancy, state machines

### API & Integration

- [API Reference](./api-reference.md) - REST and GraphQL endpoints
- [Error Code Registry](./error-codes.md) - Standardized error codes, response formats, client handling guide
- [SLA Monitoring Guide](./sla-monitoring.md) - SLA tracking and escalations
- [Integration Guide](./integration-guide.md) - Webhooks, triggers, connectors, AI agents, analytics & BI

### Security & Operations

- [Security Hardening](./security-hardening.md) - CORS, expression sandboxing, SSRF prevention, JWT lifecycle, LDAP safety, API key management
- [Concurrency & Integrity](./concurrency-integrity.md) - Distributed locking, race condition mitigation, optimistic concurrency, idempotency
- [Operations Guide](./operations-guide.md) - Migrations, logging, alerting, disaster recovery, audit log lifecycle
- [Deployment Guide](./deployment.md) - Production deployment instructions

## Tech Stack

### Backend
- **NestJS 10** - Modular Node.js framework with dependency injection
- **TypeORM** - Database ORM with migration support
  > *Note: [Drizzle ORM](https://orm.drizzle.team/) and [Prisma](https://www.prisma.io/) are modern alternatives with better type safety and query performance if starting fresh.*
- **Apollo Server** (`@nestjs/apollo`, `@nestjs/graphql`) - Code-first GraphQL API
- **Axios** (`@nestjs/axios`) - HTTP client for service tasks and external integrations
- **BullMQ** - Redis-backed distributed job queue
- **bpmn-moddle** - BPMN 2.0 XML parsing and validation
- **Sharp** - High-performance image processing (thumbnails, metadata extraction)
- **Socket.io** - Real-time WebSocket communication
- **Zod** - Runtime schema validation
- **@nestjs/throttler** - API rate limiting per key, user, and tenant tier
- **@nestjs/common CORS** - Origin-based CORS policy enforcement
- **OpenTelemetry** - Distributed tracing and observability

### Frontend
- **React 18** - UI framework with concurrent features
- **bpmn-js** - BPMN modeler and viewer
- **TailwindCSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **React Query (TanStack Query)** - Server state and caching

### Infrastructure
- **PostgreSQL 15+** - Primary database with JSONB support
- **Redis 7+** - Job queues, caching, and pub/sub
- **Docker** - Containerization and orchestration

### Testing & Quality
- **Vitest** - Fast unit and integration testing
- **Playwright** - End-to-end testing
- **ESLint + Prettier** - Code quality and formatting

## License

MIT License

Copyright (c) 2024 Kusekwa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.
