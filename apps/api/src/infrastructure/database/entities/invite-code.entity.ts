import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from './base.entity';
import { TenantEntity } from './tenant.entity';

@Entity('invite_codes')
@Index(['code'], { unique: true })
export class InviteCodeEntity extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ name: 'max_uses', type: 'int', default: 0 })
  maxUses: number; // 0 = unlimited

  @Column({ name: 'use_count', type: 'int', default: 0 })
  useCount: number;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;
}
