import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateInviteCodeDto {
  @ApiPropertyOptional({ example: 10, description: 'Maximum number of uses (0 = unlimited)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUses?: number = 0;

  @ApiPropertyOptional({ example: 30, description: 'Days until expiration (null = no expiration)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number | null = null;
}
