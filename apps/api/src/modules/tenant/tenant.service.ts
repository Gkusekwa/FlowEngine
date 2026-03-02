import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  TenantEntity,
  UserEntity,
  TenantMembershipEntity,
  AuthProviderEntity,
} from '../../infrastructure/database/entities';
import {
  ErrorCodes,
  TenantRole,
  AuthProviderType,
  TenantSummary,
} from '@flowengine/shared';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { InviteMemberDto, UpdateMemberRoleDto } from './dto/manage-member.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    @InjectRepository(AuthProviderEntity)
    private readonly authProviderRepo: Repository<AuthProviderEntity>,
  ) {}

  async createTenant(dto: CreateTenantDto): Promise<TenantEntity> {
    const existing = await this.tenantRepo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_SLUG_TAKEN,
        message: 'A tenant with this slug already exists',
      });
    }

    const tenant = this.tenantRepo.create({
      name: dto.name,
      slug: dto.slug,
      isActive: true,
    });

    await this.tenantRepo.save(tenant);

    // Create default local auth provider
    const authProvider = this.authProviderRepo.create({
      tenantId: tenant.id,
      type: AuthProviderType.LOCAL,
      name: 'Email & Password',
      config: {},
      isDefault: true,
      isActive: true,
    });

    await this.authProviderRepo.save(authProvider);

    // If admin credentials provided, create admin user
    if (dto.adminEmail && dto.adminPassword) {
      const passwordHash = await bcrypt.hash(dto.adminPassword, BCRYPT_ROUNDS);

      const user = this.userRepo.create({
        email: dto.adminEmail,
        name: dto.adminName || 'Admin',
        passwordHash,
        tenantId: tenant.id,
        isActive: true,
      });

      await this.userRepo.save(user);

      const membership = this.membershipRepo.create({
        userId: user.id,
        tenantId: tenant.id,
        role: TenantRole.OWNER,
      });

      await this.membershipRepo.save(membership);
    }

    this.logger.log(`Tenant created: ${tenant.slug} (${tenant.id})`);

    return tenant;
  }

  async listTenants(): Promise<TenantEntity[]> {
    return this.tenantRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async toggleTenantActive(id: string): Promise<TenantEntity> {
    const tenant = await this.getTenantById(id);
    tenant.isActive = !tenant.isActive;
    await this.tenantRepo.save(tenant);
    this.logger.log(`Tenant ${tenant.slug} is now ${tenant.isActive ? 'active' : 'inactive'}`);
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException({
        code: ErrorCodes.TENANT_NOT_FOUND,
        message: 'Tenant not found',
      });
    }
    return tenant;
  }

  async getTenantById(id: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({
        code: ErrorCodes.TENANT_NOT_FOUND,
        message: 'Tenant not found',
      });
    }
    return tenant;
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto): Promise<TenantEntity> {
    const tenant = await this.getTenantById(tenantId);

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.settings !== undefined) tenant.settings = dto.settings;

    await this.tenantRepo.save(tenant);
    return tenant;
  }

  async getMembers(tenantId: string): Promise<{ id: string; email: string; name: string; role: TenantRole }[]> {
    const memberships = await this.membershipRepo.find({
      where: { tenantId },
      relations: ['user'],
    });

    return memberships.map((m) => ({
      id: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
    }));
  }

  async inviteMember(tenantId: string, dto: InviteMemberDto): Promise<void> {
    const tenant = await this.getTenantById(tenantId);

    // Check user limit
    const userCount = await this.userRepo.count({ where: { tenantId } });
    if (userCount >= tenant.maxUsers) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_MEMBER_EXISTS,
        message: 'Tenant has reached maximum user limit',
      });
    }

    // Check if user already exists in this tenant
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email, tenantId },
    });

    if (existingUser) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_MEMBER_EXISTS,
        message: 'A user with this email already exists in this tenant',
      });
    }

    // Create user
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
      : null;

    const user = this.userRepo.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      tenantId,
      isActive: true,
    });

    await this.userRepo.save(user);

    // Create membership
    const membership = this.membershipRepo.create({
      userId: user.id,
      tenantId,
      role: dto.role,
    });

    await this.membershipRepo.save(membership);

    this.logger.log(`Member invited: ${dto.email} as ${dto.role} in tenant ${tenant.slug}`);
  }

  async updateMemberRole(
    tenantId: string,
    userId: string,
    dto: UpdateMemberRoleDto,
    currentUserId: string,
  ): Promise<void> {
    if (userId === currentUserId) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_RESOURCE_ACCESS_DENIED,
        message: 'Cannot change your own role',
      });
    }

    const membership = await this.membershipRepo.findOne({
      where: { userId, tenantId },
    });

    if (!membership) {
      throw new NotFoundException({
        code: ErrorCodes.TENANT_MEMBER_NOT_FOUND,
        message: 'Member not found',
      });
    }

    // Prevent changing the last owner
    if (membership.role === TenantRole.OWNER && dto.role !== TenantRole.OWNER) {
      const ownerCount = await this.membershipRepo.count({
        where: { tenantId, role: TenantRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException({
          code: ErrorCodes.AUTHZ_RESOURCE_ACCESS_DENIED,
          message: 'Cannot remove the last owner of a tenant',
        });
      }
    }

    membership.role = dto.role;
    await this.membershipRepo.save(membership);
  }

  async removeMember(tenantId: string, userId: string, currentUserId: string): Promise<void> {
    if (userId === currentUserId) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_RESOURCE_ACCESS_DENIED,
        message: 'Cannot remove yourself from the tenant',
      });
    }

    const membership = await this.membershipRepo.findOne({
      where: { userId, tenantId },
    });

    if (!membership) {
      throw new NotFoundException({
        code: ErrorCodes.TENANT_MEMBER_NOT_FOUND,
        message: 'Member not found',
      });
    }

    // Prevent removing the last owner
    if (membership.role === TenantRole.OWNER) {
      const ownerCount = await this.membershipRepo.count({
        where: { tenantId, role: TenantRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException({
          code: ErrorCodes.AUTHZ_RESOURCE_ACCESS_DENIED,
          message: 'Cannot remove the last owner of a tenant',
        });
      }
    }

    // Remove membership and user
    await this.membershipRepo.remove(membership);
    await this.userRepo.delete({ id: userId, tenantId });

    this.logger.log(`Member removed: ${userId} from tenant ${tenantId}`);
  }
}
