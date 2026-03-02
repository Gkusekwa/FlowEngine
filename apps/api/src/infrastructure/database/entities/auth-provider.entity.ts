import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { AuthProviderType } from '@flowengine/shared';

@Entity('auth_providers')
@Index(['tenantId', 'name'], { unique: true })
export class AuthProviderEntity extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 50 })
  type: AuthProviderType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'jsonb', default: '{}' })
  config: Record<string, unknown>;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.authProviders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;
}
