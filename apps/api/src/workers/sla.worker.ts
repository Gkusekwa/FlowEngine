import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, Job } from 'bullmq';
import { SLA_MONITORING_QUEUE, SlaJobType } from '../infrastructure/queues/queue.constants';
import type { SlaCheckJobData } from '../infrastructure/queues/queue.constants';
import { SlaEventEntity } from '../infrastructure/database/entities/sla-event.entity';
import { TaskInstanceEntity } from '../infrastructure/database/entities/task-instance.entity';
import { SlaDefinitionEntity } from '../infrastructure/database/entities/sla-definition.entity';
import { EventsGateway } from '../modules/websocket/events.gateway';
import { SlaEventType, TaskStatus } from '@flowengine/shared';

@Injectable()
export class SlaWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;
  private readonly logger = new Logger(SlaWorker.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SlaEventEntity)
    private readonly slaEventRepo: Repository<SlaEventEntity>,
    @InjectRepository(TaskInstanceEntity)
    private readonly taskInstanceRepo: Repository<TaskInstanceEntity>,
    @InjectRepository(SlaDefinitionEntity)
    private readonly slaDefinitionRepo: Repository<SlaDefinitionEntity>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      SLA_MONITORING_QUEUE,
      async (job: Job<SlaCheckJobData>) => {
        this.logger.debug(`Processing SLA job ${job.name} (${job.id})`);
        await this.processSlaCheck(job);
      },
      {
        connection: {
          host: this.config.get<string>('REDIS_HOST', 'localhost'),
          port: this.config.get<number>('REDIS_PORT', 6379),
          password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        },
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`SLA job ${job?.name} (${job?.id}) failed: ${error.message}`);
    });

    this.logger.log('SLA monitoring worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processSlaCheck(job: Job<SlaCheckJobData>): Promise<void> {
    const { taskInstanceId, slaDefinitionId, thresholdSeconds, escalationLevel = 0 } = job.data;
    const eventType = this.mapJobTypeToEventType(job.name);

    this.logger.log(`Processing SLA ${eventType} check for task ${taskInstanceId}`);

    try {
      // Fetch task instance with relations
      const taskInstance = await this.taskInstanceRepo.findOne({
        where: { id: taskInstanceId },
        relations: ['workflowInstance', 'workflowInstance.tenant', 'activityDefinition'],
      });

      if (!taskInstance) {
        this.logger.warn(`Task instance ${taskInstanceId} not found`);
        return;
      }

      // Skip if task already completed
      if (taskInstance.status === TaskStatus.COMPLETED || taskInstance.status === TaskStatus.CANCELLED) {
        this.logger.debug(`Task ${taskInstanceId} already completed, skipping SLA check`);
        return;
      }

      // Calculate actual duration
      const startTime = taskInstance.startedAt || taskInstance.createdAt;
      const actualDurationSeconds = Math.floor(
        (Date.now() - new Date(startTime).getTime()) / 1000,
      );

      // Check if event already exists
      const existingEvent = await this.slaEventRepo.findOne({
        where: {
          taskInstance: { id: taskInstanceId },
          slaDefinition: { id: slaDefinitionId },
          eventType,
        },
      });

      if (existingEvent) {
        this.logger.debug(`SLA event already recorded for task ${taskInstanceId}`);
        return;
      }

      // Create SLA event
      const slaEvent = this.slaEventRepo.create({
        taskInstance: { id: taskInstanceId } as TaskInstanceEntity,
        slaDefinition: { id: slaDefinitionId } as SlaDefinitionEntity,
        eventType,
        thresholdSeconds,
        actualDurationSeconds,
        escalationLevel,
        acknowledged: false,
      });

      await this.slaEventRepo.save(slaEvent);

      this.logger.log(`Recorded SLA ${eventType} event for task ${taskInstanceId}`);

      // Emit WebSocket notification
      const tenantId = taskInstance.workflowInstance?.tenant?.id;
      if (tenantId) {
        const eventData = {
          id: slaEvent.id,
          taskInstanceId,
          eventType,
          thresholdSeconds,
          actualDurationSeconds,
          escalationLevel,
          taskName: taskInstance.activityDefinition?.name || 'Unknown Task',
        };

        if (eventType === SlaEventType.WARNING) {
          this.eventsGateway.emitSlaWarning(tenantId, eventData);
        } else {
          this.eventsGateway.emitSlaBreach(tenantId, eventData);
        }
      }
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to process SLA check for task ${taskInstanceId}: ${errMessage}`,
        errStack,
      );
      throw error;
    }
  }

  private mapJobTypeToEventType(jobName: string): SlaEventType {
    switch (jobName) {
      case SlaJobType.CHECK_WARNING:
        return SlaEventType.WARNING;
      case SlaJobType.CHECK_BREACH:
        return SlaEventType.BREACH;
      case SlaJobType.CHECK_ESCALATION:
        return SlaEventType.ESCALATION;
      default:
        return SlaEventType.WARNING;
    }
  }
}
