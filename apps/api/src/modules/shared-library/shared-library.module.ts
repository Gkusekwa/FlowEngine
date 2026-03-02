import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SharedWorkflowEntity,
  SharedWorkflowImportEntity,
  WorkflowDefinitionEntity,
  ActivityDefinitionEntity,
  TransitionDefinitionEntity,
  SlaDefinitionEntity,
  TenantEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { SharedLibraryService } from './shared-library.service';
import { SharedLibraryController } from './shared-library.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SharedWorkflowEntity,
      SharedWorkflowImportEntity,
      WorkflowDefinitionEntity,
      ActivityDefinitionEntity,
      TransitionDefinitionEntity,
      SlaDefinitionEntity,
      TenantEntity,
      UserEntity,
    ]),
    WorkflowModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [SharedLibraryController],
  providers: [SharedLibraryService],
  exports: [SharedLibraryService],
})
export class SharedLibraryModule {}
