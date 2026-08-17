import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ProjectServiceDto {
  @IsString()
  code!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  // Valor cheio (recebido do cliente).
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  clientValue!: number;

  // Valor de repasse (pago à subcontratada).
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subValue!: number;
}

export class CreateProjectDto {
  @IsString()
  code!: string;

  @IsString()
  clientCompanyId!: string;

  // Zero ou mais subcontratadas (opcional).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subcontractorCompanyIds?: string[];

  // Linhas de serviço/preço.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectServiceDto)
  services?: ProjectServiceDto[];
}
