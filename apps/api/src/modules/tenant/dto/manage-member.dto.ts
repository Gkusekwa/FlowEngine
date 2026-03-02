import { IsString, IsEmail, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantRole } from '@flowengine/shared';

export class InviteMemberDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: TenantRole, example: TenantRole.OPERATOR })
  @IsEnum(TenantRole)
  role: TenantRole;

  @ApiPropertyOptional({ example: 'TempP@ss1' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: TenantRole })
  @IsEnum(TenantRole)
  role: TenantRole;
}
