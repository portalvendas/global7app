import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { FinanceLineDto } from '../../invoices/dto/create-invoice.dto';

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

  // Linhas de serviço (valor de repasse). Se enviadas, o amount é recalculado pela soma.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinanceLineDto)
  lines?: FinanceLineDto[];
}
