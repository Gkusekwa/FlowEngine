import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { UserEntity } from './user.entity';
import { ActivityDefinitionEntity } from './activity-definition.entity';
import { TransitionDefinitionEntity } from './transition-definition.entity';
import { WorkflowStatus } from '@flowengine/shared';

@Entity('workflow_definitions')
@Index(['tenantId', 'name', 'version'], { unique: true })
@Index(['tenantId', 'status'])
@Index(['tenantId', 'name'])
@Index(['tenantId', 'createdAt'])
export class WorkflowDefinitionEntity extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 50, default: WorkflowStatus.DRAFT })
  status: WorkflowStatus;

  @Column({ name: 'bpmn_xml', type: 'text' })
  bpmnXml: string;

  @Column({ name: 'parsed_definition', type: 'jsonb', default: '{}' })
  parsedDefinition: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity;

  @OneToMany(() => ActivityDefinitionEntity, (a) => a.workflowDefinition, { cascade: true })
  activities: ActivityDefinitionEntity[];

  @OneToMany(() => TransitionDefinitionEntity, (t) => t.workflowDefinition, { cascade: true })
  transitions: TransitionDefinitionEntity[];
}
