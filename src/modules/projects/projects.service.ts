import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        code: dto.code,
        description: dto.description,
        contractValue: new Prisma.Decimal(dto.contractValue),
        clientCompanyId: dto.clientCompanyId,
        subcontractorCompanyId: dto.subcontractorCompanyId,
        teamId: dto.teamId,
      },
    });
  }

  /** Escopo: Global 7 vê tudo; subcontratada vê os projetos onde é responsável. */
  private scopeFor(user: AuthUser): Prisma.ProjectWhereInput {
    if (user.companyType === CompanyType.OPERATOR) return {};
    if (user.companyType === CompanyType.SUBCONTRACTOR) {
      return { subcontractorCompanyId: user.companyId };
    }
    return { clientCompanyId: user.companyId }; // CLIENT
  }

  async list(user: AuthUser, pagination: PaginationDto) {
    const where = this.scopeFor(user);
    const { page, pageSize } = pagination;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, name: true } },
          subcontractor: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...this.scopeFor(user) },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.ensureExists(id);
    const data: Prisma.ProjectUpdateInput = { ...dto } as Prisma.ProjectUpdateInput;
    if (dto.contractValue !== undefined) {
      data.contractValue = new Prisma.Decimal(dto.contractValue);
    }
    return this.prisma.project.update({ where: { id }, data });
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.project.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Projeto não encontrado');
  }
}
