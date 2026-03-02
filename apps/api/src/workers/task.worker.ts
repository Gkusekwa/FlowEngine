import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, Job, Queue } from 'bullmq';
import { EXECUTION_QUEUE } from '../infrastructure/queues/queue.module';
import {
  TASK_PROCESSING_QUEUE,
  TaskJobType,
  ExecutionJobType,
} from '../infrastructure/queues/queue.constants';
import { TaskInstanceEntity } from '../infrastructure/database/entities/task-instance.entity';
import { TaskStateHistoryEntity } from '../infrastructure/database/entities/task-state-history.entity';
import { ActivityDefinitionEntity } from '../infrastructure/database/entities/activity-definition.entity';
import { HttpServiceExecutor, HttpServiceConfig } from '../engine/http/http-service.executor';
import { VariableManager } from '../engine/variable.manager';
import { TaskStatus } from '@flowengine/shared';
import type { ExecuteServiceTaskJobData, ContinueExecutionJobData } from '../infrastructure/queues/queue.constants';

@Injectable()
export class TaskWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;
  private readonly logger = new Logger(TaskWorker.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(EXECUTION_QUEUE) private readonly executionQueue: Queue,
    @InjectRepository(TaskInstanceEntity)
    private readonly taskRepo: Repository<TaskInstanceEntity>,
    @InjectRepository(TaskStateHistoryEntity)
    private readonly historyRepo: Repository<TaskStateHistoryEntity>,
    @InjectRepository(ActivityDefinitionEntity)
    private readonly activityRepo: Repository<ActivityDefinitionEntity>,
    private readonly httpExecutor: HttpServiceExecutor,
    private readonly variableManager: VariableManager,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      TASK_PROCESSING_QUEUE,
      async (job: Job) => {
        switch (job.name) {
          case TaskJobType.EXECUTE_SERVICE_TASK: {
            await this.executeServiceTask(job.data as ExecuteServiceTaskJobData);
            break;
          }
          default:
            this.logger.warn(`Unknown job type: ${job.name}`);
        }
      },
      {
        connection: {
          host: this.config.get<string>('REDIS_HOST', 'localhost'),
          port: this.config.get<number>('REDIS_PORT', 6379),
          password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        },
        concurrency: 10,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Task job ${job?.name} (${job?.id}) failed: ${error.message}`);
    });

    this.logger.log('Task worker started');
  }

  private async executeServiceTask(data: ExecuteServiceTaskJobData): Promise<void> {
    const { tenantId, instanceId, tokenId, taskId, activityDefinitionId } = data;

    const activity = await this.activityRepo.findOne({ where: { id: activityDefinitionId } });
    if (!activity) throw new Error(`Activity ${activityDefinitionId} not found`);

    const config = activity.config as unknown as HttpServiceConfig;
    const variables = await this.variableManager.getVariables(instanceId);

    try {
      const result = await this.httpExecutor.execute(config, variables);

      // Mark task as completed
      await this.taskRepo.update(taskId, {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        completionResult: result as any,
      });

      await this.historyRepo.save(
        this.historyRepo.create({
          taskInstanceId: taskId,
          fromStatus: TaskStatus.ACTIVE,
          toStatus: TaskStatus.COMPLETED,
          reason: `HTTP ${config.method || 'GET'} completed with status ${result.statusCode}`,
        }),
      );

      // Enqueue continuation
      const continueData: ContinueExecutionJobData = {
        tenantId,
        instanceId,
        tokenId,
        result: { [`serviceResult_${activity.bpmnElementId}`]: result },
      };

      await this.executionQueue.add(ExecutionJobType.CONTINUE_EXECUTION, continueData);

      this.logger.log(`Service task ${taskId} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.taskRepo.update(taskId, {
        status: TaskStatus.FAILED,
        completedAt: new Date(),
        completionResult: { error: errorMessage } as any,
      });

      await this.historyRepo.save(
        this.historyRepo.create({
          taskInstanceId: taskId,
          fromStatus: TaskStatus.ACTIVE,
          toStatus: TaskStatus.FAILED,
          reason: `Service task failed: ${errorMessage}`,
        }),
      );

      this.logger.error(`Service task ${taskId} failed: ${errorMessage}`);
      throw error; // Let BullMQ handle retries
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
