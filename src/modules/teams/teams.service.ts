import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  private isGlobal7(user: AuthUser): boolean {
    return user.companyType === CompanyType.OPERATOR;
  }

  create(user: AuthUser, dto: CreateTeamDto) {
    const subcontractorCompanyId = this.isGlobal7(user)
      ? dto.subcontractorCompanyId
      : user.companyId;
    if (!subcontractorCompanyId) {
      throw new BadRequestException('subcontractorCompanyId é obrigatório');
    }
    return this.prisma.team.create({ data: { name: dto.name, subcontractorCompanyId } });
  }

  async list(user: AuthUser, pagination: PaginationDto) {
    const where: Prisma.TeamWhereInput = this.isGlobal7(user)
      ? {}
      : { subcontractorCompanyId: user.companyId };
    const { page, pageSize } = pagination;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { memberships: true } } },
      }),
      this.prisma.team.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { memberships: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!team) throw new NotFoundException('Equipe não encontrada');
    if (!this.isGlobal7(user) && team.subcontractorCompanyId !== user.companyId) {
      throw new ForbiddenException('Sem acesso a esta equipe');
    }
    return team;
  }

  async addMember(user: AuthUser, teamId: string, userId: string) {
    await this.findOne(user, teamId); // valida acesso
    return this.prisma.teamMembership.create({ data: { teamId, userId } });
  }
}
