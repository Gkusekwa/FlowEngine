import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  WorkflowDefinitionEntity,
  ActivityDefinitionEntity,
  TransitionDefinitionEntity,
  SlaDefinitionEntity,
} from '../../infrastructure/database/entities';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { BpmnParserService } from './bpmn-parser.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowDefinitionEntity,
      ActivityDefinitionEntity,
      TransitionDefinitionEntity,
      SlaDefinitionEntity,
    ]),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, BpmnParserService],
  exports: [WorkflowService, BpmnParserService],
})
export class WorkflowModule {}
