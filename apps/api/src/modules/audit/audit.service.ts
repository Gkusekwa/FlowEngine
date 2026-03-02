import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { AuditLogEntity } from '../../infrastructure/database/entities';
import { AuditAction, PaginatedResponse } from '@flowengine/shared';

export interface CreateAuditLogParams {
  tenantId: string;
  userId?: string;
  action: AuditAction | string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  requestId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditLogQuery {
  tenantId: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      const entry = this.auditRepo.create({
        tenantId: params.tenantId,
        userId: params.userId || null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId || null,
        ipAddress: params.ipAddress || null,
        requestId: params.requestId || null,
        oldValues: params.oldValues || null,
        newValues: params.newValues || null,
        metadata: params.metadata || null,
      });

      await this.auditRepo.save(entry);
    } catch (error: unknown) {
      // Audit logging should never break the main flow
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to write audit log: ${err.message}`, err.stack);
    }
  }

  async search(query: AuditLogQuery): Promise<PaginatedResponse<AuditLogEntity>> {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);

    const where: FindOptionsWhere<AuditLogEntity> = {
      tenantId: query.tenantId,
    };

    if (query.action) where.action = query.action;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.userId) where.userId = query.userId;

    if (query.startDate && query.endDate) {
      where.createdAt = Between(query.startDate, query.endDate);
    }

    const [items, total] = await this.auditRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
