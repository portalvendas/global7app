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

  /** Vencimento = data da invoice + Nº de dias dos termos (NET21/NET30…). */
  private dueFrom(issueDate?: string, terms?: string, due?: string): Date | undefined {
    if (due) return new Date(due);
    if (!issueDate || !terms) return undefined;
    const m = terms.match(/(\d+)/);
    if (!m) return undefined;
    const d = new Date(issueDate);
    d.setDate(d.getDate() + Number(m[1]));
    return d;
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
        paymentTerms: dto.paymentTerms,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: this.dueFrom(dto.issueDate, dto.paymentTerms, dto.dueDate),
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
    if (inv.status === InvoiceStatus.PAID) throw new BadRequestException('Não é possível editar invoice paga');
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.InvoiceUpdateInput = {
        number: dto.number,
        issuedTo: dto.issuedTo,
        billedTo: dto.billedTo,
        paymentTerms: dto.paymentTerms,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      };
      // Troca de projeto ajusta o cliente.
      if (dto.projectId && dto.projectId !== inv.projectId) {
        const project = await tx.project.findUnique({ where: { id: dto.projectId } });
        if (!project) throw new NotFoundException('Projeto não encontrado');
        data.project = { connect: { id: project.id } };
        data.client = { connect: { id: project.clientCompanyId } };
      }
      const terms = dto.paymentTerms ?? inv.paymentTerms ?? undefined;
      const issue = dto.issueDate ?? (inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : undefined);
      const due = this.dueFrom(issue, terms, dto.dueDate);
      if (due) data.dueDate = due;

      // Substitui as linhas quando enviadas; recalcula o amount.
      if (dto.lines) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        if (dto.lines.length) {
          await tx.invoiceLine.createMany({
            data: dto.lines.map((l) => ({
              invoiceId: id,
              code: l.code || null,
              description: l.description,
              unit: l.unit || null,
              quantity: new Prisma.Decimal(l.quantity || 0),
              rate: new Prisma.Decimal(l.rate || 0),
              total: new Prisma.Decimal(l.total || Number(l.quantity || 0) * Number(l.rate || 0)),
            })),
          });
        }
        data.amount = new Prisma.Decimal(dto.lines.reduce((s, l) => s + Number(l.total || Number(l.quantity || 0) * Number(l.rate || 0)), 0));
      } else if (dto.amount !== undefined) {
        data.amount = new Prisma.Decimal(dto.amount);
      }
      await tx.invoice.update({ where: { id }, data });
      return tx.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    });
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
