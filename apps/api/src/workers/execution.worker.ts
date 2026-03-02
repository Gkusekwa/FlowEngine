import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { WORKFLOW_EXECUTION_QUEUE, ExecutionJobType } from '../infrastructure/queues/queue.constants';
import { ExecutionEngineService } from '../engine/execution-engine.service';
import type { StartWorkflowJobData, ContinueExecutionJobData } from '../infrastructure/queues/queue.constants';

@Injectable()
export class ExecutionWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;
  private readonly logger = new Logger(ExecutionWorker.name);

  constructor(
    private readonly config: ConfigService,
    private readonly engineService: ExecutionEngineService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      WORKFLOW_EXECUTION_QUEUE,
      async (job: Job) => {
        this.logger.debug(`Processing job ${job.name} (${job.id})`);

        switch (job.name) {
          case ExecutionJobType.START_WORKFLOW: {
            const data = job.data as StartWorkflowJobData;
            await this.engineService.startExecution(data.tenantId, data.instanceId);
            break;
          }
          case ExecutionJobType.CONTINUE_EXECUTION: {
            const data = job.data as ContinueExecutionJobData;
            await this.engineService.continueExecution(
              data.tenantId,
              data.instanceId,
              data.tokenId,
              data.result,
            );
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
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.name} (${job?.id}) failed: ${error.message}`);
    });

    this.logger.log('Execution worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
