import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Queue } from 'bullmq';
import { TaskInstanceEntity } from '../../infrastructure/database/entities/task-instance.entity';
import { TaskStateHistoryEntity } from '../../infrastructure/database/entities/task-state-history.entity';
import { ActivityDefinitionEntity } from '../../infrastructure/database/entities/activity-definition.entity';
import { DistributedLockService } from '../../infrastructure/redis/distributed-lock.service';
import { EXECUTION_QUEUE } from '../../infrastructure/queues/queue.module';
import { ExecutionJobType } from '../../infrastructure/queues/queue.constants';
import { SlaService } from '../sla/sla.service';
import { EventsGateway } from '../websocket/events.gateway';
import { AuditService } from '../audit/audit.service';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { TaskStatus, AuditAction, ErrorCodes } from '@flowengine/shared';
import type { ContinueExecutionJobData } from '../../infrastructure/queues/queue.constants';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(TaskInstanceEntity)
    private readonly taskRepo: Repository<TaskInstanceEntity>,
    @InjectRepository(TaskStateHistoryEntity)
    private readonly historyRepo: Repository<TaskStateHistoryEntity>,
    @InjectRepository(ActivityDefinitionEntity)
    private readonly activityRepo: Repository<ActivityDefinitionEntity>,
    @Inject(EXECUTION_QUEUE) private readonly executionQueue: Queue,
    private readonly lockService: DistributedLockService,
    private readonly slaService: SlaService,
    private readonly eventsGateway: EventsGateway,
    private readonly auditService: AuditService,
  ) {}

  async getInbox(
    tenantId: string,
    userId: string,
    options: { page?: number; pageSize?: number },
  ): Promise<{ items: TaskInstanceEntity[]; total: number; page: number; pageSize: number }> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.activityDefinition', 'activity')
      .leftJoinAndSelect('task.workflowInstance', 'instance')
      .leftJoinAndSelect('instance.workflowDefinition', 'definition')
      .where('task.tenantId = :tenantId', { tenantId })
      .andWhere('task.status IN (:...statuses)', {
        statuses: [TaskStatus.PENDING, TaskStatus.ACTIVE],
      })
      .andWhere(
        '(task.assignedTo = :userId OR (task.assignedGroup IS NOT NULL AND task.assignedTo IS NULL))',
        { userId },
      )
      .orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async findOne(tenantId: string, id: string): Promise<TaskInstanceEntity> {
    const task = await this.taskRepo.findOne({
      where: { id, tenantId },
      relations: ['activityDefinition', 'workflowInstance', 'stateHistory'],
    });
    if (!task) {
      throw new NotFoundException({
        code: ErrorCodes.TASK_NOT_FOUND,
        message: 'Task not found',
      });
    }
    return task;
  }

  async claimTask(tenantId: string, taskId: string, userId: string): Promise<TaskInstanceEntity> {
    return this.lockService.withLock(`task:${taskId}`, 5000, async () => {
      const task = await this.taskRepo.findOne({ where: { id: taskId, tenantId } });
      if (!task) {
        throw new NotFoundException({ code: ErrorCodes.TASK_NOT_FOUND, message: 'Task not found' });
      }
      if (task.status !== TaskStatus.PENDING) {
        throw new BadRequestException({
          code: ErrorCodes.TASK_INVALID_STATE,
          message: 'Only pending tasks can be claimed',
        });
      }
      if (task.assignedTo) {
        throw new BadRequestException({
          code: ErrorCodes.TASK_ALREADY_CLAIMED,
          message: 'Task is already assigned',
        });
      }

      // Update the task - we already hold the lock and verified state above
      await this.taskRepo.update(taskId, {
        assignedTo: userId,
        status: TaskStatus.ACTIVE,
        startedAt: new Date(),
      });

      await this.historyRepo.save(
        this.historyRepo.create({
          taskInstanceId: taskId,
          fromStatus: TaskStatus.PENDING,
          toStatus: TaskStatus.ACTIVE,
          changedBy: userId,
          reason: 'Task claimed',
        }),
      );

      // Emit WebSocket event
      this.eventsGateway.emitTaskAssigned(userId, {
        taskId,
        workflowInstanceId: task.workflowInstanceId,
        action: 'claimed',
      });

      // Audit log
      this.auditService.log({
        tenantId,
        userId,
        action: AuditAction.TASK_CLAIMED,
        resourceType: 'task',
        resourceId: taskId,
        newValues: { assignedTo: userId },
      });

      return this.taskRepo.findOneOrFail({ where: { id: taskId } });
    });
  }

  async unclaimTask(tenantId: string, taskId: string, userId: string): Promise<TaskInstanceEntity> {
    return this.lockService.withLock(`task:${taskId}`, 5000, async () => {
      const task = await this.taskRepo.findOne({ where: { id: taskId, tenantId } });
      if (!task) {
        throw new NotFoundException({ code: ErrorCodes.TASK_NOT_FOUND, message: 'Task not found' });
      }
      if (task.status !== TaskStatus.ACTIVE || task.assignedTo !== userId) {
        throw new BadRequestException({
          code: ErrorCodes.TASK_INVALID_STATE,
          message: 'You can only unclaim tasks that are assigned to you',
        });
      }

      await this.taskRepo.update(taskId, {
        assignedTo: null,
        status: TaskStatus.PENDING,
        startedAt: null,
      });

      await this.historyRepo.save(
        this.historyRepo.create({
          taskInstanceId: taskId,
          fromStatus: TaskStatus.ACTIVE,
          toStatus: TaskStatus.PENDING,
          changedBy: userId,
          reason: 'Task unclaimed',
        }),
      );

      // Audit log
      this.auditService.log({
        tenantId,
        userId,
        action: AuditAction.TASK_UNCLAIMED,
        resourceType: 'task',
        resourceId: taskId,
      });

      return this.taskRepo.findOneOrFail({ where: { id: taskId } });
    });
  }

  async completeTask(
    tenantId: string,
    taskId: string,
    userId: string,
    dto: CompleteTaskDto,
  ): Promise<TaskInstanceEntity> {
    return this.lockService.withLock(`task:${taskId}`, 5000, async () => {
      const task = await this.taskRepo.findOne({ where: { id: taskId, tenantId } });
      if (!task) {
        throw new NotFoundException({ code: ErrorCodes.TASK_NOT_FOUND, message: 'Task not found' });
      }
      if (task.status !== TaskStatus.ACTIVE) {
        throw new BadRequestException({
          code: ErrorCodes.TASK_INVALID_STATE,
          message: 'Only active tasks can be completed',
        });
      }
      if (task.assignedTo !== userId) {
        throw new BadRequestException({
          code: ErrorCodes.TASK_NOT_ASSIGNED,
          message: 'You must be assigned to complete this task',
        });
      }

      // Conditional update
      const result = await this.taskRepo.update(
        { id: taskId, status: TaskStatus.ACTIVE },
        {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
          completedBy: userId,
          completionResult: dto.result as any,
        },
      );

      if (result.affected === 0) {
        throw new BadRequestException({
          code: ErrorCodes.TASK_INVALID_STATE,
          message: 'Task state changed during completion',
        });
      }

      await this.historyRepo.save(
        this.historyRepo.create({
          taskInstanceId: taskId,
          fromStatus: TaskStatus.ACTIVE,
          toStatus: TaskStatus.COMPLETED,
          changedBy: userId,
          reason: dto.comment || 'Task completed',
        }),
      );

      // Cancel SLA checks for this task
      await this.slaService.cancelChecks(taskId);

      // Emit WebSocket event
      this.eventsGateway.emitTaskCompleted(tenantId, task.workflowInstanceId, {
        taskId,
        completedBy: userId,
      });

      // Audit log
      this.auditService.log({
        tenantId,
        userId,
        action: AuditAction.TASK_COMPLETED,
        resourceType: 'task',
        resourceId: taskId,
        newValues: { completionResult: dto.result },
      });

      // Enqueue continuation of the workflow execution
      if (task.tokenId) {
        const continueData: ContinueExecutionJobData = {
          tenantId,
          instanceId: task.workflowInstanceId,
          tokenId: task.tokenId,
          result: dto.result,
        };
        await this.executionQueue.add(ExecutionJobType.CONTINUE_EXECUTION, continueData);
      }

      return this.taskRepo.findOneOrFail({ where: { id: taskId } });
    });
  }

  async assignTask(
    tenantId: string,
    taskId: string,
    dto: AssignTaskDto,
  ): Promise<TaskInstanceEntity> {
    return this.lockService.withLock(`task:${taskId}`, 5000, async () => {
      const task = await this.taskRepo.findOne({ where: { id: taskId, tenantId } });
      if (!task) {
        throw new NotFoundException({ code: ErrorCodes.TASK_NOT_FOUND, message: 'Task not found' });
      }
      if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.ACTIVE) {
        throw new BadRequestException({
          code: ErrorCodes.TASK_INVALID_STATE,
          message: 'Only pending or active tasks can be assigned',
        });
      }

      const previousStatus = task.status;
      await this.taskRepo.update(taskId, {
        assignedTo: dto.userId,
        status: TaskStatus.ACTIVE,
        startedAt: task.startedAt || new Date(),
      });

      await this.historyRepo.save(
        this.historyRepo.create({
          taskInstanceId: taskId,
          fromStatus: previousStatus,
          toStatus: TaskStatus.ACTIVE,
          reason: `Task assigned to ${dto.userId}`,
        }),
      );

      // Emit WebSocket event to assigned user
      this.eventsGateway.emitTaskAssigned(dto.userId, {
        taskId,
        workflowInstanceId: task.workflowInstanceId,
        action: 'assigned',
      });

      // Audit log
      this.auditService.log({
        tenantId,
        action: AuditAction.TASK_ASSIGNED,
        resourceType: 'task',
        resourceId: taskId,
        newValues: { assignedTo: dto.userId },
      });

      return this.taskRepo.findOneOrFail({ where: { id: taskId } });
    });
  }
}
