import { Entity, Column, ManyToOne, JoinColumn, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { WorkflowDefinitionEntity } from './workflow-definition.entity';
import { ActivityDefinitionEntity } from './activity-definition.entity';

@Entity('transition_definitions')
@Index(['workflowDefinitionId', 'bpmnElementId'], { unique: true })
@Index(['sourceActivityId'])
@Index(['targetActivityId'])
export class TransitionDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_definition_id', type: 'uuid' })
  workflowDefinitionId: string;

  @Column({ name: 'bpmn_element_id', type: 'varchar', length: 255 })
  bpmnElementId: string;

  @Column({ name: 'source_activity_id', type: 'uuid' })
  sourceActivityId: string;

  @Column({ name: 'target_activity_id', type: 'uuid' })
  targetActivityId: string;

  @Column({ name: 'condition_expression', type: 'text', nullable: true })
  conditionExpression: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WorkflowDefinitionEntity, (w) => w.transitions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_definition_id' })
  workflowDefinition: WorkflowDefinitionEntity;

  @ManyToOne(() => ActivityDefinitionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_activity_id' })
  sourceActivity: ActivityDefinitionEntity;

  @ManyToOne(() => ActivityDefinitionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_activity_id' })
  targetActivity: ActivityDefinitionEntity;
}
