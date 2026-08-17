import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private isGlobal7(user: AuthUser): boolean {
    return user.companyType === CompanyType.OPERATOR;
  }

  create(dto: CreateCompanyDto) {
    return this.prisma.company.create({ data: dto });
  }

  async list(user: AuthUser, pagination: PaginationDto) {
    // Global 7 vê todas; qualquer outra empresa vê apenas a si mesma.
    const where: Prisma.CompanyWhereInput = this.isGlobal7(user)
      ? { deletedAt: null }
      : { id: user.companyId, deletedAt: null };

    const { page, pageSize } = pagination;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    if (!this.isGlobal7(user) && user.companyId !== id) {
      throw new ForbiddenException('Sem acesso a esta empresa');
    }
    const company = await this.prisma.company.findFirst({ where: { id, deletedAt: null } });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.ensureExists(id);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // Soft delete.
    return this.prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Anexa o PDF do W-9 (guarda no storage) e registra metadados. Extração é no cliente. */
  async uploadW9(id: string, file: Express.Multer.File | undefined) {
    await this.ensureExists(id);
    if (!file) throw new BadRequestException('Arquivo (campo "file") é obrigatório');
    const ext = (file.originalname.split('.').pop() || 'pdf').toLowerCase();
    const saved = await this.storage.save(file.buffer, { ext, contentType: file.mimetype });
    return this.prisma.company.update({
      where: { id },
      data: {
        w9FileKey: saved.key,
        w9FileName: file.originalname || `w9.${ext}`,
        w9ReceivedAt: new Date(),
      },
    });
  }

  /** Baixa o W-9 anexado (scoped: Global 7 ou a própria empresa). */
  async getW9(user: AuthUser, id: string) {
    const company = await this.findOne(user, id); // valida acesso
    if (!company.w9FileKey) throw new NotFoundException('W-9 não anexado');
    const buffer = await this.storage.read(company.w9FileKey);
    const name = company.w9FileName || 'w9.pdf';
    const mimeType = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
    return { buffer, mimeType, name };
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.company.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException('Empresa não encontrada');
  }
}
