import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BillStatus, CompanyType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateBillDto } from './dto/create-bill.dto';

const BILL_INCLUDE = {
  subcontractor: { select: { id: true, name: true } },
  project: { select: { id: true, code: true } },
  lines: { orderBy: { id: 'asc' as const } },
};

@Injectable()
export class BillsService {
  constructor(private readonly prisma: PrismaService) {}

  private isGlobal7(u: AuthUser) {
    return u.companyType === CompanyType.OPERATOR;
  }

  /** Global7 vê tudo; subcontratada vê só as próprias bills. */
  private scopeFor(u: AuthUser): Prisma.BillWhereInput {
    if (this.isGlobal7(u)) return {};
    if (u.companyType === CompanyType.SUBCONTRACTOR) return { subcontractorCompanyId: u.companyId };
    return { id: '__none__' };
  }

  async create(u: AuthUser, dto: CreateBillDto) {
    const subcontractorCompanyId = this.isGlobal7(u) ? dto.subcontractorCompanyId : u.companyId;
    if (!subcontractorCompanyId) {
      throw new BadRequestException('subcontractorCompanyId é obrigatório quando a Global 7 lança a bill');
    }
    const lines = dto.lines ?? [];
    const amount = lines.length
      ? lines.reduce((s, l) => s + Number(l.total || Number(l.quantity || 0) * Number(l.rate || 0)), 0)
      : Number(dto.amount || 0);
    return this.prisma.bill.create({
      data: {
        subcontractorCompanyId,
        projectId: dto.projectId,
        teamId: dto.teamId,
        amount: new Prisma.Decimal(amount),
        currency: 'USD',
        description: dto.description,
        number: dto.number,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        submittedByUserId: u.id,
        status: BillStatus.SUBMITTED,
        lines: {
          create: lines.map((l) => ({
            code: l.code || null,
            description: l.description,
            unit: l.unit || null,
            quantity: new Prisma.Decimal(l.quantity || 0),
            rate: new Prisma.Decimal(l.rate || 0),
            total: new Prisma.Decimal(l.total || Number(l.quantity || 0) * Number(l.rate || 0)),
          })),
        },
      },
      include: BILL_INCLUDE,
    });
  }

  async list(u: AuthUser, pagination: PaginationDto, status?: BillStatus) {
    const where: Prisma.BillWhereInput = { ...this.scopeFor(u), ...(status ? { status } : {}) };
    const { page, pageSize } = pagination;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bill.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: BILL_INCLUDE,
      }),
      this.prisma.bill.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(u: AuthUser, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, ...this.scopeFor(u) },
      include: {
        subcontractor: { select: { id: true, name: true } },
        project: { select: { id: true, code: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        lines: { orderBy: { id: 'asc' } },
      },
    });
    if (!bill) throw new NotFoundException('Bill não encontrada');
    return bill;
  }

  async approve(id: string, u: AuthUser) {
    const bill = await this.getOrThrow(id);
    if (bill.status !== BillStatus.SUBMITTED) throw new BadRequestException('Só aprova bill SUBMITTED');
    return this.prisma.bill.update({
      where: { id },
      data: { status: BillStatus.APPROVED, approvedByUserId: u.id },
    });
  }

  async markPaid(id: string) {
    const bill = await this.getOrThrow(id);
    if (bill.status !== BillStatus.APPROVED) throw new BadRequestException('Só paga bill APPROVED');
    return this.prisma.bill.update({ where: { id }, data: { status: BillStatus.PAID, paidAt: new Date() } });
  }

  private async getOrThrow(id: string) {
    const bill = await this.prisma.bill.findUnique({ where: { id } });
    if (!bill) throw new NotFoundException('Bill não encontrada');
    return bill;
  }
}
