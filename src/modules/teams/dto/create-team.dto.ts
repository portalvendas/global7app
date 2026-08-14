import { IsOptional, IsString } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  name!: string;

  // Empresa subcontratada dona da equipe. Opcional para SUBCONTRACTOR_ADMIN
  // (assume a própria empresa); obrigatório na prática para a Global 7.
  @IsOptional()
  @IsString()
  subcontractorCompanyId?: string;
}
