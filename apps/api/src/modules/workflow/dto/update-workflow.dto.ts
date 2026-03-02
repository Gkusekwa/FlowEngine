import { IsString, IsOptional, MaxLength, IsArray, ValidateNested, IsNumber, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ActivityConfigInputDto {
  @IsString()
  bpmnElementId: string;

  @IsOptional()
  config: Record<string, unknown>;
}

export class SlaDefinitionInputDto {
  @IsString()
  bpmnElementId: string;

  @IsOptional()
  @IsInt()
  warningThresholdSeconds?: number | null;

  @IsNumber()
  breachThresholdSeconds: number;

  @IsOptional()
  @IsArray()
  escalationRules?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  notificationChannels?: string[];
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional({ example: 'Leave Request v2' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated leave request workflow' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '<?xml version="1.0" encoding="UTF-8"?>...' })
  @IsString()
  @IsOptional()
  bpmnXml?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityConfigInputDto)
  activityConfigs?: ActivityConfigInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SlaDefinitionInputDto)
  slaDefinitions?: SlaDefinitionInputDto[];
}
