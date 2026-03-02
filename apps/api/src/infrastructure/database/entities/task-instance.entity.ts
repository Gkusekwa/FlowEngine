import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { WorkflowInstanceEntity } from './workflow-instance.entity';
import { ActivityDefinitionEntity } from './activity-definition.entity';
import { TaskStateHistoryEntity } from './task-state-history.entity';
import { TaskStatus } from '@flowengine/shared';

@Entity('task_instances')
@Index(['tenantId', 'assignedTo', 'status'])
@Index(['tenantId', 'assignedGroup', 'status'])
@Index(['workflowInstanceId', 'status'])
export class TaskInstanceEntity extends TenantBaseEntity {
  @Column({ name: 'workflow_instance_id', type: 'uuid' })
  workflowInstanceId: string;

  @Column({ name: 'activity_definition_id', type: 'uuid' })
  activityDefinitionId: string;

  @Column({ name: 'token_id', type: 'uuid', nullable: true })
  tokenId: string | null;

  @Column({ type: 'varchar', length: 50, default: TaskStatus.PENDING })
  status: TaskStatus;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ name: 'assigned_group', type: 'varchar', length: 255, nullable: true })
  assignedGroup: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  variables: Record<string, unknown>;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy: string | null;

  @Column({ name: 'completion_result', type: 'jsonb', nullable: true })
  completionResult: Record<string, unknown> | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @ManyToOne(() => WorkflowInstanceEntity, (i) => i.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_instance_id' })
  workflowInstance: WorkflowInstanceEntity;

  @ManyToOne(() => ActivityDefinitionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_definition_id' })
  activityDefinition: ActivityDefinitionEntity;

  @OneToMany(() => TaskStateHistoryEntity, (h) => h.taskInstance)
  stateHistory: TaskStateHistoryEntity[];
}
