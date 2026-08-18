import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  companyId: true,
  company: { select: { id: true, name: true, type: true } },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private isG7(u: AuthUser): boolean {
    return u.companyType === CompanyType.OPERATOR;
  }

  /** G7 vê todos (filtra por empresa se pedir); sub_admin só a própria empresa. */
  async list(user: AuthUser, pagination: PaginationDto, companyId?: string, q?: string) {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (this.isG7(user)) {
      if (companyId) where.companyId = companyId;
    } else {
      where.companyId = user.companyId;
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const { page, pageSize } = pagination;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize, select: USER_SELECT }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async update(user: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) throw new NotFoundException('Usuário não encontrado');
    if (!this.isG7(user)) {
      if (target.companyId !== user.companyId) throw new ForbiddenException('Sem acesso a este usuário');
      if (dto.role === UserRole.GLOBAL7_ADMIN || dto.role === UserRole.GLOBAL7_STAFF) {
        throw new ForbiddenException('Sem permissão para conceder papel Global 7');
      }
    }
    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      email: dto.email ? dto.email.toLowerCase() : undefined,
      role: dto.role,
      isActive: dto.isActive,
    };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }
}
