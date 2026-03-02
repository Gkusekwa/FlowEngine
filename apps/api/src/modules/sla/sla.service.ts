import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, IsNull, Not } from 'typeorm';
import { Queue } from 'bullmq';
import { SlaEventEntity, SlaDefinitionEntity, TaskInstanceEntity } from '../../infrastructure/database/entities';
import { SLA_QUEUE } from '../../infrastructure/queues/queue.module';
import { SlaJobType, SlaCheckJobData } from '../../infrastructure/queues/queue.constants';
import { SlaEventsQueryDto } from './dto/sla.dto';
import { SlaEventType, TaskStatus, ErrorCodes, PaginatedResponse } from '@flowengine/shared';

export interface SlaDashboardStats {
  totalEvents: number;
  warnings: number;
  breaches: number;
  escalations: number;
  unacknowledged: number;
  complianceRate: number;
}

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    @InjectRepository(SlaEventEntity)
    private readonly slaEventRepo: Repository<SlaEventEntity>,
    @InjectRepository(SlaDefinitionEntity)
    private readonly slaDefRepo: Repository<SlaDefinitionEntity>,
    @InjectRepository(TaskInstanceEntity)
    private readonly taskRepo: Repository<TaskInstanceEntity>,
    @Inject(SLA_QUEUE) private readonly slaQueue: Queue,
  ) {}

  /**
   * Schedule SLA checks for a newly created task
   */
  async scheduleChecks(tenantId: string, taskInstanceId: string, activityDefinitionId: string): Promise<void> {
    const slaDef = await this.slaDefRepo.findOne({
      where: { activityDefinitionId },
    });

    if (!slaDef) {
      return; // No SLA defined for this activity
    }

    // Schedule warning check
    if (slaDef.warningThresholdSeconds) {
      await this.slaQueue.add(
        SlaJobType.CHECK_WARNING,
        {
          tenantId,
          taskInstanceId,
          slaDefinitionId: slaDef.id,
          thresholdSeconds: slaDef.warningThresholdSeconds,
        } as SlaCheckJobData,
        {
          delay: slaDef.warningThresholdSeconds * 1000,
          jobId: `sla-warning-${taskInstanceId}`,
        },
      );
      this.logger.debug(`Scheduled SLA warning check for task ${taskInstanceId} in ${slaDef.warningThresholdSeconds}s`);
    }

    // Schedule breach check
    await this.slaQueue.add(
      SlaJobType.CHECK_BREACH,
      {
        tenantId,
        taskInstanceId,
        slaDefinitionId: slaDef.id,
        thresholdSeconds: slaDef.breachThresholdSeconds,
      } as SlaCheckJobData,
      {
        delay: slaDef.breachThresholdSeconds * 1000,
        jobId: `sla-breach-${taskInstanceId}`,
      },
    );
    this.logger.debug(`Scheduled SLA breach check for task ${taskInstanceId} in ${slaDef.breachThresholdSeconds}s`);

    // Schedule escalations
    const escalationRules = (slaDef.escalationRules || []) as Array<{
      level: number;
      triggerAfterSeconds: number;
      assignTo?: string;
      notifyUsers?: string[];
      notifyGroups?: string[];
    }>;

    for (const rule of escalationRules) {
      await this.slaQueue.add(
        SlaJobType.CHECK_ESCALATION,
        {
          tenantId,
          taskInstanceId,
          slaDefinitionId: slaDef.id,
          thresholdSeconds: rule.triggerAfterSeconds,
          escalationLevel: rule.level,
        } as SlaCheckJobData,
        {
          delay: rule.triggerAfterSeconds * 1000,
          jobId: `sla-escalation-${taskInstanceId}-${rule.level}`,
        },
      );
    }
  }

  /**
   * Cancel scheduled SLA checks when a task is completed
   */
  async cancelChecks(taskInstanceId: string): Promise<void> {
    const jobs = [
      `sla-warning-${taskInstanceId}`,
      `sla-breach-${taskInstanceId}`,
    ];

    for (const jobId of jobs) {
      try {
        const job = await this.slaQueue.getJob(jobId);
        if (job) {
          await job.remove();
        }
      } catch {
        // Job may not exist or already processed
      }
    }

    // Also cancel escalation jobs (try levels 1-5)
    for (let level = 1; level <= 5; level++) {
      try {
        const job = await this.slaQueue.getJob(`sla-escalation-${taskInstanceId}-${level}`);
        if (job) {
          await job.remove();
        }
      } catch {
        // Job may not exist
      }
    }
  }

  /**
   * Record an SLA event (called by SLA worker)
   */
  async recordEvent(
    taskInstanceId: string,
    slaDefinitionId: string,
    eventType: SlaEventType,
    thresholdSeconds: number,
    escalationLevel = 0,
  ): Promise<SlaEventEntity | null> {
    // Check if task is still active
    const task = await this.taskRepo.findOne({
      where: { id: taskInstanceId },
    });

    if (!task || task.status === TaskStatus.COMPLETED) {
      return null; // Task already completed, no SLA event needed
    }

    // Check for duplicate event
    const existing = await this.slaEventRepo.findOne({
      where: {
        taskInstanceId,
        slaDefinitionId,
        eventType,
        escalationLevel,
      },
    });

    if (existing) {
      return existing; // Already recorded
    }

    // Calculate actual duration
    const actualDurationSeconds = Math.floor(
      (Date.now() - task.createdAt.getTime()) / 1000,
    );

    const event = this.slaEventRepo.create({
      taskInstanceId,
      slaDefinitionId,
      eventType,
      thresholdSeconds,
      actualDurationSeconds,
      escalationLevel,
    });

    const saved = await this.slaEventRepo.save(event);
    this.logger.warn(
      `SLA ${eventType} recorded for task ${taskInstanceId} (threshold: ${thresholdSeconds}s, actual: ${actualDurationSeconds}s)`,
    );

    return saved;
  }

  /**
   * Mark event notification as sent
   */
  async markNotificationSent(eventId: string): Promise<void> {
    await this.slaEventRepo.update(eventId, {
      notificationSent: true,
      notificationSentAt: new Date(),
    });
  }

  /**
   * Acknowledge an SLA event
   */
  async acknowledge(tenantId: string, eventId: string, userId: string): Promise<SlaEventEntity> {
    const event = await this.slaEventRepo.findOne({
      where: { id: eventId },
      relations: ['taskInstance'],
    });

    if (!event || event.taskInstance?.tenantId !== tenantId) {
      throw new NotFoundException({
        code: ErrorCodes.SLA_NOT_FOUND,
        message: 'SLA event not found',
      });
    }

    if (event.acknowledged) {
      throw new ConflictException({
        code: ErrorCodes.SLA_ALREADY_ACKNOWLEDGED,
        message: 'SLA event already acknowledged',
        details: { acknowledgedAt: event.acknowledgedAt },
      });
    }

    event.acknowledged = true;
    event.acknowledgedBy = userId;
    event.acknowledgedAt = new Date();

    return this.slaEventRepo.save(event);
  }

  /**
   * Get SLA events with filtering
   */
  async findAll(tenantId: string, query: SlaEventsQueryDto): Promise<PaginatedResponse<SlaEventEntity>> {
    const { page = 1, pageSize = 20, eventType, taskInstanceId, acknowledged } = query;

    const qb = this.slaEventRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.taskInstance', 'task')
      .leftJoinAndSelect('task.workflowInstance', 'instance')
      .leftJoinAndSelect('task.activityDefinition', 'activity')
      .where('task.tenantId = :tenantId', { tenantId });

    if (eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType });
    }

    if (taskInstanceId) {
      qb.andWhere('event.taskInstanceId = :taskInstanceId', { taskInstanceId });
    }

    if (acknowledged !== undefined) {
      qb.andWhere('event.acknowledged = :acknowledged', { acknowledged });
    }

    qb.orderBy('event.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get SLA dashboard statistics
   */
  async getDashboardStats(tenantId: string): Promise<SlaDashboardStats> {
    const qb = this.slaEventRepo
      .createQueryBuilder('event')
      .leftJoin('event.taskInstance', 'task')
      .where('task.tenantId = :tenantId', { tenantId });

    const [events, totalCompleted] = await Promise.all([
      qb.getMany(),
      this.taskRepo.count({
        where: { tenantId, status: TaskStatus.COMPLETED },
      }),
    ]);

    const warnings = events.filter((e) => e.eventType === SlaEventType.WARNING).length;
    const breaches = events.filter((e) => e.eventType === SlaEventType.BREACH).length;
    const escalations = events.filter((e) => e.eventType === SlaEventType.ESCALATION).length;
    const unacknowledged = events.filter((e) => !e.acknowledged).length;

    const complianceRate = totalCompleted > 0
      ? Math.round(((totalCompleted - breaches) / totalCompleted) * 100)
      : 100;

    return {
      totalEvents: events.length,
      warnings,
      breaches,
      escalations,
      unacknowledged,
      complianceRate,
    };
  }
}
