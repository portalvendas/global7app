import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentType, CompanyType, DailyStatus, Prisma } from '@prisma/client';
import * as sharp from 'sharp';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateDailyDto } from './dto/create-daily.dto';
import { QueryDailyDto } from './dto/query-daily.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

const EDITABLE: DailyStatus[] = [DailyStatus.DRAFT, DailyStatus.REJECTED];

@Injectable()
export class DailyProductionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private isGlobal7(user: AuthUser): boolean {
    return user.companyType === CompanyType.OPERATOR;
  }

  /** Filtro de leitura por papel/tenant. */
  private scopeFor(user: AuthUser): Prisma.DailyProductionWhereInput {
    if (user.companyType === CompanyType.OPERATOR) return {};
    if (user.companyType === CompanyType.SUBCONTRACTOR) {
      return { team: { subcontractorCompanyId: user.companyId } };
    }
    // TEAM_MEMBER: apenas dailies das equipes de que participa.
    if (user.companyType === CompanyType.CLIENT) return { id: '__none__' };
    return { team: { memberships: { some: { userId: user.id } } } };
  }

  // ─── Criação / edição (upsert idempotente por clientUuid) ───
  async create(user: AuthUser, dto: CreateDailyDto) {
    const team = await this.prisma.team.findUnique({ where: { id: dto.teamId } });
    if (!team) throw new NotFoundException('Equipe não encontrada');

    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');

    await this.assertCanWriteForTeam(user, dto.teamId, team.subcontractorCompanyId);

    // Coerência: se o projeto está amarrado a uma equipe, precisa ser a mesma.
    if (project.teamId && project.teamId !== dto.teamId) {
      throw new BadRequestException('Este projeto não pertence à equipe informada');
    }

    const existing = await this.prisma.dailyProduction.findUnique({
      where: { clientUuid: dto.clientUuid },
    });

    if (existing) {
      // Idempotência: reenvio do mesmo lançamento não duplica.
      if (existing.authorUserId !== user.id && !this.isGlobal7(user)) {
        throw new ForbiddenException('Daily pertence a outro usuário');
      }
      if (!EDITABLE.includes(existing.status)) {
        return existing; // já enviado/aprovado — no-op idempotente
      }
      return this.prisma.dailyProduction.update({
        where: { id: existing.id },
        data: {
          description: dto.description,
          productionDate: new Date(dto.productionDate),
          gpsLat: dto.gpsLat,
          gpsLng: dto.gpsLng,
          // reenviar um rejeitado volta pra DRAFT até o técnico submeter de novo
          status: DailyStatus.DRAFT,
          rejectionReason: null,
        },
      });
    }

    return this.prisma.dailyProduction.create({
      data: {
        clientUuid: dto.clientUuid,
        projectId: dto.projectId,
        teamId: dto.teamId,
        authorUserId: user.id,
        productionDate: new Date(dto.productionDate),
        description: dto.description,
        gpsLat: dto.gpsLat,
        gpsLng: dto.gpsLng,
        status: DailyStatus.DRAFT,
      },
    });
  }

  // ─── Transições de estado ───
  async submit(user: AuthUser, id: string) {
    const daily = await this.getScopedOrThrow(user, id);
    await this.assertCanWriteForTeam(user, daily.teamId, daily.team.subcontractorCompanyId);
    if (!EDITABLE.includes(daily.status)) {
      throw new BadRequestException(`Não é possível enviar um daily com status ${daily.status}`);
    }
    return this.prisma.dailyProduction.update({
      where: { id },
      data: { status: DailyStatus.SUBMITTED, rejectionReason: null },
    });
  }

  async approve(user: AuthUser, id: string) {
    this.assertGlobal7(user);
    const daily = await this.getScopedOrThrow(user, id);
    if (daily.status !== DailyStatus.SUBMITTED) {
      throw new BadRequestException('Só é possível aprovar um daily enviado (SUBMITTED)');
    }
    return this.prisma.dailyProduction.update({
      where: { id },
      data: { status: DailyStatus.APPROVED, reviewedByUserId: user.id, reviewedAt: new Date() },
    });
  }

  async reject(user: AuthUser, id: string, reason: string) {
    this.assertGlobal7(user);
    const daily = await this.getScopedOrThrow(user, id);
    if (daily.status !== DailyStatus.SUBMITTED) {
      throw new BadRequestException('Só é possível rejeitar um daily enviado (SUBMITTED)');
    }
    return this.prisma.dailyProduction.update({
      where: { id },
      data: {
        status: DailyStatus.REJECTED,
        rejectionReason: reason,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
      },
    });
  }

  // ─── Leitura ───
  async list(user: AuthUser, query: QueryDailyDto) {
    const where: Prisma.DailyProductionWhereInput = { ...this.scopeFor(user) };
    if (query.status) where.status = query.status;
    if (query.projectId) where.projectId = query.projectId;
    if (query.teamId) where.teamId = query.teamId;
    if (query.from || query.to) {
      where.productionDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const { page, pageSize } = query;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.dailyProduction.findMany({
        where,
        orderBy: [{ productionDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { id: true, code: true } },
          team: { select: { id: true, name: true } },
          author: { select: { id: true, name: true } },
          _count: { select: { attachments: true } },
        },
      }),
      this.prisma.dailyProduction.count({ where }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const daily = await this.prisma.dailyProduction.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: {
        project: { select: { id: true, code: true, description: true } },
        team: { select: { id: true, name: true } },
        author: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!daily) throw new NotFoundException('Daily não encontrado');
    const { attachments, ...rest } = daily;
    return { ...rest, attachments: attachments.map((a) => this.serializeAttachment(a)) };
  }

  // ─── Anexos (foto de produção / mapa) ───
  async addAttachment(
    user: AuthUser,
    id: string,
    file: Express.Multer.File | undefined,
    dto: UploadAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('Arquivo (campo "file") é obrigatório');
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Apenas imagens são aceitas');
    }

    const daily = await this.getScopedOrThrow(user, id);
    await this.assertCanWriteForTeam(user, daily.teamId, daily.team.subcontractorCompanyId);
    if (!EDITABLE.includes(daily.status)) {
      throw new BadRequestException('Só é possível anexar fotos em daily DRAFT ou REJECTED');
    }

    // Thumbnail leve (WebP) p/ preview instantâneo — vive no Postgres.
    const thumbnail = await sharp(file.buffer)
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();

    // Original vai pro storage (LocalDisk agora; Drive/R2 na fase 3).
    const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const saved = await this.storage.save(file.buffer, { ext, contentType: file.mimetype });

    const attachment = await this.prisma.attachment.create({
      data: {
        dailyProductionId: daily.id,
        type: dto.type as AttachmentType,
        storageKey: saved.key,
        driveFileId: saved.driveFileId,
        driveWebViewLink: saved.webViewLink,
        thumbnailData: new Uint8Array(thumbnail),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadStatus: 'STORED',
        gpsLat: dto.gpsLat,
        gpsLng: dto.gpsLng,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : undefined,
      },
    });
    return this.serializeAttachment(attachment);
  }

  // ─── Helpers ───
  private async getScopedOrThrow(user: AuthUser, id: string) {
    const daily = await this.prisma.dailyProduction.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: { team: { select: { subcontractorCompanyId: true } } },
    });
    if (!daily) throw new NotFoundException('Daily não encontrado');
    return daily;
  }

  private assertGlobal7(user: AuthUser): void {
    if (!this.isGlobal7(user)) throw new ForbiddenException('Ação restrita à Global 7');
  }

  /** Quem pode criar/editar/anexar no daily de uma equipe. */
  private async assertCanWriteForTeam(
    user: AuthUser,
    teamId: string,
    subcontractorCompanyId: string,
  ): Promise<void> {
    if (this.isGlobal7(user)) return;
    if (user.companyId !== subcontractorCompanyId) {
      throw new ForbiddenException('Sem acesso a esta equipe');
    }
    if (user.companyType === CompanyType.SUBCONTRACTOR) return; // admin da subcontratada
    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: user.id } },
    });
    if (!membership) throw new ForbiddenException('Você não é membro desta equipe');
  }

  /**
   * Baixa o ORIGINAL de um anexo (via StorageService), respeitando escopo/papel.
   * Serve tanto LocalDisk quanto Drive — o front chama autenticado sob demanda.
   */
  async getAttachmentOriginal(user: AuthUser, dailyId: string, attachmentId: string) {
    await this.getScopedOrThrow(user, dailyId); // valida acesso ao daily (tenant/papel)
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, dailyProductionId: dailyId },
    });
    if (!attachment || !attachment.storageKey) {
      throw new NotFoundException('Anexo não encontrado');
    }
    const buffer = await this.storage.read(attachment.storageKey);
    return { buffer, mimeType: attachment.mimeType || 'application/octet-stream' };
  }

  private serializeAttachment(a: {
    id: string;
    dailyProductionId: string;
    type: AttachmentType;
    mimeType: string | null;
    sizeBytes: number | null;
    uploadStatus: string;
    gpsLat: number | null;
    gpsLng: number | null;
    capturedAt: Date | null;
    createdAt: Date;
    storageKey: string | null;
    driveWebViewLink: string | null;
    thumbnailData: Uint8Array | null;
  }) {
    return {
      id: a.id,
      type: a.type,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadStatus: a.uploadStatus,
      gpsLat: a.gpsLat,
      gpsLng: a.gpsLng,
      capturedAt: a.capturedAt,
      createdAt: a.createdAt,
      // preview pronto pro front (base64) — o original fica no storage.
      thumbnailUrl: a.thumbnailData
        ? `data:image/webp;base64,${Buffer.from(a.thumbnailData).toString('base64')}`
        : null,
      // caminho (relativo à api) p/ baixar o original autenticado, quando existir.
      originalPath: a.storageKey
        ? `/daily-production/${a.dailyProductionId}/attachments/${a.id}/original`
        : null,
      // link direto no Drive (útil só p/ a Global 7, dona do Drive).
      driveWebViewLink: a.driveWebViewLink ?? null,
    };
  }
}
