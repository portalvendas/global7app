import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

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

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.company.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException('Empresa não encontrada');
  }
}
