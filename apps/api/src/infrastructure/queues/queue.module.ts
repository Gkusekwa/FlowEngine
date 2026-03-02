import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WORKFLOW_EXECUTION_QUEUE, TASK_PROCESSING_QUEUE, SLA_MONITORING_QUEUE } from './queue.constants';

export const EXECUTION_QUEUE = 'EXECUTION_QUEUE';
export const TASK_QUEUE = 'TASK_QUEUE';
export const SLA_QUEUE = 'SLA_QUEUE';

@Global()
@Module({
  providers: [
    {
      provide: EXECUTION_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Queue(WORKFLOW_EXECUTION_QUEUE, {
          connection: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        });
      },
    },
    {
      provide: TASK_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Queue(TASK_PROCESSING_QUEUE, {
          connection: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        });
      },
    },
    {
      provide: SLA_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Queue(SLA_MONITORING_QUEUE, {
          connection: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
          defaultJobOptions: {
            attempts: 1,
            removeOnComplete: { count: 500 },
            removeOnFail: { count: 1000 },
          },
        });
      },
    },
  ],
  exports: [EXECUTION_QUEUE, TASK_QUEUE, SLA_QUEUE],
})
export class QueueModule {}
