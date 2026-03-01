# Domain Models

TypeScript interfaces and types for the FlowEngine workflow engine.

## Core Types

### Enums and Literal Types

```typescript
// Workflow definition status
export type WorkflowStatus = 'draft' | 'published' | 'archived';

// Workflow instance status
export type InstanceStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'suspended';

// Task instance status
export type TaskStatus =
  | 'pending'   // Created but not yet active
  | 'active'    // Ready for work
  | 'completed' // Successfully finished
  | 'failed'    // Failed (may retry)
  | 'skipped';  // Bypassed (conditional flow)

// BPMN activity types
export type ActivityType =
  | 'startEvent'
  | 'endEvent'
  | 'userTask'
  | 'serviceTask'
  | 'scriptTask'
  | 'sendTask'
  | 'receiveTask'
  | 'businessRuleTask'
  | 'manualTask'
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway'
  | 'eventBasedGateway'
  | 'intermediateCatchEvent'
  | 'intermediateThrowEvent'
  | 'boundaryEvent'
  | 'subProcess'
  | 'callActivity';

// Form field types
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'date'
  | 'datetime'
  | 'file'
  | 'user'
  | 'group';

// SLA event types
export type SLAEventType = 'warning' | 'breach' | 'escalation';

// Notification channel types
export type NotificationChannelType = 'email' | 'slack' | 'webhook' | 'sms';

// User roles (tenant-level)
export type TenantRole = 'owner' | 'admin' | 'designer' | 'operator' | 'viewer';

// Auth provider types
export type AuthProviderType = 'local' | 'ldap' | 'keycloak' | 'oauth2' | 'saml';

// Subscription plans
export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';
```

---

## Multi-Tenancy Models

### Tenant

```typescript
export interface Tenant {
  id: string;
  name: string;
  slug: string;                          // URL-safe identifier
  settings: TenantSettings;
  subscriptionPlan: SubscriptionPlan;
  maxUsers: number;
  maxWorkflows: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  branding?: {
    logo?: string;
    primaryColor?: string;
    favicon?: string;
  };
  features?: {
    slaMonitoring?: boolean;
    apiAccess?: boolean;
    customForms?: boolean;
    webhooks?: boolean;
  };
  notifications?: {
    defaultChannels?: NotificationChannelType[];
    slackWorkspace?: string;
  };
  security?: {
    mfaRequired?: boolean;
    sessionTimeout?: number;             // Minutes
    ipWhitelist?: string[];
  };
}

export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  permissions: string[];                 // Fine-grained permissions
  invitedBy?: string;
  joinedAt: Date;
}

export interface TenantWithMembership extends Tenant {
  membership: TenantMembership;
}
```

---

## Authentication Models

### AuthProvider

```typescript
export interface AuthProvider {
  id: string;
  tenantId: string;
  type: AuthProviderType;
  name: string;
  config: AuthProviderConfig;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthProviderConfig =
  | LocalAuthConfig
  | LdapAuthConfig
  | KeycloakAuthConfig
  | OAuth2AuthConfig
  | SamlAuthConfig;

export interface LocalAuthConfig {
  passwordPolicy: {
    minLength: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecial?: boolean;
    maxAge?: number;                     // Days before password expires
  };
  allowRegistration?: boolean;
  requireEmailVerification?: boolean;
}

export interface LdapAuthConfig {
  url: string;                           // ldap://ldap.example.com:389
  baseDn: string;                        // dc=example,dc=com
  bindDn: string;                        // cn=admin,dc=example,dc=com
  bindCredential: string;                // Encrypted password
  userSearchBase: string;                // ou=users
  userSearchFilter: string;              // (uid={{username}})
  usernameAttribute: string;             // uid, sAMAccountName
  emailAttribute: string;                // mail
  nameAttribute: string;                 // cn, displayName
  groupSearchBase?: string;              // ou=groups
  groupSearchFilter?: string;            // (member={{dn}})
  groupNameAttribute?: string;           // cn
  startTls?: boolean;
  tlsCertificate?: string;
  syncInterval?: number;                 // Seconds between syncs
  connectionTimeout?: number;            // Milliseconds
}

export interface KeycloakAuthConfig {
  serverUrl: string;                     // https://keycloak.example.com
  realm: string;
  clientId: string;
  clientSecret: string;                  // Encrypted
  adminUsername?: string;                // For user/group sync
  adminPassword?: string;                // Encrypted
  syncRoles?: boolean;
  roleMapping?: Record<string, TenantRole>;  // Keycloak role -> FlowEngine role
  syncGroups?: boolean;
  defaultRole?: TenantRole;
}

export interface OAuth2AuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;                  // Encrypted
  scopes: string[];
  userIdClaim: string;                   // sub
  emailClaim: string;                    // email
  nameClaim: string;                     // name
  groupsClaim?: string;                  // groups
  pkceEnabled?: boolean;
}

export interface SamlAuthConfig {
  entityId: string;                      // SP entity ID
  ssoUrl: string;                        // IdP SSO URL
  sloUrl?: string;                       // IdP SLO URL
  certificate: string;                   // IdP certificate
  privateKey?: string;                   // SP private key for signing
  signatureAlgorithm?: 'sha256' | 'sha512';
  attributeMapping: {
    email: string;
    name: string;
    groups?: string;
  };
  allowUnsolicitedResponse?: boolean;
}
```

### User (Extended)

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;                 // NULL for external providers
  authProviderId?: string;
  externalId?: string;                   // ID from external provider
  avatarUrl?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  metadata: UserMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMetadata {
  // LDAP-specific
  dn?: string;
  ldapGroups?: string[];

  // Keycloak-specific
  realmRoles?: string[];
  clientRoles?: Record<string, string[]>;

  // OAuth2-specific
  oauthScopes?: string[];

  // General
  department?: string;
  title?: string;
  phone?: string;
  timezone?: string;
  locale?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tenantId: string;
  tokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface UserGroup {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  externalId?: string;                   // Synced from LDAP/Keycloak
  authProviderId?: string;
  isSynced: boolean;
  members?: User[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Auth DTOs

```typescript
// Login request
export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string;                   // Required if multi-tenant
  providerId?: string;                   // Specific auth provider
  mfaCode?: string;
}

// Login response
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: UserProfile;
  tenant: TenantInfo;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: TenantRole;
  permissions: string[];
  groups: string[];
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  settings: Partial<TenantSettings>;
}

// OAuth2/OIDC callback
export interface OAuthCallbackRequest {
  code: string;
  state: string;
  tenantSlug: string;
  providerId: string;
}

// SAML callback
export interface SamlCallbackRequest {
  SAMLResponse: string;
  RelayState?: string;
}

// Refresh token
export interface RefreshTokenRequest {
  refreshToken: string;
}

// Token payload (JWT claims)
export interface TokenPayload {
  sub: string;                           // User ID
  email: string;
  name: string;
  tenant_id: string;
  tenant_slug: string;
  role: TenantRole;
  permissions: string[];
  auth_provider: AuthProviderType;
  groups: string[];
  iat: number;
  exp: number;
}
```

---

## Workflow Definition Models

### WorkflowDefinition

```typescript
export interface WorkflowDefinition {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  version: number;
  status: WorkflowStatus;
  bpmnXml: string;
  parsedDefinition: ParsedBPMN;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface ParsedBPMN {
  activities: ActivityDefinition[];
  transitions: TransitionDefinition[];
  startEventId: string;
  endEventIds: string[];
}
```

### ActivityDefinition

```typescript
export interface ActivityDefinition {
  id: string;
  workflowDefinitionId: string;
  bpmnElementId: string;
  type: ActivityType;
  name?: string;
  config: ActivityConfig;
  position: Position;
  slaDefinition?: SLADefinition;
  createdAt: Date;
}

export interface Position {
  x: number;
  y: number;
}

export interface ActivityConfig {
  // Common
  documentation?: string;

  // User Task
  assignee?: string;                    // User ID or expression: "${initiator}"
  candidateUsers?: string[];            // User IDs who can claim
  candidateGroups?: string[];           // Group names who can claim
  formKey?: string;                     // Form identifier
  formFields?: FormField[];             // Inline form definition
  dueDate?: string;                     // Expression: "${now() + duration('P3D')}"
  priority?: number;                    // 0-100

  // Service Task
  serviceType?: 'http' | 'script' | 'custom' | 'expression' | 'notification';
  implementation?: string;              // Service implementation class/function
  httpConfig?: HttpServiceConfig;
  scriptConfig?: ScriptConfig;
  notificationConfig?: NotificationServiceConfig;

  // Script Task
  script?: string;
  scriptFormat?: 'javascript' | 'groovy' | 'python';
  resultVariable?: string;

  // Business Rule Task (DMN)
  businessRuleConfig?: BusinessRuleConfig;

  // Manual Task
  manualTaskConfig?: ManualTaskConfig;

  // Send Task
  sendTaskConfig?: SendTaskConfig;

  // Receive Task
  receiveTaskConfig?: ReceiveTaskConfig;

  // Gateway
  defaultFlow?: string;                 // Default outgoing transition ID

  // Event
  eventType?: 'timer' | 'message' | 'signal' | 'error';
  eventConfig?: EventConfig;

  // SubProcess / Call Activity
  calledElement?: string;               // Called workflow ID
  inMappings?: VariableMapping[];
  outMappings?: VariableMapping[];
}
```

### FormField

```typescript
export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  validation?: FormFieldValidation;

  // Type-specific options
  options?: SelectOption[];             // For select/multiselect/radio
  multiple?: boolean;                   // For file uploads
  accept?: string;                      // For file uploads: "image/*,.pdf"
  min?: number;                         // For number/date
  max?: number;                         // For number/date
  minLength?: number;                   // For text/textarea
  maxLength?: number;                   // For text/textarea
  pattern?: string;                     // Regex pattern

  // Conditional visibility
  showIf?: string;                      // Expression: "${fieldA == 'yes'}"
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface FormFieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  custom?: string;                      // Custom validation expression
}
```

### File Upload Configuration

```typescript
// Extended form field for file uploads
export interface FileFormField extends FormField {
  type: 'file';

  // File constraints
  accept?: string;                      // MIME types: "image/*,.pdf,.docx"
  multiple?: boolean;                   // Allow multiple files
  maxFiles?: number;                    // Maximum number of files (if multiple)
  maxFileSize?: number;                 // Max size per file in bytes
  maxTotalSize?: number;                // Max total size for all files

  // Storage configuration
  storageConfig?: FileStorageConfig;

  // Processing options
  generateThumbnails?: boolean;         // Generate thumbnails for images
  extractMetadata?: boolean;            // Extract file metadata (EXIF, etc.)
  scanForViruses?: boolean;             // Enable virus scanning
}

export interface FileStorageConfig {
  provider: 'local' | 's3' | 'azure' | 'gcs' | 'minio';
  bucket?: string;                      // Bucket/container name
  path?: string;                        // Path template: "workflows/${instanceId}/files"
  acl?: 'private' | 'public-read';
  encryption?: boolean;
  retentionDays?: number;               // Auto-delete after N days
}

// Uploaded file metadata
export interface UploadedFile {
  id: string;
  originalName: string;
  storageName: string;                  // UUID-based name in storage
  mimeType: string;
  size: number;                         // Size in bytes
  checksum: string;                     // SHA-256 hash
  storageProvider: string;
  storagePath: string;
  storageUrl?: string;                  // Direct URL (if public)
  downloadUrl: string;                  // Signed/authenticated URL

  // Metadata
  metadata?: FileMetadata;
  thumbnails?: FileThumbnail[];

  // Security
  virusScanStatus?: 'pending' | 'clean' | 'infected' | 'error';
  virusScanAt?: Date;

  // Audit
  uploadedBy: string;
  uploadedAt: Date;
  workflowInstanceId?: string;
  taskInstanceId?: string;
  formFieldId?: string;
}

export interface FileMetadata {
  // Image-specific
  width?: number;
  height?: number;
  orientation?: number;
  colorSpace?: string;

  // Document-specific
  pageCount?: number;
  author?: string;
  title?: string;
  createdAt?: Date;

  // Media-specific
  duration?: number;                    // Audio/video duration in seconds
  bitrate?: number;
  codec?: string;

  // General
  exif?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

export interface FileThumbnail {
  size: 'small' | 'medium' | 'large';   // 64px, 256px, 512px
  width: number;
  height: number;
  url: string;
  mimeType: string;
}
```

### Form Submission

```typescript
// Form submission from user task
export interface FormSubmission {
  taskInstanceId: string;
  submittedBy: string;
  submittedAt: Date;
  fields: FormFieldSubmission[];
  files: FileSubmission[];
  signature?: FormSignature;
  metadata?: Record<string, unknown>;
}

export interface FormFieldSubmission {
  fieldId: string;
  fieldType: FormFieldType;
  value: unknown;
  displayValue?: string;                // Human-readable value
  validationResult?: FieldValidationResult;
}

export interface FileSubmission {
  fieldId: string;
  files: UploadedFile[];
  uploadProgress?: number;              // 0-100 during upload
  validationResult?: FileValidationResult;
}

export interface FormSignature {
  type: 'drawn' | 'typed' | 'certificate';
  value: string;                        // Base64 image or typed name
  signedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  certificateId?: string;               // For certificate-based signatures
}

// Validation results
export interface FieldValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface FileValidationResult {
  valid: boolean;
  errors: FileValidationError[];
}

export interface ValidationError {
  rule: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface FileValidationError extends ValidationError {
  fileName?: string;
  fileIndex?: number;
}
```

### Form Data Storage

```typescript
// How form data is stored after submission
export interface StoredFormData {
  taskInstanceId: string;
  formDefinitionId?: string;
  formVersion?: number;

  // Field values (non-file)
  values: Record<string, StoredFieldValue>;

  // File references
  files: Record<string, StoredFileReference[]>;

  // Computed/derived values
  computed?: Record<string, unknown>;

  // Submission metadata
  submittedBy: string;
  submittedAt: Date;
  submissionIp?: string;
  submissionUserAgent?: string;

  // For audit trail
  previousVersions?: StoredFormData[];
}

export interface StoredFieldValue {
  fieldId: string;
  fieldType: FormFieldType;
  value: unknown;
  displayValue?: string;
  encrypted?: boolean;                  // For sensitive fields
}

export interface StoredFileReference {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  downloadUrl?: string;                 // Generated on-demand
}

// Form data access control
export interface FormDataAccessPolicy {
  // Who can view form data
  viewableBy: AccessRule[];

  // Who can download files
  downloadableBy: AccessRule[];

  // Field-level encryption for sensitive data
  encryptedFields?: string[];

  // File access restrictions
  fileAccessExpiry?: number;            // Signed URL expiry in seconds

  // Audit requirements
  logAccess?: boolean;
  logDownloads?: boolean;
}

export interface AccessRule {
  type: 'user' | 'group' | 'role' | 'expression';
  value: string;
}
```

### TransitionDefinition

```typescript
export interface TransitionDefinition {
  id: string;
  workflowDefinitionId: string;
  bpmnElementId: string;
  sourceActivityId: string;
  targetActivityId: string;
  name?: string;
  conditionExpression?: string;         // "${amount > 10000}"
  isDefault: boolean;
  createdAt: Date;
}
```

### Service Configurations

```typescript
export interface HttpServiceConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;                          // Can include expressions
  headers?: Record<string, string>;
  body?: string;                        // JSON template with expressions
  timeout?: number;                     // Milliseconds
  retries?: number;
  resultVariable?: string;
  failOnError?: boolean;
}

export interface ScriptConfig {
  script: string;
  language: 'javascript' | 'groovy';
  resultVariable?: string;
}

export interface EventConfig {
  // Timer
  timerType?: 'date' | 'duration' | 'cycle';
  timerValue?: string;                  // ISO 8601: "2024-12-31T23:59:59Z", "PT1H", "R3/PT1H"

  // Message
  messageName?: string;
  correlationKey?: string;

  // Signal
  signalName?: string;

  // Error
  errorCode?: string;
  errorMessage?: string;
}

export interface VariableMapping {
  source: string;
  target: string;
  type?: 'copy' | 'expression';
}
```

### Task-Specific Configurations

```typescript
// ============================================
// BUSINESS RULE TASK (DMN) CONFIGURATION
// ============================================

export type DecisionResultType = 'singleEntry' | 'singleResult' | 'collectEntries' | 'resultList';

export interface BusinessRuleConfig {
  // Decision Reference
  decisionRef: string;                    // DMN decision ID or key
  decisionRefBinding?: 'latest' | 'version' | 'versionTag';
  decisionRefVersion?: number;            // Specific version number
  decisionRefVersionTag?: string;         // Version tag (e.g., "production")
  decisionRefTenantId?: string;           // Cross-tenant decision reference

  // Input Mapping
  inputVariables?: BusinessRuleInputMapping[];
  mapDecisionResult?: DecisionResultType;

  // Output Configuration
  resultVariable?: string;                // Variable to store the decision result

  // External DMN Engine (optional)
  externalEngine?: {
    type: 'camunda' | 'drools' | 'opendmn' | 'custom';
    endpoint?: string;                    // REST endpoint for external engine
    headers?: Record<string, string>;
    timeout?: number;
  };

  // Error Handling
  failOnNoResult?: boolean;               // Fail if no rule matches
  defaultResult?: unknown;                // Default value if no rule matches
}

export interface BusinessRuleInputMapping {
  source: string;                         // Process variable or expression
  target: string;                         // DMN input variable name
  type?: 'variable' | 'expression';
}

// DMN Decision Table Definition (for inline rules)
export interface DecisionTable {
  id: string;
  name: string;
  hitPolicy: 'UNIQUE' | 'FIRST' | 'PRIORITY' | 'ANY' | 'COLLECT' | 'RULE_ORDER' | 'OUTPUT_ORDER';
  aggregation?: 'SUM' | 'MIN' | 'MAX' | 'COUNT';
  inputs: DecisionTableInput[];
  outputs: DecisionTableOutput[];
  rules: DecisionTableRule[];
}

export interface DecisionTableInput {
  id: string;
  label: string;
  inputExpression: string;                // Expression to evaluate
  typeRef?: 'string' | 'number' | 'boolean' | 'date';
}

export interface DecisionTableOutput {
  id: string;
  label: string;
  name: string;                           // Output variable name
  typeRef?: 'string' | 'number' | 'boolean' | 'date';
}

export interface DecisionTableRule {
  id: string;
  inputEntries: string[];                 // Conditions for each input
  outputEntries: string[];                // Values for each output
  description?: string;
}

// ============================================
// MANUAL TASK CONFIGURATION
// ============================================

export interface ManualTaskConfig {
  // Assignment (similar to User Task but without forms)
  assignee?: string;                      // User ID or expression
  candidateUsers?: string[];
  candidateGroups?: string[];

  // Instructions
  instructions?: string;                  // Markdown-formatted instructions
  instructionsExpression?: string;        // Dynamic instructions via expression

  // External Work Reference
  externalSystemRef?: string;             // Reference to external system
  externalTaskId?: string;                // Task ID in external system
  externalSystemUrl?: string;             // URL to external system

  // Completion
  requireConfirmation?: boolean;          // Require explicit confirmation
  confirmationMessage?: string;           // Message shown on confirmation
  autoCompleteAfter?: string;             // ISO 8601 duration for auto-complete

  // Documentation
  documentationUrl?: string;              // Link to documentation
  attachments?: ManualTaskAttachment[];

  // Tracking
  estimatedDuration?: string;             // ISO 8601 duration estimate
  trackActualDuration?: boolean;          // Track time spent
}

export interface ManualTaskAttachment {
  name: string;
  url: string;
  type: 'document' | 'link' | 'video' | 'image';
  description?: string;
}

// ============================================
// SEND TASK CONFIGURATION
// ============================================

export type SendTaskChannel = 'email' | 'slack' | 'teams' | 'sms' | 'webhook' | 'push' | 'custom';

export interface SendTaskConfig {
  channel: SendTaskChannel;

  // Email Configuration
  emailConfig?: EmailSendConfig;

  // Slack Configuration
  slackConfig?: SlackSendConfig;

  // Microsoft Teams Configuration
  teamsConfig?: TeamsSendConfig;

  // SMS Configuration
  smsConfig?: SmsSendConfig;

  // Webhook Configuration
  webhookConfig?: WebhookSendConfig;

  // Push Notification Configuration
  pushConfig?: PushSendConfig;

  // Common Options
  async?: boolean;                        // Fire and forget (don't wait for delivery)
  retries?: number;                       // Number of retry attempts
  retryDelay?: number;                    // Delay between retries (ms)
  failOnError?: boolean;                  // Fail task if send fails
  resultVariable?: string;                // Store send result
}

export interface EmailSendConfig {
  to: string | string[];                  // Recipients (expressions supported)
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;                        // Subject line (expressions supported)
  body: string;                           // Body content (expressions supported)
  bodyType?: 'text' | 'html';
  template?: string;                      // Email template ID
  templateData?: Record<string, unknown>; // Template variables
  attachments?: EmailAttachment[];
  replyTo?: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface EmailAttachment {
  filename: string;
  content?: string;                       // Base64 encoded content
  path?: string;                          // File path or URL
  contentType?: string;
}

export interface SlackSendConfig {
  channel: string;                        // Channel ID or name
  message: string;                        // Message text (expressions supported)
  blocks?: unknown[];                     // Slack Block Kit blocks
  attachments?: unknown[];                // Slack attachments
  threadTs?: string;                      // Reply in thread
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}

export interface TeamsSendConfig {
  webhookUrl?: string;                    // Incoming webhook URL
  channel?: string;                       // Channel ID (for bot)
  message: string;                        // Message text
  adaptiveCard?: unknown;                 // Adaptive Card JSON
  mentions?: string[];                    // User IDs to mention
}

export interface SmsSendConfig {
  to: string | string[];                  // Phone numbers (expressions supported)
  message: string;                        // SMS message (max 160 chars recommended)
  provider?: 'twilio' | 'nexmo' | 'aws_sns' | 'custom';
}

export interface WebhookSendConfig {
  url: string;                            // Webhook URL (expressions supported)
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  timeout?: number;
  authentication?: {
    type: 'none' | 'basic' | 'bearer' | 'api_key' | 'hmac';
    credentials?: Record<string, string>;
  };
}

export interface PushSendConfig {
  userId?: string | string[];             // Target user IDs
  deviceTokens?: string[];                // Specific device tokens
  title: string;
  body: string;
  data?: Record<string, unknown>;         // Custom data payload
  icon?: string;
  badge?: number;
  sound?: string;
  provider?: 'firebase' | 'apns' | 'onesignal' | 'custom';
}

// ============================================
// RECEIVE TASK CONFIGURATION
// ============================================

export type ReceiveTaskTrigger = 'message' | 'signal' | 'webhook' | 'event';

export interface ReceiveTaskConfig {
  triggerType: ReceiveTaskTrigger;

  // Message-based
  messageName?: string;                   // Message name to wait for
  correlationKey?: string;                // Correlation expression

  // Signal-based
  signalName?: string;                    // Signal name to wait for

  // Webhook-based
  webhookConfig?: ReceiveWebhookConfig;

  // Event-based
  eventName?: string;                     // Event name to wait for
  eventSource?: string;                   // Event source filter

  // Timeout Configuration
  timeout?: string;                       // ISO 8601 duration (e.g., "PT1H")
  timeoutAction?: 'fail' | 'continue' | 'escalate';
  timeoutResultVariable?: string;         // Store timeout flag

  // Payload Handling
  resultVariable?: string;                // Store received payload
  payloadMapping?: ReceivePayloadMapping[];
  payloadValidation?: PayloadValidationRule[];
}

export interface ReceiveWebhookConfig {
  path: string;                           // Webhook endpoint path
  method?: 'GET' | 'POST' | 'PUT';
  authentication?: {
    type: 'none' | 'api_key' | 'hmac' | 'jwt';
    config?: Record<string, string>;
  };
  responseTemplate?: string;              // Response body template
  responseStatus?: number;                // HTTP status code to return
}

export interface ReceivePayloadMapping {
  source: string;                         // JSONPath in received payload
  target: string;                         // Process variable name
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  defaultValue?: unknown;
}

export interface PayloadValidationRule {
  field: string;                          // Field to validate
  rule: 'required' | 'type' | 'pattern' | 'range' | 'enum' | 'custom';
  value?: unknown;                        // Rule parameter
  message?: string;                       // Error message
}

// ============================================
// NOTIFICATION SERVICE CONFIGURATION
// ============================================

export interface NotificationServiceConfig {
  channel: NotificationChannelType;
  template?: string;                      // Notification template ID
  recipients: string | string[];          // Recipients (expressions supported)
  data?: Record<string, unknown>;         // Template variables
  priority?: 'high' | 'normal' | 'low';

  // Channel-specific overrides
  emailOverrides?: Partial<EmailSendConfig>;
  slackOverrides?: Partial<SlackSendConfig>;
  webhookOverrides?: Partial<WebhookSendConfig>;
  smsOverrides?: Partial<SmsSendConfig>;
}
```

---

## SLA Models

### SLADefinition

```typescript
export interface SLADefinition {
  id: string;
  activityDefinitionId: string;
  warningThresholdSeconds?: number;     // Time before warning (optional)
  breachThresholdSeconds: number;       // Time before breach (required)
  escalationRules: EscalationRule[];
  notificationChannels: NotificationChannel[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EscalationRule {
  level: number;                        // 1, 2, 3...
  triggerAfterSeconds: number;          // Time after breach to trigger
  assignTo?: string;                    // Reassign to user/group
  notifyUsers?: string[];               // User IDs to notify
  notifyGroups?: string[];              // Group names to notify
  action?: 'reassign' | 'notify' | 'both';
}

export interface NotificationChannel {
  type: NotificationChannelType;
  config: NotificationConfig;
  events?: SLAEventType[];              // Which events trigger this channel
}

export interface NotificationConfig {
  // Email
  template?: string;
  recipients?: string[];
  cc?: string[];

  // Slack
  channel?: string;
  webhookUrl?: string;

  // Webhook
  url?: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;

  // SMS
  phoneNumbers?: string[];
}
```

### SLAStatus

```typescript
export interface SLAStatus {
  isBreached: boolean;
  isWarning: boolean;
  currentDurationSeconds: number;
  warningThresholdSeconds?: number;
  breachThresholdSeconds: number;
  estimatedBreachAt?: Date;
  escalationLevel: number;
}

export interface SLAEvent {
  id: string;
  taskInstanceId: string;
  slaDefinitionId: string;
  eventType: SLAEventType;
  thresholdSeconds: number;
  actualDurationSeconds?: number;
  escalationLevel: number;
  notificationSent: boolean;
  notificationSentAt?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  createdAt: Date;
}
```

---

## Instance Models

### WorkflowInstance

```typescript
export interface WorkflowInstance {
  id: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  correlationId?: string;               // External reference ID
  status: InstanceStatus;
  variables: Record<string, unknown>;   // Process variables
  startedAt: Date;
  completedAt?: Date;
  startedBy?: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowInstanceDetail extends WorkflowInstance {
  workflowDefinition: WorkflowDefinition;
  currentTasks: TaskWithContext[];
  completedTasks: TaskInstance[];
  timeline: TimelineEvent[];
}
```

### TaskInstance

```typescript
export interface TaskInstance {
  id: string;
  workflowInstanceId: string;
  activityDefinitionId: string;
  status: TaskStatus;
  assignedTo?: string;
  assignedGroup?: string;
  variables: Record<string, unknown>;   // Task-local variables
  startedAt?: Date;
  completedAt?: Date;
  dueAt?: Date;                         // Calculated from SLA
  completedBy?: string;
  completionResult?: Record<string, unknown>;
  completionComment?: string;           // Optional comment on completion
  retryCount: number;
  createdAt: Date;
}

export interface TaskWithContext extends TaskInstance {
  workflowInstance: WorkflowInstance;
  activityDefinition: ActivityDefinition;
  previousStates: TaskStateHistory[];
  nextPossibleActivities: NextActivity[];
  slaStatus?: SLAStatus;
  form?: FormField[];                   // Resolved form fields
}

export interface NextActivity {
  id: string;
  bpmnElementId: string;
  name?: string;
  type: ActivityType;
  condition?: string;                   // Condition expression if applicable
}
```

### TaskStateHistory

```typescript
export interface TaskStateHistory {
  id: string;
  taskInstanceId: string;
  fromStatus?: TaskStatus;
  toStatus: TaskStatus;
  changedBy?: string;
  changedAt: Date;
  reason?: string;
  metadata: Record<string, unknown>;
}
```

### ExecutionToken

```typescript
export interface ExecutionToken {
  id: string;
  workflowInstanceId: string;
  parentTokenId?: string;               // For forked tokens
  currentActivityId?: string;
  status: 'active' | 'waiting' | 'completed' | 'merged';
  forkGatewayId?: string;               // Gateway that created this token
  createdAt: Date;
  completedAt?: Date;
}
```

---

## Event Models

### Workflow Events

```typescript
export type WorkflowEvent =
  | WorkflowStartedEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | WorkflowCancelledEvent
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | SLAWarningEvent
  | SLABreachEvent
  | EscalationEvent;

export interface BaseEvent {
  id: string;
  timestamp: Date;
  correlationId?: string;
}

export interface WorkflowStartedEvent extends BaseEvent {
  type: 'WORKFLOW_STARTED';
  workflowInstanceId: string;
  workflowDefinitionId: string;
  variables: Record<string, unknown>;
  startedBy?: string;
}

export interface WorkflowCompletedEvent extends BaseEvent {
  type: 'WORKFLOW_COMPLETED';
  workflowInstanceId: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: Record<string, unknown>;
}

export interface TaskCreatedEvent extends BaseEvent {
  type: 'TASK_CREATED';
  taskInstanceId: string;
  workflowInstanceId: string;
  activityDefinitionId: string;
  activityName?: string;
}

export interface TaskAssignedEvent extends BaseEvent {
  type: 'TASK_ASSIGNED';
  taskInstanceId: string;
  workflowInstanceId: string;
  assignedTo: string;
  assignedBy?: string;
}

export interface TaskCompletedEvent extends BaseEvent {
  type: 'TASK_COMPLETED';
  taskInstanceId: string;
  workflowInstanceId: string;
  completedBy?: string;
  result: Record<string, unknown>;
  comment?: string;
}

export interface SLAWarningEvent extends BaseEvent {
  type: 'SLA_WARNING';
  taskInstanceId: string;
  workflowInstanceId: string;
  currentDurationSeconds: number;
  warningThresholdSeconds: number;
}

export interface SLABreachEvent extends BaseEvent {
  type: 'SLA_BREACH';
  taskInstanceId: string;
  workflowInstanceId: string;
  currentDurationSeconds: number;
  breachThresholdSeconds: number;
}

export interface EscalationEvent extends BaseEvent {
  type: 'ESCALATION';
  taskInstanceId: string;
  workflowInstanceId: string;
  escalationLevel: number;
  escalationRule: EscalationRule;
}
```

### Timeline Events

```typescript
export interface TimelineEvent {
  type: string;
  timestamp: Date;
  actor?: string;
  taskId?: string;
  taskName?: string;
  details?: Record<string, unknown>;
}
```

---

## User Models

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  members: string[];                    // User IDs
  createdAt: Date;
}
```

---

## API DTOs

### Request DTOs

```typescript
// Create workflow
export interface CreateWorkflowDto {
  name: string;
  description?: string;
  bpmnXml: string;
}

// Start instance
export interface StartInstanceDto {
  workflowDefinitionId: string;
  correlationId?: string;
  variables?: Record<string, unknown>;
}

// Complete task
export interface CompleteTaskDto {
  variables?: Record<string, unknown>;
  comment?: string;
}

// Assign task
export interface AssignTaskDto {
  assignTo: string;
}
```

### Response DTOs

```typescript
// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Task completion response
export interface CompleteTaskResponse {
  success: boolean;
  taskId: string;
  completedAt: Date;
  nextTasks: Array<{
    id: string;
    activityName: string;
    status: TaskStatus;
  }>;
}

// SLA dashboard response
export interface SLADashboardResponse {
  summary: {
    totalTasksCompleted: number;
    slaBreaches: number;
    slaWarnings: number;
    complianceRate: number;
    averageCompletionTimeSeconds: number;
  };
  byWorkflow: Array<{
    workflowId: string;
    workflowName: string;
    totalTasks: number;
    breaches: number;
    complianceRate: number;
  }>;
  timeline: Array<{
    timestamp: Date;
    completed: number;
    breaches: number;
  }>;
}
```

---

## Utility Types

```typescript
// Expression evaluation context
export interface ExpressionContext {
  variables: Record<string, unknown>;
  task?: TaskInstance;
  instance?: WorkflowInstance;
  user?: User;
  now: () => Date;
  duration: (iso: string) => number;
}

// Job payloads
export interface WorkflowExecutionJob {
  type: 'START_WORKFLOW' | 'CONTINUE_EXECUTION' | 'COMPLETE_TASK' | 'EVALUATE_GATEWAY';
  workflowInstanceId: string;
  taskInstanceId?: string;
  tokenId?: string;
  variables?: Record<string, unknown>;
}

export interface SLAMonitoringJob {
  type: 'CHECK_SLA' | 'TRIGGER_WARNING' | 'TRIGGER_BREACH' | 'ESCALATE';
  taskInstanceId: string;
  slaDefinitionId: string;
  escalationLevel?: number;
}

export interface NotificationJob {
  type: NotificationChannelType;
  recipients: string[];
  template: string;
  data: Record<string, unknown>;
}
```

---

## Task Execution Models

Models for the internal task execution engine. See [Task Execution Mechanics](./task-execution.md) for detailed documentation.

### Task Handler Interface

```typescript
// Task handler that processes specific task types
export interface TaskHandler {
  type: ActivityType;

  // Execute the task and return result
  execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult>;

  // Optional: Validate configuration at design time
  validate?(config: ActivityConfig): ValidationResult;

  // Optional: Handle task timeout
  onTimeout?(task: TaskInstance): Promise<void>;

  // Optional: Handle task cancellation
  onCancel?(task: TaskInstance): Promise<void>;

  // Optional: Estimate execution duration
  estimateDuration?(config: ActivityConfig): number;
}

// Context provided to task handlers during execution
export interface ExecutionContext {
  workflowInstance: WorkflowInstance;
  activityDefinition: ActivityDefinition;
  variables: Record<string, unknown>;
  services: ServiceContainer;
  logger: Logger;
  tracer: Tracer;
  tenantId: string;
  correlationId: string;
}

// Result returned by task handlers
export interface ExecutionResult {
  status: ExecutionResultStatus;
  outputVariables?: Record<string, unknown>;
  error?: ExecutionError;
  waitCondition?: WaitCondition;
  metrics?: ExecutionMetrics;
}

export type ExecutionResultStatus = 'completed' | 'waiting' | 'failed';
```

### Execution Errors

```typescript
export type ErrorCategory = 'transient' | 'business' | 'system' | 'fatal';

export interface ExecutionError {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  originalError?: Error;
  stackTrace?: string;
}

// Predefined error codes
export type ExecutionErrorCode =
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SCRIPT_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';
```

### Wait Conditions

```typescript
export type WaitConditionType =
  | 'user_completion'
  | 'external_trigger'
  | 'timer'
  | 'manual_confirmation';

export interface WaitCondition {
  type: WaitConditionType;
  taskId?: string;
  subscriptionId?: string;
  timeout?: Date;
  metadata?: Record<string, unknown>;
}

// User task waiting for form submission
export interface UserCompletionWaitCondition extends WaitCondition {
  type: 'user_completion';
  taskId: string;
  assignedTo?: string;
  candidateGroups?: string[];
  formKey?: string;
}

// Receive task waiting for external message/signal
export interface ExternalTriggerWaitCondition extends WaitCondition {
  type: 'external_trigger';
  triggerType: 'message' | 'signal' | 'webhook' | 'event';
  subscriptionId: string;
  messageName?: string;
  correlationKey?: string;
  signalName?: string;
  webhookPath?: string;
}

// Timer event waiting for duration/date
export interface TimerWaitCondition extends WaitCondition {
  type: 'timer';
  timerType: 'duration' | 'date' | 'cycle';
  timerValue: string;
  nextFireTime: Date;
  remainingCycles?: number;
}

// Manual task waiting for confirmation
export interface ManualConfirmationWaitCondition extends WaitCondition {
  type: 'manual_confirmation';
  taskId: string;
  requireConfirmation: boolean;
  autoCompleteAt?: Date;
}
```

### Message Subscriptions

```typescript
// Subscription for receive tasks waiting for messages
export interface MessageSubscription {
  id: string;
  workflowInstanceId: string;
  taskInstanceId: string;
  messageName: string;
  correlationKey?: string;
  createdAt: Date;
  consumedAt?: Date;
  timeoutAt?: Date;
  timeoutJobId?: string;
}

// Incoming message for correlation
export interface IncomingMessage {
  messageName: string;
  correlationKey?: string;
  variables: Record<string, unknown>;
  source?: string;
  timestamp: Date;
}

// Result of message correlation
export interface CorrelationResult {
  matched: boolean;
  subscriptionId?: string;
  taskId?: string;
  workflowInstanceId?: string;
  error?: string;
}
```

### Webhook Subscriptions

```typescript
// Subscription for receive tasks waiting for webhooks
export interface WebhookSubscription {
  id: string;
  workflowInstanceId: string;
  taskInstanceId: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT';
  authentication?: WebhookAuthConfig;
  responseTemplate?: string;
  responseStatus: number;
  createdAt: Date;
  consumedAt?: Date;
  timeoutAt?: Date;
}

export interface WebhookAuthConfig {
  type: 'none' | 'api_key' | 'hmac' | 'jwt';
  config?: Record<string, string>;
}

// Incoming webhook request
export interface IncomingWebhook {
  subscriptionId: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  queryParams: Record<string, string>;
  clientIp: string;
  timestamp: Date;
}
```

### Service Task Executors

```typescript
// Registry of service task executors
export interface ServiceTaskExecutorRegistry {
  executors: Map<ServiceType, ServiceTaskExecutor>;
  register(type: ServiceType, executor: ServiceTaskExecutor): void;
  execute(type: ServiceType, task: TaskInstance, config: unknown, context: ExecutionContext): Promise<ServiceResult>;
}

export type ServiceType = 'http' | 'script' | 'custom' | 'expression' | 'notification';

export interface ServiceTaskExecutor {
  type: ServiceType;
  execute(task: TaskInstance, config: unknown, context: ExecutionContext): Promise<ServiceResult>;
  validate?(config: unknown): ValidationResult;
}

export interface ServiceResult {
  status: 'completed' | 'failed';
  output?: unknown;
  error?: ExecutionError;
  metrics?: {
    duration: number;
    retryCount: number;
    bytesTransferred?: number;
  };
}
```

### Script Execution

```typescript
// Script execution sandbox
export interface ScriptSandbox {
  variables: Record<string, unknown>;
  execution: ScriptExecutionAPI;
  globals: Record<string, unknown>;
  functions: Record<string, Function>;
}

export interface ScriptExecutionAPI {
  getVariable(name: string): unknown;
  setVariable(name: string, value: unknown): void;
  processInstanceId: string;
  activityId: string;
  activityName?: string;
}

export interface ScriptExecutionConfig {
  script: string;
  language: 'javascript' | 'groovy' | 'python';
  timeout: number;         // milliseconds
  memoryLimit: number;     // bytes
}

export interface ScriptExecutionResult {
  returnValue: unknown;
  collectedVariables: Record<string, unknown>;
  duration: number;
  memoryUsed: number;
}
```

### Business Rule Execution

```typescript
// DMN decision evaluation result
export interface DecisionResult {
  decisionId: string;
  matchedRules: DecisionTableRule[];
  output: unknown;
  evaluationTime: number;
  inputContext: Record<string, unknown>;
}

// Error when multiple rules match for UNIQUE policy
export interface MultipleMatchesError extends ExecutionError {
  code: 'MULTIPLE_MATCHES';
  decisionId: string;
  matchedRules: DecisionTableRule[];
}

// Error when no rules match
export interface NoMatchingRuleError extends ExecutionError {
  code: 'NO_MATCHING_RULE';
  decisionId: string;
  inputContext: Record<string, unknown>;
}
```

### Channel Dispatchers

```typescript
// Dispatcher for send tasks
export interface ChannelDispatcher {
  channel: SendTaskChannel;
  buildPayload(config: SendTaskConfig, context: ExecutionContext): Promise<unknown>;
  send(payload: unknown): Promise<DispatchResult>;
  validate?(config: unknown): ValidationResult;
}

export interface DispatchResult {
  status: 'sent' | 'queued' | 'failed';
  messageId?: string;
  jobId?: string;
  sentAt?: Date;
  queuedAt?: Date;
  error?: string;
  attempts?: number;
  recipients?: number;
}

// Email-specific dispatch result
export interface EmailDispatchResult extends DispatchResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

// Slack-specific dispatch result
export interface SlackDispatchResult extends DispatchResult {
  ts: string;           // Slack message timestamp
  channel: string;
  threadTs?: string;
}
```

### Execution Metrics

```typescript
export interface ExecutionMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  cpuTime?: number;
  memoryPeak?: number;
  ioOperations?: number;
  externalCalls?: ExternalCallMetric[];
}

export interface ExternalCallMetric {
  service: string;
  operation: string;
  duration: number;
  status: 'success' | 'failure';
  statusCode?: number;
  bytesTransferred?: number;
}
```

### Execution Tracing

```typescript
// Span for distributed tracing
export interface ExecutionSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, unknown>;
}

// Trace context for propagation
export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}
```

---

## Reliability & Fault Tolerance Models

### Compensation Handlers

```typescript
export type CompensationHandlerType = 'script' | 'service' | 'workflow';

export interface CompensationHandler {
  id: string;
  activityDefinitionId: string;
  handlerType: CompensationHandlerType;
  config: CompensationConfig;
  executionOrder: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CompensationConfig =
  | ScriptCompensationConfig
  | ServiceCompensationConfig
  | WorkflowCompensationConfig;

export interface ScriptCompensationConfig {
  language: 'javascript' | 'typescript';
  code: string;
  timeout?: number;
}

export interface ServiceCompensationConfig {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  timeout?: number;
  inputMapping?: Record<string, string>;
}

export interface WorkflowCompensationConfig {
  workflowDefinitionId: string;
  inputMapping?: Record<string, string>;
  waitForCompletion?: boolean;
}
```

### Workflow Checkpoints

```typescript
export interface WorkflowCheckpoint {
  id: string;
  workflowInstanceId: string;
  checkpointNumber: number;
  stateSnapshot: CheckpointState;
  variablesSnapshot: Record<string, unknown>;
  activeTokens: TokenSnapshot[];
  compressed: boolean;
  compressionAlgorithm?: 'gzip' | 'lz4';
  sizeBytes: number;
  createdAt: Date;
}

export interface CheckpointState {
  currentActivities: string[];
  completedActivities: string[];
  taskStates: Record<string, TaskCheckpoint>;
}

export interface TaskCheckpoint {
  status: TaskStatus;
  assignedTo?: string;
  variables?: Record<string, unknown>;
}

export interface TokenSnapshot {
  id: string;
  status: string;
  currentActivityId?: string;
  parentTokenId?: string;
}

export interface CheckpointConfig {
  enabled: boolean;
  intervalSeconds: number;
  onActivityCompletion: boolean;
  compressionEnabled: boolean;
  maxCheckpoints: number;
}
```

### Dead Letter Queue

```typescript
export type DLQStatus = 'pending' | 'retried' | 'resolved' | 'discarded';

export interface DeadLetterQueueItem {
  id: string;
  tenantId: string;
  queueName: string;
  jobId: string;
  jobName?: string;
  jobData: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
  failedAt: Date;
  retryCount: number;
  originalQueue?: string;
  status: DLQStatus;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  createdAt: Date;
}

export interface DLQSummary {
  queueName: string;
  total: number;
  pending: number;
  retried: number;
  resolved: number;
  discarded: number;
  oldestFailure?: Date;
  newestFailure?: Date;
}
```

### Retry Policies

```typescript
export type BackoffType = 'fixed' | 'exponential' | 'linear';
export type RetryStatus = 'success' | 'failed' | 'timeout';

export interface RetryPolicy {
  maxAttempts: number;
  backoffType: BackoffType;
  initialDelay: number;           // milliseconds
  maxDelay: number;               // milliseconds
  multiplier: number;             // for exponential backoff
  retryableErrors: string[];      // error codes to retry
  nonRetryableErrors: string[];   // error codes to fail immediately
}

export interface RetryAttempt {
  id: string;
  jobReferenceId: string;
  jobType: string;
  attemptNumber: number;
  status: RetryStatus;
  errorMessage?: string;
  errorCode?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
```

### Task Delegation

```typescript
export type DelegationType = 'task' | 'out_of_office' | 'permanent';

export interface TaskDelegation {
  id: string;
  tenantId: string;
  taskInstanceId?: string;        // null for out-of-office rules
  delegationType: DelegationType;
  fromUserId: string;
  toUserId: string;
  reason?: string;
  validFrom: Date;
  validUntil?: Date;              // null for permanent
  isActive: boolean;
  createdAt: Date;
  createdBy?: string;
}

export interface DelegationWithUsers extends TaskDelegation {
  fromUser: User;
  toUser: User;
  task?: TaskInstance;
}
```

### Circuit Breaker

```typescript
export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  failureThreshold: number;       // failures before opening
  successThreshold: number;       // successes to close from half-open
  timeout: number;                // reset timeout ms
  volumeThreshold: number;        // min requests to evaluate
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastStateChange: Date;
  nextAttempt?: Date;             // when to try again from open
}
```

---

## Observability Models

### Audit Logs

```typescript
export interface AuditLog {
  id: string;
  tenantId?: string;              // null for system events
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditLogFilter {
  tenantId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  requestId?: string;
}

// Common audit actions
export type AuditAction =
  | 'workflow.created'
  | 'workflow.updated'
  | 'workflow.published'
  | 'workflow.archived'
  | 'workflow.deleted'
  | 'instance.started'
  | 'instance.completed'
  | 'instance.failed'
  | 'instance.cancelled'
  | 'task.created'
  | 'task.assigned'
  | 'task.claimed'
  | 'task.delegated'
  | 'task.completed'
  | 'task.failed'
  | 'sla.warning'
  | 'sla.breach'
  | 'sla.escalation'
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'user.password_changed'
  | 'tenant.created'
  | 'tenant.settings_updated'
  | 'auth_provider.configured'
  | 'api_key.created'
  | 'api_key.revoked';
```

### Workflow Metrics

```typescript
export type MetricPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface WorkflowMetrics {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: MetricPeriod;

  // Instance metrics
  instancesStarted: number;
  instancesCompleted: number;
  instancesFailed: number;
  instancesCancelled: number;

  // Duration metrics (seconds)
  avgDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  p50DurationSeconds: number;
  p95DurationSeconds: number;
  p99DurationSeconds: number;

  // Task metrics
  totalTasksCreated: number;
  totalTasksCompleted: number;
  avgTaskDurationSeconds: number;

  // SLA metrics
  slaWarnings: number;
  slaBreaches: number;
  slaComplianceRate: number;

  // Error metrics
  errorCount: number;
  retryCount: number;
  dlqCount: number;

  createdAt: Date;
}

export interface MetricsQuery {
  workflowDefinitionId?: string;
  periodType: MetricPeriod;
  startDate: Date;
  endDate: Date;
}
```

### Distributed Tracing

```typescript
export type SpanKind = 'server' | 'client' | 'producer' | 'consumer' | 'internal';
export type SpanStatus = 'ok' | 'error' | 'unset';

export interface TraceSpan {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  spanKind?: SpanKind;

  // Timing
  startTime: Date;
  endTime?: Date;
  durationMs?: number;

  // Context
  tenantId?: string;
  userId?: string;
  workflowInstanceId?: string;
  taskInstanceId?: string;

  // Status
  statusCode?: SpanStatus;
  statusMessage?: string;

  // Data
  attributes: Record<string, unknown>;
  events: SpanEvent[];

  createdAt: Date;
}

export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes: Record<string, unknown>;
}

export interface TracingConfig {
  enabled: boolean;
  exporter: 'jaeger' | 'zipkin' | 'otlp';
  endpoint: string;
  samplingRate: number;
  propagators: ('w3c-trace-context' | 'b3' | 'jaeger')[];
}
```

---

## Integration Models

### Webhook Configuration

```typescript
export type WebhookDirection = 'inbound' | 'outbound';
export type WebhookAuthType = 'none' | 'basic' | 'bearer' | 'api_key' | 'oauth2' | 'hmac';

export interface WebhookConfig {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  direction: WebhookDirection;

  // Inbound settings
  endpointPath?: string;
  secretKey?: string;

  // Outbound settings
  url?: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  authType: WebhookAuthType;
  authConfig: WebhookAuthConfig;

  // Trigger configuration
  triggerEvents: string[];
  payloadTemplate?: Record<string, unknown>;

  // Retry settings
  retryEnabled: boolean;
  maxRetries: number;
  retryDelaySeconds: number;

  // Status
  isActive: boolean;
  lastTriggeredAt?: Date;
  successCount: number;
  failureCount: number;

  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type WebhookAuthConfig =
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string }
  | { type: 'api_key'; header: string; value: string }
  | { type: 'oauth2'; tokenUrl: string; clientId: string; clientSecret: string; scopes?: string[] }
  | { type: 'hmac'; algorithm: 'sha256' | 'sha512'; secret: string; header: string };
```

### Event Triggers

```typescript
export type TriggerType = 'cron' | 'webhook' | 'message_queue' | 'database_change' | 'manual';

export interface EventTrigger {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  name: string;
  description?: string;
  triggerType: TriggerType;
  config: TriggerConfig;

  // Input mapping
  inputVariables: Record<string, unknown>;
  correlationIdExpression?: string;

  // Status
  isActive: boolean;
  lastTriggeredAt?: Date;
  nextTriggerAt?: Date;           // for cron
  triggerCount: number;

  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type TriggerConfig =
  | CronTriggerConfig
  | WebhookTriggerConfig
  | MessageQueueTriggerConfig
  | DatabaseChangeTriggerConfig
  | ManualTriggerConfig;

export interface CronTriggerConfig {
  expression: string;             // "0 9 * * MON"
  timezone: string;               // "America/New_York"
}

export interface WebhookTriggerConfig {
  webhookConfigId: string;
  pathPattern?: string;
  payloadValidation?: Record<string, unknown>;
}

export interface MessageQueueTriggerConfig {
  broker: 'kafka' | 'nats' | 'rabbitmq' | 'redis_streams';
  topic: string;
  groupId?: string;
  filter?: Record<string, unknown>;
}

export interface DatabaseChangeTriggerConfig {
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  filter?: Record<string, unknown>;
  connectionId: string;           // reference to connector
}

export interface ManualTriggerConfig {
  requiredInputs?: string[];
  inputSchema?: Record<string, unknown>;
}
```

### API Keys

```typescript
export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  keyPrefix: string;              // first 10 chars for identification
  keyHash: string;                // hashed full key

  // Permissions
  scopes: string[];
  allowedWorkflows?: string[];    // null = all
  allowedIps?: string[];          // IP whitelist

  // Rate limiting
  rateLimitPerMinute: number;
  rateLimitPerDay: number;

  // Status
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;

  createdAt: Date;
  createdBy?: string;
  revokedAt?: Date;
  revokedBy?: string;
}

export type ApiScope =
  | 'workflows:read'
  | 'workflows:write'
  | 'instances:read'
  | 'instances:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'sla:read'
  | 'webhooks:manage'
  | 'admin:read';

export interface CreateApiKeyDto {
  name: string;
  description?: string;
  scopes: ApiScope[];
  allowedWorkflows?: string[];
  allowedIps?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  expiresAt?: Date;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  secretKey: string;              // only returned on creation
}
```

### Event Subscriptions

```typescript
export type MessageBroker = 'kafka' | 'nats' | 'rabbitmq' | 'redis_streams';

export interface EventSubscription {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  brokerType: MessageBroker;

  // Connection
  connectionConfig: BrokerConnectionConfig;

  // Subscribe settings
  subscribeTopics: string[];
  consumerGroup?: string;

  // Publish settings
  publishTopics: PublishTopicConfig[];

  // Filtering
  eventFilter?: Record<string, unknown>;

  // Status
  isActive: boolean;
  lastMessageAt?: Date;
  messagesReceived: number;
  messagesPublished: number;

  createdAt: Date;
  updatedAt: Date;
}

export type BrokerConnectionConfig =
  | KafkaConnectionConfig
  | NatsConnectionConfig
  | RabbitMQConnectionConfig
  | RedisStreamsConnectionConfig;

export interface KafkaConnectionConfig {
  brokers: string[];
  ssl?: boolean;
  sasl?: {
    mechanism: 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512';
    username: string;
    password: string;
  };
}

export interface NatsConnectionConfig {
  servers: string[];
  token?: string;
  user?: string;
  password?: string;
}

export interface RabbitMQConnectionConfig {
  url: string;
  vhost?: string;
}

export interface RedisStreamsConnectionConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface PublishTopicConfig {
  event: string;
  topic: string;
  keyExpression?: string;
}
```

### Connector Configurations

```typescript
export type ConnectorType = 'email' | 'slack' | 'teams' | 'rest' | 'database' | 's3' | 'salesforce';

export interface ConnectorConfig {
  id: string;
  tenantId: string;
  connectorType: ConnectorType;
  name: string;
  description?: string;
  config: ConnectorTypeConfig;

  // Status
  isActive: boolean;
  isVerified: boolean;
  lastVerifiedAt?: Date;
  lastUsedAt?: Date;
  errorMessage?: string;

  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type ConnectorTypeConfig =
  | EmailConnectorConfig
  | SlackConnectorConfig
  | TeamsConnectorConfig
  | RestConnectorConfig
  | DatabaseConnectorConfig
  | S3ConnectorConfig
  | SalesforceConnectorConfig;

export interface EmailConnectorConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun' | 'ses';
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
  apiKey?: string;
  from: string;
  replyTo?: string;
}

export interface SlackConnectorConfig {
  webhookUrl?: string;
  botToken?: string;
  defaultChannel: string;
  signingSecret?: string;
}

export interface TeamsConnectorConfig {
  webhookUrl: string;
}

export interface RestConnectorConfig {
  baseUrl: string;
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api_key';
    credentials?: Record<string, string>;
  };
  defaultHeaders?: Record<string, string>;
  timeout?: number;
}

export interface DatabaseConnectorConfig {
  type: 'postgresql' | 'mysql' | 'mssql' | 'oracle';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
}

export interface S3ConnectorConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;              // for S3-compatible storage
}

export interface SalesforceConnectorConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  securityToken?: string;
}
```

---

## Shift & Business Hours Models

```typescript
export type BusinessHoursMode = 'standard' | 'shifts' | 'rotating_shifts';

export interface BusinessHoursConfig {
  enabled: boolean;
  timezone: string;
  mode: BusinessHoursMode;

  // Standard mode
  schedule?: Record<string, DaySchedule>;

  // Shift mode
  shifts?: Record<string, ShiftDefinition>;
  shiftSchedule?: Record<string, string[]>;  // day -> shift names

  // Rotating shift mode
  rotationPattern?: RotationPattern;

  // Common
  holidays: string[];             // ISO date strings
}

export interface DaySchedule {
  start: string;                  // "09:00"
  end: string;                    // "17:00"
}

export interface ShiftDefinition {
  name: string;
  hours: DaySchedule;
  crossesMidnight?: boolean;
  color?: string;
}

export interface RotationPattern {
  type: 'weekly' | 'biweekly' | 'custom';
  cycle: RotationCycle[];
  startDate: string;              // ISO date
}

export interface RotationCycle {
  week: number;
  days: string[];
  shift: string | null;
}

export interface ShiftAssignments {
  [shiftName: string]: {
    users: string[];
    groups: string[];
  };
}

export interface ShiftHandoffConfig {
  enabled: boolean;
  behavior: 'reassign' | 'notify' | 'queue' | 'retain';
  reassignTo?: 'next_shift_group' | 'fallback_group';
  notifyOutgoing: boolean;
  notifyIncoming: boolean;
  handoffNoteRequired: boolean;
  graceMinutes: number;
}

export interface CurrentShiftInfo {
  currentShift?: {
    name: string;
    displayName: string;
    startTime: Date;
    endTime: Date;
    remainingMinutes: number;
  };
  nextShift?: {
    name: string;
    displayName: string;
    startTime: Date;
    endTime: Date;
  };
  assignedUsers: string[];
  assignedGroups: string[];
  activeTasks: number;
  tasksDueSoon: number;
}

// Shift-specific SLA overrides
export interface ShiftSLAOverride {
  shiftName: string;
  warningThresholdSeconds?: number;
  breachThresholdSeconds: number;
  reason?: string;
}
```

---

## AI Service Models

Models for AI-assisted workflow design, form generation, and optimization features.

### AI Provider Configuration

```typescript
export type AIProviderType = 'openai' | 'anthropic' | 'azure-openai' | 'ollama';

export interface AIProviderConfig {
  id: string;
  tenantId: string;
  providerType: AIProviderType;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  config: AIProviderTypeConfig;
  rateLimits?: AIRateLimitConfig;
  createdAt: Date;
  updatedAt: Date;
}

export type AIProviderTypeConfig =
  | OpenAIConfig
  | AnthropicConfig
  | AzureOpenAIConfig
  | OllamaConfig;

export interface OpenAIConfig {
  apiKey: string;
  model: string;                    // "gpt-4-turbo", "gpt-4o"
  maxTokens?: number;
  temperature?: number;
  organizationId?: string;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;                    // "claude-3-sonnet-20240229", "claude-3-opus"
  maxTokens?: number;
  temperature?: number;
}

export interface AzureOpenAIConfig {
  endpoint: string;                 // "https://your-resource.openai.azure.com"
  apiKey: string;
  deploymentName: string;
  apiVersion?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface OllamaConfig {
  baseUrl: string;                  // "http://localhost:11434"
  model: string;                    // "llama3", "mistral", "codellama"
  maxTokens?: number;
  temperature?: number;
  numCtx?: number;                  // context window size
}

export interface AIRateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
}
```

### AI Request/Response Types

```typescript
// Workflow generation from natural language
export interface AIWorkflowGenerationRequest {
  tenantId: string;
  prompt: string;
  options?: WorkflowGenerationOptions;
  context?: WorkflowContext;
}

export interface WorkflowGenerationOptions {
  complexity?: 'simple' | 'moderate' | 'complex';
  includeErrorHandling?: boolean;
  includeSLA?: boolean;
  includeNotifications?: boolean;
  style?: 'sequential' | 'parallel' | 'adaptive';
  maxActivities?: number;
}

export interface WorkflowContext {
  existingWorkflows?: string[];     // IDs for reference
  organizationDomain?: string;
  preferredTaskTypes?: ActivityType[];
  assignmentGroups?: string[];
}

export interface AIWorkflowGenerationResponse {
  success: boolean;
  workflowDefinition?: Partial<WorkflowDefinition>;
  bpmnXml?: string;
  explanation?: string;
  suggestions?: string[];
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: AIError;
}

// Form schema generation
export interface AIFormGenerationRequest {
  tenantId: string;
  description: string;
  options?: FormGenerationOptions;
}

export interface FormGenerationOptions {
  includeFileUploads?: boolean;
  includeConditionalLogic?: boolean;
  maxFields?: number;
  fieldTypes?: FormFieldType[];
}

export interface AIFormGenerationResponse {
  success: boolean;
  formSchema?: FormField[];
  explanation?: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: AIError;
}

// Workflow optimization
export interface AIWorkflowAnalysisRequest {
  tenantId: string;
  workflowDefinitionId: string;
  analysisType: 'optimize' | 'validate' | 'suggest';
  metrics?: WorkflowMetrics;
}

export interface AIWorkflowAnalysisResponse {
  success: boolean;
  suggestions?: OptimizationSuggestion[];
  validationIssues?: ValidationIssue[];
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: AIError;
}

export interface OptimizationSuggestion {
  type: 'performance' | 'reliability' | 'user_experience' | 'sla';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedActivities?: string[];
  estimatedImpact?: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  activityId?: string;
  message: string;
  suggestion?: string;
}
```

### AI Chat Assistant

```typescript
export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokens?: number;
    model?: string;
    workflowContext?: string;
  };
}

export interface AIChatSession {
  id: string;
  tenantId: string;
  userId: string;
  title?: string;
  messages: AIChatMessage[];
  workflowContext?: {
    workflowDefinitionId?: string;
    workflowInstanceId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AIChatRequest {
  sessionId?: string;
  tenantId: string;
  message: string;
  workflowContext?: {
    workflowDefinitionId?: string;
    workflowInstanceId?: string;
  };
  options?: {
    streamResponse?: boolean;
    includeWorkflowSuggestions?: boolean;
  };
}

export interface AIChatResponse {
  success: boolean;
  sessionId: string;
  message?: AIChatMessage;
  workflowActions?: AIWorkflowAction[];
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: AIError;
}

export interface AIWorkflowAction {
  type: 'create_workflow' | 'modify_workflow' | 'add_activity' | 'generate_form';
  description: string;
  payload?: unknown;
  confirmed?: boolean;
}
```

### AI Error Types

```typescript
export type AIErrorCode =
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'CONTEXT_TOO_LONG'
  | 'MODEL_UNAVAILABLE'
  | 'CONTENT_FILTERED'
  | 'TIMEOUT'
  | 'CONFIGURATION_ERROR';

export interface AIError {
  code: AIErrorCode;
  message: string;
  provider?: AIProviderType;
  retryable: boolean;
  retryAfter?: number;            // seconds
  details?: Record<string, unknown>;
}
```

### AI Usage Tracking

```typescript
export interface AIUsageRecord {
  id: string;
  tenantId: string;
  userId?: string;
  providerId: string;
  providerType: AIProviderType;
  operationType: 'workflow_generation' | 'form_generation' | 'optimization' | 'chat';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  durationMs: number;
  success: boolean;
  errorCode?: AIErrorCode;
  createdAt: Date;
}

export interface AIUsageSummary {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost?: number;
  byProvider: Record<AIProviderType, {
    requests: number;
    tokens: number;
    cost?: number;
  }>;
  byOperation: Record<string, {
    requests: number;
    tokens: number;
  }>;
}
```

### AI Caching

```typescript
export interface AICacheEntry {
  id: string;
  tenantId: string;
  cacheKey: string;                // hash of request
  operationType: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  tokensUsed: number;
  hitCount: number;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
}

export interface AICacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
  cacheableOperations: string[];
}
```
