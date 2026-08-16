import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
