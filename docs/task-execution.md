# Task Execution Mechanics

This document details the internal execution mechanics for all supported task types in FlowEngine. Understanding these mechanics is essential for debugging, optimization, and custom task handler development.

---

## Execution Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXECUTION FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Workflow   │    │   Execution  │    │    Task      │                   │
│  │   Instance   │───►│    Token     │───►│   Instance   │                   │
│  │   Created    │    │   Created    │    │   Created    │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│         │                   │                   │                            │
│         ▼                   ▼                   ▼                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   BullMQ     │    │    Task      │    │    Task      │                   │
│  │   Job Queue  │───►│   Executor   │───►│   Handler    │                   │
│  │              │    │   Registry   │    │   (Type)     │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                                                 │                            │
│                                                 ▼                            │
│                                          ┌──────────────┐                   │
│                                          │  Execution   │                   │
│                                          │   Result     │                   │
│                                          └──────────────┘                   │
│                                                 │                            │
│                      ┌──────────────────────────┼──────────────────────┐    │
│                      ▼                          ▼                      ▼    │
│               ┌──────────────┐          ┌──────────────┐       ┌──────────┐│
│               │   Complete   │          │    Wait      │       │  Error   ││
│               │   & Continue │          │   (Async)    │       │  Handle  ││
│               └──────────────┘          └──────────────┘       └──────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Task Lifecycle States

All tasks follow a standard lifecycle with specific state transitions:

```
                              ┌─────────────────────────────────┐
                              │         TASK LIFECYCLE          │
                              └─────────────────────────────────┘

    ┌─────────┐     activate      ┌─────────┐     complete      ┌───────────┐
    │ PENDING │─────────────────►│ ACTIVE  │─────────────────►│ COMPLETED │
    └─────────┘                   └─────────┘                   └───────────┘
         │                             │
         │                             │ fail
         │                             ▼
         │                       ┌─────────┐     retry        ┌─────────┐
         │                       │ FAILED  │◄────────────────│ RETRYING│
         │                       └─────────┘                  └─────────┘
         │                             │
         │ skip                        │ max retries
         ▼                             ▼
    ┌─────────┐                  ┌───────────┐
    │ SKIPPED │                  │ DEAD_LETTER│
    └─────────┘                  └───────────┘
```

### State Definitions

| State | Description | Allowed Transitions |
|-------|-------------|---------------------|
| `pending` | Task created but not yet ready for execution | `active`, `skipped` |
| `active` | Task is ready and being worked on | `completed`, `failed` |
| `completed` | Task finished successfully | (terminal) |
| `failed` | Task failed (may retry) | `retrying`, `dead_letter` |
| `retrying` | Task is being retried | `active`, `failed` |
| `skipped` | Task was bypassed (conditional flow) | (terminal) |
| `dead_letter` | Task exceeded max retries | (terminal, manual intervention) |

---

## Task Executor Registry

The Task Executor Registry manages all task handlers and routes execution to the appropriate handler based on task type.

```typescript
// Internal: Task Executor Registry
interface TaskExecutorRegistry {
  handlers: Map<ActivityType, TaskHandler>;

  register(type: ActivityType, handler: TaskHandler): void;
  execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult>;
  getHandler(type: ActivityType): TaskHandler | undefined;
}

interface TaskHandler {
  type: ActivityType;
  execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult>;
  validate?(config: ActivityConfig): ValidationResult;
  onTimeout?(task: TaskInstance): Promise<void>;
  onCancel?(task: TaskInstance): Promise<void>;
}

interface ExecutionContext {
  workflowInstance: WorkflowInstance;
  activityDefinition: ActivityDefinition;
  variables: Record<string, unknown>;
  services: ServiceContainer;
  logger: Logger;
  tracer: Tracer;
}

interface ExecutionResult {
  status: 'completed' | 'waiting' | 'failed';
  outputVariables?: Record<string, unknown>;
  error?: ExecutionError;
  waitCondition?: WaitCondition;
}
```

---

## User Task Execution

User Tasks require human interaction and support form-based data collection.

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        USER TASK EXECUTION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TOKEN ARRIVES AT USER TASK                                              │
│     │                                                                        │
│     ▼                                                                        │
│  2. CREATE TASK INSTANCE                                                     │
│     ├─ Evaluate assignee expression: "${employee.manager}"                  │
│     ├─ Resolve candidate users/groups                                       │
│     ├─ Calculate due date from expression                                   │
│     └─ Set priority (0-100)                                                 │
│     │                                                                        │
│     ▼                                                                        │
│  3. RESOLVE FORM DEFINITION                                                  │
│     ├─ Load form by formKey (if external)                                   │
│     ├─ Or use inline formFields                                             │
│     ├─ Evaluate showIf conditions for fields                                │
│     └─ Populate default values from variables                               │
│     │                                                                        │
│     ▼                                                                        │
│  4. EMIT TASK_CREATED EVENT                                                  │
│     ├─ Publish to Redis Streams: task.created                               │
│     ├─ Notify via WebSocket to relevant users                               │
│     └─ Trigger notification hooks                                           │
│     │                                                                        │
│     ▼                                                                        │
│  5. SCHEDULE SLA MONITORING                                                  │
│     ├─ Schedule warning job at warningThresholdSeconds                      │
│     ├─ Schedule breach job at breachThresholdSeconds                        │
│     └─ Store job IDs for cancellation                                       │
│     │                                                                        │
│     ▼                                                                        │
│  6. TOKEN ENTERS WAITING STATE                                               │
│     └─ Execution pauses until task completion                               │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  7. USER CLAIMS TASK (Optional)                                              │
│     ├─ Acquire distributed lock: task:{taskId}:claim                        │
│     ├─ Verify user is in candidateUsers/candidateGroups                     │
│     ├─ Set assignedTo = claimingUserId                                      │
│     ├─ Emit TASK_ASSIGNED event                                             │
│     └─ Release lock                                                          │
│     │                                                                        │
│     ▼                                                                        │
│  8. USER COMPLETES TASK                                                      │
│     ├─ Validate form data against field validations                         │
│     ├─ Verify user is assignee or in candidates                             │
│     ├─ Store completion variables                                           │
│     └─ Record completion comment                                            │
│     │                                                                        │
│     ▼                                                                        │
│  9. POST-COMPLETION PROCESSING                                               │
│     ├─ Cancel scheduled SLA jobs                                            │
│     ├─ Update task status to 'completed'                                    │
│     ├─ Record in task_state_history                                         │
│     ├─ Emit TASK_COMPLETED event                                            │
│     └─ Enqueue CONTINUE_EXECUTION job                                       │
│     │                                                                        │
│     ▼                                                                        │
│  10. RESUME EXECUTION                                                        │
│      ├─ Worker picks up CONTINUE_EXECUTION job                              │
│      ├─ Merge task variables into process variables                         │
│      ├─ Move token to next activity                                         │
│      └─ Continue workflow execution                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Internal Handler

```typescript
class UserTaskHandler implements TaskHandler {
  type = 'userTask' as const;

  async execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult> {
    const config = context.activityDefinition.config;

    // 1. Resolve assignment
    const assignment = await this.resolveAssignment(config, context);

    // 2. Create task with assignment
    await this.taskRepository.update(task.id, {
      assignedTo: assignment.assignee,
      assignedGroup: assignment.primaryGroup,
      candidateUsers: assignment.candidateUsers,
      candidateGroups: assignment.candidateGroups,
      dueAt: this.calculateDueDate(config.dueDate, context),
      priority: config.priority ?? 50,
      status: 'active'
    });

    // 3. Resolve and attach form
    const form = await this.resolveForm(config, context);
    await this.taskFormService.attachForm(task.id, form);

    // 4. Emit creation event
    await this.eventBus.emit('task.created', {
      taskId: task.id,
      workflowInstanceId: context.workflowInstance.id,
      assignedTo: assignment.assignee,
      candidateGroups: assignment.candidateGroups
    });

    // 5. Schedule SLA monitoring
    if (context.activityDefinition.slaDefinition) {
      await this.slaService.scheduleMonitoring(task.id, context.activityDefinition.slaDefinition);
    }

    // 6. Return waiting status - token waits for user action
    return {
      status: 'waiting',
      waitCondition: {
        type: 'user_completion',
        taskId: task.id
      }
    };
  }

  private async resolveAssignment(config: ActivityConfig, context: ExecutionContext) {
    const expressionEngine = context.services.get(ExpressionEngine);

    return {
      assignee: config.assignee
        ? await expressionEngine.evaluate(config.assignee, context.variables)
        : undefined,
      candidateUsers: config.candidateUsers ?? [],
      candidateGroups: config.candidateGroups ?? [],
      primaryGroup: config.candidateGroups?.[0]
    };
  }
}
```

### Completion Processing

```typescript
// Task completion internal flow
async completeUserTask(taskId: string, input: CompleteTaskInput, userId: string): Promise<void> {
  // 1. Acquire lock to prevent race conditions
  await this.lockService.withLock(`task:${taskId}:complete`, 5000, async () => {

    // 2. Load and validate task
    const task = await this.taskRepository.findById(taskId);
    if (task.status !== 'active') {
      throw new InvalidTaskStateError(task.status, 'active');
    }

    // 3. Verify user authorization
    if (!this.canUserComplete(task, userId)) {
      throw new UnauthorizedTaskAccessError(taskId, userId);
    }

    // 4. Validate form submission
    const form = await this.taskFormService.getForm(taskId);
    const validationResult = await this.formValidator.validate(form, input.variables);
    if (!validationResult.valid) {
      throw new FormValidationError(validationResult.errors);
    }

    // 5. Update task state
    await this.taskRepository.update(taskId, {
      status: 'completed',
      completedAt: new Date(),
      completedBy: userId,
      completionResult: input.variables,
      completionComment: input.comment
    });

    // 6. Record state transition
    await this.taskHistoryService.recordTransition({
      taskId,
      fromStatus: 'active',
      toStatus: 'completed',
      changedBy: userId,
      metadata: { variables: input.variables }
    });

    // 7. Cancel SLA monitoring
    await this.slaService.cancelMonitoring(taskId);

    // 8. Emit completion event
    await this.eventBus.emit('task.completed', {
      taskId,
      workflowInstanceId: task.workflowInstanceId,
      completedBy: userId,
      result: input.variables
    });

    // 9. Enqueue continuation
    await this.executionQueue.add('CONTINUE_EXECUTION', {
      workflowInstanceId: task.workflowInstanceId,
      completedTaskId: taskId,
      outputVariables: input.variables
    });
  });
}
```

---

## Form Data and File Handling

This section details how form inputs and file uploads are processed, validated, stored, and retrieved.

### Form Processing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FORM SUBMISSION PROCESSING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CLIENT SUBMITS FORM                                                      │
│     │                                                                        │
│     │  ┌─────────────────────────────────────────────────────────────┐     │
│     │  │  FormData (multipart/form-data)                              │     │
│     │  │  ├─ Text fields: { fieldId: value }                          │     │
│     │  │  ├─ Select/Radio: { fieldId: selectedValue }                 │     │
│     │  │  ├─ Multi-select: { fieldId: [values] }                      │     │
│     │  │  ├─ Files: { fieldId: [File objects] }                       │     │
│     │  │  └─ Signature: { signature: base64Data }                     │     │
│     │  └─────────────────────────────────────────────────────────────┘     │
│     │                                                                        │
│     ▼                                                                        │
│  2. REQUEST VALIDATION                                                       │
│     ├─ Verify task exists and is active                                     │
│     ├─ Verify user authorization                                            │
│     └─ Check request size limits                                            │
│     │                                                                        │
│     ▼                                                                        │
│  3. FILE UPLOAD PROCESSING (parallel per file)                              │
│     │                                                                        │
│     │  FOR EACH FILE:                                                       │
│     │  ┌─────────────────────────────────────────────────────────────┐     │
│     │  │  a. Validate file type (MIME check + magic bytes)           │     │
│     │  │  b. Validate file size                                       │     │
│     │  │  c. Scan for viruses (if enabled)                           │     │
│     │  │  d. Generate unique storage name (UUID)                      │     │
│     │  │  e. Calculate checksum (SHA-256)                             │     │
│     │  │  f. Upload to storage provider                               │     │
│     │  │  g. Extract metadata (images, documents)                     │     │
│     │  │  h. Generate thumbnails (images)                             │     │
│     │  │  i. Create file record in database                           │     │
│     │  └─────────────────────────────────────────────────────────────┘     │
│     │                                                                        │
│     ▼                                                                        │
│  4. FIELD VALIDATION                                                         │
│     │                                                                        │
│     │  FOR EACH FIELD:                                                      │
│     │  ┌─────────────────────────────────────────────────────────────┐     │
│     │  │  a. Check required fields                                    │     │
│     │  │  b. Validate type (string, number, date, etc.)              │     │
│     │  │  c. Apply min/max constraints                                │     │
│     │  │  d. Check pattern/regex                                      │     │
│     │  │  e. Run custom validation expressions                        │     │
│     │  │  f. Validate against showIf conditions                       │     │
│     │  └─────────────────────────────────────────────────────────────┘     │
│     │                                                                        │
│     ▼                                                                        │
│  5. DATA TRANSFORMATION                                                      │
│     ├─ Convert types (string to number, date parsing)                       │
│     ├─ Sanitize strings (XSS prevention)                                    │
│     ├─ Encrypt sensitive fields                                             │
│     └─ Map field IDs to variable names                                      │
│     │                                                                        │
│     ▼                                                                        │
│  6. STORE FORM DATA                                                          │
│     ├─ Save to form_submissions table                                       │
│     ├─ Link file references                                                 │
│     └─ Update task variables                                                │
│     │                                                                        │
│     ▼                                                                        │
│  7. COMPLETE TASK                                                            │
│     └─ Trigger task completion flow                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Upload Processing

```typescript
class FileUploadService {
  private storageProviders: Map<string, StorageProvider>;
  private virusScanner?: VirusScannerService;
  private thumbnailGenerator: ThumbnailService;
  private metadataExtractor: MetadataExtractorService;

  async processUpload(
    file: Express.Multer.File,
    config: FileFormField,
    context: UploadContext
  ): Promise<UploadedFile> {
    // 1. Validate file type
    await this.validateFileType(file, config.accept);

    // 2. Validate file size
    this.validateFileSize(file, config.maxFileSize);

    // 3. Virus scan (if enabled)
    if (config.scanForViruses) {
      const scanResult = await this.virusScanner?.scan(file.buffer);
      if (scanResult?.infected) {
        throw new InfectedFileError(file.originalname, scanResult.virus);
      }
    }

    // 4. Generate storage identifiers
    const fileId = randomUUID();
    const storageName = `${fileId}${path.extname(file.originalname)}`;
    const storagePath = this.buildStoragePath(config.storageConfig, context, storageName);

    // 5. Calculate checksum
    const checksum = await this.calculateChecksum(file.buffer);

    // 6. Upload to storage
    const storageProvider = this.getStorageProvider(config.storageConfig?.provider ?? 'local');
    const uploadResult = await storageProvider.upload({
      buffer: file.buffer,
      path: storagePath,
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname,
        uploadedBy: context.userId,
        workflowInstanceId: context.workflowInstanceId
      },
      acl: config.storageConfig?.acl ?? 'private',
      encryption: config.storageConfig?.encryption ?? true
    });

    // 7. Extract metadata (parallel with thumbnail generation)
    const [metadata, thumbnails] = await Promise.all([
      config.extractMetadata ? this.extractMetadata(file) : undefined,
      config.generateThumbnails && this.isImage(file.mimetype)
        ? this.generateThumbnails(file, storagePath, storageProvider)
        : undefined
    ]);

    // 8. Create database record
    const uploadedFile: UploadedFile = {
      id: fileId,
      originalName: file.originalname,
      storageName,
      mimeType: file.mimetype,
      size: file.size,
      checksum,
      storageProvider: config.storageConfig?.provider ?? 'local',
      storagePath,
      storageUrl: uploadResult.publicUrl,
      downloadUrl: await this.generateDownloadUrl(storagePath, storageProvider),
      metadata,
      thumbnails,
      virusScanStatus: config.scanForViruses ? 'clean' : undefined,
      virusScanAt: config.scanForViruses ? new Date() : undefined,
      uploadedBy: context.userId,
      uploadedAt: new Date(),
      workflowInstanceId: context.workflowInstanceId,
      taskInstanceId: context.taskInstanceId,
      formFieldId: context.fieldId
    };

    await this.fileRepository.create(uploadedFile);

    return uploadedFile;
  }

  private async validateFileType(file: Express.Multer.File, accept?: string): Promise<void> {
    if (!accept) return;

    // Parse accept string: "image/*,.pdf,.docx"
    const allowedTypes = accept.split(',').map(t => t.trim());

    // Check MIME type
    const mimeAllowed = allowedTypes.some(type => {
      if (type.startsWith('.')) {
        // Extension check
        return file.originalname.toLowerCase().endsWith(type.toLowerCase());
      } else if (type.endsWith('/*')) {
        // Wildcard MIME type (e.g., image/*)
        return file.mimetype.startsWith(type.replace('/*', '/'));
      } else {
        // Exact MIME type
        return file.mimetype === type;
      }
    });

    if (!mimeAllowed) {
      throw new InvalidFileTypeError(file.originalname, file.mimetype, allowedTypes);
    }

    // Verify magic bytes match declared MIME type (prevent spoofing)
    const detectedType = await fileTypeFromBuffer(file.buffer);
    if (detectedType && !this.mimeTypesMatch(file.mimetype, detectedType.mime)) {
      throw new MimeTypeMismatchError(file.originalname, file.mimetype, detectedType.mime);
    }
  }

  private async generateThumbnails(
    file: Express.Multer.File,
    originalPath: string,
    provider: StorageProvider
  ): Promise<FileThumbnail[]> {
    const sizes = [
      { name: 'small', width: 64, height: 64 },
      { name: 'medium', width: 256, height: 256 },
      { name: 'large', width: 512, height: 512 }
    ];

    const thumbnails: FileThumbnail[] = [];

    for (const size of sizes) {
      const thumbBuffer = await sharp(file.buffer)
        .resize(size.width, size.height, {
          fit: 'cover',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const thumbPath = this.getThumbnailPath(originalPath, size.name);
      await provider.upload({
        buffer: thumbBuffer,
        path: thumbPath,
        contentType: 'image/jpeg',
        acl: 'private'
      });

      const thumbMetadata = await sharp(thumbBuffer).metadata();

      thumbnails.push({
        size: size.name as 'small' | 'medium' | 'large',
        width: thumbMetadata.width!,
        height: thumbMetadata.height!,
        url: await this.generateDownloadUrl(thumbPath, provider),
        mimeType: 'image/jpeg'
      });
    }

    return thumbnails;
  }

  private async extractMetadata(file: Express.Multer.File): Promise<FileMetadata> {
    const metadata: FileMetadata = {};

    if (this.isImage(file.mimetype)) {
      const imageMetadata = await sharp(file.buffer).metadata();
      metadata.width = imageMetadata.width;
      metadata.height = imageMetadata.height;
      metadata.colorSpace = imageMetadata.space;
      metadata.orientation = imageMetadata.orientation;

      // Extract EXIF data
      if (imageMetadata.exif) {
        metadata.exif = this.parseExif(imageMetadata.exif);
      }
    }

    if (this.isPdf(file.mimetype)) {
      const pdfMetadata = await this.extractPdfMetadata(file.buffer);
      metadata.pageCount = pdfMetadata.pageCount;
      metadata.author = pdfMetadata.author;
      metadata.title = pdfMetadata.title;
      metadata.createdAt = pdfMetadata.createdAt;
    }

    return metadata;
  }
}
```

### Form Field Validation

```typescript
class FormValidationService {
  private expressionEngine: ExpressionEngine;

  async validateForm(
    submission: FormSubmission,
    formDefinition: FormField[],
    context: ValidationContext
  ): Promise<FormValidationResult> {
    const errors: FieldValidationError[] = [];
    const validatedFields: Map<string, ValidatedField> = new Map();

    // Build field dependency graph for showIf conditions
    const visibleFields = await this.evaluateFieldVisibility(formDefinition, submission, context);

    for (const fieldDef of formDefinition) {
      // Skip validation for hidden fields
      if (!visibleFields.has(fieldDef.id)) {
        continue;
      }

      const submittedValue = this.getSubmittedValue(submission, fieldDef.id);
      const fieldErrors = await this.validateField(fieldDef, submittedValue, context);

      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors.map(e => ({ ...e, fieldId: fieldDef.id })));
      } else {
        validatedFields.set(fieldDef.id, {
          fieldId: fieldDef.id,
          value: this.transformValue(submittedValue, fieldDef),
          displayValue: this.formatDisplayValue(submittedValue, fieldDef)
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      validatedFields
    };
  }

  private async validateField(
    fieldDef: FormField,
    value: unknown,
    context: ValidationContext
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Required check
    if (fieldDef.required && this.isEmpty(value)) {
      errors.push({
        rule: 'required',
        message: `${fieldDef.label} is required`
      });
      return errors; // Skip other validations if empty and required
    }

    // Skip other validations if empty and not required
    if (this.isEmpty(value)) {
      return errors;
    }

    // Type-specific validation
    switch (fieldDef.type) {
      case 'text':
      case 'textarea':
        errors.push(...this.validateText(value as string, fieldDef));
        break;

      case 'number':
        errors.push(...this.validateNumber(value, fieldDef));
        break;

      case 'date':
      case 'datetime':
        errors.push(...this.validateDate(value, fieldDef));
        break;

      case 'select':
      case 'radio':
        errors.push(...this.validateSelect(value, fieldDef));
        break;

      case 'multiselect':
        errors.push(...this.validateMultiSelect(value as unknown[], fieldDef));
        break;

      case 'boolean':
        errors.push(...this.validateBoolean(value, fieldDef));
        break;

      case 'file':
        // File validation is done in FileUploadService
        break;

      case 'user':
      case 'group':
        errors.push(...await this.validateUserOrGroup(value, fieldDef, context));
        break;
    }

    // Custom validation expression
    if (fieldDef.validation?.custom) {
      const customResult = await this.evaluateCustomValidation(
        fieldDef.validation.custom,
        value,
        context
      );
      if (!customResult.valid) {
        errors.push({
          rule: 'custom',
          message: customResult.message ?? 'Validation failed'
        });
      }
    }

    return errors;
  }

  private validateText(value: string, fieldDef: FormField): ValidationError[] {
    const errors: ValidationError[] = [];
    const validation = fieldDef.validation ?? {};

    if (fieldDef.minLength && value.length < fieldDef.minLength) {
      errors.push({
        rule: 'minLength',
        message: `${fieldDef.label} must be at least ${fieldDef.minLength} characters`,
        params: { minLength: fieldDef.minLength, actual: value.length }
      });
    }

    if (fieldDef.maxLength && value.length > fieldDef.maxLength) {
      errors.push({
        rule: 'maxLength',
        message: `${fieldDef.label} must be at most ${fieldDef.maxLength} characters`,
        params: { maxLength: fieldDef.maxLength, actual: value.length }
      });
    }

    if (fieldDef.pattern) {
      const regex = new RegExp(fieldDef.pattern);
      if (!regex.test(value)) {
        errors.push({
          rule: 'pattern',
          message: validation.patternMessage ?? `${fieldDef.label} format is invalid`,
          params: { pattern: fieldDef.pattern }
        });
      }
    }

    return errors;
  }

  private validateNumber(value: unknown, fieldDef: FormField): ValidationError[] {
    const errors: ValidationError[] = [];
    const numValue = Number(value);

    if (isNaN(numValue)) {
      errors.push({
        rule: 'type',
        message: `${fieldDef.label} must be a valid number`
      });
      return errors;
    }

    if (fieldDef.min !== undefined && numValue < fieldDef.min) {
      errors.push({
        rule: 'min',
        message: `${fieldDef.label} must be at least ${fieldDef.min}`,
        params: { min: fieldDef.min, actual: numValue }
      });
    }

    if (fieldDef.max !== undefined && numValue > fieldDef.max) {
      errors.push({
        rule: 'max',
        message: `${fieldDef.label} must be at most ${fieldDef.max}`,
        params: { max: fieldDef.max, actual: numValue }
      });
    }

    return errors;
  }

  private async evaluateFieldVisibility(
    fields: FormField[],
    submission: FormSubmission,
    context: ValidationContext
  ): Promise<Set<string>> {
    const visible = new Set<string>();

    for (const field of fields) {
      if (!field.showIf) {
        // No condition, always visible
        visible.add(field.id);
      } else {
        // Evaluate showIf expression
        const expressionContext = {
          ...context.variables,
          ...this.submissionToObject(submission)
        };

        const isVisible = await this.expressionEngine.evaluate(
          field.showIf,
          expressionContext
        );

        if (isVisible) {
          visible.add(field.id);
        }
      }
    }

    return visible;
  }
}
```

### Form Data Storage

```typescript
class FormDataStorageService {
  async storeFormData(
    taskId: string,
    submission: FormSubmission,
    validatedFields: Map<string, ValidatedField>,
    uploadedFiles: Map<string, UploadedFile[]>
  ): Promise<StoredFormData> {
    // 1. Build values object
    const values: Record<string, StoredFieldValue> = {};
    for (const [fieldId, field] of validatedFields) {
      values[fieldId] = {
        fieldId,
        fieldType: field.fieldType,
        value: field.value,
        displayValue: field.displayValue,
        encrypted: field.encrypted
      };
    }

    // 2. Build file references
    const files: Record<string, StoredFileReference[]> = {};
    for (const [fieldId, fieldFiles] of uploadedFiles) {
      files[fieldId] = fieldFiles.map(f => ({
        fileId: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        storagePath: f.storagePath
      }));
    }

    // 3. Create stored form data record
    const storedData: StoredFormData = {
      taskInstanceId: taskId,
      values,
      files,
      submittedBy: submission.submittedBy,
      submittedAt: submission.submittedAt,
      submissionIp: submission.metadata?.ipAddress as string,
      submissionUserAgent: submission.metadata?.userAgent as string
    };

    // 4. Save to database
    await this.formDataRepository.create(storedData);

    // 5. Update task variables with form values
    const taskVariables = this.buildTaskVariables(validatedFields, uploadedFiles);
    await this.taskRepository.updateVariables(taskId, taskVariables);

    return storedData;
  }

  private buildTaskVariables(
    validatedFields: Map<string, ValidatedField>,
    uploadedFiles: Map<string, UploadedFile[]>
  ): Record<string, unknown> {
    const variables: Record<string, unknown> = {};

    // Add field values
    for (const [fieldId, field] of validatedFields) {
      variables[fieldId] = field.value;
    }

    // Add file references (as array of file IDs and metadata)
    for (const [fieldId, files] of uploadedFiles) {
      variables[fieldId] = files.map(f => ({
        id: f.id,
        name: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        downloadUrl: f.downloadUrl
      }));
    }

    return variables;
  }
}
```

### File Download and Access

```typescript
class FileAccessService {
  async getDownloadUrl(
    fileId: string,
    userId: string,
    options?: DownloadOptions
  ): Promise<string> {
    // 1. Load file record
    const file = await this.fileRepository.findById(fileId);
    if (!file) {
      throw new FileNotFoundError(fileId);
    }

    // 2. Check access permissions
    const hasAccess = await this.checkFileAccess(file, userId);
    if (!hasAccess) {
      throw new FileAccessDeniedError(fileId, userId);
    }

    // 3. Log access (for audit)
    await this.auditService.logFileAccess({
      fileId,
      userId,
      action: 'download_url_generated',
      timestamp: new Date()
    });

    // 4. Generate signed URL
    const storageProvider = this.getStorageProvider(file.storageProvider);
    const expirySeconds = options?.expirySeconds ?? 3600; // 1 hour default

    return storageProvider.getSignedUrl(file.storagePath, {
      expiresIn: expirySeconds,
      responseDisposition: options?.inline
        ? `inline; filename="${file.originalName}"`
        : `attachment; filename="${file.originalName}"`
    });
  }

  async streamFile(
    fileId: string,
    userId: string,
    res: Response
  ): Promise<void> {
    const file = await this.fileRepository.findById(fileId);
    if (!file) {
      throw new FileNotFoundError(fileId);
    }

    const hasAccess = await this.checkFileAccess(file, userId);
    if (!hasAccess) {
      throw new FileAccessDeniedError(fileId, userId);
    }

    // Log download
    await this.auditService.logFileAccess({
      fileId,
      userId,
      action: 'file_downloaded',
      timestamp: new Date()
    });

    // Set response headers
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('ETag', file.checksum);

    // Stream from storage
    const storageProvider = this.getStorageProvider(file.storageProvider);
    const stream = await storageProvider.getStream(file.storagePath);
    stream.pipe(res);
  }

  private async checkFileAccess(file: UploadedFile, userId: string): Promise<boolean> {
    // Get task and workflow access policies
    if (file.taskInstanceId) {
      const task = await this.taskRepository.findById(file.taskInstanceId);
      if (!task) return false;

      // User who uploaded can always access
      if (file.uploadedBy === userId) return true;

      // Check if user was/is assignee
      if (task.assignedTo === userId) return true;
      if (task.completedBy === userId) return true;

      // Check workflow-level access
      const instance = await this.workflowInstanceRepository.findById(task.workflowInstanceId);
      if (instance?.startedBy === userId) return true;

      // Check group membership
      const user = await this.userService.findById(userId);
      const userGroups = user?.groups ?? [];
      if (task.candidateGroups?.some(g => userGroups.includes(g))) return true;
    }

    // Check if user has admin access to tenant
    const isAdmin = await this.authService.hasPermission(userId, 'files:read:all');
    if (isAdmin) return true;

    return false;
  }
}
```

### File Cleanup and Retention

```typescript
class FileRetentionService {
  @Cron('0 0 2 * * *') // Run at 2 AM daily
  async cleanupExpiredFiles(): Promise<void> {
    // Find files past retention period
    const expiredFiles = await this.fileRepository.findExpired();

    for (const file of expiredFiles) {
      try {
        // Delete from storage
        const provider = this.getStorageProvider(file.storageProvider);
        await provider.delete(file.storagePath);

        // Delete thumbnails
        if (file.thumbnails) {
          for (const thumb of file.thumbnails) {
            await provider.delete(this.getPathFromUrl(thumb.url));
          }
        }

        // Mark as deleted in database (soft delete for audit trail)
        await this.fileRepository.markDeleted(file.id);

        this.logger.info('Expired file cleaned up', { fileId: file.id });
      } catch (error) {
        this.logger.error('Failed to cleanup expired file', {
          fileId: file.id,
          error
        });
      }
    }
  }

  async deleteWorkflowFiles(workflowInstanceId: string): Promise<void> {
    const files = await this.fileRepository.findByWorkflowInstance(workflowInstanceId);

    for (const file of files) {
      await this.deleteFile(file);
    }
  }
}
```

### Storage Provider Interface

```typescript
interface StorageProvider {
  upload(options: UploadOptions): Promise<UploadResult>;
  download(path: string): Promise<Buffer>;
  getStream(path: string): Promise<Readable>;
  delete(path: string): Promise<void>;
  getSignedUrl(path: string, options: SignedUrlOptions): Promise<string>;
  exists(path: string): Promise<boolean>;
  getMetadata(path: string): Promise<StorageMetadata>;
}

// S3 Implementation Example
class S3StorageProvider implements StorageProvider {
  private s3Client: S3Client;

  async upload(options: UploadOptions): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: options.path,
      Body: options.buffer,
      ContentType: options.contentType,
      Metadata: options.metadata,
      ACL: options.acl === 'public-read' ? 'public-read' : 'private',
      ServerSideEncryption: options.encryption ? 'AES256' : undefined
    });

    await this.s3Client.send(command);

    return {
      path: options.path,
      publicUrl: options.acl === 'public-read'
        ? `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${options.path}`
        : undefined
    };
  }

  async getSignedUrl(path: string, options: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: path,
      ResponseContentDisposition: options.responseDisposition
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: options.expiresIn
    });
  }
}
```

---

## Service Task Execution

Service Tasks execute automated logic including HTTP calls, scripts, and custom implementations.

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SERVICE TASK EXECUTION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TOKEN ARRIVES AT SERVICE TASK                                           │
│     │                                                                        │
│     ▼                                                                        │
│  2. CREATE TASK INSTANCE (status: active)                                   │
│     │                                                                        │
│     ▼                                                                        │
│  3. DETERMINE SERVICE TYPE                                                   │
│     ├─ 'http'       → HTTP Service Executor                                 │
│     ├─ 'script'     → Script Executor                                       │
│     ├─ 'custom'     → Custom Implementation Loader                          │
│     ├─ 'expression' → Expression Evaluator                                  │
│     └─ 'notification' → Notification Dispatcher                             │
│     │                                                                        │
│     ▼                                                                        │
│  4. EXECUTE SERVICE (within circuit breaker)                                │
│     │                                                                        │
│     ├─────────────────────────────────────────────────────┐                 │
│     │                                                      │                 │
│     ▼                                                      ▼                 │
│  ┌──────────────────────┐                     ┌──────────────────────┐      │
│  │   SUCCESS            │                     │   FAILURE            │      │
│  ├──────────────────────┤                     ├──────────────────────┤      │
│  │ • Store result in    │                     │ • Check retry policy │      │
│  │   resultVariable     │                     │ • If retryable:      │      │
│  │ • Mark completed     │                     │   - Calculate backoff│      │
│  │ • Continue execution │                     │   - Requeue job      │      │
│  └──────────────────────┘                     │ • If not retryable:  │      │
│                                               │   - Mark failed      │      │
│                                               │   - Check failOnError│      │
│                                               │   - Handle error path│      │
│                                               └──────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### HTTP Service Task Internals

```typescript
class HttpServiceTaskExecutor implements ServiceTaskExecutor {
  type = 'http' as const;

  async execute(task: TaskInstance, config: HttpServiceConfig, context: ExecutionContext): Promise<ServiceResult> {
    const { circuitBreaker, httpClient, expressionEngine } = context.services;

    // 1. Evaluate dynamic values in config
    const resolvedConfig = await this.resolveConfig(config, context);

    // 2. Execute within circuit breaker
    const result = await circuitBreaker.execute(
      `http:${resolvedConfig.url}`,
      async () => {
        // 3. Build HTTP request
        const request = {
          method: resolvedConfig.method,
          url: resolvedConfig.url,
          headers: resolvedConfig.headers,
          data: resolvedConfig.body ? JSON.parse(resolvedConfig.body) : undefined,
          timeout: resolvedConfig.timeout ?? 30000
        };

        // 4. Execute with retry logic
        return await this.executeWithRetry(httpClient, request, resolvedConfig.retries ?? 3);
      }
    );

    // 5. Store result
    const outputVariables: Record<string, unknown> = {};
    if (config.resultVariable) {
      outputVariables[config.resultVariable] = {
        status: result.status,
        headers: result.headers,
        body: result.data
      };
    }

    return {
      status: 'completed',
      outputVariables
    };
  }

  private async executeWithRetry(client: HttpClient, request: HttpRequest, maxRetries: number): Promise<HttpResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await client.request(request);

        // Check for retryable status codes
        if (response.status >= 500 && attempt < maxRetries) {
          await this.delay(this.calculateBackoff(attempt));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        if (this.isRetryableError(error) && attempt < maxRetries) {
          await this.delay(this.calculateBackoff(attempt));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }
}
```

### Script Service Task Internals

```typescript
class ScriptServiceTaskExecutor implements ServiceTaskExecutor {
  type = 'script' as const;

  async execute(task: TaskInstance, config: ScriptConfig, context: ExecutionContext): Promise<ServiceResult> {
    const { sandboxExecutor } = context.services;

    // 1. Prepare sandbox environment
    const sandbox = {
      // Expose process variables
      ...context.variables,

      // Expose execution context
      execution: {
        getVariable: (name: string) => context.variables[name],
        setVariable: (name: string, value: unknown) => {
          context.variables[name] = value;
        },
        processInstanceId: context.workflowInstance.id,
        activityId: context.activityDefinition.id
      },

      // Safe built-ins
      console: { log: () => {}, warn: () => {}, error: () => {} },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,

      // Utility functions
      duration: (iso: string) => this.parseDuration(iso),
      now: () => new Date()
    };

    // 2. Execute script in sandbox with timeout
    const result = await sandboxExecutor.execute({
      script: config.script,
      language: config.language,
      sandbox,
      timeout: 30000, // 30 second timeout
      memoryLimit: 128 * 1024 * 1024 // 128MB
    });

    // 3. Extract output
    const outputVariables: Record<string, unknown> = {};
    if (config.resultVariable) {
      outputVariables[config.resultVariable] = result;
    }

    // Include any variables set via execution.setVariable
    Object.assign(outputVariables, context.variables);

    return {
      status: 'completed',
      outputVariables
    };
  }
}
```

---

## Business Rule Task Execution

Business Rule Tasks evaluate DMN decision tables to determine outcomes.

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BUSINESS RULE TASK EXECUTION FLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TOKEN ARRIVES AT BUSINESS RULE TASK                                     │
│     │                                                                        │
│     ▼                                                                        │
│  2. LOAD DECISION DEFINITION                                                 │
│     ├─ By decisionRef key/id                                                │
│     ├─ Apply version binding (latest/version/versionTag)                    │
│     └─ Or use inlineDecisionTable                                           │
│     │                                                                        │
│     ▼                                                                        │
│  3. PREPARE INPUT CONTEXT                                                    │
│     ├─ Map process variables to decision inputs                             │
│     ├─ Evaluate input expressions                                           │
│     └─ Validate input types                                                 │
│     │                                                                        │
│     ▼                                                                        │
│  4. EVALUATE DECISION TABLE                                                  │
│     │                                                                        │
│     ├─ FOR EACH RULE:                                                       │
│     │   ├─ Evaluate input entries against context                           │
│     │   ├─ Check if all conditions match                                    │
│     │   └─ Collect matching rules                                           │
│     │                                                                        │
│     ├─ APPLY HIT POLICY:                                                    │
│     │   ├─ UNIQUE  → Exactly one match required                             │
│     │   ├─ FIRST   → Return first matching rule                             │
│     │   ├─ PRIORITY → Return highest priority match                         │
│     │   ├─ ANY     → Any match (all must have same output)                  │
│     │   ├─ COLLECT → Return all matches                                     │
│     │   ├─ RULE_ORDER → Return all in rule order                            │
│     │   └─ OUTPUT_ORDER → Return all sorted by output                       │
│     │                                                                        │
│     └─ APPLY AGGREGATION (for COLLECT):                                     │
│         ├─ SUM   → Sum of outputs                                           │
│         ├─ MIN   → Minimum output                                           │
│         ├─ MAX   → Maximum output                                           │
│         └─ COUNT → Number of matches                                        │
│     │                                                                        │
│     ▼                                                                        │
│  5. MAP DECISION RESULT                                                      │
│     ├─ singleEntry  → Single value from single output column                │
│     ├─ singleResult → Object with all output columns                        │
│     ├─ collectEntries → Array of single values                              │
│     └─ resultList   → Array of objects                                      │
│     │                                                                        │
│     ▼                                                                        │
│  6. STORE RESULT & CONTINUE                                                  │
│     ├─ Store in resultVariable                                              │
│     └─ Continue execution                                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Internal Handler

```typescript
class BusinessRuleTaskHandler implements TaskHandler {
  type = 'businessRuleTask' as const;

  async execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult> {
    const config = context.activityDefinition.config.businessRuleConfig!;

    // 1. Load decision definition
    const decision = await this.loadDecision(config, context);

    // 2. Prepare input context
    const inputContext = await this.prepareInputContext(config, context);

    // 3. Evaluate decision
    let result: DecisionResult;

    if (config.externalEngine) {
      // External DMN engine
      result = await this.evaluateExternal(config.externalEngine, decision, inputContext);
    } else {
      // Internal DMN engine
      result = await this.evaluateInternal(decision, inputContext);
    }

    // 4. Handle no-match scenario
    if (result.matchedRules.length === 0) {
      if (config.failOnNoResult) {
        throw new NoMatchingRuleError(decision.id, inputContext);
      }
      result.output = config.defaultResult;
    }

    // 5. Map result according to mapDecisionResult
    const mappedResult = this.mapResult(result, config.mapDecisionResult ?? 'singleResult');

    // 6. Store output
    const outputVariables: Record<string, unknown> = {};
    if (config.resultVariable) {
      outputVariables[config.resultVariable] = mappedResult;
    }

    return {
      status: 'completed',
      outputVariables
    };
  }

  private async evaluateInternal(decision: DecisionTable, inputContext: Record<string, unknown>): Promise<DecisionResult> {
    const matchedRules: DecisionTableRule[] = [];

    // Evaluate each rule
    for (const rule of decision.rules) {
      const matches = this.evaluateRule(rule, decision.inputs, inputContext);
      if (matches) {
        matchedRules.push(rule);

        // For FIRST and UNIQUE, we can stop early
        if (decision.hitPolicy === 'FIRST') {
          break;
        }
      }
    }

    // Validate hit policy
    if (decision.hitPolicy === 'UNIQUE' && matchedRules.length > 1) {
      throw new MultipleMatchesError(decision.id, matchedRules);
    }

    if (decision.hitPolicy === 'ANY' && matchedRules.length > 1) {
      // Verify all outputs are the same
      const firstOutput = JSON.stringify(matchedRules[0].outputEntries);
      for (const rule of matchedRules.slice(1)) {
        if (JSON.stringify(rule.outputEntries) !== firstOutput) {
          throw new ConflictingOutputsError(decision.id, matchedRules);
        }
      }
    }

    // Apply hit policy ordering
    let orderedRules = matchedRules;
    if (decision.hitPolicy === 'PRIORITY') {
      orderedRules = this.sortByPriority(matchedRules, decision);
    } else if (decision.hitPolicy === 'OUTPUT_ORDER') {
      orderedRules = this.sortByOutput(matchedRules, decision);
    }

    // Build output
    const outputs = orderedRules.map(rule =>
      this.buildRuleOutput(rule, decision.outputs)
    );

    // Apply aggregation for COLLECT
    let finalOutput = outputs;
    if (decision.hitPolicy === 'COLLECT' && decision.aggregation) {
      finalOutput = this.applyAggregation(outputs, decision.aggregation);
    }

    return {
      matchedRules: orderedRules,
      output: finalOutput.length === 1 ? finalOutput[0] : finalOutput
    };
  }

  private evaluateRule(rule: DecisionTableRule, inputs: DecisionTableInput[], context: Record<string, unknown>): boolean {
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const entry = rule.inputEntries[i];
      const value = this.evaluateExpression(input.inputExpression, context);

      if (!this.matchesEntry(value, entry, input.typeRef)) {
        return false;
      }
    }
    return true;
  }

  private matchesEntry(value: unknown, entry: string, typeRef?: string): boolean {
    // "-" means any value matches
    if (entry === '-' || entry === '') {
      return true;
    }

    // Comparison operators
    if (entry.startsWith('>=')) {
      return Number(value) >= Number(entry.slice(2).trim());
    }
    if (entry.startsWith('<=')) {
      return Number(value) <= Number(entry.slice(2).trim());
    }
    if (entry.startsWith('>')) {
      return Number(value) > Number(entry.slice(1).trim());
    }
    if (entry.startsWith('<')) {
      return Number(value) < Number(entry.slice(1).trim());
    }

    // Range: [1..10], (1..10), [1..10)
    const rangeMatch = entry.match(/^([\[\(])(\d+)\.\.(\d+)([\]\)])$/);
    if (rangeMatch) {
      const [, leftBracket, min, max, rightBracket] = rangeMatch;
      const numValue = Number(value);
      const minIncl = leftBracket === '[';
      const maxIncl = rightBracket === ']';
      return (minIncl ? numValue >= Number(min) : numValue > Number(min)) &&
             (maxIncl ? numValue <= Number(max) : numValue < Number(max));
    }

    // List: "a", "b", "c"
    if (entry.includes(',')) {
      const options = entry.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      return options.includes(String(value));
    }

    // Exact match
    return String(value) === entry.replace(/^["']|["']$/g, '');
  }
}
```

---

## Script Task Execution

Script Tasks execute inline scripts for computation and data transformation.

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SCRIPT TASK EXECUTION FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TOKEN ARRIVES AT SCRIPT TASK                                            │
│     │                                                                        │
│     ▼                                                                        │
│  2. VALIDATE SCRIPT                                                          │
│     ├─ Parse script syntax                                                  │
│     ├─ Check for disallowed operations                                      │
│     └─ Validate script format (javascript/groovy/python)                    │
│     │                                                                        │
│     ▼                                                                        │
│  3. PREPARE SANDBOX ENVIRONMENT                                              │
│     │                                                                        │
│     │  ┌─────────────────────────────────────────────────────────────┐     │
│     │  │                    SANDBOX CONTENTS                          │     │
│     │  ├─────────────────────────────────────────────────────────────┤     │
│     │  │  Process Variables:     │  Safe Globals:                    │     │
│     │  │  • All workflow vars    │  • JSON, Math, Date               │     │
│     │  │  • Input parameters     │  • Array, Object, String          │     │
│     │  │                         │  • Number, Boolean                │     │
│     │  │  Execution Context:     │                                    │     │
│     │  │  • getVariable()        │  Utility Functions:               │     │
│     │  │  • setVariable()        │  • now(), duration()              │     │
│     │  │  • processInstanceId    │  • format(), parse()              │     │
│     │  └─────────────────────────────────────────────────────────────┘     │
│     │                                                                        │
│     ▼                                                                        │
│  4. EXECUTE IN ISOLATED VM                                                   │
│     ├─ Create isolated context (vm2/isolated-vm)                            │
│     ├─ Set memory limit (128MB default)                                     │
│     ├─ Set execution timeout (30s default)                                  │
│     └─ Run script                                                           │
│     │                                                                        │
│     ├──────────────────────────────────┐                                    │
│     │                                   │                                    │
│     ▼                                   ▼                                    │
│  ┌─────────────┐                 ┌─────────────┐                            │
│  │  SUCCESS    │                 │   ERROR     │                            │
│  ├─────────────┤                 ├─────────────┤                            │
│  │ • Capture   │                 │ • Timeout   │                            │
│  │   return    │                 │ • Memory    │                            │
│  │   value     │                 │ • Syntax    │                            │
│  │ • Collect   │                 │ • Runtime   │                            │
│  │   setVar    │                 └─────────────┘                            │
│  │   calls     │                        │                                    │
│  └─────────────┘                        ▼                                    │
│         │                        ┌─────────────┐                            │
│         │                        │ Retry or    │                            │
│         │                        │ Fail Task   │                            │
│         │                        └─────────────┘                            │
│         ▼                                                                    │
│  5. STORE RESULT                                                             │
│     ├─ Store return value in resultVariable                                 │
│     └─ Merge setVariable calls into process variables                       │
│     │                                                                        │
│     ▼                                                                        │
│  6. CONTINUE EXECUTION                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Internal Handler

```typescript
class ScriptTaskHandler implements TaskHandler {
  type = 'scriptTask' as const;

  private executors = {
    javascript: new JavaScriptScriptExecutor(),
    groovy: new GroovyScriptExecutor(),
    python: new PythonScriptExecutor()
  };

  async execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult> {
    const config = context.activityDefinition.config;
    const executor = this.executors[config.scriptFormat ?? 'javascript'];

    if (!executor) {
      throw new UnsupportedScriptFormatError(config.scriptFormat);
    }

    // 1. Validate script
    const validation = await executor.validate(config.script!);
    if (!validation.valid) {
      throw new ScriptValidationError(validation.errors);
    }

    // 2. Prepare execution context
    const scriptContext = this.buildScriptContext(context);

    // 3. Execute with resource limits
    const startTime = Date.now();
    let result: unknown;

    try {
      result = await executor.execute({
        script: config.script!,
        context: scriptContext,
        timeout: 30000,
        memoryLimit: 128 * 1024 * 1024
      });
    } catch (error) {
      if (error instanceof ScriptTimeoutError) {
        context.logger.error('Script timeout', {
          taskId: task.id,
          duration: Date.now() - startTime
        });
      }
      throw error;
    }

    // 4. Collect output
    const outputVariables: Record<string, unknown> = {
      ...scriptContext.collectedVariables
    };

    if (config.resultVariable) {
      outputVariables[config.resultVariable] = result;
    }

    // 5. Log execution metrics
    context.logger.info('Script executed', {
      taskId: task.id,
      duration: Date.now() - startTime,
      outputKeys: Object.keys(outputVariables)
    });

    return {
      status: 'completed',
      outputVariables
    };
  }

  private buildScriptContext(context: ExecutionContext): ScriptExecutionContext {
    const collectedVariables: Record<string, unknown> = {};

    return {
      variables: { ...context.variables },
      collectedVariables,
      execution: {
        getVariable: (name: string) => context.variables[name],
        setVariable: (name: string, value: unknown) => {
          collectedVariables[name] = value;
        },
        processInstanceId: context.workflowInstance.id,
        activityId: context.activityDefinition.id,
        activityName: context.activityDefinition.name
      },
      globals: {
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        console: {
          log: (...args: unknown[]) => context.logger.debug('Script log', { args }),
          warn: (...args: unknown[]) => context.logger.warn('Script warn', { args }),
          error: (...args: unknown[]) => context.logger.error('Script error', { args })
        }
      },
      functions: {
        now: () => new Date(),
        duration: (iso: string) => this.parseDuration(iso),
        format: (date: Date, pattern: string) => this.formatDate(date, pattern),
        uuid: () => randomUUID()
      }
    };
  }
}
```

---

## Send Task Execution

Send Tasks dispatch messages through various channels without waiting for a response.

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SEND TASK EXECUTION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TOKEN ARRIVES AT SEND TASK                                              │
│     │                                                                        │
│     ▼                                                                        │
│  2. DETERMINE CHANNEL                                                        │
│     ├─ email   → Email Dispatcher                                           │
│     ├─ slack   → Slack Dispatcher                                           │
│     ├─ teams   → Teams Dispatcher                                           │
│     ├─ sms     → SMS Dispatcher                                             │
│     ├─ webhook → Webhook Dispatcher                                         │
│     └─ push    → Push Notification Dispatcher                               │
│     │                                                                        │
│     ▼                                                                        │
│  3. RESOLVE CONFIGURATION                                                    │
│     ├─ Evaluate expressions in recipients                                   │
│     ├─ Evaluate expressions in message/body                                 │
│     ├─ Load and render template (if templateId)                             │
│     └─ Build final payload                                                  │
│     │                                                                        │
│     ▼                                                                        │
│  4. DISPATCH MESSAGE                                                         │
│     │                                                                        │
│     ├─ ASYNC MODE (async: true)                                             │
│     │   ├─ Enqueue to notifications queue                                   │
│     │   ├─ Return immediately                                               │
│     │   └─ Background worker processes                                      │
│     │                                                                        │
│     └─ SYNC MODE (async: false, default)                                    │
│         ├─ Send via channel provider                                        │
│         ├─ Wait for acknowledgment                                          │
│         └─ Retry on failure (if retries > 0)                                │
│     │                                                                        │
│     ▼                                                                        │
│  5. HANDLE RESULT                                                            │
│     │                                                                        │
│     ├─ SUCCESS                                                              │
│     │   ├─ Store delivery receipt in resultVariable                         │
│     │   └─ Continue execution                                               │
│     │                                                                        │
│     └─ FAILURE                                                              │
│         ├─ If failOnError: true  → Fail task, trigger error path            │
│         └─ If failOnError: false → Log warning, continue execution          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Internal Handler

```typescript
class SendTaskHandler implements TaskHandler {
  type = 'sendTask' as const;

  private dispatchers: Map<SendTaskChannel, ChannelDispatcher> = new Map([
    ['email', new EmailDispatcher()],
    ['slack', new SlackDispatcher()],
    ['teams', new TeamsDispatcher()],
    ['sms', new SmsDispatcher()],
    ['webhook', new WebhookDispatcher()],
    ['push', new PushNotificationDispatcher()]
  ]);

  async execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult> {
    const config = context.activityDefinition.config.sendTaskConfig!;
    const dispatcher = this.dispatchers.get(config.channel);

    if (!dispatcher) {
      throw new UnsupportedChannelError(config.channel);
    }

    // 1. Resolve all expressions in config
    const resolvedConfig = await this.resolveConfig(config, context);

    // 2. Build message payload
    const payload = await dispatcher.buildPayload(resolvedConfig, context);

    // 3. Dispatch based on async mode
    let result: DispatchResult;

    if (config.async) {
      // Async: enqueue and return immediately
      const jobId = await context.services.get(NotificationQueue).add({
        channel: config.channel,
        payload,
        retries: config.retries ?? 3,
        retryDelay: config.retryDelay ?? 5000
      });

      result = {
        status: 'queued',
        jobId,
        queuedAt: new Date()
      };
    } else {
      // Sync: dispatch and wait
      result = await this.dispatchWithRetry(dispatcher, payload, config);
    }

    // 4. Handle result
    const outputVariables: Record<string, unknown> = {};
    if (config.resultVariable) {
      outputVariables[config.resultVariable] = result;
    }

    return {
      status: 'completed',
      outputVariables
    };
  }

  private async dispatchWithRetry(
    dispatcher: ChannelDispatcher,
    payload: unknown,
    config: SendTaskConfig
  ): Promise<DispatchResult> {
    const maxRetries = config.retries ?? 3;
    const retryDelay = config.retryDelay ?? 5000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await dispatcher.send(payload);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          await this.delay(retryDelay * (attempt + 1)); // Linear backoff
        }
      }
    }

    if (config.failOnError ?? true) {
      throw lastError;
    }

    return {
      status: 'failed',
      error: lastError?.message,
      attempts: maxRetries + 1
    };
  }
}
```

### Channel Dispatcher Example (Email)

```typescript
class EmailDispatcher implements ChannelDispatcher {
  async buildPayload(config: SendTaskConfig, context: ExecutionContext): Promise<EmailPayload> {
    const emailConfig = config.emailConfig!;
    const templateService = context.services.get(TemplateService);

    let body = emailConfig.body;
    let subject = emailConfig.subject;

    // Render template if specified
    if (emailConfig.template) {
      const rendered = await templateService.render(emailConfig.template, {
        ...context.variables,
        ...emailConfig.templateData
      });
      body = rendered.body;
      subject = rendered.subject ?? subject;
    }

    return {
      to: this.normalizeRecipients(emailConfig.to),
      cc: emailConfig.cc ? this.normalizeRecipients(emailConfig.cc) : undefined,
      bcc: emailConfig.bcc ? this.normalizeRecipients(emailConfig.bcc) : undefined,
      subject,
      body,
      bodyType: emailConfig.bodyType ?? 'html',
      replyTo: emailConfig.replyTo,
      attachments: await this.resolveAttachments(emailConfig.attachments),
      priority: this.mapPriority(emailConfig.priority)
    };
  }

  async send(payload: EmailPayload): Promise<DispatchResult> {
    const mailer = this.getMailer();

    const result = await mailer.sendMail({
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      [payload.bodyType === 'html' ? 'html' : 'text']: payload.body,
      replyTo: payload.replyTo,
      attachments: payload.attachments,
      priority: payload.priority
    });

    return {
      status: 'sent',
      messageId: result.messageId,
      sentAt: new Date(),
      recipients: payload.to.length
    };
  }
}
```

---

## Receive Task Execution

Receive Tasks wait for external messages, signals, or webhooks before continuing.

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RECEIVE TASK EXECUTION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TOKEN ARRIVES AT RECEIVE TASK                                           │
│     │                                                                        │
│     ▼                                                                        │
│  2. CREATE SUBSCRIPTION                                                      │
│     │                                                                        │
│     ├─ MESSAGE TYPE                                                         │
│     │   ├─ Register message listener                                        │
│     │   ├─ Store: messageName + correlationKey                              │
│     │   └─ Index in message_subscriptions table                             │
│     │                                                                        │
│     ├─ SIGNAL TYPE                                                          │
│     │   ├─ Register signal listener                                         │
│     │   └─ Store: signalName                                                │
│     │                                                                        │
│     ├─ WEBHOOK TYPE                                                         │
│     │   ├─ Register webhook endpoint                                        │
│     │   ├─ Generate unique callback URL                                     │
│     │   └─ Store: path + authentication config                              │
│     │                                                                        │
│     └─ EVENT TYPE                                                           │
│         ├─ Subscribe to event stream                                        │
│         └─ Store: eventName + eventSource                                   │
│     │                                                                        │
│     ▼                                                                        │
│  3. SCHEDULE TIMEOUT (if configured)                                         │
│     ├─ Schedule job at timeout duration                                     │
│     └─ Store timeout job ID for cancellation                                │
│     │                                                                        │
│     ▼                                                                        │
│  4. TOKEN ENTERS WAITING STATE                                               │
│     └─ Execution pauses                                                     │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  5a. MESSAGE/SIGNAL/WEBHOOK RECEIVED                                         │
│      │                                                                       │
│      ▼                                                                       │
│      CORRELATION CHECK                                                       │
│      ├─ Match messageName/signalName                                        │
│      ├─ Evaluate correlationKey against payload                             │
│      └─ Find matching subscription                                          │
│      │                                                                       │
│      ▼                                                                       │
│      VALIDATE PAYLOAD                                                        │
│      ├─ Apply payloadValidation rules                                       │
│      └─ Reject if invalid (return error response)                           │
│      │                                                                       │
│      ▼                                                                       │
│      MAP PAYLOAD TO VARIABLES                                                │
│      ├─ Apply payloadMapping rules                                          │
│      └─ Store in resultVariable                                             │
│      │                                                                       │
│      ▼                                                                       │
│      RESUME EXECUTION                                                        │
│      ├─ Cancel timeout job                                                  │
│      ├─ Remove subscription                                                 │
│      ├─ Mark task completed                                                 │
│      └─ Continue workflow                                                   │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  5b. TIMEOUT TRIGGERED                                                       │
│      │                                                                       │
│      ▼                                                                       │
│      APPLY TIMEOUT ACTION                                                    │
│      ├─ 'fail'     → Mark task failed, trigger error path                   │
│      ├─ 'continue' → Set timeoutResultVariable, continue execution          │
│      └─ 'escalate' → Trigger escalation, keep waiting                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Internal Handler

```typescript
class ReceiveTaskHandler implements TaskHandler {
  type = 'receiveTask' as const;

  async execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult> {
    const config = context.activityDefinition.config.receiveTaskConfig!;

    // 1. Create subscription based on trigger type
    const subscription = await this.createSubscription(task, config, context);

    // 2. Schedule timeout if configured
    let timeoutJobId: string | undefined;
    if (config.timeout) {
      timeoutJobId = await this.scheduleTimeout(task, config, context);
    }

    // 3. Store subscription metadata
    await this.subscriptionRepository.create({
      taskInstanceId: task.id,
      workflowInstanceId: context.workflowInstance.id,
      triggerType: config.triggerType,
      subscriptionId: subscription.id,
      timeoutJobId,
      config: subscription.config,
      createdAt: new Date()
    });

    // 4. Return waiting status
    return {
      status: 'waiting',
      waitCondition: {
        type: 'external_trigger',
        triggerType: config.triggerType,
        subscriptionId: subscription.id
      }
    };
  }

  private async createSubscription(task: TaskInstance, config: ReceiveTaskConfig, context: ExecutionContext) {
    switch (config.triggerType) {
      case 'message':
        return this.createMessageSubscription(task, config, context);
      case 'signal':
        return this.createSignalSubscription(task, config, context);
      case 'webhook':
        return this.createWebhookSubscription(task, config, context);
      case 'event':
        return this.createEventSubscription(task, config, context);
      default:
        throw new UnsupportedTriggerTypeError(config.triggerType);
    }
  }

  private async createMessageSubscription(task: TaskInstance, config: ReceiveTaskConfig, context: ExecutionContext) {
    const correlationValue = config.correlationKey
      ? await context.services.get(ExpressionEngine).evaluate(config.correlationKey, context.variables)
      : undefined;

    return context.services.get(MessageSubscriptionService).subscribe({
      messageName: config.messageName!,
      correlationKey: correlationValue ? String(correlationValue) : undefined,
      taskInstanceId: task.id,
      workflowInstanceId: context.workflowInstance.id
    });
  }

  private async createWebhookSubscription(task: TaskInstance, config: ReceiveTaskConfig, context: ExecutionContext) {
    const webhookConfig = config.webhookConfig!;
    const expressionEngine = context.services.get(ExpressionEngine);

    // Resolve path expressions
    const resolvedPath = await expressionEngine.evaluate(webhookConfig.path, context.variables);

    return context.services.get(WebhookSubscriptionService).register({
      path: String(resolvedPath),
      method: webhookConfig.method ?? 'POST',
      authentication: webhookConfig.authentication,
      taskInstanceId: task.id,
      workflowInstanceId: context.workflowInstance.id,
      responseTemplate: webhookConfig.responseTemplate,
      responseStatus: webhookConfig.responseStatus ?? 200
    });
  }
}

// Message correlation service
class MessageCorrelationService {
  async correlateMessage(message: IncomingMessage): Promise<CorrelationResult> {
    // 1. Find matching subscriptions
    const subscriptions = await this.subscriptionRepository.findByMessage(
      message.messageName,
      message.correlationKey
    );

    if (subscriptions.length === 0) {
      return { matched: false, reason: 'No matching subscription' };
    }

    // 2. For each match, trigger resume
    const results: TaskResumeResult[] = [];

    for (const subscription of subscriptions) {
      // Acquire lock to prevent race conditions
      const result = await this.lockService.withLock(
        `subscription:${subscription.id}`,
        5000,
        async () => {
          // Verify subscription still exists (not already consumed)
          const current = await this.subscriptionRepository.findById(subscription.id);
          if (!current || current.consumedAt) {
            return { skipped: true };
          }

          // Load task and config
          const task = await this.taskRepository.findById(subscription.taskInstanceId);
          const config = await this.getReceiveTaskConfig(task);

          // Validate payload
          if (config.payloadValidation) {
            const validation = this.validatePayload(message.variables, config.payloadValidation);
            if (!validation.valid) {
              return { error: validation.errors };
            }
          }

          // Map payload to variables
          const outputVariables = this.mapPayload(message.variables, config.payloadMapping);
          if (config.resultVariable) {
            outputVariables[config.resultVariable] = message.variables;
          }

          // Mark subscription as consumed
          await this.subscriptionRepository.markConsumed(subscription.id);

          // Cancel timeout if scheduled
          if (subscription.timeoutJobId) {
            await this.timerQueue.remove(subscription.timeoutJobId);
          }

          // Resume task execution
          await this.executionQueue.add('CONTINUE_EXECUTION', {
            workflowInstanceId: subscription.workflowInstanceId,
            completedTaskId: task.id,
            outputVariables
          });

          return { resumed: true, taskId: task.id };
        }
      );

      results.push(result);
    }

    return { matched: true, results };
  }
}
```

---

## Manual Task Execution

Manual Tasks represent work performed outside the system, tracked but not directly executed.

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MANUAL TASK EXECUTION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TOKEN ARRIVES AT MANUAL TASK                                            │
│     │                                                                        │
│     ▼                                                                        │
│  2. CREATE TASK INSTANCE                                                     │
│     ├─ Resolve assignee/candidateGroups                                     │
│     ├─ Render instructions (Markdown)                                       │
│     ├─ Resolve external system references                                   │
│     └─ Attach documentation/resources                                       │
│     │                                                                        │
│     ▼                                                                        │
│  3. EMIT TASK_CREATED EVENT                                                  │
│     ├─ Notify assigned user/group                                           │
│     └─ Include instructions and external references                         │
│     │                                                                        │
│     ▼                                                                        │
│  4. CHECK AUTO-COMPLETE                                                      │
│     │                                                                        │
│     ├─ autoCompleteAfter IS SET                                             │
│     │   ├─ Schedule auto-complete job                                       │
│     │   └─ Store job ID for cancellation                                    │
│     │                                                                        │
│     └─ autoCompleteAfter NOT SET                                            │
│         └─ Wait for manual confirmation                                     │
│     │                                                                        │
│     ▼                                                                        │
│  5. SCHEDULE SLA MONITORING (if defined)                                     │
│     │                                                                        │
│     ▼                                                                        │
│  6. TOKEN ENTERS WAITING STATE                                               │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  7a. USER CONFIRMS COMPLETION                                                │
│      │                                                                       │
│      ▼                                                                       │
│      VALIDATE CONFIRMATION                                                   │
│      ├─ If requireConfirmation: true                                        │
│      │   └─ Show confirmationMessage, require acknowledgment                │
│      └─ If requireConfirmation: false                                       │
│          └─ Accept completion directly                                      │
│      │                                                                       │
│      ▼                                                                       │
│      RECORD COMPLETION                                                       │
│      ├─ Track actual duration (if trackActualDuration: true)                │
│      ├─ Cancel auto-complete job (if scheduled)                             │
│      ├─ Cancel SLA monitoring                                               │
│      └─ Mark task completed                                                 │
│      │                                                                       │
│      ▼                                                                       │
│      CONTINUE EXECUTION                                                      │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  7b. AUTO-COMPLETE TRIGGERED                                                 │
│      │                                                                       │
│      ▼                                                                       │
│      MARK AS AUTO-COMPLETED                                                  │
│      ├─ Set completionType: 'auto'                                          │
│      ├─ Record auto-completion time                                         │
│      └─ Continue execution                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Internal Handler

```typescript
class ManualTaskHandler implements TaskHandler {
  type = 'manualTask' as const;

  async execute(task: TaskInstance, context: ExecutionContext): Promise<ExecutionResult> {
    const config = context.activityDefinition.config.manualTaskConfig!;

    // 1. Resolve assignment
    const assignment = await this.resolveAssignment(config, context);

    // 2. Render instructions
    const renderedInstructions = config.instructionsExpression
      ? await context.services.get(ExpressionEngine).evaluate(config.instructionsExpression, context.variables)
      : config.instructions;

    // 3. Resolve external references
    const externalRefs = await this.resolveExternalReferences(config, context);

    // 4. Update task with resolved data
    await this.taskRepository.update(task.id, {
      assignedTo: assignment.assignee,
      candidateGroups: assignment.candidateGroups,
      status: 'active',
      metadata: {
        instructions: renderedInstructions,
        externalSystemRef: externalRefs.systemRef,
        externalTaskId: externalRefs.taskId,
        externalSystemUrl: externalRefs.url,
        documentationUrl: config.documentationUrl,
        attachments: config.attachments,
        estimatedDuration: config.estimatedDuration,
        requireConfirmation: config.requireConfirmation ?? false,
        confirmationMessage: config.confirmationMessage,
        trackActualDuration: config.trackActualDuration ?? false,
        startedAt: new Date()
      }
    });

    // 5. Emit task created event
    await this.eventBus.emit('task.created', {
      taskId: task.id,
      type: 'manualTask',
      workflowInstanceId: context.workflowInstance.id,
      assignedTo: assignment.assignee,
      candidateGroups: assignment.candidateGroups,
      externalSystemRef: externalRefs.systemRef
    });

    // 6. Schedule auto-complete if configured
    let autoCompleteJobId: string | undefined;
    if (config.autoCompleteAfter) {
      const duration = this.parseDuration(config.autoCompleteAfter);
      autoCompleteJobId = await this.timerQueue.add(
        'AUTO_COMPLETE_MANUAL_TASK',
        { taskId: task.id },
        { delay: duration }
      );

      await this.taskRepository.update(task.id, {
        metadata: {
          ...task.metadata,
          autoCompleteJobId,
          autoCompleteAt: new Date(Date.now() + duration)
        }
      });
    }

    // 7. Schedule SLA monitoring
    if (context.activityDefinition.slaDefinition) {
      await this.slaService.scheduleMonitoring(task.id, context.activityDefinition.slaDefinition);
    }

    // 8. Return waiting status
    return {
      status: 'waiting',
      waitCondition: {
        type: 'manual_confirmation',
        taskId: task.id,
        autoCompleteAt: autoCompleteJobId
          ? new Date(Date.now() + this.parseDuration(config.autoCompleteAfter!))
          : undefined
      }
    };
  }
}

// Manual task completion
async completeManualTask(taskId: string, input: CompleteManualTaskInput, userId: string): Promise<void> {
  await this.lockService.withLock(`task:${taskId}:complete`, 5000, async () => {
    const task = await this.taskRepository.findById(taskId);

    if (task.status !== 'active') {
      throw new InvalidTaskStateError(task.status, 'active');
    }

    // Check confirmation requirement
    const config = task.metadata as ManualTaskMetadata;
    if (config.requireConfirmation && !input.confirmed) {
      throw new ConfirmationRequiredError(config.confirmationMessage);
    }

    // Calculate actual duration if tracking
    let actualDuration: number | undefined;
    if (config.trackActualDuration && config.startedAt) {
      actualDuration = Date.now() - new Date(config.startedAt).getTime();
    }

    // Cancel auto-complete job if exists
    if (config.autoCompleteJobId) {
      await this.timerQueue.remove(config.autoCompleteJobId);
    }

    // Update task
    await this.taskRepository.update(taskId, {
      status: 'completed',
      completedAt: new Date(),
      completedBy: userId,
      completionComment: input.comment,
      metadata: {
        ...config,
        completionType: 'manual',
        actualDuration
      }
    });

    // Cancel SLA monitoring
    await this.slaService.cancelMonitoring(taskId);

    // Emit completion event
    await this.eventBus.emit('task.completed', {
      taskId,
      type: 'manualTask',
      workflowInstanceId: task.workflowInstanceId,
      completedBy: userId,
      actualDuration
    });

    // Continue execution
    await this.executionQueue.add('CONTINUE_EXECUTION', {
      workflowInstanceId: task.workflowInstanceId,
      completedTaskId: taskId
    });
  });
}
```

---

## Execution Token Management

Tokens track the flow of execution through the workflow.

### Token States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION TOKEN STATES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                    ┌─────────┐                                              │
│                    │ CREATED │                                              │
│                    └────┬────┘                                              │
│                         │ initialize                                         │
│                         ▼                                                    │
│                    ┌─────────┐                                              │
│       ┌───────────│ ACTIVE  │────────────┐                                 │
│       │            └────┬────┘            │                                 │
│       │                 │                 │                                 │
│       │ wait            │ complete        │ fork (parallel gateway)        │
│       │                 │                 │                                 │
│       ▼                 ▼                 ▼                                 │
│  ┌─────────┐      ┌───────────┐    ┌─────────────┐                         │
│  │ WAITING │      │ COMPLETED │    │   FORKED    │                         │
│  └────┬────┘      └───────────┘    └──────┬──────┘                         │
│       │                                    │                                 │
│       │ resume                             │ creates child tokens           │
│       │                                    │                                 │
│       ▼                                    ▼                                 │
│  ┌─────────┐                    ┌─────────────────────┐                    │
│  │ ACTIVE  │                    │ CHILD TOKENS (n)    │                    │
│  └─────────┘                    │ ├─ Token A (active) │                    │
│                                 │ ├─ Token B (active) │                    │
│                                 │ └─ Token C (waiting)│                    │
│                                 └──────────┬──────────┘                    │
│                                            │                                 │
│                                            │ all complete                    │
│                                            ▼                                 │
│                                      ┌──────────┐                           │
│                                      │  MERGED  │                           │
│                                      └────┬─────┘                           │
│                                           │                                  │
│                                           │ creates single token             │
│                                           ▼                                  │
│                                      ┌─────────┐                            │
│                                      │ ACTIVE  │                            │
│                                      └─────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Token Repository

```typescript
interface ExecutionTokenRepository {
  create(token: Partial<ExecutionToken>): Promise<ExecutionToken>;
  findById(id: string): Promise<ExecutionToken | null>;
  findByWorkflowInstance(instanceId: string): Promise<ExecutionToken[]>;
  findActiveByWorkflowInstance(instanceId: string): Promise<ExecutionToken[]>;
  findByForkGateway(instanceId: string, gatewayId: string): Promise<ExecutionToken[]>;
  update(id: string, updates: Partial<ExecutionToken>): Promise<ExecutionToken>;
  delete(id: string): Promise<void>;
}

// Token operations
class TokenService {
  // Create initial token at start event
  async createInitialToken(workflowInstance: WorkflowInstance): Promise<ExecutionToken> {
    return this.tokenRepository.create({
      workflowInstanceId: workflowInstance.id,
      currentActivityId: workflowInstance.startEventId,
      status: 'active',
      parentTokenId: null,
      forkGatewayId: null
    });
  }

  // Fork token at parallel/inclusive gateway
  async forkTokens(
    parentToken: ExecutionToken,
    gatewayId: string,
    targetActivityIds: string[]
  ): Promise<ExecutionToken[]> {
    // Mark parent as forked
    await this.tokenRepository.update(parentToken.id, {
      status: 'completed',
      completedAt: new Date()
    });

    // Create child tokens
    const childTokens: ExecutionToken[] = [];
    for (const activityId of targetActivityIds) {
      const child = await this.tokenRepository.create({
        workflowInstanceId: parentToken.workflowInstanceId,
        currentActivityId: activityId,
        status: 'active',
        parentTokenId: parentToken.id,
        forkGatewayId: gatewayId
      });
      childTokens.push(child);
    }

    return childTokens;
  }

  // Merge tokens at join gateway
  async mergeTokens(workflowInstanceId: string, gatewayId: string): Promise<ExecutionToken | null> {
    // Use distributed lock to prevent race conditions
    return this.lockService.withLock(
      `gateway:${workflowInstanceId}:${gatewayId}`,
      5000,
      async () => {
        // Find all tokens that were forked at this gateway
        const tokens = await this.tokenRepository.findByForkGateway(workflowInstanceId, gatewayId);

        // Check if all tokens have arrived (completed or at the join)
        const allArrived = tokens.every(t =>
          t.status === 'completed' || t.currentActivityId === gatewayId
        );

        if (!allArrived) {
          // Not all tokens have arrived, wait for more
          return null;
        }

        // Mark all tokens as merged
        for (const token of tokens) {
          await this.tokenRepository.update(token.id, {
            status: 'merged',
            completedAt: new Date()
          });
        }

        // Create merged token to continue
        return this.tokenRepository.create({
          workflowInstanceId,
          currentActivityId: gatewayId,
          status: 'active',
          parentTokenId: tokens[0].parentTokenId // Use original parent
        });
      }
    );
  }
}
```

---

## Error Handling and Recovery

### Error Categories

```typescript
enum ErrorCategory {
  TRANSIENT = 'transient',       // Network issues, timeouts - retry
  BUSINESS = 'business',          // Validation failures - handle via error path
  SYSTEM = 'system',              // Infrastructure failures - alert and retry
  FATAL = 'fatal'                 // Unrecoverable - fail workflow
}

interface ExecutionError {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  originalError?: Error;
}
```

### Error Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR HANDLING FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TASK EXECUTION ERROR                                                        │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────┐                                                        │
│  │ Classify Error  │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│     ┌─────┴─────────────────────────────────────┐                           │
│     │             │              │              │                            │
│     ▼             ▼              ▼              ▼                            │
│ TRANSIENT     BUSINESS       SYSTEM         FATAL                           │
│     │             │              │              │                            │
│     ▼             ▼              ▼              ▼                            │
│ ┌───────┐   ┌──────────┐   ┌─────────┐   ┌──────────┐                      │
│ │ Retry │   │ Boundary │   │ Alert + │   │ Fail     │                      │
│ │ with  │   │ Error    │   │ Retry   │   │ Workflow │                      │
│ │Backoff│   │ Handler? │   │         │   │          │                      │
│ └───┬───┘   └────┬─────┘   └────┬────┘   └────┬─────┘                      │
│     │            │              │              │                            │
│     │     ┌──────┴──────┐       │              │                            │
│     │     │             │       │              │                            │
│     │    YES           NO       │              │                            │
│     │     │             │       │              │                            │
│     │     ▼             ▼       │              │                            │
│     │ ┌────────┐  ┌─────────┐   │              │                            │
│     │ │ Follow │  │ Fail    │   │              │                            │
│     │ │ Error  │  │ Task    │   │              │                            │
│     │ │ Path   │  │         │   │              │                            │
│     │ └────────┘  └─────────┘   │              │                            │
│     │                           │              │                            │
│     │   Max Retries?            │              │                            │
│     ├────────────┐              │              │                            │
│     │            │              │              │                            │
│    NO           YES             │              │                            │
│     │            │              │              │                            │
│     ▼            ▼              ▼              ▼                            │
│ ┌────────┐  ┌─────────────────────────────────────┐                        │
│ │Continue│  │        DEAD LETTER QUEUE            │                        │
│ │ Retry  │  │  • Store failed job                 │                        │
│ │        │  │  • Alert operations                 │                        │
│ │        │  │  • Manual intervention required     │                        │
│ └────────┘  └─────────────────────────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Compensation (Saga Pattern)

When a workflow activity fails and compensation is configured, the system executes compensation handlers in reverse order (most recent completed activity first). Each handler type (script, service, workflow) receives the original activity result as context.

**Compensation execution rules:**
- Handlers execute in reverse chronological order of activity completion
- If a compensation handler itself fails, the failure is logged but remaining compensations continue
- After all compensations complete (or are skipped), the workflow is marked as `compensated`
- Activities without compensation handlers are skipped silently

**Compensation handler types:**

| Type | Description | Use Case |
|------|-------------|----------|
| `script` | Inline script executed in sandbox | Simple rollback logic (reset variables, undo calculations) |
| `service` | HTTP call to external endpoint | Cancel external transactions (refunds, order cancellations) |
| `workflow` | Trigger a separate compensation workflow | Complex multi-step rollback procedures |

---

### Task Execution Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Two users claim the same task simultaneously | Optimistic locking via database version column; first claim succeeds, second receives 409 Conflict |
| Task completed with invalid form data | Completion rejected with 422; task remains in `active` state; user can fix and resubmit |
| Task delegated to a user who no longer exists | Delegation rejected with 404; original assignment unchanged |
| Circular delegation chain (A→B→C→A) | System tracks delegation chain; circular delegation detected and rejected with 422 |
| Task timeout fires while user is submitting | If submission completes first, timeout is cancelled; if timeout fires first, task is escalated and submission receives 409 |
| File upload fails during task completion | Transaction rolled back; task remains in `active` state; previously uploaded files in this attempt are cleaned up |
| Task assigned to deactivated user | Task remains assigned but appears in unassigned queue for reassignment; admin alerted |
| Task form references undefined variable | Variable resolves to null; field displayed as empty; form submission proceeds normally |
| Service task returns partial data | Available fields mapped to variables; missing fields set to null; warning logged |
| Script task exceeds execution time limit (default: 30s) | Script terminated; task fails with `SCRIPT_TIMEOUT`; retryable based on retry policy |
| Script task exceeds memory limit (default: 128MB) | Script terminated; task fails with `SCRIPT_MEMORY_EXCEEDED`; not retryable |
| Send task email/notification delivery fails | Retried per retry policy; delivery status tracked; workflow continues (send task is fire-and-forget by default) |
| Receive task correlation message arrives before task is ready | Message buffered in correlation store; matched when receive task activates |
| Receive task correlation message never arrives | Task remains waiting until timeout; if no timeout configured, waits indefinitely |
| Manual task confirmation by unauthorized user | Rejected with 403; task remains in current state |
| Business rule engine returns conflicting results | First matching rule takes precedence (rule order matters); conflict logged as warning |
| Business rule references undefined variable | Rule evaluates to false (undefined treated as null); default output used if defined |

### Concurrent Execution Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Multiple parallel branches complete at the exact same time | Database serialization handles concurrent merge; tokens processed sequentially at gateway |
| Workflow instance cancelled while tasks are in-flight | All active tasks receive cancellation signal; in-progress service calls allowed to complete but results discarded |
| Workflow variables updated by two parallel branches | Last write wins; variable history preserves both values with timestamps |
| Timer event and user completion occur simultaneously | Database transaction ensures only one succeeds; loser's operation is rolled back |
| Bulk task completion via API (batch endpoint) | Each task completed in its own transaction; partial failures possible; response includes per-task status |

---

## Job Queue Processing

### Queue Configuration

```typescript
interface QueueConfiguration {
  queues: {
    'workflow-execution': {
      concurrency: 10;
      jobTypes: ['START_WORKFLOW', 'CONTINUE_EXECUTION', 'COMPLETE_TASK', 'EVALUATE_GATEWAY'];
    };
    'task-processing': {
      concurrency: 20;
      jobTypes: ['EXECUTE_SERVICE_TASK', 'EXECUTE_SCRIPT_TASK', 'EXECUTE_BUSINESS_RULE'];
    };
    'sla-monitoring': {
      concurrency: 20;
      jobTypes: ['CHECK_SLA', 'TRIGGER_WARNING', 'TRIGGER_BREACH', 'ESCALATE'];
    };
    'notifications': {
      concurrency: 10;
      jobTypes: ['SEND_EMAIL', 'SEND_SLACK', 'SEND_SMS', 'SEND_WEBHOOK'];
    };
    'timers': {
      concurrency: 5;
      jobTypes: ['TIMER_EVENT', 'AUTO_COMPLETE', 'RECEIVE_TIMEOUT'];
    };
  };
}
```

### Worker Processing

```typescript
class WorkflowExecutionWorker {
  async processJob(job: Job<WorkflowExecutionJob>): Promise<void> {
    const { type, workflowInstanceId, taskInstanceId, tokenId, variables } = job.data;

    // Set up tracing
    const span = this.tracer.startSpan(`workflow.${type}`, {
      attributes: {
        workflowInstanceId,
        taskInstanceId,
        jobId: job.id
      }
    });

    try {
      switch (type) {
        case 'START_WORKFLOW':
          await this.startWorkflow(workflowInstanceId, variables);
          break;

        case 'CONTINUE_EXECUTION':
          await this.continueExecution(workflowInstanceId, taskInstanceId, variables);
          break;

        case 'COMPLETE_TASK':
          await this.completeTask(taskInstanceId!, variables);
          break;

        case 'EVALUATE_GATEWAY':
          await this.evaluateGateway(workflowInstanceId, tokenId!);
          break;
      }

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  private async continueExecution(
    workflowInstanceId: string,
    completedTaskId?: string,
    outputVariables?: Record<string, unknown>
  ): Promise<void> {
    // 1. Load workflow instance and current state
    const instance = await this.workflowInstanceRepository.findById(workflowInstanceId);

    if (instance.status !== 'running') {
      this.logger.warn('Skipping execution for non-running instance', {
        workflowInstanceId,
        status: instance.status
      });
      return;
    }

    // 2. Merge output variables into process variables
    if (outputVariables) {
      await this.workflowInstanceRepository.update(workflowInstanceId, {
        variables: { ...instance.variables, ...outputVariables }
      });
    }

    // 3. Find active tokens
    const activeTokens = await this.tokenService.findActiveByWorkflowInstance(workflowInstanceId);

    // 4. Process each active token
    for (const token of activeTokens) {
      await this.processToken(instance, token);
    }
  }

  private async processToken(instance: WorkflowInstance, token: ExecutionToken): Promise<void> {
    // 1. Get current activity
    const activity = await this.activityRepository.findById(token.currentActivityId!);

    // 2. Evaluate outgoing transitions
    const nextActivities = await this.evaluateTransitions(instance, activity);

    // 3. Handle based on activity type
    if (this.isGateway(activity.type)) {
      await this.handleGateway(instance, token, activity, nextActivities);
    } else if (nextActivities.length === 1) {
      // Move token to next activity
      await this.moveToken(token, nextActivities[0]);
      await this.executeActivity(instance, nextActivities[0]);
    } else if (nextActivities.length === 0) {
      // End event reached
      await this.handleEndEvent(instance, token);
    }
  }
}
```

---

## Observability Integration

### Execution Tracing

```typescript
class ExecutionTracer {
  // Start a new trace for workflow execution
  startWorkflowTrace(workflowInstance: WorkflowInstance): Span {
    return this.tracer.startSpan('workflow.execute', {
      attributes: {
        'workflow.instance_id': workflowInstance.id,
        'workflow.definition_id': workflowInstance.workflowDefinitionId,
        'workflow.tenant_id': workflowInstance.tenantId
      }
    });
  }

  // Create span for task execution
  startTaskSpan(task: TaskInstance, parentSpan: Span): Span {
    return this.tracer.startSpan('task.execute', {
      parent: parentSpan,
      attributes: {
        'task.id': task.id,
        'task.type': task.activityType,
        'task.name': task.activityName
      }
    });
  }

  // Record task completion
  recordTaskCompletion(span: Span, result: ExecutionResult): void {
    span.setAttributes({
      'task.status': result.status,
      'task.output_variables': Object.keys(result.outputVariables ?? {}).join(',')
    });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  // Record task error
  recordTaskError(span: Span, error: ExecutionError): void {
    span.setAttributes({
      'task.error.code': error.code,
      'task.error.category': error.category,
      'task.error.retryable': error.retryable
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error.originalError ?? new Error(error.message));
    span.end();
  }
}
```

### Metrics Collection

```typescript
class ExecutionMetrics {
  // Task execution duration
  private taskDuration = new Histogram({
    name: 'flowengine_task_execution_duration_seconds',
    help: 'Task execution duration in seconds',
    labelNames: ['tenant_id', 'workflow_id', 'task_type', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]
  });

  // Task count by status
  private taskCount = new Counter({
    name: 'flowengine_tasks_total',
    help: 'Total number of tasks processed',
    labelNames: ['tenant_id', 'workflow_id', 'task_type', 'status']
  });

  // Active tasks gauge
  private activeTasks = new Gauge({
    name: 'flowengine_active_tasks',
    help: 'Number of currently active tasks',
    labelNames: ['tenant_id', 'workflow_id', 'task_type']
  });

  recordTaskExecution(task: TaskInstance, duration: number, status: string): void {
    const labels = {
      tenant_id: task.tenantId,
      workflow_id: task.workflowDefinitionId,
      task_type: task.activityType,
      status
    };

    this.taskDuration.observe(labels, duration / 1000);
    this.taskCount.inc(labels);
  }

  incrementActiveTasks(task: TaskInstance): void {
    this.activeTasks.inc({
      tenant_id: task.tenantId,
      workflow_id: task.workflowDefinitionId,
      task_type: task.activityType
    });
  }

  decrementActiveTasks(task: TaskInstance): void {
    this.activeTasks.dec({
      tenant_id: task.tenantId,
      workflow_id: task.workflowDefinitionId,
      task_type: task.activityType
    });
  }
}
```

---

## Summary

This document covers the internal execution mechanics for all supported task types:

| Task Type | Execution Model | Wait Behavior | Completion Trigger |
|-----------|-----------------|---------------|-------------------|
| **User Task** | Async (human) | Waits for user | API call / form submit |
| **Service Task** | Sync (auto) | No wait | Immediate |
| **Business Rule Task** | Sync (auto) | No wait | Immediate |
| **Script Task** | Sync (auto) | No wait | Immediate |
| **Send Task** | Sync/Async | Optional | Delivery confirmation |
| **Receive Task** | Async (external) | Waits for message | Message correlation |
| **Manual Task** | Async (human) | Waits for confirmation | User confirmation |

Each task type integrates with the core execution engine through:
- **Task Executor Registry** - Routes to appropriate handler
- **Execution Tokens** - Track flow position
- **Job Queues** - Async processing via BullMQ
- **Event Bus** - Publish state changes
- **Observability** - Tracing, metrics, logging
