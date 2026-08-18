import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ProjectType } from '@prisma/client';

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

  // Tipo de serviço da invoice (SPLICE / CONSTRUCTION).
  @IsOptional()
  @IsEnum(ProjectType)
  serviceType?: ProjectType;

  // Termos de pagamento (NET21, NET30…). Obrigatório na criação.
  @IsString()
  paymentTerms!: string;

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
