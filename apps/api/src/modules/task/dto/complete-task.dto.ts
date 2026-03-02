import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteTaskDto {
  @ApiProperty({ example: { approved: true, comments: 'Looks good' } })
  @IsObject()
  result: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Approved after review' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  comment?: string;
}
