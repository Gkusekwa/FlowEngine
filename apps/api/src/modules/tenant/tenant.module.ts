import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { AuthModule } from '../auth/auth.module';
import {
  TenantEntity,
  UserEntity,
  TenantMembershipEntity,
  AuthProviderEntity,
} from '../../infrastructure/database/entities';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([
      TenantEntity,
      UserEntity,
      TenantMembershipEntity,
      AuthProviderEntity,
    ]),
  ],
  providers: [TenantService],
  controllers: [TenantController],
  exports: [TenantService],
})
export class TenantModule {}
