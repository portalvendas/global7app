import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto, ProjectServiceDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;

const INCLUDE = {
  client: { select: { id: true, name: true } },
  subcontractors: { include: { company: { select: { id: true, name: true } } } },
  services: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        code: dto.code,
        clientCompanyId: dto.clientCompanyId,
        subcontractors: { create: (dto.subcontractorCompanyIds ?? []).map((companyId) => ({ companyId })) },
        services: { create: (dto.services ?? []).map((s) => this.serviceData(s)) },
      },
      include: INCLUDE,
    });
  }

  private serviceData(s: ProjectServiceDto) {
    return {
      code: s.code,
      description: s.description,
      unit: s.unit || null,
      clientValue: new Prisma.Decimal(s.clientValue || 0),
      subValue: new Prisma.Decimal(s.subValue || 0),
    };
  }

  /** Escopo: Global 7 vê tudo; subcontratada vê projetos onde participa; cliente os seus. */
  private scopeFor(user: AuthUser): Prisma.ProjectWhereInput {
    if (user.companyType === CompanyType.OPERATOR) return {};
    if (user.companyType === CompanyType.SUBCONTRACTOR) {
      return { subcontractors: { some: { companyId: user.companyId } } };
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
        include: INCLUDE,
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: INCLUDE,
    });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.ensureExists(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { code: dto.code, clientCompanyId: dto.clientCompanyId },
      });
      if (dto.subcontractorCompanyIds) {
        await tx.projectSubcontractor.deleteMany({ where: { projectId: id } });
        if (dto.subcontractorCompanyIds.length) {
          await tx.projectSubcontractor.createMany({
            data: dto.subcontractorCompanyIds.map((companyId) => ({ projectId: id, companyId })),
          });
        }
      }
      if (dto.services) {
        await tx.projectService.deleteMany({ where: { projectId: id } });
        if (dto.services.length) {
          await tx.projectService.createMany({
            data: dto.services.map((s) => ({ projectId: id, ...this.serviceData(s) })),
          });
        }
      }
      return tx.project.findUnique({ where: { id }, include: INCLUDE });
    });
  }

  /**
   * Lê um PDF de tabela de preços (best-effort) e devolve linhas {code, description, unit, value}
   * para o usuário revisar/importar. PDFs só-imagem retornam vazio (preenche manual).
   */
  async parseRateTable(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Arquivo (campo "file") é obrigatório');
    let text = '';
    try {
      text = (await pdfParse(file.buffer)).text || '';
    } catch {
      return { lines: [], note: 'Não consegui ler o PDF (provável imagem/escaneado). Preencha manualmente.' };
    }
    const lines = this.extractRateLines(text);
    return {
      lines,
      note: lines.length
        ? `${lines.length} linha(s) detectada(s). Confira e ajuste antes de salvar.`
        : 'Nenhuma linha reconhecida automaticamente (PDF pode ser imagem). Preencha manualmente.',
    };
  }

  private extractRateLines(text: string): { code: string; description: string; unit: string; value: number }[] {
    const unitRe = /(Per Splice|Per Enclosure|Per Location|Per Re-?entry|Per Each [A-Za-z]+|Per [A-Za-z/ ]+?|Each|EACH|FT)\b/i;
    const out: { code: string; description: string; unit: string; value: number }[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      // preço no fim da linha ($ 12.00 / 12.00)
      const pm = line.match(/\$?\s*([0-9][0-9.,]*[0-9])\s*$/);
      if (!pm) continue;
      const value = Number(pm[1].replace(/,/g, ''));
      if (!isFinite(value) || value <= 0) continue;
      let rest = line.slice(0, pm.index).trim().replace(/[|:]+$/, '').trim();
      if (!rest) continue;
      // unidade
      let unit = '';
      const um = rest.match(unitRe);
      if (um) { unit = um[0].trim(); rest = rest.replace(um[0], '').trim(); }
      rest = rest.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim();
      // código = primeiro token; descrição = restante
      const sp = rest.indexOf(' ');
      const code = (sp === -1 ? rest : rest.slice(0, sp)).replace(/[|:]/g, '').trim();
      const description = (sp === -1 ? '' : rest.slice(sp + 1)).replace(/[|:]+/g, '').trim();
      if (!code || code.length > 16) continue; // linha improvável de ser item
      out.push({ code, description, unit, value });
    }
    return out;
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.project.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Projeto não encontrado');
  }
}
