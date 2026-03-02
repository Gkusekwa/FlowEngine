import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async health() {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const dbReady = this.dataSource.isInitialized;
    const redisReady = this.redis.status === 'ready';

    return {
      ready: dbReady && redisReady,
      components: {
        database: dbReady ? 'up' : 'down',
        redis: redisReady ? 'up' : 'down',
      },
    };
  }

  @Get('live')
  live() {
    return { alive: true };
  }

  @Get('db')
  async dbHealth() {
    const start = Date.now();
    await this.dataSource.query('SELECT 1');
    const latency = Date.now() - start;

    return { status: 'up', latencyMs: latency };
  }

  @Get('redis')
  async redisHealth() {
    const start = Date.now();
    await this.redis.ping();
    const latency = Date.now() - start;

    return { status: 'up', latencyMs: latency };
  }
}
