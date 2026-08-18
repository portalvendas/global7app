import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DailyStatus } from '@prisma/client';

export class SetDailyStatusDto {
  @IsEnum(DailyStatus)
  status!: DailyStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
