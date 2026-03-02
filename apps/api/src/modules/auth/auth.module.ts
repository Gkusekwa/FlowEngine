import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  UserEntity,
  TenantEntity,
  TenantMembershipEntity,
  AuthProviderEntity,
  UserSessionEntity,
  InviteCodeEntity,
  JoinRequestEntity,
} from '../../infrastructure/database/entities';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),
        signOptions: {
          algorithm: 'HS256',
        },
      }),
    }),
    TypeOrmModule.forFeature([
      UserEntity,
      TenantEntity,
      TenantMembershipEntity,
      AuthProviderEntity,
      UserSessionEntity,
      InviteCodeEntity,
      JoinRequestEntity,
    ]),
  ],
  providers: [AuthService, TokenService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
