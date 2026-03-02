import { Module, Global, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DistributedLockService } from './distributed-lock.service';
import { REDIS_CLIENT } from './redis.constants';

export { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redis = new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => Math.min(times * 100, 3000),
        });

        redis.on('error', (err) => {
          console.error('Redis connection error:', err.message);
        });

        // Wait for connection to be ready before returning
        // This is required for Redlock 5.x to function properly
        await new Promise<void>((resolve, reject) => {
          if (redis.status === 'ready') {
            resolve();
          } else {
            redis.once('ready', resolve);
            redis.once('error', reject);
          }
        });

        console.log('Redis client connected and ready');
        return redis;
      },
    },
    DistributedLockService,
  ],
  exports: [REDIS_CLIENT, DistributedLockService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {}

  async onModuleDestroy() {
    // Redis client cleanup is handled by NestJS DI container
  }
}
