import { IsString, IsOptional, MaxLength, MinLength, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActivityConfigInputDto, SlaDefinitionInputDto } from './update-workflow.dto';

export class CreateWorkflowDto {
  @ApiProperty({ example: 'Leave Request' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Employee leave request workflow' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '<?xml version="1.0" encoding="UTF-8"?>...' })
  @IsString()
  @MinLength(1)
  bpmnXml: string;

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
