import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillStatus, UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';

const G7 = [UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF];

@ApiTags('bills')
@ApiBearerAuth()
@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  // Subcontratada (self-service) ou Global7 lançam a bill.
  @Roles(UserRole.SUBCONTRACTOR_ADMIN, ...G7)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBillDto) {
    return this.bills.create(user, dto);
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
