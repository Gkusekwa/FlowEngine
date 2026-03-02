import { IsUUID, IsOptional, IsBoolean, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { SlaEventType } from '@flowengine/shared';

export class SlaEventsQueryDto {
  @IsOptional()
  @IsEnum(SlaEventType)
  eventType?: SlaEventType;

  @IsOptional()
  @IsUUID()
  taskInstanceId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  acknowledged?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number = 20;
}

export class AcknowledgeSlaDto {
  @IsOptional()
  comment?: string;
}
