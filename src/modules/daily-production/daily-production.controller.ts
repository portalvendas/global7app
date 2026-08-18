import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DailyProductionService } from './daily-production.service';
import { CreateDailyDto } from './dto/create-daily.dto';
import { QueryDailyDto } from './dto/query-daily.dto';
import { RejectDailyDto } from './dto/reject-daily.dto';
import { UpdateDailyDto } from './dto/update-daily.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

const FIELD_ROLES = [
  UserRole.TEAM_MEMBER,
  UserRole.SUBCONTRACTOR_ADMIN,
  UserRole.GLOBAL7_ADMIN,
  UserRole.GLOBAL7_STAFF,
];

@ApiTags('daily-production')
@ApiBearerAuth()
@Controller('daily-production')
export class DailyProductionController {
  constructor(private readonly service: DailyProductionService) {}

  @Roles(...FIELD_ROLES)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDailyDto) {
    return this.service.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryDailyDto) {
    return this.service.list(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Roles(...FIELD_ROLES)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDailyDto) {
    return this.service.update(user, id, dto);
  }

  @Roles(...FIELD_ROLES)
  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Roles(...FIELD_ROLES)
  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.service.removeAttachment(user, id, attachmentId);
  }

  @Roles(UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF)
  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Roles(UserRole.GLOBAL7_ADMIN, UserRole.GLOBAL7_STAFF)
  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectDailyDto) {
    return this.service.reject(user, id, dto.reason);
  }

  @Get(':id/attachments/:attachmentId/original')
  async original(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.service.getAttachmentOriginal(user, id, attachmentId);
    return new StreamableFile(buffer, { type: mimeType });
  }

  @Roles(...FIELD_ROLES)
  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  addAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadAttachmentDto,
  ) {
    return this.service.addAttachment(user, id, file, dto);
  }
}
