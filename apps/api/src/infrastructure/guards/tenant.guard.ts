import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TokenPayload, ErrorCodes } from '@flowengine/shared';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as TokenPayload;
    const tenantSlug = request.tenantSlug as string | undefined;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_TENANT_ACCESS_DENIED,
        message: 'Authentication required',
      });
    }

    // If a tenant slug is present in the request (from middleware),
    // verify it matches the user's JWT tenant
    if (tenantSlug && tenantSlug !== user.tenantSlug) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_TENANT_ACCESS_DENIED,
        message: 'Access denied: tenant mismatch',
      });
    }

    return true;
  }
}
