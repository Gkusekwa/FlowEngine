import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { TaskHandler, TaskHandlerResult, TaskExecutionContext } from '../engine.interfaces';
import { TaskInstanceEntity } from '../../infrastructure/database/entities/task-instance.entity';
import { TaskStateHistoryEntity } from '../../infrastructure/database/entities/task-state-history.entity';
import { TASK_QUEUE } from '../../infrastructure/queues/queue.module';
import { TaskJobType } from '../../infrastructure/queues/queue.constants';
import { TaskStatus } from '@flowengine/shared';
import type { ExecuteServiceTaskJobData } from '../../infrastructure/queues/queue.constants';

@Injectable()
export class ServiceTaskHandler implements TaskHandler {
  private readonly logger = new Logger(ServiceTaskHandler.name);

  constructor(
    @InjectRepository(TaskInstanceEntity)
    private readonly taskRepo: Repository<TaskInstanceEntity>,
    @InjectRepository(TaskStateHistoryEntity)
    private readonly historyRepo: Repository<TaskStateHistoryEntity>,
    @Inject(TASK_QUEUE) private readonly taskQueue: Queue,
  ) {}

  async execute(context: TaskExecutionContext): Promise<TaskHandlerResult> {
    const { tenantId, workflowInstanceId, tokenId, activityDefinition, variables } = context;

    // Create a task instance for tracking
    const task = this.taskRepo.create({
      tenantId,
      workflowInstanceId,
      activityDefinitionId: activityDefinition.id,
      tokenId,
      status: TaskStatus.ACTIVE,
      variables,
      startedAt: new Date(),
    });

    const savedTask = await this.taskRepo.save(task);

    await this.historyRepo.save(
      this.historyRepo.create({
        taskInstanceId: savedTask.id,
        fromStatus: null,
        toStatus: TaskStatus.ACTIVE,
        reason: 'Service task started',
      }),
    );

    // Enqueue the service task for async execution
    const jobData: ExecuteServiceTaskJobData = {
      tenantId,
      instanceId: workflowInstanceId,
      tokenId,
      taskId: savedTask.id,
      activityDefinitionId: activityDefinition.id,
    };

    await this.taskQueue.add(TaskJobType.EXECUTE_SERVICE_TASK, jobData, {
      jobId: `service-task-${savedTask.id}`,
    });

    this.logger.log(`Enqueued service task ${savedTask.id} for activity ${activityDefinition.name || activityDefinition.bpmnElementId}`);

    // Return waiting — the worker will continue execution when done
    return 'waiting';
  }
}
