import { CompanyType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsEnum(CompanyType)
  type!: CompanyType;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // ── W-9 (opcional; extraído do PDF preenchível no cliente ou digitado). SSN nunca é enviado/guardado.
  @IsOptional() @IsString() w9BusinessName?: string;
  @IsOptional() @IsString() w9TaxClassification?: string;
  @IsOptional() @IsString() w9Ein?: string;
  @IsOptional() @IsString() w9Address?: string;
  @IsOptional() @IsString() w9City?: string;
  @IsOptional() @IsString() w9State?: string;
  @IsOptional() @IsString() w9Zip?: string;
}
