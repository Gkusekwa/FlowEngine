import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuditModule } from './modules/audit/audit.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { TaskModule } from './modules/task/task.module';
import { SlaModule } from './modules/sla/sla.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { QueueModule } from './infrastructure/queues/queue.module';
import { EngineModule } from './engine/engine.module';
import { WorkersModule } from './workers/workers.module';
import { HealthModule } from './infrastructure/health/health.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Infrastructure
    DatabaseModule,
    RedisModule,
    HealthModule,

    // Queues
    QueueModule,

    // Domain modules
    AuthModule,
    TenantModule,
    AuditModule,
    WorkflowModule,
    ExecutionModule,
    TaskModule,
    SlaModule,

    // Real-time
    WebsocketModule,

    // Engine & Workers
    EngineModule,
    WorkersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer
      .apply(TenantContextMiddleware)
      .exclude('api/v1/auth/(.*)', 'api/v1/health(.*)')
      .forRoutes('*');
  }
}
