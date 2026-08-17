import {
  Body, Controller, Get, Param, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { BillStatus, UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { DocumentParseService } from '../finance-import/document-parse.service';
import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';

const G7 = [UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF];

@ApiTags('bills')
@ApiBearerAuth()
@Controller('bills')
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly parser: DocumentParseService,
  ) {}

  // Subcontratada (self-service) ou Global7 lançam a bill.
  @Roles(UserRole.SUBCONTRACTOR_ADMIN, ...G7)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBillDto) {
    return this.bills.create(user, dto);
  }

  // Lê um PDF/Excel de payroll e devolve os campos p/ preencher (sem gravar).
  @Roles(UserRole.SUBCONTRACTOR_ADMIN, ...G7)
  @Post('parse')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  parse(@UploadedFile() file: Express.Multer.File) {
    return this.parser.parse(file);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto, @Query('status') status?: BillStatus) {
    return this.bills.list(user, pagination, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bills.findOne(user, id);
  }

  @Roles(...G7)
  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bills.approve(id, user);
  }

  @Roles(...G7)
  @Post(':id/pay')
  pay(@Param('id') id: string) {
    return this.bills.markPaid(id);
  }
}
