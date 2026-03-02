import { Entity, Column, OneToOne, JoinColumn, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ActivityDefinitionEntity } from './activity-definition.entity';

@Entity('sla_definitions')
@Index(['activityDefinitionId'], { unique: true })
export class SlaDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'activity_definition_id', type: 'uuid' })
  activityDefinitionId: string;

  @Column({ name: 'warning_threshold_seconds', type: 'int', nullable: true })
  warningThresholdSeconds: number | null;

  @Column({ name: 'breach_threshold_seconds', type: 'int' })
  breachThresholdSeconds: number;

  @Column({ name: 'escalation_rules', type: 'jsonb', default: '[]' })
  escalationRules: Record<string, unknown>[];

  @Column({ name: 'notification_channels', type: 'jsonb', default: '[]' })
  notificationChannels: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => ActivityDefinitionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_definition_id' })
  activityDefinition: ActivityDefinitionEntity;
}
