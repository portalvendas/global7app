import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  code!: string;

  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber()
  contractValue!: number;

  @IsString()
  clientCompanyId!: string;

  @IsOptional()
  @IsString()
  subcontractorCompanyId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;
}
