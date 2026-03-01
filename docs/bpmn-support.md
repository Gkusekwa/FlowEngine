# BPMN 2.0 Support

FlowEngine supports a subset of BPMN 2.0 elements commonly used in business process automation. This document details supported elements, their configuration options, and usage examples.

## Supported Elements Overview

| Category | Element | Supported | Notes |
|----------|---------|-----------|-------|
| **Events** | Start Event | ✅ | Single start event per process |
| | End Event | ✅ | Multiple end events allowed |
| | Timer Event | ✅ | Intermediate and boundary |
| | Message Event | ✅ | Catch and throw |
| | Error Event | ✅ | Boundary only |
| **Tasks** | User Task | ✅ | Full form support |
| | Service Task | ✅ | HTTP, script, custom |
| | Script Task | ✅ | JavaScript, Groovy, Python |
| | Send Task | ✅ | Email, Slack, SMS, Webhook |
| | Receive Task | ✅ | Message, Signal, Webhook |
| | Business Rule Task | ✅ | DMN decision tables |
| | Manual Task | ✅ | External/offline tasks |
| **Gateways** | Exclusive (XOR) | ✅ | Conditional branching |
| | Parallel (AND) | ✅ | Fork and join |
| | Inclusive (OR) | ✅ | Multiple paths |
| | Event-Based | ✅ | Wait for events |
| **Containers** | Sub-Process | ✅ | Embedded subprocess |
| | Call Activity | ✅ | Reusable processes |
| **Artifacts** | Text Annotation | ✅ | Documentation |
| | Data Object | ⚠️ | Visualization only |
| | Pool/Lane | ⚠️ | Visualization only |

---

## Events

### Start Event

The entry point of a workflow. Each workflow must have exactly one start event.

```xml
<bpmn:startEvent id="StartEvent_1" name="Process Started">
  <bpmn:outgoing>Flow_1</bpmn:outgoing>
</bpmn:startEvent>
```

**Configuration:**
```json
{
  "type": "startEvent",
  "config": {
    "formKey": "start-form",        // Optional: collect initial data
    "formFields": [
      { "id": "requestType", "type": "select", "label": "Request Type", "required": true }
    ],
    "initiatorVariable": "initiator" // Store user who started the process
  }
}
```

### End Event

Marks the completion of a workflow path. Multiple end events are allowed for different completion scenarios.

```xml
<bpmn:endEvent id="EndEvent_Approved" name="Request Approved">
  <bpmn:incoming>Flow_Approved</bpmn:incoming>
</bpmn:endEvent>

<bpmn:endEvent id="EndEvent_Rejected" name="Request Rejected">
  <bpmn:incoming>Flow_Rejected</bpmn:incoming>
</bpmn:endEvent>
```

**Configuration:**
```json
{
  "type": "endEvent",
  "config": {
    "terminateAll": false,     // If true, terminates all parallel branches
    "resultVariable": "outcome" // Stores which end event was reached
  }
}
```

### Timer Events

#### Intermediate Timer Event (Catch)

Pauses execution for a specified duration.

```xml
<bpmn:intermediateCatchEvent id="Timer_Wait" name="Wait 24 Hours">
  <bpmn:timerEventDefinition>
    <bpmn:timeDuration>PT24H</bpmn:timeDuration>
  </bpmn:timerEventDefinition>
</bpmn:intermediateCatchEvent>
```

**Timer Types:**

| Type | Format | Example |
|------|--------|---------|
| Duration | ISO 8601 Duration | `PT1H30M` (1 hour 30 min) |
| Date | ISO 8601 DateTime | `2024-12-31T23:59:59Z` |
| Cycle | ISO 8601 Repeating | `R3/PT1H` (repeat 3 times, hourly) |

**Configuration:**
```json
{
  "type": "intermediateCatchEvent",
  "config": {
    "eventType": "timer",
    "eventConfig": {
      "timerType": "duration",
      "timerValue": "PT24H"
    }
  }
}
```

#### Timer Boundary Event

Attached to a task, triggers if the task isn't completed within the time limit.

```xml
<bpmn:boundaryEvent id="Timer_Escalation" attachedToRef="Task_Approval" cancelActivity="false">
  <bpmn:timerEventDefinition>
    <bpmn:timeDuration>PT4H</bpmn:timeDuration>
  </bpmn:timerEventDefinition>
  <bpmn:outgoing>Flow_Escalate</bpmn:outgoing>
</bpmn:boundaryEvent>
```

**Interrupting vs Non-Interrupting:**
- `cancelActivity="true"` - Cancels the task and follows the boundary flow
- `cancelActivity="false"` - Task continues, boundary flow executes in parallel

### Message Events

Used for inter-process communication or external system integration.

```xml
<bpmn:intermediateCatchEvent id="Message_Response" name="Wait for Response">
  <bpmn:messageEventDefinition messageRef="Message_PaymentConfirmation" />
</bpmn:intermediateCatchEvent>
```

**Correlation:**
```json
{
  "type": "intermediateCatchEvent",
  "config": {
    "eventType": "message",
    "eventConfig": {
      "messageName": "PaymentConfirmation",
      "correlationKey": "${orderId}"
    }
  }
}
```

**Sending a message:**
```http
POST /api/v1/messages
{
  "messageName": "PaymentConfirmation",
  "correlationKey": "ORDER-12345",
  "variables": {
    "paymentId": "PAY-789",
    "amount": 150.00
  }
}
```

---

## Tasks

### User Task

Requires human interaction to complete. Supports forms for data collection.

```xml
<bpmn:userTask id="Task_Approval" name="Manager Approval">
  <bpmn:extensionElements>
    <camunda:formData>
      <camunda:formField id="approved" label="Approve?" type="boolean" />
      <camunda:formField id="comments" label="Comments" type="string" />
    </camunda:formData>
  </bpmn:extensionElements>
</bpmn:userTask>
```

**Full Configuration:**
```json
{
  "type": "userTask",
  "name": "Manager Approval",
  "config": {
    "assignee": "${employee.manager}",
    "candidateGroups": ["managers", "approvers"],
    "dueDate": "${now() + duration('P3D')}",
    "priority": 50,
    "formKey": "approval-form",
    "formFields": [
      {
        "id": "approved",
        "type": "boolean",
        "label": "Approve Request?",
        "required": true
      },
      {
        "id": "amount",
        "type": "number",
        "label": "Approved Amount",
        "validation": { "min": 0, "max": 100000 },
        "showIf": "${approved == true}"
      },
      {
        "id": "reason",
        "type": "textarea",
        "label": "Rejection Reason",
        "required": true,
        "showIf": "${approved == false}"
      },
      {
        "id": "attachments",
        "type": "file",
        "label": "Supporting Documents",
        "multiple": true,
        "accept": ".pdf,.doc,.docx"
      }
    ]
  }
}
```

#### File Upload Fields

User Tasks support rich file upload capabilities with validation, virus scanning, and automatic metadata extraction.

**Basic File Upload:**
```json
{
  "id": "document",
  "type": "file",
  "label": "Upload Document",
  "required": true,
  "accept": ".pdf,.doc,.docx",
  "maxSize": "10MB",
  "description": "Upload the signed contract"
}
```

**Multiple File Upload with Limits:**
```json
{
  "id": "attachments",
  "type": "file",
  "label": "Supporting Documents",
  "multiple": true,
  "maxFiles": 5,
  "maxSize": "25MB",
  "maxTotalSize": "100MB",
  "accept": ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg",
  "required": false,
  "description": "Upload any supporting documentation (max 5 files, 25MB each)"
}
```

**Image Upload with Preview:**
```json
{
  "id": "profilePhoto",
  "type": "file",
  "label": "Profile Photo",
  "accept": "image/*",
  "maxSize": "5MB",
  "imageConfig": {
    "generateThumbnail": true,
    "thumbnailSize": { "width": 150, "height": 150 },
    "maxDimensions": { "width": 4096, "height": 4096 },
    "allowedFormats": ["jpeg", "png", "webp"],
    "autoRotate": true
  },
  "required": true
}
```

**File Upload with Validation Rules:**
```json
{
  "id": "invoice",
  "type": "file",
  "label": "Invoice Document",
  "required": true,
  "accept": ".pdf",
  "maxSize": "15MB",
  "validation": {
    "virusScan": true,
    "requireSignature": false,
    "contentValidation": {
      "type": "pdf",
      "rules": [
        { "rule": "hasText", "message": "PDF must contain readable text" },
        { "rule": "maxPages", "value": 50, "message": "PDF must not exceed 50 pages" }
      ]
    }
  },
  "metadata": {
    "extract": true,
    "fields": ["pageCount", "author", "createdDate", "modifiedDate"]
  }
}
```

**Complete File Field Configuration:**
```json
{
  "id": "legalDocuments",
  "type": "file",
  "label": "Legal Documents",
  "description": "Upload all required legal documents for review",
  "required": true,
  "multiple": true,
  "maxFiles": 10,
  "maxSize": "50MB",
  "maxTotalSize": "200MB",
  "accept": ".pdf,.doc,.docx",
  "acceptMimeTypes": [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ],
  "validation": {
    "virusScan": true,
    "contentValidation": {
      "type": "document",
      "rules": [
        { "rule": "notEmpty", "message": "Document must not be empty" },
        { "rule": "notEncrypted", "message": "Password-protected files are not allowed" }
      ]
    }
  },
  "metadata": {
    "extract": true,
    "fields": ["pageCount", "author", "createdDate", "wordCount"]
  },
  "storage": {
    "provider": "s3",
    "bucket": "${env.DOCUMENTS_BUCKET}",
    "path": "legal/${processInstanceId}/${fileId}",
    "encryption": "AES256",
    "retention": "P7Y"
  },
  "ui": {
    "dropzone": true,
    "showPreview": true,
    "showFileSize": true,
    "uploadProgressBar": true
  }
}
```

**File Upload BPMN XML Extension:**
```xml
<bpmn:userTask id="Task_UploadDocuments" name="Upload Documents">
  <bpmn:extensionElements>
    <camunda:formData>
      <camunda:formField id="contract" type="file" label="Signed Contract">
        <camunda:properties>
          <camunda:property id="accept" value=".pdf" />
          <camunda:property id="maxSize" value="10MB" />
          <camunda:property id="required" value="true" />
          <camunda:property id="virusScan" value="true" />
        </camunda:properties>
      </camunda:formField>
      <camunda:formField id="attachments" type="file" label="Additional Documents">
        <camunda:properties>
          <camunda:property id="multiple" value="true" />
          <camunda:property id="maxFiles" value="5" />
          <camunda:property id="accept" value=".pdf,.doc,.docx,.png,.jpg" />
        </camunda:properties>
      </camunda:formField>
    </camunda:formData>
  </bpmn:extensionElements>
</bpmn:userTask>
```

**Accessing Uploaded Files in Subsequent Tasks:**
```json
{
  "type": "serviceTask",
  "name": "Process Uploaded Documents",
  "config": {
    "serviceType": "script",
    "scriptConfig": {
      "language": "javascript",
      "script": "const files = execution.getVariable('legalDocuments'); const totalPages = files.reduce((sum, f) => sum + (f.metadata?.pageCount || 0), 0); return { fileCount: files.length, totalPages, fileIds: files.map(f => f.id) };",
      "resultVariable": "documentSummary"
    }
  }
}
```

**File Field Properties Reference:**

| Property | Type | Description |
|----------|------|-------------|
| `accept` | string | Comma-separated file extensions (`.pdf,.doc`) |
| `acceptMimeTypes` | string[] | Allowed MIME types |
| `maxSize` | string | Max size per file (`10MB`, `500KB`) |
| `maxTotalSize` | string | Max combined size for multiple files |
| `maxFiles` | number | Max number of files (when `multiple: true`) |
| `multiple` | boolean | Allow multiple file selection |
| `validation.virusScan` | boolean | Enable virus scanning |
| `metadata.extract` | boolean | Extract file metadata |
| `storage.provider` | string | Storage provider (`s3`, `azure`, `gcs`, `local`) |
| `storage.retention` | string | Retention period (ISO 8601 duration) |
| `imageConfig` | object | Image-specific processing options |

#### External Storage Configuration

FlowEngine supports multiple storage providers for uploaded files. Configure storage at the field level or set a default provider globally.

**Amazon S3 Storage:**
```json
{
  "id": "documents",
  "type": "file",
  "label": "Upload Documents",
  "storage": {
    "provider": "s3",
    "bucket": "${env.AWS_S3_BUCKET}",
    "region": "${env.AWS_REGION}",
    "path": "workflows/${workflowDefinitionKey}/${processInstanceId}/files/${fieldId}",
    "acl": "private",
    "encryption": "AES256",
    "serverSideEncryption": true,
    "storageClass": "STANDARD_IA",
    "credentials": {
      "accessKeyId": "${env.AWS_ACCESS_KEY_ID}",
      "secretAccessKey": "${env.AWS_SECRET_ACCESS_KEY}",
      "roleArn": "${env.AWS_ROLE_ARN}"
    },
    "presignedUrlExpiry": 3600,
    "multipartThreshold": "100MB",
    "tags": {
      "Environment": "${env.ENVIRONMENT}",
      "WorkflowId": "${workflowDefinitionId}"
    }
  }
}
```

**Azure Blob Storage:**
```json
{
  "id": "attachments",
  "type": "file",
  "label": "Attachments",
  "storage": {
    "provider": "azure",
    "accountName": "${env.AZURE_STORAGE_ACCOUNT}",
    "containerName": "workflow-files",
    "path": "${tenantId}/${processInstanceId}/${fileId}",
    "accessTier": "Cool",
    "encryption": true,
    "credentials": {
      "connectionString": "${env.AZURE_STORAGE_CONNECTION_STRING}",
      "sasToken": "${env.AZURE_SAS_TOKEN}",
      "managedIdentity": true
    },
    "presignedUrlExpiry": 3600,
    "metadata": {
      "workflowId": "${workflowDefinitionId}",
      "uploadedBy": "${currentUser.id}"
    }
  }
}
```

**Google Cloud Storage:**
```json
{
  "id": "reports",
  "type": "file",
  "label": "Reports",
  "storage": {
    "provider": "gcs",
    "projectId": "${env.GCP_PROJECT_ID}",
    "bucket": "${env.GCS_BUCKET}",
    "path": "uploads/${processInstanceId}/${timestamp}/${originalName}",
    "storageClass": "NEARLINE",
    "predefinedAcl": "private",
    "encryption": {
      "type": "customer-managed",
      "kmsKeyName": "${env.GCS_KMS_KEY}"
    },
    "credentials": {
      "keyFile": "${env.GOOGLE_APPLICATION_CREDENTIALS}",
      "serviceAccountEmail": "${env.GCS_SERVICE_ACCOUNT}"
    },
    "signedUrlExpiry": 3600,
    "uniformBucketLevelAccess": true
  }
}
```

**MinIO (S3-Compatible):**
```json
{
  "id": "internalDocs",
  "type": "file",
  "label": "Internal Documents",
  "storage": {
    "provider": "minio",
    "endpoint": "${env.MINIO_ENDPOINT}",
    "port": 9000,
    "useSSL": true,
    "bucket": "workflow-uploads",
    "path": "${tenantId}/files/${fileId}",
    "credentials": {
      "accessKey": "${env.MINIO_ACCESS_KEY}",
      "secretKey": "${env.MINIO_SECRET_KEY}"
    },
    "presignedUrlExpiry": 7200
  }
}
```

**Local Filesystem:**
```json
{
  "id": "tempFiles",
  "type": "file",
  "label": "Temporary Files",
  "storage": {
    "provider": "local",
    "basePath": "/var/flowengine/uploads",
    "path": "${processInstanceId}/${fieldId}/${fileId}",
    "permissions": "0640",
    "createDirectories": true,
    "serveVia": "api",
    "cleanupPolicy": {
      "enabled": true,
      "retentionDays": 30,
      "archiveTo": "s3"
    }
  }
}
```

**Global Storage Configuration (environment-level):**

Configure default storage in your FlowEngine configuration file:

```json
{
  "storage": {
    "defaultProvider": "s3",
    "providers": {
      "s3": {
        "bucket": "flowengine-files-prod",
        "region": "us-east-1",
        "encryption": "AES256",
        "credentials": {
          "useInstanceProfile": true
        }
      },
      "azure": {
        "accountName": "flowenginefiles",
        "containerName": "uploads",
        "credentials": {
          "managedIdentity": true
        }
      },
      "local": {
        "basePath": "/data/flowengine/uploads",
        "serveVia": "nginx"
      }
    },
    "cdn": {
      "enabled": true,
      "baseUrl": "https://cdn.example.com/files",
      "signUrls": true,
      "ttl": 86400
    },
    "lifecycle": {
      "defaultRetention": "P1Y",
      "archiveAfter": "P90D",
      "archiveStorageClass": "GLACIER",
      "deleteAfter": "P7Y"
    }
  }
}
```

**Storage Provider Comparison:**

| Provider | Use Case | Durability | Cost | Features |
|----------|----------|------------|------|----------|
| S3 | Production, high availability | 99.999999999% | Pay per use | Versioning, lifecycle, CDN integration |
| Azure Blob | Azure ecosystem, enterprise | 99.999999999% | Pay per use | Tiered storage, CDN, managed identity |
| GCS | GCP ecosystem, analytics | 99.999999999% | Pay per use | Multi-regional, BigQuery integration |
| MinIO | On-premise, S3-compatible | Self-managed | Self-hosted | Full S3 API, Kubernetes native |
| Local | Development, small deployments | Disk-dependent | Free | Simple setup, no external dependencies |

**Storage Path Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `${processInstanceId}` | Workflow instance UUID | `a1b2c3d4-...` |
| `${workflowDefinitionId}` | Workflow definition UUID | `wf-12345` |
| `${workflowDefinitionKey}` | Workflow key/name | `invoice-approval` |
| `${taskInstanceId}` | Task instance UUID | `task-67890` |
| `${fieldId}` | Form field ID | `attachments` |
| `${fileId}` | Generated file UUID | `file-abcdef` |
| `${originalName}` | Original filename | `report.pdf` |
| `${timestamp}` | Upload timestamp | `20240115T143022Z` |
| `${tenantId}` | Multi-tenant identifier | `acme-corp` |
| `${currentUser.id}` | Uploading user ID | `user-123` |
| `${env.VAR_NAME}` | Environment variable | (varies) |

### Service Task

Executes automated logic - HTTP calls, scripts, or custom services.

#### HTTP Service Task

```json
{
  "type": "serviceTask",
  "name": "Call Payment API",
  "config": {
    "serviceType": "http",
    "httpConfig": {
      "method": "POST",
      "url": "https://api.payment.com/charge",
      "headers": {
        "Authorization": "Bearer ${env.PAYMENT_API_KEY}",
        "Content-Type": "application/json"
      },
      "body": "{\"amount\": ${amount}, \"currency\": \"USD\", \"orderId\": \"${orderId}\"}",
      "timeout": 30000,
      "retries": 3,
      "resultVariable": "paymentResult",
      "failOnError": true
    }
  }
}
```

#### Script Service Task

```json
{
  "type": "serviceTask",
  "name": "Calculate Discount",
  "config": {
    "serviceType": "script",
    "scriptConfig": {
      "language": "javascript",
      "script": "const discount = amount > 1000 ? 0.1 : 0.05; return { discountRate: discount, discountedAmount: amount * (1 - discount) };",
      "resultVariable": "discountResult"
    }
  }
}
```

### Script Task

Similar to script service task but specifically for computation.

```xml
<bpmn:scriptTask id="Task_Calculate" name="Calculate Total" scriptFormat="javascript">
  <bpmn:script>
    var total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    var tax = total * 0.1;
    execution.setVariable('total', total);
    execution.setVariable('tax', tax);
    execution.setVariable('grandTotal', total + tax);
  </bpmn:script>
</bpmn:scriptTask>
```

### Send Task

Sends notifications or messages without waiting for a response. This is a one-way communication task.

```xml
<bpmn:sendTask id="Task_NotifyApproval" name="Send Approval Notification">
  <bpmn:extensionElements>
    <flowengine:sendTask channel="email" />
  </bpmn:extensionElements>
</bpmn:sendTask>
```

**Email Send Task:**
```json
{
  "type": "sendTask",
  "name": "Send Approval Email",
  "config": {
    "sendTaskConfig": {
      "channel": "email",
      "emailConfig": {
        "to": ["${requester.email}"],
        "cc": ["${manager.email}"],
        "subject": "Request ${requestId} Approved",
        "body": "Your request has been approved for $${approvedAmount}.",
        "bodyType": "html",
        "template": "approval-notification",
        "templateData": {
          "requesterName": "${requester.name}",
          "requestId": "${requestId}",
          "amount": "${approvedAmount}",
          "approvedBy": "${approver.name}"
        },
        "priority": "high"
      },
      "async": true,
      "retries": 3
    }
  }
}
```

**Slack Send Task:**
```json
{
  "type": "sendTask",
  "name": "Post to Slack",
  "config": {
    "sendTaskConfig": {
      "channel": "slack",
      "slackConfig": {
        "channel": "#approvals",
        "message": "Request ${requestId} has been approved by ${approver.name}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Request Approved*\n${requester.name}'s request for $${amount} was approved."
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": { "type": "plain_text", "text": "View Details" },
                "url": "https://app.example.com/requests/${requestId}"
              }
            ]
          }
        ]
      }
    }
  }
}
```

**Webhook Send Task:**
```json
{
  "type": "sendTask",
  "name": "Notify External System",
  "config": {
    "sendTaskConfig": {
      "channel": "webhook",
      "webhookConfig": {
        "url": "https://api.external-system.com/notifications",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer ${env.EXTERNAL_API_KEY}",
          "Content-Type": "application/json"
        },
        "body": {
          "event": "request_approved",
          "requestId": "${requestId}",
          "amount": "${amount}",
          "timestamp": "${now()}"
        },
        "timeout": 30000,
        "authentication": {
          "type": "hmac",
          "credentials": {
            "secret": "${env.WEBHOOK_SECRET}",
            "algorithm": "sha256",
            "header": "X-Signature"
          }
        }
      },
      "retries": 3,
      "retryDelay": 5000,
      "failOnError": false
    }
  }
}
```

**SMS Send Task:**
```json
{
  "type": "sendTask",
  "name": "Send SMS Alert",
  "config": {
    "sendTaskConfig": {
      "channel": "sms",
      "smsConfig": {
        "to": "${customer.phone}",
        "message": "Your order #${orderId} has shipped! Track at: ${trackingUrl}",
        "provider": "twilio"
      },
      "async": true
    }
  }
}
```

---

### Receive Task

Waits for an external message, signal, or event before continuing the workflow.

```xml
<bpmn:receiveTask id="Task_WaitForPayment" name="Wait for Payment Confirmation">
  <bpmn:extensionElements>
    <flowengine:receiveTask messageName="PaymentConfirmation" />
  </bpmn:extensionElements>
</bpmn:receiveTask>
```

**Message-Based Receive Task:**
```json
{
  "type": "receiveTask",
  "name": "Wait for Payment Confirmation",
  "config": {
    "receiveTaskConfig": {
      "triggerType": "message",
      "messageName": "PaymentConfirmation",
      "correlationKey": "${orderId}",
      "timeout": "PT24H",
      "timeoutAction": "escalate",
      "resultVariable": "paymentResult",
      "payloadMapping": [
        { "source": "$.paymentId", "target": "paymentId", "required": true },
        { "source": "$.amount", "target": "paidAmount", "type": "number" },
        { "source": "$.status", "target": "paymentStatus" }
      ],
      "payloadValidation": [
        { "field": "status", "rule": "enum", "value": ["completed", "pending", "failed"] },
        { "field": "amount", "rule": "range", "value": { "min": 0 } }
      ]
    }
  }
}
```

**Correlating a Message (API Call):**
```http
POST /api/v1/messages
Content-Type: application/json

{
  "messageName": "PaymentConfirmation",
  "correlationKey": "ORDER-12345",
  "variables": {
    "paymentId": "PAY-789",
    "amount": 150.00,
    "status": "completed"
  }
}
```

**Webhook-Based Receive Task:**
```json
{
  "type": "receiveTask",
  "name": "Wait for External Callback",
  "config": {
    "receiveTaskConfig": {
      "triggerType": "webhook",
      "webhookConfig": {
        "path": "/callbacks/orders/${orderId}",
        "method": "POST",
        "authentication": {
          "type": "hmac",
          "config": {
            "secret": "${env.WEBHOOK_SECRET}",
            "header": "X-Signature"
          }
        },
        "responseTemplate": "{\"status\": \"received\", \"processId\": \"${processInstanceId}\"}",
        "responseStatus": 200
      },
      "timeout": "PT48H",
      "timeoutAction": "fail",
      "resultVariable": "callbackData"
    }
  }
}
```

**Signal-Based Receive Task:**
```json
{
  "type": "receiveTask",
  "name": "Wait for Approval Signal",
  "config": {
    "receiveTaskConfig": {
      "triggerType": "signal",
      "signalName": "BatchApprovalComplete",
      "timeout": "P7D",
      "timeoutAction": "continue",
      "timeoutResultVariable": "didTimeout"
    }
  }
}
```

---

### Business Rule Task

Executes business rules using DMN (Decision Model and Notation) decision tables. This enables externalization of business logic from the process flow.

```xml
<bpmn:businessRuleTask id="Task_DetermineDiscount" name="Determine Discount"
                        camunda:decisionRef="discount-decision"
                        camunda:mapDecisionResult="singleEntry"
                        camunda:resultVariable="discountPercentage">
</bpmn:businessRuleTask>
```

**Basic Business Rule Task:**
```json
{
  "type": "businessRuleTask",
  "name": "Determine Discount Level",
  "config": {
    "businessRuleConfig": {
      "decisionRef": "discount-decision",
      "decisionRefBinding": "latest",
      "mapDecisionResult": "singleEntry",
      "resultVariable": "discountPercentage",
      "inputVariables": [
        { "source": "${customerType}", "target": "customerType" },
        { "source": "${orderAmount}", "target": "orderAmount" },
        { "source": "${loyaltyYears}", "target": "loyaltyYears" }
      ]
    }
  }
}
```

**DMN Decision Table Example (discount-decision.dmn):**

| Customer Type | Order Amount | Loyalty Years | Discount % |
|---------------|--------------|---------------|------------|
| premium       | -            | >= 5          | 20         |
| premium       | -            | < 5           | 15         |
| standard      | >= 1000      | >= 3          | 10         |
| standard      | >= 1000      | < 3           | 5          |
| standard      | < 1000       | -             | 0          |
| new           | -            | -             | 5          |

**Inline Decision Table Configuration:**
```json
{
  "type": "businessRuleTask",
  "name": "Calculate Risk Score",
  "config": {
    "businessRuleConfig": {
      "decisionRef": "inline",
      "inlineDecisionTable": {
        "id": "risk-assessment",
        "name": "Risk Assessment",
        "hitPolicy": "FIRST",
        "inputs": [
          { "id": "input1", "label": "Credit Score", "inputExpression": "creditScore", "typeRef": "number" },
          { "id": "input2", "label": "Debt Ratio", "inputExpression": "debtToIncomeRatio", "typeRef": "number" },
          { "id": "input3", "label": "Employment", "inputExpression": "employmentStatus", "typeRef": "string" }
        ],
        "outputs": [
          { "id": "output1", "label": "Risk Level", "name": "riskLevel", "typeRef": "string" },
          { "id": "output2", "label": "Max Loan", "name": "maxLoanAmount", "typeRef": "number" }
        ],
        "rules": [
          {
            "id": "rule1",
            "inputEntries": [">= 750", "< 0.3", "employed"],
            "outputEntries": ["low", "500000"],
            "description": "Excellent credit, low debt, employed"
          },
          {
            "id": "rule2",
            "inputEntries": [">= 700", "< 0.4", "employed"],
            "outputEntries": ["medium", "250000"],
            "description": "Good credit, moderate debt"
          },
          {
            "id": "rule3",
            "inputEntries": [">= 650", "< 0.5", "-"],
            "outputEntries": ["high", "100000"],
            "description": "Fair credit"
          },
          {
            "id": "rule4",
            "inputEntries": ["< 650", "-", "-"],
            "outputEntries": ["very_high", "0"],
            "description": "Poor credit - decline"
          }
        ]
      },
      "resultVariable": "riskAssessment",
      "mapDecisionResult": "singleResult"
    }
  }
}
```

**External DMN Engine Integration:**
```json
{
  "type": "businessRuleTask",
  "name": "Complex Compliance Check",
  "config": {
    "businessRuleConfig": {
      "decisionRef": "compliance-rules-v2",
      "externalEngine": {
        "type": "camunda",
        "endpoint": "https://dmn-engine.company.com/decision-definition",
        "headers": {
          "Authorization": "Bearer ${env.DMN_API_KEY}"
        },
        "timeout": 10000
      },
      "inputVariables": [
        { "source": "${transaction}", "target": "transaction", "type": "expression" },
        { "source": "${customer}", "target": "customer", "type": "expression" }
      ],
      "resultVariable": "complianceResult",
      "mapDecisionResult": "resultList",
      "failOnNoResult": true
    }
  }
}
```

**Hit Policies Explained:**

| Policy | Description |
|--------|-------------|
| UNIQUE | Only one rule can match (error if multiple match) |
| FIRST | Returns first matching rule |
| PRIORITY | Returns highest priority match |
| ANY | Any matching rule (all must return same result) |
| COLLECT | Returns all matching results |
| RULE_ORDER | Returns matches in rule order |
| OUTPUT_ORDER | Returns matches sorted by output values |

---

### Manual Task

Represents work performed outside of FlowEngine, typically physical or offline tasks. Unlike User Tasks, Manual Tasks don't have forms - they're tracked but not directly executed within the system.

```xml
<bpmn:manualTask id="Task_PhysicalInspection" name="Perform Physical Inspection">
  <bpmn:documentation>
    Inspector must physically verify the equipment condition.
  </bpmn:documentation>
</bpmn:manualTask>
```

**Basic Manual Task:**
```json
{
  "type": "manualTask",
  "name": "Physical Document Verification",
  "config": {
    "manualTaskConfig": {
      "assignee": "${verificationOfficer}",
      "candidateGroups": ["verification-team"],
      "instructions": "## Document Verification Checklist\n\n1. Verify original ID documents\n2. Check document authenticity\n3. Compare photos with applicant\n4. Stamp and sign verification form",
      "requireConfirmation": true,
      "confirmationMessage": "I confirm that I have completed the physical document verification.",
      "estimatedDuration": "PT30M",
      "trackActualDuration": true
    }
  }
}
```

**Manual Task with External System Reference:**
```json
{
  "type": "manualTask",
  "name": "Warehouse Pick and Pack",
  "config": {
    "manualTaskConfig": {
      "candidateGroups": ["warehouse-staff"],
      "instructions": "Pick items from locations specified in the WMS and pack for shipment.",
      "externalSystemRef": "WMS",
      "externalTaskId": "${wmsPickingTaskId}",
      "externalSystemUrl": "https://wms.company.com/tasks/${wmsPickingTaskId}",
      "documentationUrl": "https://wiki.company.com/warehouse/picking-procedures",
      "attachments": [
        {
          "name": "Picking List",
          "url": "${pickingListUrl}",
          "type": "document",
          "description": "Generated picking list for this order"
        },
        {
          "name": "Training Video",
          "url": "https://training.company.com/warehouse/picking",
          "type": "video",
          "description": "Standard picking procedure"
        }
      ],
      "estimatedDuration": "PT15M"
    }
  }
}
```

**Auto-Complete Manual Task:**
```json
{
  "type": "manualTask",
  "name": "Wait for Mail Delivery",
  "config": {
    "manualTaskConfig": {
      "instructions": "Physical documents have been mailed. This task will auto-complete after the expected delivery window.",
      "autoCompleteAfter": "P3D",
      "requireConfirmation": false
    }
  }
}
```

**Manual Task Use Cases:**

| Use Case | Description |
|----------|-------------|
| Physical Inspections | On-site equipment or property inspections |
| Document Handling | Physical document processing, signing, stamping |
| Warehouse Operations | Picking, packing, shipping activities |
| Field Service | On-location service or repair work |
| Meeting/Call | Scheduled meetings tracked in workflow |
| External System Work | Work performed in legacy systems |

---

### Script Task

Executes computational logic directly within the workflow using JavaScript, Groovy, or Python.

```xml
<bpmn:scriptTask id="Task_Calculate" name="Calculate Total" scriptFormat="javascript">
  <bpmn:script>
    var subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    var tax = subtotal * taxRate;
    var shipping = subtotal > 100 ? 0 : 9.99;
    execution.setVariable('subtotal', subtotal);
    execution.setVariable('tax', tax);
    execution.setVariable('shipping', shipping);
    execution.setVariable('total', subtotal + tax + shipping);
  </bpmn:script>
</bpmn:scriptTask>
```

**JavaScript Script Task:**
```json
{
  "type": "scriptTask",
  "name": "Calculate Order Totals",
  "config": {
    "script": "const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);\nconst discount = subtotal * (discountRate || 0);\nconst taxable = subtotal - discount;\nconst tax = taxable * 0.08;\nconst total = taxable + tax;\nreturn { subtotal, discount, tax, total };",
    "scriptFormat": "javascript",
    "resultVariable": "orderCalculation"
  }
}
```

**Python Script Task:**
```json
{
  "type": "scriptTask",
  "name": "Data Transformation",
  "config": {
    "script": "import json\n\ndef transform_customer(data):\n    return {\n        'fullName': f\"{data['firstName']} {data['lastName']}\",\n        'email': data['email'].lower(),\n        'segment': 'premium' if data['totalOrders'] > 100 else 'standard'\n    }\n\nresult = transform_customer(customerData)",
    "scriptFormat": "python",
    "resultVariable": "transformedCustomer"
  }
}
```

**Groovy Script Task:**
```json
{
  "type": "scriptTask",
  "name": "Complex Business Logic",
  "config": {
    "script": "def eligibility = [:]\neligibility.qualified = age >= 18 && income >= minIncome\neligibility.tier = income >= 100000 ? 'gold' : (income >= 50000 ? 'silver' : 'bronze')\neligibility.maxCredit = eligibility.qualified ? income * 0.3 : 0\nreturn eligibility",
    "scriptFormat": "groovy",
    "resultVariable": "eligibilityResult"
  }
}
```

**Script Task Best Practices:**

| Practice | Description |
|----------|-------------|
| Keep scripts simple | Complex logic should be in Service Tasks |
| Use result variables | Always specify where to store results |
| Handle errors | Wrap in try-catch for graceful failures |
| Avoid side effects | Scripts should be pure calculations |
| Limit execution time | Scripts timeout after 30 seconds by default |

---

## Gateways

### Exclusive Gateway (XOR)

Routes to exactly one outgoing path based on conditions.

```xml
<bpmn:exclusiveGateway id="Gateway_Decision" name="Approved?" default="Flow_Rejected">
  <bpmn:incoming>Flow_1</bpmn:incoming>
  <bpmn:outgoing>Flow_Approved</bpmn:outgoing>
  <bpmn:outgoing>Flow_Rejected</bpmn:outgoing>
</bpmn:exclusiveGateway>

<bpmn:sequenceFlow id="Flow_Approved" sourceRef="Gateway_Decision" targetRef="Task_Process">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">
    ${approved == true}
  </bpmn:conditionExpression>
</bpmn:sequenceFlow>

<bpmn:sequenceFlow id="Flow_Rejected" sourceRef="Gateway_Decision" targetRef="Task_Notify" />
```

**Condition Expressions:**
```javascript
// Simple comparison
${amount > 10000}

// Boolean check
${approved == true}

// String comparison
${status == 'active'}

// Complex conditions
${amount > 10000 && department == 'finance'}

// Array/collection check
${items.length > 0}

// Null checks
${manager != null}
```

### Parallel Gateway (AND)

Forks execution into multiple parallel paths, then synchronizes.

```xml
<!-- Fork -->
<bpmn:parallelGateway id="Gateway_Fork" name="Start Parallel">
  <bpmn:incoming>Flow_1</bpmn:incoming>
  <bpmn:outgoing>Flow_TaskA</bpmn:outgoing>
  <bpmn:outgoing>Flow_TaskB</bpmn:outgoing>
  <bpmn:outgoing>Flow_TaskC</bpmn:outgoing>
</bpmn:parallelGateway>

<!-- Join -->
<bpmn:parallelGateway id="Gateway_Join" name="Wait for All">
  <bpmn:incoming>Flow_FromA</bpmn:incoming>
  <bpmn:incoming>Flow_FromB</bpmn:incoming>
  <bpmn:incoming>Flow_FromC</bpmn:incoming>
  <bpmn:outgoing>Flow_Continue</bpmn:outgoing>
</bpmn:parallelGateway>
```

**Behavior:**
- Fork: Creates execution tokens for ALL outgoing paths
- Join: Waits until ALL incoming paths complete before continuing

### Inclusive Gateway (OR)

Routes to one or more outgoing paths based on conditions.

```xml
<bpmn:inclusiveGateway id="Gateway_Notifications" name="Send Notifications">
  <bpmn:incoming>Flow_1</bpmn:incoming>
  <bpmn:outgoing>Flow_Email</bpmn:outgoing>
  <bpmn:outgoing>Flow_SMS</bpmn:outgoing>
  <bpmn:outgoing>Flow_Slack</bpmn:outgoing>
</bpmn:inclusiveGateway>

<bpmn:sequenceFlow id="Flow_Email" sourceRef="Gateway_Notifications" targetRef="Task_Email">
  <bpmn:conditionExpression>${notifyEmail == true}</bpmn:conditionExpression>
</bpmn:sequenceFlow>

<bpmn:sequenceFlow id="Flow_SMS" sourceRef="Gateway_Notifications" targetRef="Task_SMS">
  <bpmn:conditionExpression>${notifySMS == true}</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```

**Behavior:**
- Fork: Evaluates ALL conditions, takes all true paths (minimum one required)
- Join: Waits for all active incoming tokens

### Event-Based Gateway

Waits for one of several events, then proceeds with the first to occur.

```xml
<bpmn:eventBasedGateway id="Gateway_WaitFor" name="Wait for Response">
  <bpmn:incoming>Flow_1</bpmn:incoming>
  <bpmn:outgoing>Flow_ToMessage</bpmn:outgoing>
  <bpmn:outgoing>Flow_ToTimer</bpmn:outgoing>
</bpmn:eventBasedGateway>

<bpmn:intermediateCatchEvent id="Event_Message" name="Response Received">
  <bpmn:incoming>Flow_ToMessage</bpmn:incoming>
  <bpmn:messageEventDefinition messageRef="Message_Response" />
</bpmn:intermediateCatchEvent>

<bpmn:intermediateCatchEvent id="Event_Timeout" name="Timeout">
  <bpmn:incoming>Flow_ToTimer</bpmn:incoming>
  <bpmn:timerEventDefinition>
    <bpmn:timeDuration>PT24H</bpmn:timeDuration>
  </bpmn:timerEventDefinition>
</bpmn:intermediateCatchEvent>
```

---

## Containers

### Sub-Process

Embedded subprocess for grouping related activities.

```xml
<bpmn:subProcess id="SubProcess_Approval" name="Approval Process">
  <bpmn:startEvent id="SubStart" />
  <bpmn:userTask id="SubTask_Review" name="Review" />
  <bpmn:userTask id="SubTask_Approve" name="Approve" />
  <bpmn:endEvent id="SubEnd" />

  <bpmn:sequenceFlow sourceRef="SubStart" targetRef="SubTask_Review" />
  <bpmn:sequenceFlow sourceRef="SubTask_Review" targetRef="SubTask_Approve" />
  <bpmn:sequenceFlow sourceRef="SubTask_Approve" targetRef="SubEnd" />
</bpmn:subProcess>
```

**Error Boundary on SubProcess:**
```xml
<bpmn:boundaryEvent id="Error_Handler" attachedToRef="SubProcess_Approval">
  <bpmn:errorEventDefinition errorRef="Error_Rejected" />
  <bpmn:outgoing>Flow_HandleError</bpmn:outgoing>
</bpmn:boundaryEvent>
```

### Call Activity

Invokes a reusable workflow definition.

```xml
<bpmn:callActivity id="CallActivity_Approval" name="Run Approval Workflow"
                   calledElement="approval-workflow-v2">
  <bpmn:extensionElements>
    <camunda:in source="requestData" target="request" />
    <camunda:out source="result" target="approvalResult" />
  </bpmn:extensionElements>
</bpmn:callActivity>
```

**Configuration:**
```json
{
  "type": "callActivity",
  "name": "Run Approval Workflow",
  "config": {
    "calledElement": "approval-workflow-v2",
    "inMappings": [
      { "source": "requestData", "target": "request", "type": "copy" },
      { "source": "${amount * 1.1}", "target": "adjustedAmount", "type": "expression" }
    ],
    "outMappings": [
      { "source": "result", "target": "approvalResult" }
    ]
  }
}
```

---

## Artifacts

Artifacts in BPMN provide additional information about the process but don't directly affect execution flow. FlowEngine supports these for visualization and documentation purposes.

### Text Annotation

Provides documentation and notes within the workflow diagram.

```xml
<bpmn:textAnnotation id="Annotation_1">
  <bpmn:text>This approval step requires manager sign-off for amounts over $10,000</bpmn:text>
</bpmn:textAnnotation>

<bpmn:association id="Association_1" sourceRef="Task_Approval" targetRef="Annotation_1" />
```

**Configuration:**
```json
{
  "type": "textAnnotation",
  "id": "Annotation_1",
  "config": {
    "text": "This approval step requires manager sign-off for amounts over $10,000",
    "associatedElements": ["Task_Approval"],
    "style": {
      "width": 200,
      "backgroundColor": "#fffde7"
    }
  }
}
```

**Use Cases:**
- Document business rules that aren't obvious from the flow
- Add compliance notes for auditors
- Explain complex gateway conditions
- Reference external documentation or policies

---

### Data Object

Represents data used or produced by activities. In FlowEngine, Data Objects are **visualization only** - they appear in the diagram but don't affect execution. Actual data handling is done through process variables.

```xml
<bpmn:dataObjectReference id="DataObject_Invoice" name="Invoice Data" dataObjectRef="DataObject_1">
  <bpmn:dataState name="approved" />
</bpmn:dataObjectReference>

<bpmn:dataInputAssociation id="DataInput_1">
  <bpmn:sourceRef>DataObject_Invoice</bpmn:sourceRef>
  <bpmn:targetRef>Task_ProcessInvoice</bpmn:targetRef>
</bpmn:dataInputAssociation>
```

**Visual Representation:**
```json
{
  "type": "dataObjectReference",
  "id": "DataObject_Invoice",
  "config": {
    "name": "Invoice Data",
    "dataState": "approved",
    "description": "Invoice document with line items and totals",
    "associatedVariable": "invoiceData",
    "isCollection": false
  }
}
```

**Data Object Types:**

| Type | Icon | Description |
|------|------|-------------|
| Data Object | 📄 | Single data item |
| Data Collection | 📄📄📄 | Multiple data items (array) |
| Data Input | 📄→ | Input to the process |
| Data Output | →📄 | Output from the process |
| Data Store | 🗄️ | Persistent data reference |

**Why Visualization Only?**

FlowEngine uses process variables for actual data handling because:
- Variables provide runtime type checking
- Variables support expressions and transformations
- Variables integrate with the execution context
- Variables can be encrypted for sensitive data

**Mapping Data Objects to Variables:**

While Data Objects don't execute, you can document the relationship:

```json
{
  "type": "dataObjectReference",
  "id": "DataObject_CustomerInfo",
  "config": {
    "name": "Customer Information",
    "mappedVariables": [
      { "name": "customer", "description": "Full customer record" },
      { "name": "customer.email", "description": "Customer email address" },
      { "name": "customer.tier", "description": "Customer tier (bronze/silver/gold)" }
    ],
    "documentation": "Customer data loaded from CRM at process start"
  }
}
```

---

### Pool and Lane

Pools and Lanes organize workflows by participants or departments. In FlowEngine, these are **visualization only** - they structure the diagram but don't enforce assignment rules. Use task assignment configurations for actual routing.

```xml
<bpmn:collaboration id="Collaboration_1">
  <bpmn:participant id="Participant_Company" name="ACME Corp" processRef="Process_Order" />
  <bpmn:participant id="Participant_Customer" name="Customer" />
</bpmn:collaboration>

<bpmn:process id="Process_Order" isExecutable="true">
  <bpmn:laneSet id="LaneSet_1">
    <bpmn:lane id="Lane_Sales" name="Sales Team">
      <bpmn:flowNodeRef>Task_CreateQuote</bpmn:flowNodeRef>
      <bpmn:flowNodeRef>Task_NegotiatePrice</bpmn:flowNodeRef>
    </bpmn:lane>
    <bpmn:lane id="Lane_Finance" name="Finance Team">
      <bpmn:flowNodeRef>Task_ApproveCredit</bpmn:flowNodeRef>
      <bpmn:flowNodeRef>Task_ProcessPayment</bpmn:flowNodeRef>
    </bpmn:lane>
    <bpmn:lane id="Lane_Warehouse" name="Warehouse">
      <bpmn:flowNodeRef>Task_ShipOrder</bpmn:flowNodeRef>
    </bpmn:lane>
  </bpmn:laneSet>
</bpmn:process>
```

**Visual Configuration:**
```json
{
  "pools": [
    {
      "id": "Participant_Company",
      "name": "ACME Corp",
      "processRef": "Process_Order",
      "isExecutable": true,
      "lanes": [
        {
          "id": "Lane_Sales",
          "name": "Sales Team",
          "description": "Handles customer interactions and quotes",
          "suggestedCandidateGroups": ["sales"],
          "color": "#e3f2fd"
        },
        {
          "id": "Lane_Finance",
          "name": "Finance Team",
          "description": "Handles payments and credit approvals",
          "suggestedCandidateGroups": ["finance", "accounting"],
          "color": "#e8f5e9"
        },
        {
          "id": "Lane_Warehouse",
          "name": "Warehouse",
          "description": "Handles physical order fulfillment",
          "suggestedCandidateGroups": ["warehouse"],
          "color": "#fff3e0"
        }
      ]
    },
    {
      "id": "Participant_Customer",
      "name": "Customer",
      "isExecutable": false,
      "description": "External party - not managed by FlowEngine"
    }
  ]
}
```

**Pool Types:**

| Type | Executable | Description |
|------|------------|-------------|
| White Box Pool | Yes | Shows internal process details |
| Black Box Pool | No | External participant, no internal details |
| Collapsed Pool | Yes/No | Minimized view, expands on click |

**Why Visualization Only?**

Pools and Lanes don't control execution because:
- Task assignment is more flexible with `candidateGroups` and `assignee` expressions
- Runtime assignment can consider workload, availability, and skills
- Cross-lane collaboration is common (one person may work multiple lanes)
- Expression-based assignment supports dynamic org structures

**Recommended Pattern - Lane-Aligned Assignment:**

While lanes don't enforce assignment, you can align your task configuration with lane structure:

```json
{
  "type": "userTask",
  "name": "Approve Credit",
  "lane": "Lane_Finance",
  "config": {
    "candidateGroups": ["finance"],
    "description": "Review customer credit application",
    "priority": 50
  }
}
```

**Best Practices:**

| Practice | Description |
|----------|-------------|
| Use lanes for documentation | Show who typically handles each task |
| Align candidate groups | Match task assignment to lane suggestions |
| Don't over-complicate | 3-5 lanes per pool is usually sufficient |
| Use black box pools | For external parties you don't control |
| Add lane descriptions | Document responsibilities in lane metadata |

---

## Expression Language

FlowEngine supports a JavaScript-based expression language for conditions and variable manipulation.

### Variables

```javascript
// Simple variable access
${variableName}

// Nested property access
${user.email}
${order.items[0].name}

// Variable with default
${amount ?? 0}
```

### Built-in Functions

```javascript
// Date/Time
${now()}                          // Current timestamp
${now() + duration('P1D')}        // Tomorrow
${dateFormat(dueDate, 'YYYY-MM-DD')}

// String
${upper(name)}                    // Uppercase
${lower(email)}                   // Lowercase
${concat(firstName, ' ', lastName)}
${contains(description, 'urgent')}

// Math
${min(a, b)}
${max(a, b)}
${round(amount, 2)}
${abs(difference)}

// Collection
${length(items)}
${sum(items, 'price')}
${filter(items, 'status == "active"')}

// Environment
${env.API_KEY}                    // Environment variable
```

### Condition Examples

```javascript
// Amount-based routing
${amount <= 1000}                 // Low value
${amount > 1000 && amount <= 10000}  // Medium value
${amount > 10000}                 // High value

// Role-based routing
${user.role == 'manager'}
${contains(user.groups, 'finance')}

// Priority-based
${priority == 'high' || (priority == 'medium' && daysOpen > 5)}
```

---

## BPMN Import/Export

### Importing BPMN

```http
POST /api/v1/workflows/import
Content-Type: multipart/form-data

file: <process.bpmn>
```

**Supported formats:**
- BPMN 2.0 XML (`.bpmn`, `.bpmn2`)
- Camunda modeler format
- Signavio export format

### Exporting BPMN

```http
GET /api/v1/workflows/:id/export
Accept: application/xml
```

Returns standard BPMN 2.0 XML compatible with:
- Camunda Modeler
- bpmn.io
- Bizagi
- Signavio
