import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  async health() {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe - checks all dependencies' })
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
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { alive: true };
  }

  @Get('db')
  @ApiOperation({ summary: 'Database health with latency' })
  async dbHealth() {
    const start = Date.now();
    await this.dataSource.query('SELECT 1');
    const latency = Date.now() - start;

    return { status: 'up', latencyMs: latency };
  }

  @Get('redis')
  @ApiOperation({ summary: 'Redis health with latency' })
  async redisHealth() {
    const start = Date.now();
    await this.redis.ping();
    const latency = Date.now() - start;

    return { status: 'up', latencyMs: latency };
  }
}
