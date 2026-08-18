import {
  Body, Controller, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus, UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { DocumentParseService } from '../finance-import/document-parse.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SetInvoiceStatusDto } from './dto/set-invoice-status.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

const G7 = [UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF];

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly parser: DocumentParseService,
  ) {}

  @Roles(...G7)
  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

  // Lê um PDF/Excel de invoice e devolve os campos p/ preencher (sem gravar).
  @Roles(...G7)
  @Post('parse')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  parse(@UploadedFile() file: Express.Multer.File) {
    return this.parser.parse(file);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto, @Query('status') status?: InvoiceStatus) {
    return this.invoices.list(user, pagination, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.findOne(user, id);
  }

  @Roles(...G7)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(id, dto);
  }

  @Roles(...G7)
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetInvoiceStatusDto) {
    return this.invoices.setStatus(id, dto.status);
  }

  @Roles(...G7)
  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.invoices.send(id);
  }

  @Roles(...G7)
  @Post(':id/pay')
  pay(@Param('id') id: string) {
    return this.invoices.markPaid(id);
  }
}
