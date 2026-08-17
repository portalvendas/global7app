import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class FinanceLineDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total!: number;
}

export class CreateInvoiceDto {
  @IsString()
  projectId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  issuedTo?: string;

  @IsOptional()
  @IsString()
  billedTo?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Linhas de serviço (valor cheio). Se enviadas, o amount é recalculado pela soma.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinanceLineDto)
  lines?: FinanceLineDto[];
}
