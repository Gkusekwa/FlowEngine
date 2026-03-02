import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskInstanceEntity } from '../../infrastructure/database/entities/task-instance.entity';
import { TaskStateHistoryEntity } from '../../infrastructure/database/entities/task-state-history.entity';
import { ActivityDefinitionEntity } from '../../infrastructure/database/entities/activity-definition.entity';
import { EngineModule } from '../../engine/engine.module';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskInstanceEntity,
      TaskStateHistoryEntity,
      ActivityDefinitionEntity,
    ]),
    EngineModule,
  ],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
