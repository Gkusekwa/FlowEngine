# SLA Monitoring Guide

FlowEngine provides comprehensive SLA (Service Level Agreement) monitoring for workflow tasks, including warnings, breaches, escalations, and real-time notifications.

## Overview

SLA monitoring tracks the time taken to complete each task against defined thresholds:

```
Task Created
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Active Task                               │
│                                                                  │
│  ├───────────┼───────────────┼───────────────┼────────────►     │
│  0      Warning          Breach         Escalation L1    Time   │
│         Threshold        Threshold       (if defined)           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Configuring SLA

### Via BPMN Editor

In the workflow editor, select any User Task or Service Task to configure its SLA:

1. Click on the task element
2. Open the Properties Panel
3. Navigate to the "SLA" section
4. Configure thresholds and escalation rules

### Via API

```json
POST /api/v1/workflows/:id
{
  "bpmnXml": "...",
  "slaDefinitions": {
    "Task_ManagerApproval": {
      "warningThresholdSeconds": 7200,
      "breachThresholdSeconds": 14400,
      "escalationRules": [
        {
          "level": 1,
          "triggerAfterSeconds": 18000,
          "assignTo": "deputy-manager-id",
          "notifyGroups": ["management"]
        }
      ],
      "notificationChannels": [
        { "type": "email", "config": { "template": "sla-alert" } },
        { "type": "slack", "config": { "channel": "#workflow-alerts" } }
      ]
    }
  }
}
```

## SLA Thresholds

### Warning Threshold

- **Optional** - Can be omitted if only breach tracking is needed
- Triggers a warning event when elapsed time exceeds threshold
- Does not affect task assignment or status
- Useful for proactive monitoring

```json
{
  "warningThresholdSeconds": 7200  // 2 hours
}
```

### Breach Threshold

- **Required** for SLA tracking
- Triggers a breach event when elapsed time exceeds threshold
- Updates `dueAt` field on task instance
- Enables escalation rules

```json
{
  "breachThresholdSeconds": 14400  // 4 hours
}
```

## Escalation Rules

Escalation rules define automatic actions taken after SLA breach.

### Configuration

```json
{
  "escalationRules": [
    {
      "level": 1,
      "triggerAfterSeconds": 18000,
      "assignTo": "manager-user-id",
      "notifyUsers": ["team-lead-id"],
      "notifyGroups": ["management"],
      "action": "both"
    },
    {
      "level": 2,
      "triggerAfterSeconds": 28800,
      "assignTo": "director-user-id",
      "notifyUsers": ["vp-id"],
      "action": "reassign"
    }
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `level` | number | Escalation level (1, 2, 3...) |
| `triggerAfterSeconds` | number | Seconds after task creation to trigger |
| `assignTo` | string | User/group ID to reassign task to |
| `notifyUsers` | string[] | User IDs to notify |
| `notifyGroups` | string[] | Group names to notify |
| `action` | string | `reassign`, `notify`, or `both` |

### Escalation Timeline Example

```
0h        2h        4h        5h        8h
│         │         │         │         │
▼         ▼         ▼         ▼         ▼
Created   Warning   Breach    Esc L1    Esc L2
          ↓         ↓         ↓         ↓
          Notify    Notify    Reassign  Reassign
                    Alert     + Notify  to Director
```

## Notification Channels

### Email

```json
{
  "type": "email",
  "config": {
    "template": "sla-breach",
    "recipients": ["alerts@company.com"],
    "cc": ["manager@company.com"]
  }
}
```

**Available Templates:**
- `sla-warning` - Warning notification
- `sla-breach` - Breach notification
- `sla-escalation` - Escalation notification

### Slack

```json
{
  "type": "slack",
  "config": {
    "channel": "#workflow-alerts",
    "webhookUrl": "https://hooks.slack.com/services/..."
  }
}
```

### Webhook

```json
{
  "type": "webhook",
  "config": {
    "url": "https://api.pagerduty.com/incidents",
    "method": "POST",
    "headers": {
      "Authorization": "Token token=xxxx",
      "Content-Type": "application/json"
    }
  }
}
```

**Webhook Payload:**
```json
{
  "event": "sla.breach",
  "taskId": "uuid",
  "taskName": "Manager Approval",
  "workflowInstanceId": "uuid",
  "correlationId": "LR-2024-001",
  "thresholdSeconds": 14400,
  "actualDurationSeconds": 14500,
  "assignedTo": "manager@company.com",
  "timestamp": "2024-01-21T12:01:00Z"
}
```

### SMS (via Twilio)

```json
{
  "type": "sms",
  "config": {
    "phoneNumbers": ["+1234567890"]
  }
}
```

## SLA Dashboard

### Metrics

The SLA dashboard provides real-time visibility into SLA performance:

```
┌─────────────────────────────────────────────────────────────────┐
│  SLA Compliance Dashboard                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   92%    │  │   150    │  │    12    │  │    25    │       │
│  │Compliance│  │Completed │  │ Breaches │  │ Warnings │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  Compliance by Workflow                                         │
│  ├─ Leave Request ────────────────────────────── 95% ██████████│
│  ├─ Expense Approval ─────────────────────────── 88% ████████  │
│  └─ Purchase Order ───────────────────────────── 91% █████████ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoint

```http
GET /api/v1/sla/dashboard?timeRange=24h&workflowId=uuid
```

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
    { "timestamp": "2024-01-21T00:00:00Z", "completed": 15, "breaches": 1 },
    { "timestamp": "2024-01-21T01:00:00Z", "completed": 12, "breaches": 0 }
  ]
}
```

## Real-Time Monitoring

### WebSocket Events

Subscribe to SLA events for real-time updates:

**WebSocket endpoint:** `wss://flowengine.example.com/ws`

**Available SLA events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `sla.warning` | `{ taskId, instanceId, currentDurationSeconds, threshold }` | SLA approaching breach threshold |
| `sla.breach` | `{ taskId, instanceId, taskName, breachDurationSeconds }` | SLA has been breached |
| `sla.escalation` | `{ taskId, instanceId, escalationLevel, newAssignee }` | Task escalated to next level |

### Task Due Date

Each task with SLA has a `dueAt` field calculated from the breach threshold:

```sql
due_at = started_at + breach_threshold_seconds
```

This enables:
- Sorting tasks by urgency
- Showing countdown timers in UI
- Calendar integration for due dates

## Acknowledging Breaches

SLA breaches can be acknowledged to indicate they've been reviewed:

```http
POST /api/v1/sla/breaches/:id/acknowledge
{
  "note": "Acknowledged - manager was on leave, task has been reassigned"
}
```

Acknowledged breaches:
- Are excluded from active breach counts
- Retain full audit trail
- Can be filtered in dashboard

## Best Practices

### 1. Set Realistic Thresholds

Consider:
- Average historical completion times
- Business hours vs. calendar hours
- Task complexity and dependencies

### 2. Use Warning Thresholds

Set warning threshold at ~50-75% of breach threshold:
```json
{
  "warningThresholdSeconds": 7200,   // 2 hours (warning)
  "breachThresholdSeconds": 10800    // 3 hours (breach)
}
```

### 3. Define Clear Escalation Paths

```json
{
  "escalationRules": [
    { "level": 1, "triggerAfterSeconds": 14400, "assignTo": "team-lead" },
    { "level": 2, "triggerAfterSeconds": 28800, "assignTo": "manager" },
    { "level": 3, "triggerAfterSeconds": 43200, "assignTo": "director" }
  ]
}
```

### 4. Monitor Compliance Trends

- Review weekly/monthly compliance rates
- Identify bottleneck activities
- Adjust thresholds based on patterns

### 5. Configure Appropriate Notifications

- Use email for non-urgent warnings
- Use Slack/SMS for critical breaches
- Avoid notification fatigue

## SLA Expressions

For dynamic SLA thresholds based on task variables:

```json
{
  "breachThresholdExpression": "${priority == 'high' ? 7200 : 28800}"
}
```

This evaluates to:
- 2 hours for high priority tasks
- 8 hours for normal priority tasks

## Excluded Time (Business Hours)

Configure business hours to exclude non-working time from SLA calculations:

```json
{
  "businessHours": {
    "enabled": true,
    "timezone": "America/New_York",
    "schedule": {
      "monday": { "start": "09:00", "end": "17:00" },
      "tuesday": { "start": "09:00", "end": "17:00" },
      "wednesday": { "start": "09:00", "end": "17:00" },
      "thursday": { "start": "09:00", "end": "17:00" },
      "friday": { "start": "09:00", "end": "17:00" }
    },
    "holidays": ["2024-12-25", "2024-01-01"]
  }
}
```

When enabled, SLA duration only counts time within business hours.

### Shift-Based Schedules

For organizations operating in shifts (call centers, healthcare, manufacturing), configure multiple shifts per day:

```json
{
  "businessHours": {
    "enabled": true,
    "timezone": "America/New_York",
    "mode": "shifts",
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
      },
      "night": {
        "name": "Night Shift",
        "hours": { "start": "22:00", "end": "06:00" },
        "color": "#9C27B0"
      }
    },
    "schedule": {
      "monday": ["morning", "afternoon", "night"],
      "tuesday": ["morning", "afternoon", "night"],
      "wednesday": ["morning", "afternoon", "night"],
      "thursday": ["morning", "afternoon", "night"],
      "friday": ["morning", "afternoon"],
      "saturday": ["morning"],
      "sunday": []
    },
    "holidays": ["2024-12-25", "2024-01-01"]
  }
}
```

**Shift Configuration Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | `"standard"` or `"shifts"` - enables shift-based scheduling |
| `shifts` | object | Named shift definitions |
| `shifts.[name].hours` | object | Start and end times for the shift |
| `shifts.[name].color` | string | Color code for UI visualization |
| `schedule` | object | Days mapped to active shift names |

### Overnight Shifts

For shifts that cross midnight, the `end` time will be on the following day:

```json
{
  "shifts": {
    "night": {
      "name": "Night Shift",
      "hours": { "start": "22:00", "end": "06:00" },
      "crossesMidnight": true
    }
  }
}
```

### Rotating Shifts

Support for rotating shift patterns (e.g., 4-on-4-off, weekly rotation):

```json
{
  "businessHours": {
    "mode": "rotating_shifts",
    "timezone": "America/Chicago",
    "shifts": {
      "day": { "hours": { "start": "07:00", "end": "19:00" } },
      "night": { "hours": { "start": "19:00", "end": "07:00" } }
    },
    "rotationPattern": {
      "type": "weekly",
      "cycle": [
        { "week": 1, "days": ["monday", "tuesday", "wednesday", "thursday"], "shift": "day" },
        { "week": 1, "days": ["friday", "saturday", "sunday"], "shift": null },
        { "week": 2, "days": ["monday", "tuesday", "wednesday"], "shift": null },
        { "week": 2, "days": ["thursday", "friday", "saturday", "sunday"], "shift": "night" }
      ],
      "startDate": "2024-01-01"
    }
  }
}
```

### Shift-Specific SLA Thresholds

Apply different SLA thresholds based on active shift:

```json
{
  "slaDefinitions": {
    "Task_Support": {
      "defaultBreachThresholdSeconds": 14400,
      "shiftOverrides": {
        "night": {
          "breachThresholdSeconds": 28800,
          "warningThresholdSeconds": 21600,
          "reason": "Reduced staffing during night shift"
        },
        "weekend": {
          "breachThresholdSeconds": 43200,
          "reason": "Weekend skeleton crew"
        }
      }
    }
  }
}
```

### Team/User Shift Assignments

Assign users or teams to specific shifts for task routing:

```json
{
  "shiftAssignments": {
    "morning": {
      "users": ["user-id-1", "user-id-2"],
      "groups": ["support-team-a"]
    },
    "afternoon": {
      "users": ["user-id-3", "user-id-4"],
      "groups": ["support-team-b"]
    },
    "night": {
      "users": ["user-id-5"],
      "groups": ["support-team-night"]
    }
  }
}
```

When a task is created during a specific shift, it can be automatically assigned to the appropriate team:

```json
{
  "taskAssignment": {
    "mode": "shift_based",
    "candidateGroups": "#{currentShift.groups}",
    "fallbackGroup": "support-all"
  }
}
```

### Shift Handoff Rules

Configure behavior when tasks span shift changes:

```json
{
  "shiftHandoff": {
    "enabled": true,
    "behavior": "reassign",
    "reassignTo": "next_shift_group",
    "notifyOutgoing": true,
    "notifyIncoming": true,
    "handoffNoteRequired": true,
    "graceMinutes": 15
  }
}
```

**Handoff Behaviors:**

| Behavior | Description |
|----------|-------------|
| `reassign` | Automatically reassign task to incoming shift |
| `notify` | Keep assignment, notify incoming shift of pending tasks |
| `queue` | Move task to shift handoff queue for manual pickup |
| `retain` | Task stays with original assignee (no handoff) |

### Shift Dashboard Widget

```
┌─────────────────────────────────────────────────────────────────┐
│  Current Shift: Morning Shift (06:00 - 14:00)                   │
│  Time Remaining: 3h 45m                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Active Tasks by Shift Today:                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ Morning │  │Afternoon│  │  Night  │                         │
│  │   23    │  │   --    │  │   --    │                         │
│  │ (5 due) │  │(pending)│  │(pending)│                         │
│  └─────────┘  └─────────┘  └─────────┘                         │
│                                                                  │
│  Shift Compliance Rate:                                         │
│  Morning: 94% ████████████████████░░                            │
│  Afternoon (yesterday): 91% ██████████████████░░░               │
│  Night (yesterday): 88% █████████████████░░░░                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API: Current Shift Information

```http
GET /api/v1/shifts/current?timezone=America/New_York
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

### Shift Transition Events

Subscribe to shift change events:

```javascript
socket.on('shift.starting', (data) => {
  // { shift: "afternoon", startsAt: "...", pendingHandoffs: 5 }
  console.log(`${data.shift} shift starting with ${data.pendingHandoffs} handoffs`);
});

socket.on('shift.ending', (data) => {
  // { shift: "morning", endsAt: "...", incompleteTasks: 3 }
  notifyTeam(`${data.shift} shift ending - ${data.incompleteTasks} tasks need handoff`);
});

socket.on('task.handoff', (data) => {
  // { taskId, fromShift, toShift, fromUser, toUser, handoffNote }
  console.log(`Task handed off from ${data.fromShift} to ${data.toShift}`);
});
```
