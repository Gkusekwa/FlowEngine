import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngineModule } from '../engine/engine.module';
import { ExecutionWorker } from './execution.worker';
import { TaskWorker } from './task.worker';
import { SlaWorker } from './sla.worker';
import { TaskInstanceEntity } from '../infrastructure/database/entities/task-instance.entity';
import { TaskStateHistoryEntity } from '../infrastructure/database/entities/task-state-history.entity';
import { ActivityDefinitionEntity } from '../infrastructure/database/entities/activity-definition.entity';
import { SlaEventEntity } from '../infrastructure/database/entities/sla-event.entity';
import { SlaDefinitionEntity } from '../infrastructure/database/entities/sla-definition.entity';

@Module({
  imports: [
    EngineModule,
    TypeOrmModule.forFeature([
      TaskInstanceEntity,
      TaskStateHistoryEntity,
      ActivityDefinitionEntity,
      SlaEventEntity,
      SlaDefinitionEntity,
    ]),
  ],
  providers: [ExecutionWorker, TaskWorker, SlaWorker],
})
export class WorkersModule {}
