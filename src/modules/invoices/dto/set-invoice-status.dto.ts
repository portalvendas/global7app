import { IsEnum } from 'class-validator';
import { InvoiceStatus } from '@prisma/client';

export class SetInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status!: InvoiceStatus;
}
