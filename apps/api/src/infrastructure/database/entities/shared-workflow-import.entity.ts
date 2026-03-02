import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
// ManyToOne and JoinColumn are needed for the sharedWorkflow relation
import { BaseEntity } from './base.entity';
import { SharedWorkflowEntity } from './shared-workflow.entity';

@Entity('shared_workflow_imports')
@Index('idx_shared_imports_shared_workflow', ['sharedWorkflowId'])
@Index('idx_shared_imports_tenant', ['importedByTenantId'])
export class SharedWorkflowImportEntity extends BaseEntity {
  @Column({ name: 'shared_workflow_id', type: 'uuid' })
  sharedWorkflowId: string;

  @Column({ name: 'imported_by_tenant_id', type: 'uuid' })
  importedByTenantId: string;

  @Column({ name: 'imported_by_user_id', type: 'uuid', nullable: true })
  importedByUserId: string | null;

  @Column({ name: 'created_workflow_definition_id', type: 'uuid', nullable: true })
  createdWorkflowDefinitionId: string | null;

  @Column({ name: 'imported_at', type: 'timestamptz', default: () => 'NOW()' })
  importedAt: Date;

  @ManyToOne(() => SharedWorkflowEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shared_workflow_id' })
  sharedWorkflow: SharedWorkflowEntity;
}
