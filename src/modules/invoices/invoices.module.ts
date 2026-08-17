import { Module } from '@nestjs/common';
import { DocumentParseService } from '../finance-import/document-parse.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({ controllers: [InvoicesController], providers: [InvoicesService, DocumentParseService] })
export class InvoicesModule {}
