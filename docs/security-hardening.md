# Security Hardening Guide

This document defines FlowEngine's security architecture, threat mitigations, and required configurations for production deployments. It addresses CORS policy, expression sandboxing, SSRF prevention, JWT token lifecycle, LDAP injection prevention, API key management, and security headers.

---

## 1. CORS Policy

### Problem

The default `CORS_ORIGINS=*` permits any origin to make authenticated requests to the API, enabling cross-site request attacks from malicious websites.

### Policy

CORS must be explicitly configured per environment. The wildcard `*` is **only** permitted in local development.

### Configuration

CORS is handled by the built-in `@nestjs/common` CORS middleware (wrapping the `cors` npm package), configured in `src/common/config/cors.config.ts`. The options builder enforces the following behavior:

1. If `CORS_ORIGINS` is unset or set to `*` and `NODE_ENV` is `production`, the application throws an error at startup requiring explicit origin configuration.
2. In development (non-production), if `CORS_ORIGINS` is unset or `*`, all origins are allowed with credentials enabled.
3. In production, the `CORS_ORIGINS` value is split on commas to produce an allowlist of origins. Each incoming request origin is checked against this list. Requests with no origin (server-to-server calls, curl) are permitted. Any origin not on the list is rejected with an error.
4. Credentials are always enabled.
5. Allowed HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
6. Allowed request headers: `Authorization`, `Content-Type`, `X-Tenant`, `X-Request-Id`, `X-API-Key`.
7. Exposed response headers: `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
8. Preflight responses are cached for 600 seconds (10 minutes).

### Environment Variables

```env
# Required in production - comma-separated list of allowed origins
CORS_ORIGINS=https://app.flowengine.io,https://admin.flowengine.io

# Development (optional - defaults to allow all)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## 2. Expression Sandboxing

### Problem

FlowEngine evaluates user-defined expressions in gateway conditions (`${amount > 10000}`), variable mappings, assignee resolution, and form field `showIf` conditions. Without sandboxing, a malicious expression could execute arbitrary code, access the filesystem, or exfiltrate data.

### Architecture

All expressions run inside an isolated sandbox with strict resource limits. FlowEngine uses `isolated-vm` for V8 isolate-level sandboxing instead of Node.js `vm` (which is not a security boundary).

```
┌──────────────────────────────────────────────────────────┐
│                    Expression Engine                       │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  1. Parse expression string                               │
│  2. Validate against allowlist (syntax check)             │
│  3. Create isolated V8 context (isolated-vm)              │
│  4. Inject read-only variable snapshot                    │
│  5. Execute with CPU + memory limits                      │
│  6. Extract result value                                  │
│  7. Destroy isolate                                       │
│                                                            │
│  Blocked:                                                  │
│  ✗ require() / import                                     │
│  ✗ process, global, globalThis                            │
│  ✗ eval(), Function()                                     │
│  ✗ setTimeout, setInterval, setImmediate                  │
│  ✗ Proxy, Reflect                                         │
│  ✗ SharedArrayBuffer, Atomics                             │
│  ✗ File system, network, child_process                    │
│                                                            │
│  Allowed:                                                  │
│  ✓ Arithmetic operators (+, -, *, /, %)                   │
│  ✓ Comparison operators (==, !=, >, <, >=, <=, ===)      │
│  ✓ Logical operators (&&, ||, !)                          │
│  ✓ String methods (includes, startsWith, trim, etc.)      │
│  ✓ Array methods (includes, length, indexOf, etc.)        │
│  ✓ Math object (Math.floor, Math.ceil, Math.round, etc.) │
│  ✓ Date construction and comparison                       │
│  ✓ JSON.parse, JSON.stringify                             │
│  ✓ Template literals                                      │
│  ✓ Optional chaining (?.)                                 │
│  ✓ Nullish coalescing (??)                                │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Implementation

The `ExpressionSandbox` class (located at `src/engine/expression/sandbox.ts`) accepts three configurable options: `timeoutMs` (default 5000), `memoryLimitMb` (default 8), and `maxExpressionLength` (default 2048). Its `evaluate` method proceeds through the following steps:

1. **Length check.** If the expression exceeds `maxExpressionLength` characters, evaluation is rejected with an `EXPRESSION_FORBIDDEN_OPERATION` error.
2. **Static analysis.** The expression string is scanned against a list of forbidden patterns before any execution occurs. The following identifiers and calls are blocked: `require()`, dynamic `import()`, `process`, `global`, `globalThis`, `eval()`, `Function()`, `setTimeout`, `setInterval`, `setImmediate`, `Proxy`, `Reflect`, `__proto__`, `constructor`, and `prototype`. If any match is found, an `EXPRESSION_FORBIDDEN_OPERATION` error is thrown.
3. **Isolate creation.** A new `isolated-vm` V8 isolate is created with the configured memory limit.
4. **Variable injection.** Workflow variables are deep-copied into the isolate context as a read-only frozen object.
5. **Safe globals.** A restricted `Math` object is injected, exposing only `PI`, `E`, `abs`, `ceil`, `floor`, `round`, `min`, `max`, `pow`, and `sqrt`.
6. **Compilation and execution.** The expression is compiled and executed within the isolate using a `with(__vars)` wrapper, subject to the configured timeout.
7. **Error handling.** Timeouts produce an `EXPRESSION_TIMEOUT` error. All other runtime failures produce an `EXPRESSION_EVAL_ERROR`.
8. **Cleanup.** The isolate is always disposed after evaluation, regardless of success or failure.

### Environment Variables

```env
# Expression engine limits
EXPRESSION_TIMEOUT_MS=5000
EXPRESSION_MEMORY_LIMIT_MB=8
EXPRESSION_MAX_LENGTH=2048
```

---

## 3. SSRF Prevention

### Problem

Service tasks allow users to configure arbitrary HTTP endpoints. Without validation, an attacker could target internal services (`http://169.254.169.254/` for cloud metadata, `http://localhost:5432/` for the database) or private network ranges.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│           Service Task HTTP Client (Axios)                  │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Request URL                                               │
│       │                                                    │
│       ▼                                                    │
│  1. URL Parse & Scheme Check                               │
│     ├─ Only https:// and http:// allowed                  │
│     ├─ Block file://, ftp://, data:// etc.                │
│     └─ Block URLs with credentials (user:pass@host)       │
│       │                                                    │
│       ▼                                                    │
│  2. DNS Resolution (before connecting)                     │
│     └─ Resolve hostname to IP addresses                   │
│       │                                                    │
│       ▼                                                    │
│  3. IP Address Validation                                  │
│     ├─ Block: 127.0.0.0/8 (loopback)                     │
│     ├─ Block: 10.0.0.0/8 (private)                        │
│     ├─ Block: 172.16.0.0/12 (private)                     │
│     ├─ Block: 192.168.0.0/16 (private)                    │
│     ├─ Block: 169.254.0.0/16 (link-local / cloud meta)   │
│     ├─ Block: 100.64.0.0/10 (CGNAT)                      │
│     ├─ Block: ::1 (IPv6 loopback)                         │
│     ├─ Block: fc00::/7 (IPv6 ULA)                         │
│     ├─ Block: fe80::/10 (IPv6 link-local)                 │
│     └─ Allow: explicitly whitelisted internal hosts       │
│       │                                                    │
│       ▼                                                    │
│  4. Execute HTTP Request                                   │
│     ├─ Enforce timeout (default 10s)                      │
│     ├─ Enforce response size limit (default 10MB)         │
│     ├─ Do NOT follow redirects automatically              │
│     │   └─ If redirect → re-validate target URL (step 1) │
│     └─ Strip internal headers from outgoing requests      │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Implementation

The `SSRFGuard` class (located at `src/engine/http/ssrf-guard.ts`) validates every URL before an HTTP connection is established. It accepts an optional list of explicitly allowed internal hostnames. The validation performs the following checks in order:

1. **URL parsing.** The raw URL string is parsed. Malformed URLs are rejected with an `INTEGRATION_SSRF_BLOCKED` error.
2. **Scheme check.** Only `http:` and `https:` protocols are permitted. All other protocols (e.g., `file:`, `ftp:`, `data:`) are blocked.
3. **Embedded credentials.** URLs containing a username or password component (e.g., `http://user:pass@host`) are rejected.
4. **Allowed internal hosts bypass.** If the hostname (lowercased) appears in the configured internal hosts allowlist, validation passes without IP checks.
5. **DNS resolution.** The hostname is resolved to its IP addresses before any connection is made. If the hostname is already an IP literal, it is used directly. Unresolvable hostnames produce an `INTEGRATION_CONNECTION_FAILED` error.
6. **IP range blocking.** Every resolved IP address is checked against a blocklist of private and reserved CIDR ranges. The following ranges are blocked:
   - `127.0.0.0/8` (loopback)
   - `10.0.0.0/8` (RFC 1918 private)
   - `172.16.0.0/12` (RFC 1918 private)
   - `192.168.0.0/16` (RFC 1918 private)
   - `169.254.0.0/16` (link-local, cloud instance metadata)
   - `100.64.0.0/10` (Carrier-Grade NAT)
   - `0.0.0.0/8`
   - `::1/128` (IPv6 loopback)
   - `fc00::/7` (IPv6 Unique Local Address)
   - `fe80::/10` (IPv6 link-local)
7. **Unparseable IPs.** Any IP address that cannot be parsed is blocked by default.

If any resolved IP falls within a blocked range, the request is rejected with an `INTEGRATION_SSRF_BLOCKED` error.

### Redirect Handling

The HTTP client (`@nestjs/axios` wrapping Axios) does not follow redirects automatically. Instead, it enforces a maximum redirect count (default 5) and re-validates each redirect target through the full SSRF guard pipeline. For each request:

1. The current URL is validated through the SSRF guard.
2. The request is issued with redirect mode set to `manual`.
3. If the response status is 301, 302, 307, or 308, the `Location` header is extracted, resolved against the current URL, and becomes the new target.
4. The loop repeats from step 1 with the new URL.
5. If the maximum redirect count is exceeded, an `INTEGRATION_CONNECTION_FAILED` error is raised.

### Environment Variables

```env
# Comma-separated list of internal hostnames allowed for service tasks
# Use sparingly - only for internal APIs that workflows genuinely need to call
SSRF_ALLOWED_INTERNAL_HOSTS=internal-api.svc.cluster.local,legacy-erp.internal

# Maximum redirects to follow (default: 5)
SSRF_MAX_REDIRECTS=5
```

---

## 4. JWT Token Lifecycle & Revocation

### Problem

JWTs are stateless and cannot be individually revoked after issuance. If a token is compromised, it remains valid until expiration. Additionally, refresh token reuse must be detected to prevent token theft.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Token Lifecycle                          │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Login                                                     │
│    │                                                       │
│    ├─ Issue access token  (short-lived: 15 min)           │
│    ├─ Issue refresh token (long-lived: 7 days)            │
│    ├─ Hash refresh token → store in user_sessions table   │
│    └─ Assign token family ID (for rotation detection)     │
│                                                            │
│  Access Token Usage                                        │
│    │                                                       │
│    ├─ Validate signature + expiration                     │
│    ├─ Check Redis revocation list (token jti)             │
│    └─ Extract tenant_id, user_id, role, permissions       │
│                                                            │
│  Token Refresh                                             │
│    │                                                       │
│    ├─ Validate refresh token signature + expiration       │
│    ├─ Look up token hash in user_sessions                 │
│    ├─ If NOT found → refresh token was already used       │
│    │   └─ Revoke ALL tokens in this family (theft detect) │
│    ├─ If found → rotate:                                  │
│    │   ├─ Delete old session record                       │
│    │   ├─ Issue new access token                          │
│    │   ├─ Issue new refresh token (same family)           │
│    │   └─ Store new refresh token hash                    │
│    └─ Add old access token jti to Redis revocation list   │
│                                                            │
│  Logout                                                    │
│    │                                                       │
│    ├─ Add access token jti to Redis revocation list       │
│    ├─ Delete session record from user_sessions            │
│    └─ Optionally: revoke all sessions for user            │
│                                                            │
│  Password Change / Account Disable                        │
│    │                                                       │
│    ├─ Delete ALL user_sessions for this user              │
│    └─ Add ALL active token jtis to Redis revocation list  │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### JWT Claims Structure

The **access token** payload contains the following claims:

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | User ID |
| `email` | string | User email address |
| `tenant_id` | string | Tenant identifier |
| `role` | TenantRole | User role within the tenant |
| `permissions` | string[] | Granted permission strings |
| `auth_provider` | AuthProviderType | Authentication provider used |
| `jti` | string | Unique token ID (used for revocation) |
| `family` | string | Token family ID (used for rotation detection) |
| `iat` | number | Issued-at timestamp |
| `exp` | number | Expiration timestamp (15 minutes from `iat`) |

The **refresh token** payload contains a subset of these claims:

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | User ID |
| `tenant_id` | string | Tenant identifier |
| `jti` | string | Unique token ID |
| `family` | string | Token family ID |
| `iat` | number | Issued-at timestamp |
| `exp` | number | Expiration timestamp (7 days from `iat`) |

### Revocation List (Redis)

The `TokenRevocationService` (located at `src/auth/token-revocation.service.ts`) manages the Redis-based revocation list. It provides three operations:

1. **Revoke a single token.** The token's `jti` is written to Redis under the key `revoked:<jti>` with a TTL equal to the token's remaining lifetime. This ensures revocation entries auto-expire once the token would have expired naturally, preventing unbounded growth of the revocation list.
2. **Check revocation status.** A token is considered revoked if the key `revoked:<jti>` exists in Redis.
3. **Revoke all tokens for a user.** Used during password changes or account disabling. All active session `jti` values for the user are written to Redis with a generous 24-hour TTL (since the exact expiry of each token may not be known).

### Refresh Token Rotation Detection

The refresh flow (in `src/auth/auth.service.ts`) implements automatic refresh token rotation with theft detection:

1. The submitted refresh token's signature and expiration are verified.
2. The refresh token is hashed, and the hash is looked up in the `user_sessions` table.
3. **If no matching session is found**, the refresh token has already been consumed. This indicates a possible token theft: the legitimate user already rotated the token, and an attacker is replaying the old one. In response, the system revokes the entire token family, logs a critical audit event with action `AUTH_REFRESH_TOKEN_REUSED`, and throws an authentication error.
4. **If a matching session is found**, rotation proceeds: the old session record is deleted, a new access token and a new refresh token are issued (preserving the same family ID), and a new session record is stored with the new refresh token hash and access token `jti`.

### Environment Variables

```env
# Token lifetimes
JWT_ACCESS_TOKEN_EXPIRY=900          # 15 minutes (seconds)
JWT_REFRESH_TOKEN_EXPIRY=604800      # 7 days (seconds)
JWT_SECRET=<minimum 32 characters, generate with: openssl rand -base64 48>

# Session limits
JWT_MAX_SESSIONS_PER_USER=5          # Max concurrent sessions per user
JWT_SESSION_IDLE_TIMEOUT=1800        # 30 min idle → session expires (seconds)
```

---

## 5. LDAP Injection Prevention

### Problem

LDAP filter strings constructed from user input without sanitization allow an attacker to manipulate queries. For example, a username of `*)(uid=*))(|(uid=*` could bypass authentication.

### Mitigation

All user-supplied values are escaped using RFC 4515 before insertion into LDAP filter templates. Never concatenate raw user input into filter strings.

### Implementation

Two escaping functions are provided in `src/auth/ldap/ldap-escape.ts`:

1. **LDAP filter escaping (RFC 4515).** The `escapeLdapFilter` function escapes the characters `*`, `(`, `)`, `\`, and NUL (`\x00`) by replacing each with a backslash followed by its two-digit hexadecimal character code. This prevents injection into LDAP search filters.

2. **LDAP DN escaping (RFC 4514).** The `escapeLdapDn` function escapes the characters `,`, `+`, `"`, `\`, `<`, `>`, `;`, and `=` by prefixing each with a backslash. Leading and trailing spaces are also escaped. This prevents injection into Distinguished Name strings.

### Usage in LDAP Authentication

The LDAP authentication service (`src/auth/ldap/ldap-auth.service.ts`) follows this process:

1. **Input escaping.** The username is passed through `escapeLdapFilter` before being interpolated into the search filter template.
2. **Length validation.** Usernames exceeding 256 characters are rejected with a `VALIDATION_STRING_TOO_LONG` error.
3. **Filter construction.** The configured `userSearchFilter` template (e.g., `(uid={{username}})`) has the `{{username}}` placeholder replaced with the escaped value.
4. **Service account bind.** An LDAP client is created and bound using the service account credentials.
5. **User search.** The directory is searched under the configured `userSearchBase` with the constructed filter, requesting only the configured attributes (`usernameAttribute`, `emailAttribute`, `nameAttribute`). The search is limited to 1 result with a 10-second timeout.
6. **User bind.** If a matching entry is found, the service performs a bind operation using the found user's DN and the submitted password to verify the credentials. The password is never interpolated into any string.
7. **Cleanup.** The LDAP client is unbound in a `finally` block regardless of outcome.

### LDAP Service Account Credential Storage

LDAP bind credentials are stored encrypted in the `auth_providers.config` JSONB column. The encryption key is derived from a separate environment variable (`LDAP_CREDENTIAL_ENCRYPTION_KEY`), distinct from the JWT secret. Encryption is applied at write time and decrypted at read time.

```env
LDAP_CREDENTIAL_ENCRYPTION_KEY=<32-byte hex key, generate with: openssl rand -hex 32>
```

---

## 6. API Key Management

### Problem

API keys stored in plaintext in the database can be leaked through SQL injection, database backups, or unauthorized database access. API keys must be treated like passwords.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  API Key Lifecycle                         │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Creation                                                  │
│    │                                                       │
│    ├─ Generate random key: fe_live_ + 32 random bytes     │
│    ├─ Show full key to user ONCE (never stored)           │
│    ├─ Store SHA-256 hash of key in api_keys table         │
│    ├─ Store key prefix (first 8 chars) for identification │
│    └─ Record scopes, IP whitelist, expiry                 │
│                                                            │
│  Authentication                                            │
│    │                                                       │
│    ├─ Extract key from Authorization: Bearer header       │
│    ├─ Compute SHA-256 hash of submitted key               │
│    ├─ Look up hash in api_keys table                      │
│    ├─ Validate: not expired, tenant active, IP allowed    │
│    └─ Check required scope against granted scopes         │
│                                                            │
│  Rotation                                                  │
│    │                                                       │
│    ├─ Create new key (same scopes/config)                 │
│    ├─ Overlap period: both old and new key valid           │
│    ├─ After migration: revoke old key                     │
│    └─ Audit log records rotation event                    │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,          -- First 8 chars of key for display
    key_hash VARCHAR(64) NOT NULL,            -- SHA-256 hash (never store plaintext)
    scopes JSONB NOT NULL DEFAULT '[]',
    ip_whitelist JSONB DEFAULT '[]',          -- Empty = allow all
    allowed_workflows JSONB DEFAULT '[]',     -- Empty = allow all
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(key_hash)
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
```

### Implementation

The `ApiKeyService` (located at `src/auth/api-key.service.ts`) provides two main operations:

**Key creation** (`createKey`):

1. A random key is generated in the format `fe_live_` followed by 32 cryptographically random bytes encoded as base64url.
2. The SHA-256 hash of the full key is computed.
3. The first 12 characters of the key are stored as the `keyPrefix` for later identification in the UI.
4. A database record is created containing the hash, prefix, tenant, name, scopes, IP whitelist, and expiry.
5. The plaintext key is returned to the caller exactly once and is never persisted.

**Key authentication** (`authenticate`):

1. The SHA-256 hash of the submitted key is computed.
2. The hash is looked up in the `api_keys` table.
3. If no matching record is found, or if the key has been revoked, an `AUTH_API_KEY_INVALID` error is thrown.
4. If the key has an expiration date and it has passed, an `AUTH_API_KEY_EXPIRED` error is thrown.
5. If the key has a non-empty IP whitelist and the request IP is not on it, an `AUTHZ_IP_NOT_WHITELISTED` error is thrown.
6. The `last_used_at` timestamp is updated asynchronously (fire-and-forget).
7. An `ApiKeyContext` is returned containing the tenant ID, API key ID, granted scopes, and allowed workflows.

---

## 7. Security Headers

All HTTP responses from the API must include the following security headers. These are set in the NestJS middleware (or nginx for the frontend).

### API Security Headers

The `SecurityHeadersMiddleware` (located at `src/common/middleware/security-headers.middleware.ts`) sets the following headers on every response:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Enable XSS filter (legacy browsers) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforce HTTPS for 1 year, include subdomains |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Prevent referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Restrict browser feature access |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | Restrict all content loading (API responses) |

Additionally, if the request includes an `Authorization` header, the middleware adds `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache` to prevent caching of authenticated responses.

### Frontend (nginx) Security Headers

```nginx
# apps/web/nginx.conf - add to server block
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://*.flowengine.io; frame-ancestors 'none';" always;
```

---

## 8. Input Validation & Sanitization

### BPMN XML Parsing

BPMN XML is parsed using `bpmn-moddle` which handles well-formed XML. The BPMN parser (`src/workflow/bpmn/bpmn-parser.ts`) applies the following additional protections before parsing:

1. **Size limit.** The XML payload is limited to 5 MB. Any input exceeding this threshold is rejected with a `VALIDATION_PAYLOAD_TOO_LARGE` error. This prevents XML bomb (billion laughs) attacks.
2. **DTD/Entity rejection.** The XML is scanned for `<!DOCTYPE` and `<!ENTITY` declarations (case-insensitive). If either is found, the input is rejected with a `WORKFLOW_BPMN_PARSE_ERROR` error, citing XXE (XML External Entity) prevention as the reason.
3. **Parsing.** The validated XML is parsed with `bpmn-moddle`, which does not resolve external entities by default.

### Request Body Validation

All API endpoints use class-validator decorators with a global validation pipe configured as follows:

- **Whitelist mode enabled.** Properties not defined in the DTO are automatically stripped from the request body.
- **Forbid non-whitelisted properties.** If unknown properties are sent, the request is rejected with a validation error (rather than silently stripping them).
- **Transform enabled.** Request values are auto-transformed to the types declared in the DTO.
- **Implicit conversion disabled.** Type conversions require explicit decorator annotations, preventing unexpected coercion.

---

## 9. Sensitive Data Handling

### PII Redaction in Logs

The redaction utility (`src/common/logging/redaction.ts`) recursively scans log payloads and replaces the values of sensitive fields with `[REDACTED]`. The following field names are considered sensitive (matched case-insensitively):

- Authentication: `password`, `passwordHash`, `password_hash`, `token`, `accessToken`, `refreshToken`, `access_token`, `refresh_token`, `apiKey`, `api_key`, `secret`, `clientSecret`, `client_secret`, `authorization`, `cookie`
- LDAP: `bindCredential`, `bind_credential`
- PII: `ssn`, `socialSecurityNumber`
- Financial: `creditCard`, `credit_card`, `cardNumber`, `card_number`

Nested objects are traversed recursively. Non-object, non-sensitive values are passed through unchanged.

### Error Response Sanitization

In production, error responses never include:
- Stack traces
- Internal file paths
- Database query details
- Raw exception messages from dependencies

The `GlobalExceptionFilter` (see [error-codes.md](./error-codes.md)) handles this by mapping all unhandled exceptions to a generic `SYSTEM_INTERNAL_ERROR` with a reference ID for support correlation.

---

## 10. Security Checklist (Production Deployment)

| Item | Status | Notes |
|------|--------|-------|
| `CORS_ORIGINS` set to explicit origins | Required | No wildcards in production |
| `JWT_SECRET` is 32+ characters, randomly generated | Required | `openssl rand -base64 48` |
| `NODE_ENV=production` | Required | Disables debug output |
| HTTPS/TLS termination configured | Required | Via ingress/load balancer |
| Security headers middleware enabled | Required | See section 7 |
| Expression sandboxing active (`isolated-vm`) | Required | See section 2 |
| SSRF guard enabled for service tasks | Required | See section 3 |
| API keys hashed with SHA-256 | Required | Never store plaintext |
| LDAP inputs escaped per RFC 4515 | Required | See section 5 |
| BPMN XML validated (no DTD/ENTITY) | Required | See section 8 |
| Request body validation (whitelist mode) | Required | See section 8 |
| PII redaction in logs | Required | See section 9 |
| Rate limiting configured per tenant tier | Required | See [api-reference.md](./api-reference.md) |
| Token revocation list (Redis) | Required | See section 4 |
| Refresh token rotation | Required | See section 4 |
| Database connections use TLS | Recommended | `?ssl=true` in DATABASE_URL |
| Dependency vulnerability scanning | Recommended | `npm audit` in CI |
| Container images scanned | Recommended | Trivy, Snyk Container |
| Network policies in Kubernetes | Recommended | Restrict pod-to-pod traffic |
