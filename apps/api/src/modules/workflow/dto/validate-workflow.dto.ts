import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateWorkflowDto {
  @ApiProperty({ example: '<?xml version="1.0" encoding="UTF-8"?>...' })
  @IsString()
  @MinLength(1)
  bpmnXml: string;
}
