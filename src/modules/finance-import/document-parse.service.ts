import { BadRequestException, Injectable } from '@nestjs/common';

// pdf-parse (mesma abordagem usada em projects)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
// exceljs para .xlsx
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');

export interface ParsedFinanceDoc {
  amount: number | null;
  number: string | null;
  issueDate: string | null; // yyyy-mm-dd
  dueDate: string | null; // yyyy-mm-dd
  projectCode: string | null; // código bruto detectado no arquivo (ex.: "SO34E")
  description: string | null;
  note: string;
}

@Injectable()
export class DocumentParseService {
  /** Lê um PDF ou Excel (best-effort) e extrai campos para preencher Invoice/Payroll. */
  async parse(file: Express.Multer.File | undefined): Promise<ParsedFinanceDoc> {
    if (!file) throw new BadRequestException('Arquivo (campo "file") é obrigatório');
    const name = (file.originalname || '').toLowerCase();
    const isExcel =
      name.endsWith('.xlsx') ||
      name.endsWith('.xlsm') ||
      file.mimetype?.includes('spreadsheet') ||
      file.mimetype?.includes('excel');
    const isPdf = name.endsWith('.pdf') || file.mimetype === 'application/pdf';

    let lines: string[] = [];
    try {
      if (isExcel) lines = await this.readExcel(file.buffer);
      else if (isPdf) lines = await this.readPdf(file.buffer);
      else lines = await this.readPdf(file.buffer); // tenta PDF por padrão
    } catch {
      return this.empty('Não consegui ler o arquivo (formato não suportado ou imagem/escaneado). Preencha manualmente.');
    }

    const data = this.extract(lines);
    const found = [data.amount != null && 'valor', data.number && 'número', data.issueDate && 'data', data.projectCode && 'projeto']
      .filter(Boolean);
    return {
      ...data,
      note: found.length
        ? `Extraído: ${found.join(', ')}. Confira antes de salvar.`
        : 'Não reconheci os campos automaticamente. Preencha manualmente.',
    };
  }

  private empty(note: string): ParsedFinanceDoc {
    return { amount: null, number: null, issueDate: null, dueDate: null, projectCode: null, description: null, note };
  }

  private async readPdf(buffer: Buffer): Promise<string[]> {
    const text = (await pdfParse(buffer)).text || '';
    return text.split('\n');
  }

  private async readExcel(buffer: Buffer): Promise<string[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const out: string[] = [];
    wb.eachSheet((ws: any) => {
      ws.eachRow((row: any) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell: any) => {
          const v = cell.value;
          if (v == null) return;
          if (typeof v === 'object') {
            if (v.result != null) cells.push(String(v.result)); // fórmula → resultado
            else if (v.text != null) cells.push(String(v.text)); // rich text
            else if (v instanceof Date) cells.push(v.toISOString().slice(0, 10));
            else cells.push(String(v.hyperlink || ''));
          } else {
            cells.push(String(v));
          }
        });
        if (cells.length) out.push(cells.join(' | '));
      });
    });
    return out;
  }

  // ─── Heurísticas de extração ──────────────────────────────
  private extract(rawLines: string[]): Omit<ParsedFinanceDoc, 'note'> {
    const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const joined = lines.join('\n');

    return {
      amount: this.findAmount(lines),
      number: this.findNumber(joined),
      issueDate: this.findDate(joined),
      dueDate: null,
      projectCode: this.findProjectCode(joined),
      description: null,
    };
  }

  private parseMoney(s: string): number | null {
    const m = s.match(/\$?\s*([0-9][0-9.,]*[0-9]|[0-9])/);
    if (!m) return null;
    let n = m[1];
    // remove separador de milhar (vírgula) — formato US
    if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '');
    else if (n.includes(',') && !n.includes('.')) n = n.replace(/,/g, '');
    const val = Number(n);
    return isFinite(val) ? val : null;
  }

  /** Prefere linhas de TOTAL/SALDO A RECEBER; senão o maior valor monetário do doc. */
  private findAmount(lines: string[]): number | null {
    const totalRe = /(GRAND TOTAL|TOTAL A RECEBER|SALDO A RECEBER(?: BRUTO)?|AMOUNT DUE|\bTOTAL\b)/i;
    let best: number | null = null;
    for (const line of lines) {
      if (!totalRe.test(line)) continue;
      // pega o último número da linha
      const nums = line.match(/\$?\s*[0-9][0-9.,]*/g);
      if (!nums) continue;
      const v = this.parseMoney(nums[nums.length - 1]);
      if (v != null && v > 0 && (best == null || v > best)) best = v;
    }
    if (best != null) return best;
    // fallback: maior valor monetário com $ no documento
    let max: number | null = null;
    for (const line of lines) {
      const nums = line.match(/\$\s*[0-9][0-9.,]*/g);
      if (!nums) continue;
      for (const raw of nums) {
        const v = this.parseMoney(raw);
        if (v != null && (max == null || v > max)) max = v;
      }
    }
    return max;
  }

  private findNumber(text: string): string | null {
    // "INVOICE 09", "INVOICE #09", "INVOICE No 09" — exige dígito logo após
    const m = text.match(/\bINVOICE\b\s*(?:#|N[o.º]?\.?|NUMBER)?\s*([0-9][0-9-]*)/i);
    return m ? m[1] : null;
  }

  private findDate(text: string): string | null {
    // "Date : 08/04/2026" (mm/dd/yyyy US)
    const m = text.match(/\bDATE\b\s*[:\-]?\s*([0-3]?\d)[/.\-]([0-3]?\d)[/.\-](\d{2,4})/i);
    if (!m) return null;
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    const mm = a.padStart(2, '0');
    const dd = b.padStart(2, '0');
    const month = Number(mm);
    const day = Number(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${mm}-${dd}`;
  }

  private findProjectCode(text: string): string | null {
    // "Project Location : PROJ - SO34E"  → SO34E
    let m = text.match(/Project\s*Location\s*[:\-]?\s*([^\n]+)/i);
    if (!m) m = text.match(/\bPROJ(?:ETO|ECT)?\b\s*[-:]\s*([^\n|]+)/i);
    if (!m) return null;
    let raw = m[1].trim();
    // limpa prefixos comuns e pega o último token significativo
    raw = raw.replace(/^PROJ(?:ETO|ECT)?\b/i, '').replace(/^[-:\s]+/, '').trim();
    // corta em separadores de coluna do excel
    raw = raw.split('|')[0].trim();
    // se sobrar "PROJ - SO34E", pega a parte após o traço
    const parts = raw.split(/\s*[-–]\s*/).filter(Boolean);
    const code = (parts.length > 1 ? parts[parts.length - 1] : parts[0] || raw).trim();
    return code || null;
  }
}
