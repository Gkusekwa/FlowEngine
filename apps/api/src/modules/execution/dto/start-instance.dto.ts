import { IsUUID, IsOptional, IsObject, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartInstanceDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  workflowDefinitionId: string;

  @ApiPropertyOptional({ example: { applicantName: 'John Doe', leaveDays: 5 } })
  @IsObject()
  @IsOptional()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'leave-request-2024-001' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  correlationId?: string;
}
