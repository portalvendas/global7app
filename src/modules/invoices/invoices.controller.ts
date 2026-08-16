import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus, UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

const G7 = [UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF];

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Roles(...G7)
  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
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
