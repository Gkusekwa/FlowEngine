# Changelog

All notable changes to FlowEngine will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project documentation
- Architecture overview with system diagrams and Mermaid support
- BPMN 2.0 support documentation
- Task execution mechanics guide
- Domain models and TypeScript interfaces
- Database schema with multi-tenancy support
- Comprehensive API reference (REST and GraphQL)
- Error code registry with standardized response formats
- SLA monitoring guide with shift-based scheduling
- Integration guide for external applications
- Analytics & BI integration (Power BI, Metabase, Superset, Tableau)
- AI agent integration documentation
- Security hardening guide (CORS, expression sandboxing, SSRF, JWT, LDAP, API keys)
- Concurrency & data integrity guide (distributed locking, race conditions)
- Operations guide (migrations, logging, alerting, disaster recovery)
- Workflow versioning documentation (multi-version execution, state machines)
- Deployment guide (Docker, Kubernetes)
- OpenTelemetry distributed tracing configuration
- Refined tech stack with Zod validation and Vitest/Playwright testing

### Core Features Documented
- Visual workflow designer with bpmn-js
- Token-based execution model for parallel flows
- Distributed architecture with Redis/BullMQ
- Complete audit trail for compliance
- Fault tolerance with retry policies and circuit breakers
- Transaction reconciliation
- Workflow self-healing capabilities

### Task Types Documented
- User Tasks with dynamic forms and file uploads
- Service Tasks (HTTP, scripts, custom implementations)
- Script Tasks (JavaScript, Groovy, Python)
- Business Rule Tasks (DMN decision tables)
- Send Tasks (Email, Slack, Teams, SMS, Webhook)
- Receive Tasks (messages, signals, webhooks)
- Manual Tasks for external/offline work

### Security Features Documented
- Multi-tenant architecture with row-level security
- Authentication providers (Local, LDAP, Keycloak, OAuth2, SAML)
- Role-based access control
- API rate limiting and key management

---

## Version History

Future releases will be documented here following the format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Features to be removed in future versions

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security improvements
```

[Unreleased]: https://github.com/Gkusekwa/FlowEngine/compare/main...HEAD
