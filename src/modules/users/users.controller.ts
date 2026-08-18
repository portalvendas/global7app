import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const MANAGERS = [UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF, UserRole.SUBCONTRACTOR_ADMIN];

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        companyId: true,
        company: { select: { id: true, name: true, type: true } },
      },
    });
  }

  @Roles(...MANAGERS)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
    @Query('companyId') companyId?: string,
    @Query('q') q?: string,
  ) {
    return this.users.list(user, pagination, companyId, q);
  }

  @Roles(...MANAGERS)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }
}
