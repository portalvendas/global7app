import { Injectable } from '@nestjs/common';
import { CompanyType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';

type StatusMoney = Record<string, { amount: number; count: number }>;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private num(d: Prisma.Decimal | null | undefined): number {
    return d ? Number(d) : 0;
  }

  private invoiceScope(u: AuthUser): Prisma.InvoiceWhereInput | null {
    if (u.companyType === CompanyType.OPERATOR) return {};
    if (u.companyType === CompanyType.CLIENT) return { clientCompanyId: u.companyId };
    return null; // subcontratada/equipe não veem AR
  }

  private billScope(u: AuthUser): Prisma.BillWhereInput | null {
    if (u.companyType === CompanyType.OPERATOR) return {};
    if (u.companyType === CompanyType.SUBCONTRACTOR) return { subcontractorCompanyId: u.companyId };
    return null;
  }

  private dailyScope(u: AuthUser): Prisma.DailyProductionWhereInput | null {
    if (u.companyType === CompanyType.OPERATOR) return {};
    if (u.companyType === CompanyType.SUBCONTRACTOR) return { team: { subcontractorCompanyId: u.companyId } };
    if (u.companyType === CompanyType.CLIENT) return null;
    return { team: { memberships: { some: { userId: u.id } } } };
  }

  async summary(u: AuthUser) {
    const [receivable, payable, production] = await Promise.all([
      this.receivable(u),
      this.payable(u),
      this.production(u),
    ]);
    return { currency: 'USD', receivable, payable, production };
  }

  private async receivable(u: AuthUser) {
    const where = this.invoiceScope(u);
    if (!where) return null;
    const grouped = await this.prisma.invoice.groupBy({
      by: ['status'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const byStatus: StatusMoney = {};
    for (const g of grouped) byStatus[g.status] = { amount: this.num(g._sum.amount), count: g._count._all };
    return {
      byStatus,
      outstanding: byStatus.SENT?.amount ?? 0, // emitidas e não pagas
      paid: byStatus.PAID?.amount ?? 0,
      draft: byStatus.DRAFT?.amount ?? 0,
      total: Object.values(byStatus).reduce((s, v) => s + v.amount, 0),
    };
  }

  private async payable(u: AuthUser) {
    const where = this.billScope(u);
    if (!where) return null;
    const grouped = await this.prisma.bill.groupBy({
      by: ['status'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const byStatus: StatusMoney = {};
    for (const g of grouped) byStatus[g.status] = { amount: this.num(g._sum.amount), count: g._count._all };
    return {
      byStatus,
      pendingApproval: byStatus.SUBMITTED?.amount ?? 0,
      toPay: byStatus.APPROVED?.amount ?? 0, // aprovadas, aguardando pagamento
      paid: byStatus.PAID?.amount ?? 0,
      total: Object.values(byStatus).reduce((s, v) => s + v.amount, 0),
    };
  }

  private async production(u: AuthUser) {
    const where = this.dailyScope(u);
    if (!where) return null;
    const grouped = await this.prisma.dailyProduction.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[g.status] = g._count._all;
    return {
      byStatus,
      pendingReview: byStatus.SUBMITTED ?? 0,
      approved: byStatus.APPROVED ?? 0,
      total: Object.values(byStatus).reduce((s, v) => s + v, 0),
    };
  }
}
