import { SetMetadata } from '@nestjs/common';
import { TenantRole } from '@flowengine/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: TenantRole[]) => SetMetadata(ROLES_KEY, roles);
