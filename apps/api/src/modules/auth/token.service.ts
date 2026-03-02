import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { UserSessionEntity } from '../../infrastructure/database/entities';
import {
  TokenPayload,
  TenantRole,
  AuthProviderType,
  ROLE_PERMISSIONS,
  JWT_DEFAULTS,
} from '@flowengine/shared';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserTokenData {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  tenantSlug: string;
  role: TenantRole;
  authProvider: AuthProviderType;
  groups: string[];
}

@Injectable()
export class TokenService {
  private readonly accessExpiry: string;
  private readonly refreshExpiryMs: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepo: Repository<UserSessionEntity>,
  ) {
    this.accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY', JWT_DEFAULTS.ACCESS_EXPIRY);
    this.refreshExpiryMs = this.parseExpiryToMs(
      this.config.get<string>('JWT_REFRESH_EXPIRY', JWT_DEFAULTS.REFRESH_EXPIRY),
    );
  }

  async generateTokenPair(user: UserTokenData, ipAddress?: string, userAgent?: string): Promise<TokenPair> {
    const permissions = ROLE_PERMISSIONS[user.role] || [];

    const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
      sub: user.userId,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      role: user.role,
      permissions,
      authProvider: user.authProvider,
      groups: user.groups,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: this.accessExpiry });

    const refreshToken = uuidv4();
    const refreshTokenHash = this.hashToken(refreshToken);
    const refreshTokenFamily = uuidv4();

    const session = this.sessionRepo.create({
      userId: user.userId,
      tenantId: user.tenantId,
      refreshTokenHash,
      refreshTokenFamily,
      expiresAt: new Date(Date.now() + this.refreshExpiryMs),
      ipAddress: ipAddress || null,
      userAgent: userAgent ? userAgent.substring(0, 500) : null,
      isRevoked: false,
    });

    await this.sessionRepo.save(session);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiryToSeconds(this.accessExpiry),
    };
  }

  async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair | null> {
    const refreshTokenHash = this.hashToken(refreshToken);

    const session = await this.sessionRepo.findOne({
      where: { refreshTokenHash },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      if (session && !session.isRevoked) {
        // Token expired but not revoked — just clean up
        await this.sessionRepo.remove(session);
      }

      if (session?.isRevoked) {
        // Possible token theft: revoke all sessions in the family
        await this.revokeTokenFamily(session.refreshTokenFamily);
      }

      return null;
    }

    // Revoke old session
    session.isRevoked = true;
    await this.sessionRepo.save(session);

    // Look up user data to build new tokens
    const user = await this.getUserDataForSession(session);
    if (!user) return null;

    // Generate new pair in the same family
    const newRefreshToken = uuidv4();
    const newRefreshTokenHash = this.hashToken(newRefreshToken);

    const permissions = ROLE_PERMISSIONS[user.role] || [];

    const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
      sub: user.userId,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      role: user.role,
      permissions,
      authProvider: user.authProvider,
      groups: user.groups,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: this.accessExpiry });

    const newSession = this.sessionRepo.create({
      userId: session.userId,
      tenantId: session.tenantId,
      refreshTokenHash: newRefreshTokenHash,
      refreshTokenFamily: session.refreshTokenFamily,
      expiresAt: new Date(Date.now() + this.refreshExpiryMs),
      ipAddress: ipAddress || null,
      userAgent: userAgent ? userAgent.substring(0, 500) : null,
      isRevoked: false,
    });

    await this.sessionRepo.save(newSession);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.parseExpiryToSeconds(this.accessExpiry),
    };
  }

  async revokeSession(refreshToken: string): Promise<void> {
    const refreshTokenHash = this.hashToken(refreshToken);
    await this.sessionRepo.update({ refreshTokenHash }, { isRevoked: true });
  }

  async revokeAllUserSessions(userId: string, tenantId: string): Promise<void> {
    await this.sessionRepo.update({ userId, tenantId }, { isRevoked: true });
  }

  async revokeAccessToken(token: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(token) as TokenPayload;
      if (!decoded?.exp) return;

      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl <= 0) return;

      await this.redis.set(`revoked:${token}`, '1', 'EX', ttl);
    } catch {
      // Token couldn't be decoded — skip
    }
  }

  async isAccessTokenRevoked(token: string): Promise<boolean> {
    const result = await this.redis.get(`revoked:${token}`);
    return result !== null;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessionRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  private async revokeTokenFamily(family: string): Promise<void> {
    await this.sessionRepo.update({ refreshTokenFamily: family }, { isRevoked: true });
  }

  private async getUserDataForSession(session: UserSessionEntity): Promise<UserTokenData | null> {
    // Query user + membership to get current role
    const result = await this.sessionRepo.manager
      .createQueryBuilder()
      .select('u.id', 'userId')
      .addSelect('u.email', 'email')
      .addSelect('u.name', 'name')
      .addSelect('u.tenant_id', 'tenantId')
      .addSelect('t.slug', 'tenantSlug')
      .addSelect('tm.role', 'role')
      .addSelect('u.auth_provider_id', 'authProviderId')
      .from('users', 'u')
      .innerJoin('tenants', 't', 't.id = u.tenant_id')
      .innerJoin('tenant_memberships', 'tm', 'tm.user_id = u.id AND tm.tenant_id = u.tenant_id')
      .where('u.id = :userId', { userId: session.userId })
      .andWhere('u.tenant_id = :tenantId', { tenantId: session.tenantId })
      .andWhere('u.is_active = true')
      .andWhere('t.is_active = true')
      .getRawOne();

    if (!result) return null;

    return {
      userId: result.userId,
      email: result.email,
      name: result.name,
      tenantId: result.tenantId,
      tenantSlug: result.tenantSlug,
      role: result.role as TenantRole,
      authProvider: result.authProviderId ? AuthProviderType.OAUTH2 : AuthProviderType.LOCAL,
      groups: [],
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiryToMs(expiry: string): number {
    return this.parseExpiryToSeconds(expiry) * 1000;
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15m

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}
