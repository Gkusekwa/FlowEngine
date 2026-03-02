import { Entity, Column, ManyToOne, JoinColumn, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { TaskInstanceEntity } from './task-instance.entity';
import { TaskStatus } from '@flowengine/shared';

@Entity('task_state_history')
@Index(['taskInstanceId', 'changedAt'])
export class TaskStateHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_instance_id', type: 'uuid' })
  taskInstanceId: string;

  @Column({ name: 'from_status', type: 'varchar', length: 50, nullable: true })
  fromStatus: TaskStatus | null;

  @Column({ name: 'to_status', type: 'varchar', length: 50 })
  toStatus: TaskStatus;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy: string | null;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @ManyToOne(() => TaskInstanceEntity, (t) => t.stateHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_instance_id' })
  taskInstance: TaskInstanceEntity;
}
