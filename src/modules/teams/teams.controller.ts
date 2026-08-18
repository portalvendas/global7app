import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

const TEAM_MANAGERS = [UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF, UserRole.SUBCONTRACTOR_ADMIN];

@ApiTags('teams')
@ApiBearerAuth()
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Roles(UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF, UserRole.SUBCONTRACTOR_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTeamDto) {
    return this.teams.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto) {
    return this.teams.list(user, pagination);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teams.findOne(user, id);
  }

  @Roles(...TEAM_MANAGERS)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teams.update(user, id, dto);
  }

  @Roles(...TEAM_MANAGERS)
  @Post(':id/members')
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.teams.addMember(user, id, dto.userId);
  }

  @Roles(...TEAM_MANAGERS)
  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.teams.removeMember(user, id, userId);
  }
}
