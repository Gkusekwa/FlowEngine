import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Tenant is resolved from JWT payload (set by JwtAuthGuard)
    // or from X-Tenant header for public endpoints that need tenant context
    const tenantHeader = req.headers['x-tenant'] as string | undefined;

    if (tenantHeader) {
      (req as any).tenantSlug = tenantHeader;
    }

    next();
  }
}
