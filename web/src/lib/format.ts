// Helpers de formatação (moeda USD e datas) usados nas telas de gestão.

export function money(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n as number) ? (n as number) : 0);
}

export function dateBR(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
