import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkflowDefinitionEntity,
  ActivityDefinitionEntity,
  TransitionDefinitionEntity,
  SlaDefinitionEntity,
} from '../../infrastructure/database/entities';
import { BpmnParserService } from './bpmn-parser.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowStatus, ErrorCodes, AuditAction, ActivityType } from '@flowengine/shared';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(WorkflowDefinitionEntity)
    private readonly workflowRepo: Repository<WorkflowDefinitionEntity>,
    @InjectRepository(ActivityDefinitionEntity)
    private readonly activityRepo: Repository<ActivityDefinitionEntity>,
    @InjectRepository(TransitionDefinitionEntity)
    private readonly transitionRepo: Repository<TransitionDefinitionEntity>,
    @InjectRepository(SlaDefinitionEntity)
    private readonly slaRepo: Repository<SlaDefinitionEntity>,
    private readonly bpmnParser: BpmnParserService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowDefinitionEntity> {
    // Check for duplicate name in this tenant
    const existing = await this.workflowRepo.findOne({
      where: { tenantId, name: dto.name, version: 1 },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.WF_DUPLICATE_NAME,
        message: `A workflow named "${dto.name}" already exists`,
      });
    }

    // Parse BPMN XML
    const parsed = await this.bpmnParser.parse(dto.bpmnXml);

    // Create workflow definition
    const workflow = this.workflowRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description || null,
      version: 1,
      status: WorkflowStatus.DRAFT,
      bpmnXml: dto.bpmnXml,
      parsedDefinition: parsed as unknown as Record<string, unknown>,
      createdBy: userId,
    });

    await this.workflowRepo.save(workflow);

    // Save activities
    const activityMap = new Map<string, ActivityDefinitionEntity>();
    for (const act of parsed.activities) {
      const entity = this.activityRepo.create({
        workflowDefinitionId: workflow.id,
        bpmnElementId: act.bpmnElementId,
        type: act.type,
        name: act.name,
        config: act.config,
        position: act.position,
      });
      const saved = await this.activityRepo.save(entity);
      activityMap.set(act.bpmnElementId, saved);
    }

    // Merge activity configs from DTO (overrides parsed config)
    await this.mergeActivityConfigs(activityMap, dto.activityConfigs);

    // Save transitions (resolve bpmn element refs to activity IDs)
    for (const trans of parsed.transitions) {
      const source = activityMap.get(trans.sourceRef);
      const target = activityMap.get(trans.targetRef);

      if (!source || !target) {
        this.logger.warn(
          `Transition ${trans.bpmnElementId} references unknown activity: source=${trans.sourceRef}, target=${trans.targetRef}`,
        );
        continue;
      }

      const entity = this.transitionRepo.create({
        workflowDefinitionId: workflow.id,
        bpmnElementId: trans.bpmnElementId,
        sourceActivityId: source.id,
        targetActivityId: target.id,
        conditionExpression: trans.conditionExpression,
        isDefault: trans.isDefault,
      });
      await this.transitionRepo.save(entity);
    }

    // Create SLA definitions
    await this.saveSlaDefinitions(activityMap, dto.slaDefinitions);

    this.logger.log(`Workflow created: ${workflow.name} (${workflow.id})`);

    this.auditService.log({
      tenantId,
      userId,
      action: AuditAction.WORKFLOW_CREATED,
      resourceType: 'workflow',
      resourceId: workflow.id,
      newValues: { name: dto.name, version: 1 },
    });

    return this.findOne(tenantId, workflow.id);
  }

  async findAll(
    tenantId: string,
    options: {
      status?: WorkflowStatus;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const { status, search, page = 1, pageSize = 20 } = options;

    const qb = this.workflowRepo
      .createQueryBuilder('w')
      .where('w.tenant_id = :tenantId', { tenantId })
      .orderBy('w.updated_at', 'DESC');

    if (status) {
      qb.andWhere('w.status = :status', { status });
    }

    if (search) {
      qb.andWhere('(w.name ILIKE :search OR w.description ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(tenantId: string, id: string): Promise<WorkflowDefinitionEntity> {
    const workflow = await this.workflowRepo.findOne({
      where: { id, tenantId },
      relations: ['activities', 'transitions'],
    });

    if (!workflow) {
      throw new NotFoundException({
        code: ErrorCodes.WF_NOT_FOUND,
        message: 'Workflow not found',
      });
    }

    return workflow;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWorkflowDto,
  ): Promise<WorkflowDefinitionEntity> {
    // Load WITHOUT relations to avoid cascade side-effects on save
    const workflow = await this.workflowRepo.findOne({
      where: { id, tenantId },
    });

    if (!workflow) {
      throw new NotFoundException({
        code: ErrorCodes.WF_NOT_FOUND,
        message: 'Workflow not found',
      });
    }

    if (workflow.status !== WorkflowStatus.DRAFT) {
      throw new BadRequestException({
        code: ErrorCodes.WF_NOT_DRAFT,
        message: 'Only draft workflows can be edited',
      });
    }

    if (dto.name) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description || null;

    if (dto.bpmnXml) {
      const parsed = await this.bpmnParser.parse(dto.bpmnXml);
      workflow.bpmnXml = dto.bpmnXml;
      workflow.parsedDefinition = parsed as unknown as Record<string, unknown>;

      // Delete existing transitions first (FK to activities), then activities
      await this.transitionRepo.delete({ workflowDefinitionId: workflow.id });
      await this.activityRepo.delete({ workflowDefinitionId: workflow.id });

      // Re-create activities
      const activityMap = new Map<string, ActivityDefinitionEntity>();
      for (const act of parsed.activities) {
        const entity = this.activityRepo.create({
          workflowDefinitionId: workflow.id,
          bpmnElementId: act.bpmnElementId,
          type: act.type,
          name: act.name,
          config: act.config,
          position: act.position,
        });
        const saved = await this.activityRepo.save(entity);
        activityMap.set(act.bpmnElementId, saved);
      }

      // Merge activity configs from DTO
      await this.mergeActivityConfigs(activityMap, dto.activityConfigs);

      // Re-create transitions
      for (const trans of parsed.transitions) {
        const source = activityMap.get(trans.sourceRef);
        const target = activityMap.get(trans.targetRef);
        if (!source || !target) continue;

        const entity = this.transitionRepo.create({
          workflowDefinitionId: workflow.id,
          bpmnElementId: trans.bpmnElementId,
          sourceActivityId: source.id,
          targetActivityId: target.id,
          conditionExpression: trans.conditionExpression,
          isDefault: trans.isDefault,
        });
        await this.transitionRepo.save(entity);
      }

      // Re-create SLA definitions (old ones were CASCADE-deleted with old activities)
      await this.saveSlaDefinitions(activityMap, dto.slaDefinitions);
    }

    await this.workflowRepo.save(workflow);

    this.auditService.log({
      tenantId,
      action: AuditAction.WORKFLOW_UPDATED,
      resourceType: 'workflow',
      resourceId: workflow.id,
      newValues: { name: workflow.name, hasBpmnUpdate: !!dto.bpmnXml },
    });

    return this.findOne(tenantId, workflow.id);
  }

  async publish(tenantId: string, id: string): Promise<WorkflowDefinitionEntity> {
    const workflow = await this.findOne(tenantId, id);

    if (workflow.status !== WorkflowStatus.DRAFT) {
      throw new BadRequestException({
        code: ErrorCodes.WF_NOT_DRAFT,
        message: 'Only draft workflows can be published',
      });
    }

    // Deprecate any previously published version with the same name
    await this.workflowRepo
      .createQueryBuilder()
      .update()
      .set({ status: WorkflowStatus.DEPRECATED })
      .where('tenant_id = :tenantId AND name = :name AND status = :published', {
        tenantId,
        name: workflow.name,
        published: WorkflowStatus.PUBLISHED,
      })
      .execute();

    workflow.status = WorkflowStatus.PUBLISHED;
    workflow.publishedAt = new Date();
    await this.workflowRepo.save(workflow);

    this.logger.log(`Workflow published: ${workflow.name} v${workflow.version}`);

    this.auditService.log({
      tenantId,
      action: AuditAction.WORKFLOW_PUBLISHED,
      resourceType: 'workflow',
      resourceId: workflow.id,
      newValues: { name: workflow.name, version: workflow.version },
    });

    return workflow;
  }

  async deprecate(tenantId: string, id: string): Promise<WorkflowDefinitionEntity> {
    const workflow = await this.findOne(tenantId, id);

    if (workflow.status !== WorkflowStatus.PUBLISHED) {
      throw new BadRequestException({
        code: 'WF_NOT_PUBLISHED',
        message: 'Only published workflows can be deprecated',
      });
    }

    workflow.status = WorkflowStatus.DEPRECATED;
    await this.workflowRepo.save(workflow);

    this.logger.log(`Workflow deprecated: ${workflow.name} v${workflow.version}`);

    this.auditService.log({
      tenantId,
      action: AuditAction.WORKFLOW_DEPRECATED,
      resourceType: 'workflow',
      resourceId: workflow.id,
    });

    return workflow;
  }

  async archive(tenantId: string, id: string): Promise<WorkflowDefinitionEntity> {
    const workflow = await this.findOne(tenantId, id);

    if (workflow.status !== WorkflowStatus.DEPRECATED && workflow.status !== WorkflowStatus.DRAFT) {
      throw new BadRequestException({
        code: 'WF_CANNOT_ARCHIVE',
        message: 'Only draft or deprecated workflows can be archived',
      });
    }

    workflow.status = WorkflowStatus.ARCHIVED;
    await this.workflowRepo.save(workflow);

    this.logger.log(`Workflow archived: ${workflow.name} v${workflow.version}`);

    this.auditService.log({
      tenantId,
      action: AuditAction.WORKFLOW_ARCHIVED,
      resourceType: 'workflow',
      resourceId: workflow.id,
    });

    return workflow;
  }

  async createNewVersion(tenantId: string, id: string): Promise<WorkflowDefinitionEntity> {
    const workflow = await this.findOne(tenantId, id);

    // Find the highest version for this workflow name
    const latest = await this.workflowRepo
      .createQueryBuilder('w')
      .where('w.tenant_id = :tenantId AND w.name = :name', { tenantId, name: workflow.name })
      .orderBy('w.version', 'DESC')
      .getOne();

    const newVersion = (latest?.version || 0) + 1;

    const newWorkflow = this.workflowRepo.create({
      tenantId,
      name: workflow.name,
      description: workflow.description,
      version: newVersion,
      status: WorkflowStatus.DRAFT,
      bpmnXml: workflow.bpmnXml,
      parsedDefinition: workflow.parsedDefinition,
      createdBy: workflow.createdBy,
    });

    await this.workflowRepo.save(newWorkflow);

    // Copy activities and build maps for transition + SLA copying
    const activityIdMap = new Map<string, string>(); // old ID → new ID
    const bpmnElementToNewId = new Map<string, string>(); // bpmnElementId → new activity ID
    const activities = await this.activityRepo.find({
      where: { workflowDefinitionId: workflow.id },
    });

    for (const act of activities) {
      const newAct = this.activityRepo.create({
        workflowDefinitionId: newWorkflow.id,
        bpmnElementId: act.bpmnElementId,
        type: act.type,
        name: act.name,
        config: act.config,
        position: act.position,
      });
      const saved = await this.activityRepo.save(newAct);
      activityIdMap.set(act.id, saved.id);
      bpmnElementToNewId.set(act.bpmnElementId, saved.id);
    }

    // Copy transitions
    const transitions = await this.transitionRepo.find({
      where: { workflowDefinitionId: workflow.id },
    });

    for (const trans of transitions) {
      const newSourceId = activityIdMap.get(trans.sourceActivityId);
      const newTargetId = activityIdMap.get(trans.targetActivityId);
      if (!newSourceId || !newTargetId) continue;

      const newTrans = this.transitionRepo.create({
        workflowDefinitionId: newWorkflow.id,
        bpmnElementId: trans.bpmnElementId,
        sourceActivityId: newSourceId,
        targetActivityId: newTargetId,
        conditionExpression: trans.conditionExpression,
        isDefault: trans.isDefault,
      });
      await this.transitionRepo.save(newTrans);
    }

    // Copy SLA definitions
    const oldActivityIds = activities.map((a) => a.id);
    if (oldActivityIds.length > 0) {
      const slaDefs = await this.slaRepo.find({
        where: oldActivityIds.map((aid) => ({ activityDefinitionId: aid })),
        relations: ['activityDefinition'],
      });

      for (const slaDef of slaDefs) {
        const newActId = activityIdMap.get(slaDef.activityDefinitionId);
        if (!newActId) continue;

        await this.slaRepo.save(
          this.slaRepo.create({
            activityDefinitionId: newActId,
            warningThresholdSeconds: slaDef.warningThresholdSeconds,
            breachThresholdSeconds: slaDef.breachThresholdSeconds,
            escalationRules: slaDef.escalationRules,
            notificationChannels: slaDef.notificationChannels,
          }),
        );
      }
    }

    this.logger.log(`New version created: ${newWorkflow.name} v${newVersion}`);
    return this.findOne(tenantId, newWorkflow.id);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const workflow = await this.findOne(tenantId, id);

    if (workflow.status === WorkflowStatus.PUBLISHED) {
      throw new BadRequestException({
        code: 'WF_CANNOT_DELETE_PUBLISHED',
        message: 'Published workflows cannot be deleted. Deprecate first.',
      });
    }

    const workflowId = workflow.id;
    await this.workflowRepo.remove(workflow);
    this.logger.log(`Workflow deleted: ${workflow.name} v${workflow.version}`);

    this.auditService.log({
      tenantId,
      action: AuditAction.WORKFLOW_DELETED,
      resourceType: 'workflow',
      resourceId: workflowId,
      oldValues: { name: workflow.name, version: workflow.version },
    });
  }

  async exportBpmn(tenantId: string, id: string): Promise<string> {
    const workflow = await this.findOne(tenantId, id);
    return workflow.bpmnXml;
  }

  async getActivityConfigs(tenantId: string, workflowId: string) {
    const workflow = await this.findOne(tenantId, workflowId);
    return workflow.activities.map((act) => ({
      bpmnElementId: act.bpmnElementId,
      config: act.config,
    }));
  }

  async getSlaDefinitions(tenantId: string, workflowId: string) {
    // Verify tenant access
    await this.findOne(tenantId, workflowId);

    const activities = await this.activityRepo.find({
      where: { workflowDefinitionId: workflowId },
    });

    if (activities.length === 0) return [];

    const slaDefs = await this.slaRepo.find({
      where: activities.map((a) => ({ activityDefinitionId: a.id })),
    });

    // Build activityId → bpmnElementId lookup
    const idToBpmn = new Map(activities.map((a) => [a.id, a.bpmnElementId]));

    return slaDefs.map((sla) => ({
      bpmnElementId: idToBpmn.get(sla.activityDefinitionId) || '',
      warningThresholdSeconds: sla.warningThresholdSeconds,
      breachThresholdSeconds: sla.breachThresholdSeconds,
      escalationRules: sla.escalationRules,
      notificationChannels: sla.notificationChannels,
    }));
  }

  private async mergeActivityConfigs(
    activityMap: Map<string, ActivityDefinitionEntity>,
    activityConfigs?: { bpmnElementId: string; config: Record<string, unknown> }[],
  ) {
    if (!activityConfigs?.length) return;

    for (const ac of activityConfigs) {
      const activity = activityMap.get(ac.bpmnElementId);
      if (activity && ac.config) {
        activity.config = { ...activity.config, ...ac.config };
        await this.activityRepo.save(activity);
      }
    }
  }

  private async saveSlaDefinitions(
    activityMap: Map<string, ActivityDefinitionEntity>,
    slaDefinitions?: {
      bpmnElementId: string;
      warningThresholdSeconds?: number | null;
      breachThresholdSeconds: number;
      escalationRules?: Record<string, unknown>[];
      notificationChannels?: string[];
    }[],
  ) {
    if (!slaDefinitions?.length) return;

    for (const slaDef of slaDefinitions) {
      if (slaDef.breachThresholdSeconds <= 0) {
        throw new BadRequestException({
          code: 'WF_INVALID_SLA',
          message: `SLA breach threshold must be greater than 0 for element "${slaDef.bpmnElementId}"`,
        });
      }
      if (
        slaDef.warningThresholdSeconds != null &&
        slaDef.warningThresholdSeconds >= slaDef.breachThresholdSeconds
      ) {
        throw new BadRequestException({
          code: 'WF_INVALID_SLA',
          message: `SLA warning threshold must be less than breach threshold for element "${slaDef.bpmnElementId}"`,
        });
      }

      const activity = activityMap.get(slaDef.bpmnElementId);
      if (activity) {
        await this.slaRepo.save(
          this.slaRepo.create({
            activityDefinitionId: activity.id,
            warningThresholdSeconds: slaDef.warningThresholdSeconds ?? null,
            breachThresholdSeconds: slaDef.breachThresholdSeconds,
            escalationRules: (slaDef.escalationRules ?? []) as Record<string, unknown>[],
            notificationChannels: (slaDef.notificationChannels ?? []) as string[],
          }),
        );
      }
    }
  }

  async validateBpmn(bpmnXml: string): Promise<{
    valid: boolean;
    errors: { type: string; message: string; elementId?: string }[];
    warnings: { type: string; message: string; elementId?: string }[];
    stats: { activities: number; transitions: number; processId?: string };
  }> {
    const errors: { type: string; message: string; elementId?: string }[] = [];
    const warnings: { type: string; message: string; elementId?: string }[] = [];
    let stats = { activities: 0, transitions: 0, processId: undefined as string | undefined };

    // Try parsing the BPMN XML
    let parsed;
    try {
      parsed = await this.bpmnParser.parse(bpmnXml);
    } catch (err: any) {
      const message = err?.response?.message || err?.message || 'Invalid BPMN XML';
      errors.push({ type: 'parse', message });
      return { valid: false, errors, warnings, stats };
    }

    stats = {
      activities: parsed.activities.length,
      transitions: parsed.transitions.length,
      processId: parsed.processId,
    };

    // Build adjacency for connectivity checks
    const activityIds = new Set(parsed.activities.map((a) => a.bpmnElementId));
    const incomingCount = new Map<string, number>();
    const outgoingCount = new Map<string, number>();
    for (const a of parsed.activities) {
      incomingCount.set(a.bpmnElementId, 0);
      outgoingCount.set(a.bpmnElementId, 0);
    }

    for (const t of parsed.transitions) {
      if (!activityIds.has(t.sourceRef)) {
        errors.push({
          type: 'reference',
          message: `Transition "${t.bpmnElementId}" references unknown source "${t.sourceRef}"`,
          elementId: t.bpmnElementId,
        });
      } else {
        outgoingCount.set(t.sourceRef, (outgoingCount.get(t.sourceRef) || 0) + 1);
      }
      if (!activityIds.has(t.targetRef)) {
        errors.push({
          type: 'reference',
          message: `Transition "${t.bpmnElementId}" references unknown target "${t.targetRef}"`,
          elementId: t.bpmnElementId,
        });
      } else {
        incomingCount.set(t.targetRef, (incomingCount.get(t.targetRef) || 0) + 1);
      }
    }

    // Check each activity for structural issues
    for (const act of parsed.activities) {
      const incoming = incomingCount.get(act.bpmnElementId) || 0;
      const outgoing = outgoingCount.get(act.bpmnElementId) || 0;

      if (act.type === ActivityType.START_EVENT) {
        if (incoming > 0) {
          warnings.push({
            type: 'structure',
            message: `Start Event "${act.name || act.bpmnElementId}" should not have incoming flows`,
            elementId: act.bpmnElementId,
          });
        }
        if (outgoing === 0) {
          errors.push({
            type: 'structure',
            message: `Start Event "${act.name || act.bpmnElementId}" has no outgoing flow`,
            elementId: act.bpmnElementId,
          });
        }
      } else if (act.type === ActivityType.END_EVENT) {
        if (outgoing > 0) {
          warnings.push({
            type: 'structure',
            message: `End Event "${act.name || act.bpmnElementId}" should not have outgoing flows`,
            elementId: act.bpmnElementId,
          });
        }
        if (incoming === 0) {
          errors.push({
            type: 'structure',
            message: `End Event "${act.name || act.bpmnElementId}" has no incoming flow`,
            elementId: act.bpmnElementId,
          });
        }
      } else if (act.type === ActivityType.EXCLUSIVE_GATEWAY) {
        if (outgoing > 1) {
          // Check that outgoing transitions (except default) have conditions
          const outgoingTransitions = parsed.transitions.filter(
            (t) => t.sourceRef === act.bpmnElementId,
          );
          const nonDefaultWithoutCondition = outgoingTransitions.filter(
            (t) => !t.isDefault && !t.conditionExpression,
          );
          if (nonDefaultWithoutCondition.length > 0) {
            warnings.push({
              type: 'condition',
              message: `Exclusive Gateway "${act.name || act.bpmnElementId}" has ${nonDefaultWithoutCondition.length} outgoing flow(s) without conditions`,
              elementId: act.bpmnElementId,
            });
          }
        }
      } else {
        // Regular tasks should be connected
        if (incoming === 0) {
          warnings.push({
            type: 'structure',
            message: `"${act.name || act.bpmnElementId}" has no incoming flow (unreachable)`,
            elementId: act.bpmnElementId,
          });
        }
        if (outgoing === 0) {
          warnings.push({
            type: 'structure',
            message: `"${act.name || act.bpmnElementId}" has no outgoing flow (dead end)`,
            elementId: act.bpmnElementId,
          });
        }
      }

      // Check unnamed tasks
      if (!act.name && act.type !== ActivityType.START_EVENT && act.type !== ActivityType.END_EVENT) {
        warnings.push({
          type: 'naming',
          message: `${act.type} "${act.bpmnElementId}" has no name`,
          elementId: act.bpmnElementId,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats,
    };
  }
}
