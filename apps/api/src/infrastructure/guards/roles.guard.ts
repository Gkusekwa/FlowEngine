import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantRole, TokenPayload, ErrorCodes } from '@flowengine/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

const ROLE_HIERARCHY: Record<TenantRole, number> = {
  [TenantRole.OWNER]: 5,
  [TenantRole.ADMIN]: 4,
  [TenantRole.DESIGNER]: 3,
  [TenantRole.OPERATOR]: 2,
  [TenantRole.VIEWER]: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<TenantRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as TokenPayload;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_INSUFFICIENT_ROLE,
        message: 'Authentication required',
      });
    }

    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    const hasRole = requiredRoles.some((role) => userLevel >= ROLE_HIERARCHY[role]);

    if (!hasRole) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_INSUFFICIENT_ROLE,
        message: `Insufficient role. Required: ${requiredRoles.join(' or ')}`,
      });
    }

    return true;
  }
}
