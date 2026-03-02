import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SharedWorkflowEntity,
  SharedWorkflowImportEntity,
  WorkflowDefinitionEntity,
  ActivityDefinitionEntity,
  TransitionDefinitionEntity,
  SlaDefinitionEntity,
  TenantEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { BpmnParserService } from '../workflow/bpmn-parser.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowStatus, AuditAction, PaginatedResponse } from '@flowengine/shared';
import { ShareWorkflowDto } from './dto/share-workflow.dto';
import { UpdateSharedWorkflowDto } from './dto/update-shared.dto';
import { BrowseLibraryDto } from './dto/browse-library.dto';

@Injectable()
export class SharedLibraryService {
  private readonly logger = new Logger(SharedLibraryService.name);

  constructor(
    @InjectRepository(SharedWorkflowEntity)
    private readonly sharedRepo: Repository<SharedWorkflowEntity>,
    @InjectRepository(SharedWorkflowImportEntity)
    private readonly importRepo: Repository<SharedWorkflowImportEntity>,
    @InjectRepository(WorkflowDefinitionEntity)
    private readonly workflowRepo: Repository<WorkflowDefinitionEntity>,
    @InjectRepository(ActivityDefinitionEntity)
    private readonly activityRepo: Repository<ActivityDefinitionEntity>,
    @InjectRepository(TransitionDefinitionEntity)
    private readonly transitionRepo: Repository<TransitionDefinitionEntity>,
    @InjectRepository(SlaDefinitionEntity)
    private readonly slaRepo: Repository<SlaDefinitionEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly bpmnParser: BpmnParserService,
    private readonly auditService: AuditService,
  ) {}

  async share(
    tenantId: string,
    userId: string,
    dto: ShareWorkflowDto,
  ): Promise<SharedWorkflowEntity> {
    // Load workflow with activities
    const workflow = await this.workflowRepo.findOne({
      where: { id: dto.workflowDefinitionId, tenantId },
      relations: ['activities'],
    });

    if (!workflow) {
      throw new NotFoundException({ message: 'Workflow not found' });
    }

    if (workflow.status !== WorkflowStatus.PUBLISHED) {
      throw new BadRequestException({
        message: 'Only published workflows can be shared to the library',
      });
    }

    // Check if already shared
    const existing = await this.sharedRepo.findOne({
      where: {
        sourceWorkflowDefinitionId: workflow.id,
        isActive: true,
      },
    });
    if (existing) {
      throw new BadRequestException({
        message: 'This workflow is already shared to the library',
      });
    }

    // Get tenant and user info for denormalized fields
    const [tenant, user] = await Promise.all([
      this.tenantRepo.findOne({ where: { id: tenantId } }),
      this.userRepo.findOne({ where: { id: userId } }),
    ]);

    // Build activity configs snapshot
    const activityConfigs: SharedWorkflowEntity['activityConfigs'] = workflow.activities.map((act) => ({
      bpmnElementId: act.bpmnElementId,
      type: act.type as string,
      name: act.name,
      config: act.config,
    }));

    // Build SLA configs snapshot
    const activityIds = workflow.activities.map((a) => a.id);
    let slaConfigs: SharedWorkflowEntity['slaConfigs'] = [];
    if (activityIds.length > 0) {
      const slaDefs = await this.slaRepo.find({
        where: activityIds.map((aid) => ({ activityDefinitionId: aid })),
      });
      const idToBpmn = new Map(workflow.activities.map((a) => [a.id, a.bpmnElementId]));
      slaConfigs = slaDefs.map((sla) => ({
        bpmnElementId: idToBpmn.get(sla.activityDefinitionId) || '',
        warningThresholdSeconds: sla.warningThresholdSeconds,
        breachThresholdSeconds: sla.breachThresholdSeconds,
        escalationRules: (sla.escalationRules || []) as Record<string, unknown>[],
        notificationChannels: (sla.notificationChannels || []) as string[],
      }));
    }

    const shared = this.sharedRepo.create({
      sourceWorkflowDefinitionId: workflow.id,
      sourceTenantId: tenantId,
      sharedByUserId: userId,
      name: workflow.name,
      description: dto.description ?? workflow.description,
      bpmnXml: workflow.bpmnXml,
      parsedDefinition: workflow.parsedDefinition,
      activityConfigs,
      slaConfigs,
      category: dto.category || null,
      tags: dto.tags || [],
      sourceVersion: workflow.version,
      sourceTenantName: tenant?.name || 'Unknown',
      sharedByUserName: user?.name || 'Unknown',
      importCount: 0,
      isActive: true,
    });

    const saved = await this.sharedRepo.save(shared);

    this.logger.log(`Workflow shared to library: ${workflow.name} by tenant ${tenantId}`);

    this.auditService.log({
      tenantId,
      userId,
      action: AuditAction.LIBRARY_WORKFLOW_SHARED,
      resourceType: 'shared_workflow',
      resourceId: saved.id,
      newValues: { workflowName: workflow.name, category: dto.category },
    });

    return saved;
  }

  async update(
    tenantId: string,
    sharedId: string,
    dto: UpdateSharedWorkflowDto,
  ): Promise<SharedWorkflowEntity> {
    const shared = await this.sharedRepo.findOne({
      where: { id: sharedId, isActive: true },
    });

    if (!shared) {
      throw new NotFoundException({ message: 'Shared workflow not found' });
    }

    if (shared.sourceTenantId !== tenantId) {
      throw new ForbiddenException({
        message: 'Only the source tenant can update a shared workflow',
      });
    }

    if (dto.category !== undefined) shared.category = dto.category || null;
    if (dto.tags !== undefined) shared.tags = dto.tags;
    if (dto.description !== undefined) shared.description = dto.description || null;

    return this.sharedRepo.save(shared);
  }

  async unshare(tenantId: string, userId: string, sharedId: string): Promise<void> {
    const shared = await this.sharedRepo.findOne({
      where: { id: sharedId, isActive: true },
    });

    if (!shared) {
      throw new NotFoundException({ message: 'Shared workflow not found' });
    }

    if (shared.sourceTenantId !== tenantId) {
      throw new ForbiddenException({
        message: 'Only the source tenant can unshare a workflow',
      });
    }

    shared.isActive = false;
    await this.sharedRepo.save(shared);

    this.logger.log(`Workflow unshared from library: ${shared.name} by tenant ${tenantId}`);

    this.auditService.log({
      tenantId,
      userId,
      action: AuditAction.LIBRARY_WORKFLOW_UNSHARED,
      resourceType: 'shared_workflow',
      resourceId: sharedId,
    });
  }

  async browse(query: BrowseLibraryDto): Promise<PaginatedResponse<SharedWorkflowEntity>> {
    const { search, category, tag, sortBy = 'newest', page = 1, pageSize = 20 } = query;

    const qb = this.sharedRepo
      .createQueryBuilder('sw')
      .where('sw.is_active = true');

    if (search) {
      qb.andWhere(
        '(sw.name ILIKE :search OR sw.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (category) {
      qb.andWhere('sw.category = :category', { category });
    }

    if (tag) {
      qb.andWhere('sw.tags @> :tag', { tag: JSON.stringify([tag]) });
    }

    switch (sortBy) {
      case 'popular':
        qb.orderBy('sw.import_count', 'DESC');
        break;
      case 'name':
        qb.orderBy('sw.name', 'ASC');
        break;
      case 'newest':
      default:
        qb.orderBy('sw.created_at', 'DESC');
        break;
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

  async findOne(sharedId: string): Promise<SharedWorkflowEntity> {
    const shared = await this.sharedRepo.findOne({
      where: { id: sharedId, isActive: true },
    });

    if (!shared) {
      throw new NotFoundException({ message: 'Shared workflow not found' });
    }

    return shared;
  }

  async getCategories(): Promise<string[]> {
    const result = await this.sharedRepo
      .createQueryBuilder('sw')
      .select('DISTINCT sw.category', 'category')
      .where('sw.is_active = true AND sw.category IS NOT NULL')
      .orderBy('sw.category', 'ASC')
      .getRawMany();

    return result.map((r) => r.category);
  }

  async getTags(): Promise<{ tag: string; count: number }[]> {
    const result = await this.sharedRepo
      .createQueryBuilder('sw')
      .select("jsonb_array_elements_text(sw.tags)", 'tag')
      .addSelect('COUNT(*)', 'count')
      .where('sw.is_active = true')
      .groupBy('tag')
      .orderBy('count', 'DESC')
      .limit(50)
      .getRawMany();

    return result.map((r) => ({ tag: r.tag, count: parseInt(r.count, 10) }));
  }

  async importWorkflow(
    tenantId: string,
    userId: string,
    sharedId: string,
    mode: 'use' | 'customize',
  ): Promise<WorkflowDefinitionEntity> {
    const shared = await this.findOne(sharedId);

    // Parse the BPMN XML to get structural definition
    const parsed = await this.bpmnParser.parse(shared.bpmnXml);

    // Determine status based on mode
    const status = mode === 'use' ? WorkflowStatus.PUBLISHED : WorkflowStatus.DRAFT;

    // Check for name collision and generate a unique name
    let name = shared.name;
    const existingCount = await this.workflowRepo.count({
      where: { tenantId, name },
    });
    if (existingCount > 0) {
      name = `${shared.name} (imported)`;
      const importedCount = await this.workflowRepo.count({
        where: { tenantId, name },
      });
      if (importedCount > 0) {
        name = `${shared.name} (imported ${Date.now()})`;
      }
    }

    // Create new workflow definition in importing tenant
    const workflow = this.workflowRepo.create({
      tenantId,
      name,
      description: shared.description,
      version: 1,
      status,
      bpmnXml: shared.bpmnXml,
      parsedDefinition: parsed as unknown as Record<string, unknown>,
      createdBy: userId,
      publishedAt: mode === 'use' ? new Date() : null,
    });
    await this.workflowRepo.save(workflow);

    // Create activities and build mapping
    const activityMap = new Map<string, ActivityDefinitionEntity>();
    const configMap = new Map<string, Record<string, unknown>>();

    // Build config lookup from shared snapshot
    for (const ac of shared.activityConfigs) {
      configMap.set(ac.bpmnElementId, ac.config);
    }

    for (const act of parsed.activities) {
      const snapshotConfig = configMap.get(act.bpmnElementId) || {};
      const entity = this.activityRepo.create({
        workflowDefinitionId: workflow.id,
        bpmnElementId: act.bpmnElementId,
        type: act.type,
        name: act.name,
        config: { ...act.config, ...snapshotConfig },
        position: act.position,
      });
      const saved = await this.activityRepo.save(entity);
      activityMap.set(act.bpmnElementId, saved);
    }

    // Create transitions with remapped activity IDs
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

    // Create SLA definitions from snapshot
    for (const slaDef of shared.slaConfigs) {
      const activity = activityMap.get(slaDef.bpmnElementId);
      if (!activity) continue;

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

    // Record the import
    await this.importRepo.save(
      this.importRepo.create({
        sharedWorkflowId: sharedId,
        importedByTenantId: tenantId,
        importedByUserId: userId,
        createdWorkflowDefinitionId: workflow.id,
        importedAt: new Date(),
      }),
    );

    // Increment import count atomically
    await this.sharedRepo
      .createQueryBuilder()
      .update()
      .set({ importCount: () => '"import_count" + 1' })
      .where('id = :id', { id: sharedId })
      .execute();

    this.logger.log(
      `Workflow imported from library: ${shared.name} → tenant ${tenantId} (mode: ${mode})`,
    );

    this.auditService.log({
      tenantId,
      userId,
      action: AuditAction.LIBRARY_WORKFLOW_IMPORTED,
      resourceType: 'shared_workflow',
      resourceId: sharedId,
      newValues: {
        importedWorkflowId: workflow.id,
        mode,
        sourceName: shared.name,
      },
    });

    return this.workflowRepo.findOne({
      where: { id: workflow.id },
      relations: ['activities', 'transitions'],
    }) as Promise<WorkflowDefinitionEntity>;
  }
}
