import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskHandler, TaskHandlerResult, TaskExecutionContext } from '../engine.interfaces';
import { TaskInstanceEntity } from '../../infrastructure/database/entities/task-instance.entity';
import { TaskStateHistoryEntity } from '../../infrastructure/database/entities/task-state-history.entity';
import { SlaService } from '../../modules/sla/sla.service';
import { EventsGateway } from '../../modules/websocket/events.gateway';
import { AuditService } from '../../modules/audit/audit.service';
import { TaskStatus, AuditAction } from '@flowengine/shared';

@Injectable()
export class UserTaskHandler implements TaskHandler {
  private readonly logger = new Logger(UserTaskHandler.name);

  constructor(
    @InjectRepository(TaskInstanceEntity)
    private readonly taskRepo: Repository<TaskInstanceEntity>,
    @InjectRepository(TaskStateHistoryEntity)
    private readonly historyRepo: Repository<TaskStateHistoryEntity>,
    private readonly slaService: SlaService,
    private readonly eventsGateway: EventsGateway,
    private readonly auditService: AuditService,
  ) {}

  async execute(context: TaskExecutionContext): Promise<TaskHandlerResult> {
    const { tenantId, workflowInstanceId, tokenId, activityDefinition, variables } = context;
    const config = activityDefinition.config as Record<string, unknown>;

    // Determine initial assignment
    const assignee = config.assignee as string | undefined;
    const candidateGroup = config.candidateGroup as string | undefined;
    const initialStatus = assignee ? TaskStatus.ACTIVE : TaskStatus.PENDING;

    // Create the task instance
    const task = this.taskRepo.create({
      tenantId,
      workflowInstanceId,
      activityDefinitionId: activityDefinition.id,
      tokenId,
      status: initialStatus,
      assignedTo: assignee || null,
      assignedGroup: candidateGroup || null,
      variables,
      startedAt: assignee ? new Date() : null,
    });

    const savedTask = await this.taskRepo.save(task);

    // Record initial state in history
    await this.historyRepo.save(
      this.historyRepo.create({
        taskInstanceId: savedTask.id,
        fromStatus: null,
        toStatus: initialStatus,
        reason: 'Task created',
      }),
    );

    // Schedule SLA checks for this task
    await this.slaService.scheduleChecks(tenantId, savedTask.id, activityDefinition.id);

    // Emit WebSocket event
    this.eventsGateway.emitTaskCreated(tenantId, {
      taskId: savedTask.id,
      activityName: activityDefinition.name || activityDefinition.bpmnElementId,
      workflowInstanceId,
      assignedTo: assignee || null,
      assignedGroup: candidateGroup || null,
      status: initialStatus,
    });

    // If task is assigned to a specific user, also notify that user
    if (assignee) {
      this.eventsGateway.emitTaskAssigned(assignee, {
        taskId: savedTask.id,
        activityName: activityDefinition.name || activityDefinition.bpmnElementId,
        workflowInstanceId,
      });
    }

    // Audit log
    this.auditService.log({
      tenantId,
      action: AuditAction.TASK_CREATED,
      resourceType: 'task',
      resourceId: savedTask.id,
      newValues: {
        activityName: activityDefinition.name,
        assignedTo: assignee,
        assignedGroup: candidateGroup,
        workflowInstanceId,
      },
    });

    this.logger.log(
      `Created user task ${savedTask.id} for activity ${activityDefinition.name || activityDefinition.bpmnElementId}` +
        (assignee ? ` assigned to ${assignee}` : '') +
        (candidateGroup ? ` for group ${candidateGroup}` : ''),
    );

    // Return waiting — token stays here until task is completed
    return 'waiting';
  }
}
