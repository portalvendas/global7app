import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateDailyDto {
  /** Gerado no celular (idempotência): reenviar o mesmo não duplica. */
  @IsUUID()
  clientUuid!: string;

  @IsString()
  projectId!: string;

  @IsString()
  teamId!: string;

  /** Data de produção (YYYY-MM-DD). */
  @IsDateString()
  productionDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gpsLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gpsLng?: number;
}
