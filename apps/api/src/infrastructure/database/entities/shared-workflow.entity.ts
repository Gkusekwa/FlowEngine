import {
  Entity,
  Column,
  Index,
} from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('shared_workflows')
@Index('idx_shared_workflows_category', ['category'])
@Index('idx_shared_workflows_source_tenant', ['sourceTenantId'])
@Index('idx_shared_workflows_created_at', ['createdAt'])
@Index('idx_shared_workflows_active_source', ['sourceWorkflowDefinitionId'], {
  unique: true,
  where: '"is_active" = true',
})
export class SharedWorkflowEntity extends BaseEntity {
  @Column({ name: 'source_workflow_definition_id', type: 'uuid', nullable: true })
  sourceWorkflowDefinitionId: string | null;

  @Column({ name: 'source_tenant_id', type: 'uuid', nullable: true })
  sourceTenantId: string | null;

  @Column({ name: 'shared_by_user_id', type: 'uuid', nullable: true })
  sharedByUserId: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'bpmn_xml', type: 'text' })
  bpmnXml: string;

  @Column({ name: 'parsed_definition', type: 'jsonb', default: {} })
  parsedDefinition: Record<string, unknown>;

  @Column({ name: 'activity_configs', type: 'jsonb', default: [] })
  activityConfigs: { bpmnElementId: string; type: string; name: string | null; config: Record<string, unknown> }[];

  @Column({ name: 'sla_configs', type: 'jsonb', default: [] })
  slaConfigs: { bpmnElementId: string; warningThresholdSeconds?: number | null; breachThresholdSeconds: number; escalationRules?: Record<string, unknown>[]; notificationChannels?: string[] }[];

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @Column({ name: 'source_version', type: 'integer', default: 1 })
  sourceVersion: number;

  @Column({ name: 'source_tenant_name', type: 'varchar', length: 255 })
  sourceTenantName: string;

  @Column({ name: 'shared_by_user_name', type: 'varchar', length: 255 })
  sharedByUserName: string;

  @Column({ name: 'import_count', type: 'integer', default: 0 })
  importCount: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
