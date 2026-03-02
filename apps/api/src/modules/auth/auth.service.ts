import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  UserEntity,
  TenantEntity,
  TenantMembershipEntity,
  AuthProviderEntity,
  InviteCodeEntity,
  JoinRequestEntity,
} from '../../infrastructure/database/entities';
import { TokenService, TokenPair, UserTokenData } from './token.service';
import {
  ErrorCodes,
  TenantRole,
  AuthProviderType,
  JoinRequestStatus,
  AuditAction,
  ROLE_PERMISSIONS,
  LoginResponse,
  UserProfile,
  TenantSummary,
} from '@flowengine/shared';
import { AuditService } from '../audit/audit.service';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    @InjectRepository(AuthProviderEntity)
    private readonly authProviderRepo: Repository<AuthProviderEntity>,
    @InjectRepository(InviteCodeEntity)
    private readonly inviteCodeRepo: Repository<InviteCodeEntity>,
    @InjectRepository(JoinRequestEntity)
    private readonly joinRequestRepo: Repository<JoinRequestEntity>,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  async lookupTenants(email: string): Promise<{ id: string; name: string; slug: string }[]> {
    const users = await this.userRepo.find({
      where: { email, isActive: true },
      select: ['tenantId'],
    });

    if (users.length === 0) {
      // Return empty array — don't reveal whether the email exists
      return [];
    }

    const tenantIds = users.map((u) => u.tenantId);
    const tenants = await this.tenantRepo
      .createQueryBuilder('t')
      .select(['t.id', 't.name', 't.slug'])
      .where('t.id IN (:...ids)', { ids: tenantIds })
      .andWhere('t.is_active = true')
      .getMany();

    return tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
  }

  async login(
    email: string,
    password: string,
    tenantSlug: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
    const tenant = await this.tenantRepo.findOne({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    const user = await this.userRepo.findOne({
      where: { email, tenantId: tenant.id },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_ACCOUNT_DISABLED,
        message: 'Account is disabled',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_ACCOUNT_LOCKED,
        message: 'Account is temporarily locked due to too many failed login attempts',
      });
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await this.handleFailedLogin(user);
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const membership = await this.membershipRepo.findOne({
      where: { userId: user.id, tenantId: tenant.id },
    });

    if (!membership) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTHZ_TENANT_ACCESS_DENIED,
        message: 'User is not a member of this tenant',
      });
    }

    const tokenData: UserTokenData = {
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      role: membership.role,
      authProvider: AuthProviderType.LOCAL,
      groups: [],
    };

    const tokens = await this.tokenService.generateTokenPair(tokenData, ipAddress, userAgent);

    const permissions = ROLE_PERMISSIONS[membership.role] || [];

    // Audit log
    this.auditService.log({
      tenantId: tenant.id,
      userId: user.id,
      action: AuditAction.USER_LOGIN,
      resourceType: 'user',
      resourceId: user.id,
      ipAddress,
      metadata: { userAgent, authProvider: AuthProviderType.LOCAL },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: membership.role,
        permissions,
        groups: [],
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }

  async register(
    email: string,
    password: string,
    name: string,
    tenantName: string,
    tenantSlug: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
    // Validate password strength
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      });
    }

    // Check if slug is taken
    const existingTenant = await this.tenantRepo.findOne({ where: { slug: tenantSlug } });
    if (existingTenant) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_SLUG_TAKEN,
        message: 'A tenant with this slug already exists',
      });
    }

    // Create the tenant
    const tenant = this.tenantRepo.create({
      name: tenantName,
      slug: tenantSlug,
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

    // Create user
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      email,
      name,
      passwordHash,
      tenantId: tenant.id,
      isActive: true,
    });
    await this.userRepo.save(user);

    // Create membership as owner
    const membership = this.membershipRepo.create({
      userId: user.id,
      tenantId: tenant.id,
      role: TenantRole.OWNER,
    });
    await this.membershipRepo.save(membership);

    this.logger.log(`Self-registration: ${email} created tenant ${tenantSlug}`);

    // Audit log for tenant creation
    this.auditService.log({
      tenantId: tenant.id,
      userId: user.id,
      action: AuditAction.TENANT_CREATED,
      resourceType: 'tenant',
      resourceId: tenant.id,
      newValues: { name: tenantName, slug: tenantSlug },
    });

    // Auto-login after registration
    return this.login(email, password, tenantSlug, ipAddress, userAgent);
  }

  // --- Invite Code Methods ---

  async generateInviteCode(
    tenantId: string,
    createdBy: string,
    maxUses: number = 0,
    expiresInDays: number | null = null,
  ): Promise<InviteCodeEntity> {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12-char hex code

    const inviteCode = this.inviteCodeRepo.create({
      tenantId,
      code,
      maxUses,
      createdBy,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
      isActive: true,
    });

    await this.inviteCodeRepo.save(inviteCode);
    this.logger.log(`Invite code generated: ${code} for tenant ${tenantId}`);
    return inviteCode;
  }

  async listInviteCodes(tenantId: string): Promise<InviteCodeEntity[]> {
    return this.inviteCodeRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInviteCode(tenantId: string, codeId: string): Promise<void> {
    const code = await this.inviteCodeRepo.findOne({
      where: { id: codeId, tenantId },
    });
    if (!code) {
      throw new NotFoundException({
        code: ErrorCodes.TENANT_INVITE_CODE_INVALID,
        message: 'Invite code not found',
      });
    }
    code.isActive = false;
    await this.inviteCodeRepo.save(code);
  }

  // --- Join Request Methods ---

  async submitJoinRequest(
    email: string,
    password: string,
    name: string,
    inviteCode: string,
  ): Promise<{ message: string; tenantName: string }> {
    // Validate password strength
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      });
    }

    // Validate invite code
    const code = await this.inviteCodeRepo.findOne({
      where: { code: inviteCode, isActive: true },
      relations: ['tenant'],
    });

    if (!code) {
      throw new BadRequestException({
        code: ErrorCodes.TENANT_INVITE_CODE_INVALID,
        message: 'Invalid invite code',
      });
    }

    if (code.expiresAt && code.expiresAt < new Date()) {
      throw new BadRequestException({
        code: ErrorCodes.TENANT_INVITE_CODE_EXPIRED,
        message: 'Invite code has expired',
      });
    }

    if (code.maxUses > 0 && code.useCount >= code.maxUses) {
      throw new BadRequestException({
        code: ErrorCodes.TENANT_INVITE_CODE_INVALID,
        message: 'Invite code has reached its usage limit',
      });
    }

    if (!code.tenant.isActive) {
      throw new BadRequestException({
        code: ErrorCodes.TENANT_DISABLED,
        message: 'This tenant is currently disabled',
      });
    }

    // Check if user already exists in this tenant
    const existingUser = await this.userRepo.findOne({
      where: { email, tenantId: code.tenantId },
    });
    if (existingUser) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_MEMBER_EXISTS,
        message: 'You are already a member of this tenant',
      });
    }

    // Check for existing pending request
    const existingRequest = await this.joinRequestRepo.findOne({
      where: { email, tenantId: code.tenantId, status: JoinRequestStatus.PENDING },
    });
    if (existingRequest) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_JOIN_REQUEST_EXISTS,
        message: 'You already have a pending join request for this tenant',
      });
    }

    // Check user limit
    const userCount = await this.userRepo.count({ where: { tenantId: code.tenantId } });
    const tenant = code.tenant;
    if (userCount >= tenant.maxUsers) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_USER_LIMIT_REACHED,
        message: 'This tenant has reached its maximum user limit',
      });
    }

    // Create join request
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const request = this.joinRequestRepo.create({
      tenantId: code.tenantId,
      email,
      name,
      passwordHash,
      inviteCode: inviteCode,
      status: JoinRequestStatus.PENDING,
    });
    await this.joinRequestRepo.save(request);

    // Increment invite code usage
    code.useCount += 1;
    await this.inviteCodeRepo.save(code);

    this.logger.log(`Join request submitted: ${email} for tenant ${tenant.slug}`);

    return {
      message: 'Join request submitted successfully. Waiting for admin approval.',
      tenantName: tenant.name,
    };
  }

  async listJoinRequests(tenantId: string): Promise<JoinRequestEntity[]> {
    return this.joinRequestRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async approveJoinRequest(
    tenantId: string,
    requestId: string,
    reviewerId: string,
    role: TenantRole = TenantRole.VIEWER,
  ): Promise<void> {
    const request = await this.joinRequestRepo.findOne({
      where: { id: requestId, tenantId, status: JoinRequestStatus.PENDING },
    });

    if (!request) {
      throw new NotFoundException({
        code: ErrorCodes.TENANT_JOIN_REQUEST_NOT_FOUND,
        message: 'Join request not found or already processed',
      });
    }

    // Check user limit again
    const userCount = await this.userRepo.count({ where: { tenantId } });
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (tenant && userCount >= tenant.maxUsers) {
      throw new ConflictException({
        code: ErrorCodes.TENANT_USER_LIMIT_REACHED,
        message: 'Tenant has reached its maximum user limit',
      });
    }

    // Create the user
    const user = this.userRepo.create({
      email: request.email,
      name: request.name,
      passwordHash: request.passwordHash,
      tenantId,
      isActive: true,
    });
    await this.userRepo.save(user);

    // Create membership
    const membership = this.membershipRepo.create({
      userId: user.id,
      tenantId,
      role,
    });
    await this.membershipRepo.save(membership);

    // Update request status
    request.status = JoinRequestStatus.APPROVED;
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date();
    await this.joinRequestRepo.save(request);

    this.logger.log(`Join request approved: ${request.email} as ${role} in tenant ${tenantId}`);
  }

  async rejectJoinRequest(
    tenantId: string,
    requestId: string,
    reviewerId: string,
  ): Promise<void> {
    const request = await this.joinRequestRepo.findOne({
      where: { id: requestId, tenantId, status: JoinRequestStatus.PENDING },
    });

    if (!request) {
      throw new NotFoundException({
        code: ErrorCodes.TENANT_JOIN_REQUEST_NOT_FOUND,
        message: 'Join request not found or already processed',
      });
    }

    request.status = JoinRequestStatus.REJECTED;
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date();
    await this.joinRequestRepo.save(request);

    this.logger.log(`Join request rejected: ${request.email} in tenant ${tenantId}`);
  }

  // --- Tenant Switching ---

  async switchTenant(
    userId: string,
    email: string,
    targetTenantSlug: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
    const tenant = await this.tenantRepo.findOne({ where: { slug: targetTenantSlug } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTHZ_TENANT_ACCESS_DENIED,
        message: 'Tenant not found or inactive',
      });
    }

    // Find user in target tenant by email
    const user = await this.userRepo.findOne({
      where: { email, tenantId: tenant.id, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTHZ_TENANT_ACCESS_DENIED,
        message: 'You are not a member of this tenant',
      });
    }

    const membership = await this.membershipRepo.findOne({
      where: { userId: user.id, tenantId: tenant.id },
    });

    if (!membership) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTHZ_TENANT_ACCESS_DENIED,
        message: 'You are not a member of this tenant',
      });
    }

    const tokenData: UserTokenData = {
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      role: membership.role,
      authProvider: AuthProviderType.LOCAL,
      groups: [],
    };

    const tokens = await this.tokenService.generateTokenPair(tokenData, ipAddress, userAgent);
    const permissions = ROLE_PERMISSIONS[membership.role] || [];

    this.logger.log(`Tenant switch: ${email} switched to tenant ${tenant.slug}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: membership.role,
        permissions,
        groups: [],
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }

  async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair | null> {
    return this.tokenService.refreshTokens(refreshToken, ipAddress, userAgent);
  }

  async logout(refreshToken: string, accessToken?: string, userId?: string, tenantId?: string): Promise<void> {
    await this.tokenService.revokeSession(refreshToken);

    if (accessToken) {
      await this.tokenService.revokeAccessToken(accessToken);
    }

    if (tenantId) {
      this.auditService.log({
        tenantId,
        userId,
        action: AuditAction.USER_LOGOUT,
        resourceType: 'user',
        resourceId: userId,
      });
    }
  }

  async getAuthProviders(tenantSlug: string): Promise<{ type: AuthProviderType; name: string }[]> {
    const tenant = await this.tenantRepo.findOne({ where: { slug: tenantSlug } });
    if (!tenant) return [];

    const providers = await this.authProviderRepo.find({
      where: { tenantId: tenant.id, isActive: true },
      select: ['type', 'name'],
    });

    // Always include local auth
    const hasLocal = providers.some((p) => p.type === AuthProviderType.LOCAL);
    if (!hasLocal) {
      providers.unshift({ type: AuthProviderType.LOCAL, name: 'Email & Password' } as AuthProviderEntity);
    }

    return providers.map((p) => ({ type: p.type, name: p.name }));
  }

  private async handleFailedLogin(user: UserEntity): Promise<void> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      this.logger.warn(`Account locked: ${user.email} after ${MAX_FAILED_ATTEMPTS} failed attempts`);
    }

    await this.userRepo.save(user);
  }
}
