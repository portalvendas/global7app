import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Roles(UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF)
  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companies.create(dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto) {
    return this.companies.list(user, pagination);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.companies.findOne(user, id);
  }

  @Roles(UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(id, dto);
  }

  // Anexa o PDF do W-9. Até 10MB.
  @Roles(UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF)
  @Post(':id/w9')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadW9(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.companies.uploadW9(id, file);
  }

  // Baixa o W-9 anexado.
  @Get(':id/w9')
  async downloadW9(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<StreamableFile> {
    const { buffer, mimeType, name } = await this.companies.getW9(user, id);
    return new StreamableFile(buffer, { type: mimeType, disposition: `inline; filename="${name}"` });
  }

  @Roles(UserRole.GLOBAL7_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.companies.remove(id);
  }
}
