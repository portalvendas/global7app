'use client';

import { PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib';

export interface W9Data {
  name?: string;
  businessName?: string;
  taxClassification?: string;
  ein?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

// Radio export value → classificação (W-9 padrão IRS).
const CLASS_MAP: Record<string, string> = {
  '1': 'individual', '2': 'c_corp', '3': 's_corp', '4': 'partnership', '5': 'trust', '6': 'llc', '7': 'other',
};

function leaf(name: string): string {
  return (name.split('.').pop() || name).replace(/\[\d+\]$/, '').toLowerCase();
}

function splitCityStateZip(v?: string): Partial<W9Data> {
  if (!v) return {};
  const m = v.match(/^(.*?),?\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] };
  return { city: v };
}

/**
 * Extrai dados de um W-9 em PDF PREENCHÍVEL (campos de formulário), no navegador.
 * Retorna null se não for preenchível (escaneado/foto) → usuário preenche manual.
 * NUNCA lê/retorna SSN (só EIN).
 */
export async function extractW9(file: File): Promise<W9Data | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const form = doc.getForm();
    const fields = form.getFields();
    if (!fields.length) return null;

    const text: Record<string, string> = {};
    let classification: string | undefined;

    for (const f of fields) {
      const l = leaf(f.getName());
      if (f instanceof PDFTextField) {
        const v = (f.getText() || '').trim();
        if (v) text[l] = v;
      } else if (f instanceof PDFRadioGroup && /c1_1|classif/.test(l)) {
        const sel = f.getSelected();
        if (sel) classification = CLASS_MAP[sel] || CLASS_MAP[sel.replace(/\D/g, '')] || 'other';
      }
    }

    // EIN = f1_14 + f1_15 (2+7) OU qualquer campo com "ein". SSN (f1_11..f1_13) é ignorado.
    const einKeys = Object.keys(text).filter((k) => /^f1_1[45]$/.test(k) || k.includes('ein'));
    const digits = einKeys.map((k) => text[k]).join('').replace(/\D/g, '');
    let ein: string | undefined;
    if (digits.length === 9) ein = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    else if (digits.length) ein = digits;

    const pick = (...keys: string[]) => { for (const k of keys) if (text[k]) return text[k]; return undefined; };

    const data: W9Data = {
      name: pick('f1_01', 'f1_1'),
      businessName: pick('f1_02', 'f1_2'),
      taxClassification: classification,
      ein,
      address: pick('f1_07', 'f1_7'),
      ...splitCityStateZip(pick('f1_08', 'f1_8')),
    };
    // se nada útil veio, trata como não-extraível
    const any = Object.values(data).some(Boolean);
    return any ? data : null;
  } catch {
    return null;
  }
}

export const CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'individual', label: 'Individual / Sole proprietor' },
  { value: 'c_corp', label: 'C Corporation' },
  { value: 's_corp', label: 'S Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust', label: 'Trust / Estate' },
  { value: 'llc', label: 'LLC' },
  { value: 'other', label: 'Other' },
];
