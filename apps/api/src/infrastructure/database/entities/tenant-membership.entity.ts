import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { UserEntity } from './user.entity';
import { TenantRole } from '@flowengine/shared';

@Entity('tenant_memberships')
@Index(['tenantId', 'userId'], { unique: true })
export class TenantMembershipEntity extends TenantBaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  role: TenantRole;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @ManyToOne(() => UserEntity, (user) => user.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
