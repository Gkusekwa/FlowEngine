import { Entity, Column, ManyToOne, JoinColumn, Index, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { TaskInstanceEntity } from './task-instance.entity';
import { SlaDefinitionEntity } from './sla-definition.entity';
import { UserEntity } from './user.entity';
import { SlaEventType } from '@flowengine/shared';

@Entity('sla_events')
@Index(['taskInstanceId'])
@Index(['eventType'])
@Index(['createdAt'])
@Index(['acknowledged', 'createdAt'])
export class SlaEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_instance_id', type: 'uuid' })
  taskInstanceId: string;

  @Column({ name: 'sla_definition_id', type: 'uuid', nullable: true })
  slaDefinitionId: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: SlaEventType;

  @Column({ name: 'threshold_seconds', type: 'int' })
  thresholdSeconds: number;

  @Column({ name: 'actual_duration_seconds', type: 'int', nullable: true })
  actualDurationSeconds: number | null;

  @Column({ name: 'escalation_level', type: 'int', default: 0 })
  escalationLevel: number;

  @Column({ name: 'notification_sent', type: 'boolean', default: false })
  notificationSent: boolean;

  @Column({ name: 'notification_sent_at', type: 'timestamptz', nullable: true })
  notificationSentAt: Date | null;

  @Column({ type: 'boolean', default: false })
  acknowledged: boolean;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy: string | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => TaskInstanceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_instance_id' })
  taskInstance: TaskInstanceEntity;

  @ManyToOne(() => SlaDefinitionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sla_definition_id' })
  slaDefinition: SlaDefinitionEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'acknowledged_by' })
  acknowledger: UserEntity | null;
}
