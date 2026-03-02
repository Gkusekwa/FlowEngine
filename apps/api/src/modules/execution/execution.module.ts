import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowInstanceEntity } from '../../infrastructure/database/entities/workflow-instance.entity';
import { WorkflowDefinitionEntity } from '../../infrastructure/database/entities/workflow-definition.entity';
import { TaskInstanceEntity } from '../../infrastructure/database/entities/task-instance.entity';
import { ExecutionTokenEntity } from '../../infrastructure/database/entities/execution-token.entity';
import { TaskStateHistoryEntity } from '../../infrastructure/database/entities/task-state-history.entity';
import { EngineModule } from '../../engine/engine.module';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowInstanceEntity,
      WorkflowDefinitionEntity,
      TaskInstanceEntity,
      ExecutionTokenEntity,
      TaskStateHistoryEntity,
    ]),
    EngineModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
