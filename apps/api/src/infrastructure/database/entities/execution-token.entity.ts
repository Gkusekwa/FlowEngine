import { Entity, Column, ManyToOne, JoinColumn, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { WorkflowInstanceEntity } from './workflow-instance.entity';
import { TokenStatus } from '@flowengine/shared';

@Entity('execution_tokens')
@Index(['workflowInstanceId', 'status'])
@Index(['currentActivityId'])
export class ExecutionTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_instance_id', type: 'uuid' })
  workflowInstanceId: string;

  @Column({ name: 'parent_token_id', type: 'uuid', nullable: true })
  parentTokenId: string | null;

  @Column({ name: 'current_activity_id', type: 'uuid', nullable: true })
  currentActivityId: string | null;

  @Column({ type: 'varchar', length: 50, default: TokenStatus.ACTIVE })
  status: TokenStatus;

  @Column({ name: 'fork_gateway_id', type: 'uuid', nullable: true })
  forkGatewayId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => WorkflowInstanceEntity, (i) => i.tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_instance_id' })
  workflowInstance: WorkflowInstanceEntity;

  @ManyToOne(() => ExecutionTokenEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_token_id' })
  parentToken: ExecutionTokenEntity | null;
}
