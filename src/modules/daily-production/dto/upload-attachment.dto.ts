import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { AttachmentType } from '@prisma/client';

export class UploadAttachmentDto {
  @IsEnum(AttachmentType)
  type!: AttachmentType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gpsLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gpsLng?: number;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}
