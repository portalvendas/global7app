import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DailyStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export class QueryDailyDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DailyStatus)
  status?: DailyStatus;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
