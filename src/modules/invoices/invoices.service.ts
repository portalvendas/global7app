import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType, InvoiceStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

const INVOICE_INCLUDE = {
  project: { select: { id: true, code: true } },
  client: { select: { id: true, name: true } },
  lines: { orderBy: { id: 'asc' as const } },
};

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private isGlobal7(u: AuthUser) {
    return u.companyType === CompanyType.OPERATOR;
  }

  /** Global7 vê tudo; cliente vê só as próprias; subcontratada não vê AR. */
  private scopeFor(u: AuthUser): Prisma.InvoiceWhereInput {
    if (this.isGlobal7(u)) return {};
    if (u.companyType === CompanyType.CLIENT) return { clientCompanyId: u.companyId };
    return { id: '__none__' };
  }

  async create(dto: CreateInvoiceDto) {
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    const lines = dto.lines ?? [];
    const amount = lines.length
      ? lines.reduce((s, l) => s + Number(l.total || Number(l.quantity || 0) * Number(l.rate || 0)), 0)
      : Number(dto.amount || 0);
    return this.prisma.invoice.create({
      data: {
        projectId: project.id,
        clientCompanyId: project.clientCompanyId,
        amount: new Prisma.Decimal(amount),
        currency: 'USD',
        number: dto.number,
        issuedTo: dto.issuedTo,
        billedTo: dto.billedTo,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: InvoiceStatus.DRAFT,
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
      include: INVOICE_INCLUDE,
    });
  }

  async list(u: AuthUser, pagination: PaginationDto, status?: InvoiceStatus) {
    const where: Prisma.InvoiceWhereInput = { ...this.scopeFor(u), ...(status ? { status } : {}) };
    const { page, pageSize } = pagination;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: INVOICE_INCLUDE,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(u: AuthUser, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, ...this.scopeFor(u) },
      include: INVOICE_INCLUDE,
    });
    if (!inv) throw new NotFoundException('Invoice não encontrada');
    return inv;
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const inv = await this.getOrThrow(id);
    if (inv.status !== InvoiceStatus.DRAFT) throw new BadRequestException('Só é possível editar invoice em DRAFT');
    const data: Prisma.InvoiceUpdateInput = {
      number: dto.number,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    };
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    return this.prisma.invoice.update({ where: { id }, data });
  }

  async send(id: string) {
    const inv = await this.getOrThrow(id);
    if (inv.status !== InvoiceStatus.DRAFT) throw new BadRequestException('Só envia invoice em DRAFT');
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT, issueDate: inv.issueDate ?? new Date() },
    });
  }

  async markPaid(id: string) {
    const inv = await this.getOrThrow(id);
    if (inv.status !== InvoiceStatus.SENT) throw new BadRequestException('Só marca como paga uma invoice SENT');
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.PAID, paidAt: new Date() } });
  }

  private async getOrThrow(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice não encontrada');
    return inv;
  }
}
