import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { UserEntity } from './user.entity';
import { AuthProviderEntity } from './auth-provider.entity';
import { TenantMembershipEntity } from './tenant-membership.entity';

@Entity('tenants')
export class TenantEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, unknown>;

  @Column({ name: 'subscription_plan', type: 'varchar', length: 50, default: 'free' })
  subscriptionPlan: string;

  @Column({ name: 'max_users', type: 'int', default: 10 })
  maxUsers: number;

  @Column({ name: 'max_workflows', type: 'int', default: 50 })
  maxWorkflows: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => UserEntity, (user) => user.tenant)
  users: UserEntity[];

  @OneToMany(() => AuthProviderEntity, (provider) => provider.tenant)
  authProviders: AuthProviderEntity[];

  @OneToMany(() => TenantMembershipEntity, (membership) => membership.tenant)
  memberships: TenantMembershipEntity[];
}
