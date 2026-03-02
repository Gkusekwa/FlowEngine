import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { WorkflowDefinitionEntity } from './workflow-definition.entity';
import { TaskInstanceEntity } from './task-instance.entity';
import { ExecutionTokenEntity } from './execution-token.entity';
import { InstanceStatus } from '@flowengine/shared';

@Entity('workflow_instances')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'workflowDefinitionId'])
@Index(['correlationId'])
export class WorkflowInstanceEntity extends TenantBaseEntity {
  @Column({ name: 'workflow_definition_id', type: 'uuid' })
  workflowDefinitionId: string;

  @Column({ type: 'varchar', length: 50, default: InstanceStatus.CREATED })
  status: InstanceStatus;

  @Column({ type: 'jsonb', default: '{}' })
  variables: Record<string, unknown>;

  @Column({ name: 'started_by', type: 'uuid', nullable: true })
  startedBy: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 255, nullable: true })
  correlationId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @ManyToOne(() => WorkflowDefinitionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_definition_id' })
  workflowDefinition: WorkflowDefinitionEntity;

  @OneToMany(() => TaskInstanceEntity, (t) => t.workflowInstance)
  tasks: TaskInstanceEntity[];

  @OneToMany(() => ExecutionTokenEntity, (t) => t.workflowInstance)
  tokens: ExecutionTokenEntity[];
}
