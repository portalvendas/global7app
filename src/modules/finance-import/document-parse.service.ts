import { BadRequestException, Injectable } from '@nestjs/common';

// pdf-parse (mesma abordagem usada em projects)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
// exceljs para .xlsx
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');

export interface ParsedLine {
  code: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  rate: number;
  total: number;
}

export interface ParsedFinanceDoc {
  amount: number | null;
  number: string | null;
  issueDate: string | null; // yyyy-mm-dd
  dueDate: string | null; // yyyy-mm-dd
  projectCode: string | null; // código bruto detectado no arquivo (ex.: "SO34E")
  issuedTo: string | null;
  billedTo: string | null;
  paymentTerms: string | null; // NET7, NET21, NET30…
  description: string | null;
  lines: ParsedLine[];
  note: string;
}

@Injectable()
export class DocumentParseService {
  /** Lê um PDF ou Excel (best-effort) e extrai campos para preencher Invoice/Payroll. */
  async parse(file: Express.Multer.File | undefined): Promise<ParsedFinanceDoc> {
    if (!file) throw new BadRequestException('Arquivo (campo "file") é obrigatório');
    const name = (file.originalname || '').toLowerCase();
    const isExcel =
      name.endsWith('.xlsx') || name.endsWith('.xlsm') ||
      file.mimetype?.includes('spreadsheet') || file.mimetype?.includes('excel');
    const isPdf = name.endsWith('.pdf') || file.mimetype === 'application/pdf';

    let textLines: string[] = [];
    let grid: string[][] | null = null;
    try {
      if (isExcel) {
        const r = await this.readExcel(file.buffer);
        textLines = r.textLines; grid = r.grid;
      } else if (isPdf) {
        textLines = await this.readPdf(file.buffer);
      } else {
        textLines = await this.readPdf(file.buffer);
      }
    } catch {
      return this.empty('Não consegui ler o arquivo (formato não suportado ou imagem/escaneado). Preencha manualmente.');
    }

    const base = this.extractScalars(textLines);
    const lines = grid ? this.extractExcelLines(grid) : this.extractPdfLines(textLines);
    const amount = lines.length ? lines.reduce((s, l) => s + (l.total || 0), 0) : base.amount;

    const found = [
      amount != null && 'valor',
      base.number && 'número',
      base.issueDate && 'data',
      base.projectCode && 'projeto',
      lines.length && `${lines.length} item(ns)`,
    ].filter(Boolean);

    return {
      amount,
      number: base.number,
      issueDate: base.issueDate,
      dueDate: null,
      projectCode: base.projectCode,
      issuedTo: base.issuedTo,
      billedTo: base.billedTo,
      paymentTerms: base.paymentTerms,
      description: null,
      lines,
      note: found.length ? `Extraído: ${found.join(', ')}. Confira antes de salvar.` : 'Não reconheci os campos automaticamente. Preencha manualmente.',
    };
  }

  private empty(note: string): ParsedFinanceDoc {
    return { amount: null, number: null, issueDate: null, dueDate: null, projectCode: null, issuedTo: null, billedTo: null, paymentTerms: null, description: null, lines: [], note };
  }

  private async readPdf(buffer: Buffer): Promise<string[]> {
    const text = (await pdfParse(buffer)).text || '';
    return text.split('\n');
  }

  /** Retorna as linhas de texto (para escalares) e a grade posicional (para itens). */
  private async readExcel(buffer: Buffer): Promise<{ textLines: string[]; grid: string[][] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const textLines: string[] = [];
    const grid: string[][] = [];
    wb.eachSheet((ws: any) => {
      ws.eachRow((row: any) => {
        const vals = row.values as any[]; // 1-indexed; índice 0 vazio
        const cells: string[] = [];
        for (let i = 1; i < vals.length; i++) cells.push(this.cellText(vals[i]));
        grid.push(cells);
        const nonEmpty = cells.filter((c) => c !== '');
        if (nonEmpty.length) textLines.push(nonEmpty.join(' | '));
      });
    });
    return { textLines, grid };
  }

  private cellText(v: any): string {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.result != null) return String(v.result);
      if (v.text != null) return String(v.text);
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (v.richText) return v.richText.map((t: any) => t.text).join('');
      return '';
    }
    return String(v);
  }

  private num(s: string): number {
    if (!s) return 0;
    const m = String(s).match(/-?[0-9][0-9.,]*/);
    if (!m) return 0;
    let n = m[0];
    if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '');
    else if (n.includes(',') && !n.includes('.')) n = n.replace(/,/g, '');
    const v = Number(n);
    return isFinite(v) ? v : 0;
  }

  private r2(n: number): number { return Math.round(n * 100) / 100; }

  // ─── Escalares (valor total, número, data, projeto, issued/billed) ──────
  private extractScalars(rawLines: string[]) {
    const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const joined = lines.join('\n');
    return {
      amount: this.findAmount(lines),
      number: this.findNumber(joined),
      issueDate: this.findDate(joined),
      projectCode: this.findProjectCode(joined),
      issuedTo: this.findLabelled(lines, /ISSUED TO/i),
      billedTo: this.findLabelled(lines, /BILLED TO/i),
      paymentTerms: this.findTerms(joined),
    };
  }

  private findTerms(text: string): string | null {
    let m = text.match(/\bNET\s*-?\s*(\d{1,3})\b/i);
    if (m) return 'NET' + m[1];
    m = text.match(/payment\s+(?:with(?:in)?|due(?:\s+in)?)\s+(\d{1,3})\s*days?/i);
    if (m) return 'NET' + m[1];
    return null;
  }

  private findAmount(lines: string[]): number | null {
    const totalRe = /(GRAND TOTAL|TOTAL A RECEBER|SALDO A RECEBER(?: BRUTO)?|AMOUNT DUE|\bTOTAL\b)/i;
    let best: number | null = null;
    for (const line of lines) {
      if (!totalRe.test(line)) continue;
      const nums = line.match(/\$?\s*[0-9][0-9.,]*/g);
      if (!nums) continue;
      const v = this.num(nums[nums.length - 1]);
      if (v > 0 && (best == null || v > best)) best = v;
    }
    if (best != null) return best;
    let max: number | null = null;
    for (const line of lines) {
      const nums = line.match(/\$\s*[0-9][0-9.,]*/g);
      if (!nums) continue;
      for (const raw of nums) { const v = this.num(raw); if (v > 0 && (max == null || v > max)) max = v; }
    }
    return max;
  }

  private findNumber(text: string): string | null {
    const m = text.match(/\bINVOICE\b\s*(?:#|N[o.º]?\.?|NUMBER)?\s*([0-9][0-9-]*)/i);
    return m ? m[1] : null;
  }

  private findDate(text: string): string | null {
    const m = text.match(/\bDATE\b\s*[:\-]?\s*([0-3]?\d)[/.\-]([0-3]?\d)[/.\-](\d{2,4})/i);
    if (!m) return null;
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    const mm = a.padStart(2, '0'); const dd = b.padStart(2, '0');
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
    return `${y}-${mm}-${dd}`;
  }

  private findProjectCode(text: string): string | null {
    let m = text.match(/Project\s*Location\s*[:\-]?\s*([^\n]+)/i);
    if (!m) m = text.match(/\bPROJ(?:ETO|ECT)?\b\s*[-:]\s*([^\n|]+)/i);
    if (!m) return null;
    let raw = m[1].trim().replace(/^PROJ(?:ETO|ECT)?\b/i, '').replace(/^[-:\s]+/, '').trim().split('|')[0].trim();
    const parts = raw.split(/\s*[-–]\s*/).filter(Boolean);
    const code = (parts.length > 1 ? parts[parts.length - 1] : parts[0] || raw).trim();
    return code || null;
  }

  /** Captura um nome/empresa após um rótulo (ISSUED TO / BILLED TO). */
  private findLabelled(lines: string[], startRe: RegExp): string | null {
    const idx = lines.findIndex((l) => startRe.test(l));
    if (idx === -1) return null;
    const nameLike = (raw?: string): string | null => {
      const s = (raw || '').split('|')[0].trim();
      if (!s || s.split(/\s+/).length > 5) return null;
      return /^[A-Z0-9][A-Za-z0-9 .,&'()\-]{1,40}$/.test(s) ? s : null;
    };
    const same = nameLike(lines[idx].split(startRe)[1]?.replace(/^[:\s]+/, ''));
    if (same) return same;
    for (let i = idx + 1; i < Math.min(lines.length, idx + 4); i++) {
      const c = nameLike(lines[i]);
      if (c) return c;
    }
    return null;
  }

  // ─── Itens (Excel: posicional; PDF: heurístico) ────────────────────────
  private extractExcelLines(grid: string[][]): ParsedLine[] {
    // acha a linha de cabeçalho da tabela
    let h = -1;
    let col = { code: 0, desc: 1, unit: 2, qty: 4, rate: 5, total: 6 };
    for (let r = 0; r < grid.length; r++) {
      const up = grid[r].map((c) => c.toUpperCase());
      const has = (re: RegExp) => up.findIndex((c) => re.test(c));
      const iQty = has(/QUANT|\bQTD\b|\bQTY\b/);
      const iTotal = has(/\bTOTAL\b|AMOUNT/);
      const iDesc = has(/ATIVIDADE|DESCRI|SERVI/);
      if (iQty !== -1 && iTotal !== -1 && iDesc !== -1) {
        h = r;
        col = {
          code: Math.max(0, has(/\bCOD\b|CÓDIGO|CODIGO|\bITEM\b/)),
          desc: iDesc,
          unit: has(/UNID|\bUM\b|\bUNIT\b/),
          qty: iQty,
          rate: has(/\bRATE\b|VALOR|PRE[ÇC]O|\bV\.?U\b|^\$$|\$/),
          total: iTotal,
        };
        break;
      }
    }
    if (h === -1) return [];
    const out: ParsedLine[] = [];
    for (let r = h + 1; r < grid.length; r++) {
      const row = grid[r];
      const joined = row.join(' ').toUpperCase();
      if (/SALDO A RECEBER|GRAND TOTAL|TOTAL GERAL/.test(joined)) break;
      const at = (i: number) => (i >= 0 && i < row.length ? row[i] : '');
      const description = at(col.desc).trim();
      const code = col.code >= 0 ? at(col.code).trim() : '';
      const qty = this.num(at(col.qty));
      const rate = this.num(at(col.rate));
      let total = this.num(at(col.total));
      if (!total && qty && rate) total = this.r2(qty * rate);
      if (!description && !code) continue;
      if (qty <= 0 && total <= 0) continue; // ignora itens zerados
      out.push({ code: code || null, description: description || code, unit: (at(col.unit) || '').trim() || null, quantity: qty, rate, total });
    }
    return out;
  }

  private extractPdfLines(rawLines: string[]): ParsedLine[] {
    const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim());
    const out: ParsedLine[] = [];
    const isJunk = (s: string) =>
      !s ||
      /\$/.test(s) ||
      /^[\d.,\s]+$/.test(s) ||
      /^([A-Za-z0-9] ){3,}/.test(s) || // texto com letras espaçadas (cabeçalho do template)
      /\b(TOTAL|SUBTOTAL|DESCRIPTION|QTY|RATE|AMOUNT|PROJECT LOCATION|ISSUED TO|BILLED TO|PAY TO|INVOICE|DATE|BANK|ACCOUNT|ROUTING|ZELLE|ADDRESS|ACCT|APPROVAL|PLEASE|THANK|REQUESTED|WWW\.)\b/i.test(s);
    // Caso 1 (mesma linha): "DESC QTY [UNID] $RATE $TOTAL"
    const full = /^(.*?)\s+([0-9][0-9.,]*)\s*([A-Za-z]{1,5})?\s+\$\s*([0-9][0-9.,]*)\s+\$\s*([0-9][0-9.,]*)$/;
    // Caso 2 (quebrada): linha "QTY [UNID]$RATE" com a descrição na linha anterior
    const qtyRate = /^([0-9][0-9.,]*)\s*([A-Za-z]{1,5})?\s*\$\s*([0-9][0-9.,]*)$/;
    const mkCode = (desc: string): string | null => {
      const first = desc.split(/\s+/)[0];
      return /^[A-Za-z0-9][A-Za-z0-9.\-]{0,9}$/.test(first) ? first.replace(/[.\-]+$/, '') : null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mf = line.match(full);
      if (mf && !isJunk(mf[1].trim())) {
        const desc = mf[1].replace(/[:|]+$/, '').trim();
        const qty = this.num(mf[2]); const rate = this.num(mf[4]);
        let total = this.num(mf[5]); if (!total && qty && rate) total = this.r2(qty * rate);
        out.push({ code: mkCode(desc), description: desc, unit: (mf[3] || '').trim() || null, quantity: qty, rate, total });
        continue;
      }
      const mq = line.match(qtyRate);
      if (mq) {
        const qty = this.num(mq[1]); const rate = this.num(mq[3]);
        if (qty <= 0 || rate <= 0) continue;
        let desc = '';
        for (let j = i - 1; j >= 0 && j >= i - 3; j--) { if (!isJunk(lines[j])) { desc = lines[j].trim(); break; } }
        if (!desc) continue;
        out.push({ code: mkCode(desc), description: desc, unit: (mq[2] || '').trim() || null, quantity: qty, rate, total: this.r2(qty * rate) });
      }
    }
    return out;
  }
}
