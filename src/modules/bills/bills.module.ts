import { Module } from '@nestjs/common';
import { DocumentParseService } from '../finance-import/document-parse.service';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({ controllers: [BillsController], providers: [BillsService, DocumentParseService] })
export class BillsModule {}
