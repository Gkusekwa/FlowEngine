import { IsUUID, IsOptional, IsString, MaxLength, IsArray } from 'class-validator';

export class ShareWorkflowDto {
  @IsUUID()
  workflowDefinitionId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
