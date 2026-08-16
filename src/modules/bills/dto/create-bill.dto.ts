import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBillDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Só usado quando quem lança é a Global 7 (em nome de uma subcontratada).
  @IsOptional()
  @IsString()
  subcontractorCompanyId?: string;
}
