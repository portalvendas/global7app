import {
  Body, Controller, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

const G7 = [UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF];

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Roles(...G7)
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  // Lê um PDF de tabela de preços e devolve as linhas p/ importar (sem gravar).
  @Roles(...G7)
  @Post('parse-rate-table')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  parseRateTable(@UploadedFile() file: Express.Multer.File) {
    return this.projects.parseRateTable(file);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto) {
    return this.projects.list(user, pagination);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.findOne(user, id);
  }

  @Roles(...G7)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }
}
