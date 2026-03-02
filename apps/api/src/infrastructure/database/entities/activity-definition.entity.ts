import { Entity, Column, ManyToOne, OneToOne, JoinColumn, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { WorkflowDefinitionEntity } from './workflow-definition.entity';
import { ActivityType } from '@flowengine/shared';

@Entity('activity_definitions')
@Index(['workflowDefinitionId', 'bpmnElementId'], { unique: true })
@Index(['type'])
export class ActivityDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_definition_id', type: 'uuid' })
  workflowDefinitionId: string;

  @Column({ name: 'bpmn_element_id', type: 'varchar', length: 255 })
  bpmnElementId: string;

  @Column({ type: 'varchar', length: 100 })
  type: ActivityType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  config: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{"x": 0, "y": 0}' })
  position: { x: number; y: number };

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WorkflowDefinitionEntity, (w) => w.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_definition_id' })
  workflowDefinition: WorkflowDefinitionEntity;
}
