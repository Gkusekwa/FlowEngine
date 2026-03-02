import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowInstanceEntity } from '../infrastructure/database/entities/workflow-instance.entity';
import { TaskInstanceEntity } from '../infrastructure/database/entities/task-instance.entity';
import { ExecutionTokenEntity } from '../infrastructure/database/entities/execution-token.entity';
import { TaskStateHistoryEntity } from '../infrastructure/database/entities/task-state-history.entity';
import { ActivityDefinitionEntity } from '../infrastructure/database/entities/activity-definition.entity';
import { TransitionDefinitionEntity } from '../infrastructure/database/entities/transition-definition.entity';
import { ExecutionEngineService } from './execution-engine.service';
import { TaskExecutorRegistry } from './task-executor.registry';
import { TokenManager } from './token.manager';
import { VariableManager } from './variable.manager';
import { GatewayEvaluator } from './gateway.evaluator';
import { StartEventHandler } from './handlers/start-event.handler';
import { EndEventHandler } from './handlers/end-event.handler';
import { UserTaskHandler } from './handlers/user-task.handler';
import { ServiceTaskHandler } from './handlers/service-task.handler';
import { SsrfGuard } from './http/ssrf.guard';
import { HttpServiceExecutor } from './http/http-service.executor';
import { ActivityType } from '@flowengine/shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowInstanceEntity,
      TaskInstanceEntity,
      ExecutionTokenEntity,
      TaskStateHistoryEntity,
      ActivityDefinitionEntity,
      TransitionDefinitionEntity,
    ]),
  ],
  providers: [
    ExecutionEngineService,
    TaskExecutorRegistry,
    TokenManager,
    VariableManager,
    GatewayEvaluator,
    StartEventHandler,
    EndEventHandler,
    UserTaskHandler,
    ServiceTaskHandler,
    SsrfGuard,
    HttpServiceExecutor,
  ],
  exports: [
    ExecutionEngineService,
    TaskExecutorRegistry,
    TokenManager,
    VariableManager,
    HttpServiceExecutor,
  ],
})
export class EngineModule implements OnModuleInit {
  constructor(
    private readonly registry: TaskExecutorRegistry,
    private readonly startEventHandler: StartEventHandler,
    private readonly endEventHandler: EndEventHandler,
    private readonly userTaskHandler: UserTaskHandler,
    private readonly serviceTaskHandler: ServiceTaskHandler,
  ) {}

  onModuleInit() {
    this.registry.register(ActivityType.START_EVENT, this.startEventHandler);
    this.registry.register(ActivityType.END_EVENT, this.endEventHandler);
    this.registry.register(ActivityType.USER_TASK, this.userTaskHandler);
    this.registry.register(ActivityType.SERVICE_TASK, this.serviceTaskHandler);
  }
}
