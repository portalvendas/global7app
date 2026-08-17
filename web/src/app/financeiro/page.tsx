'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { money, dateBR } from '@/lib/format';
import { isG7, useMe } from '@/lib/session';

interface Ref { id: string; name?: string; code?: string }
interface Line { id?: string; code?: string | null; description: string; unit?: string | null; quantity: string | number; rate: string | number; total: string | number }
interface Invoice { id: string; number?: string | null; amount: string | number; status: string; issueDate?: string | null; dueDate?: string | null; issuedTo?: string | null; billedTo?: string | null; project?: Ref | null; client?: Ref | null; lines?: Line[] }
interface Bill { id: string; number?: string | null; amount: string | number; status: string; description?: string | null; dueDate?: string | null; project?: Ref | null; subcontractor?: Ref | null; lines?: Line[] }
interface Project { id: string; code: string }
interface Svc { id?: string; code: string; description: string; unit?: string | null; clientValue: string | number; subValue: string | number }
interface Company { id: string; name: string; type: string }
interface ParsedLine { code: string | null; description: string; unit: string | null; quantity: number; rate: number; total: number }
interface ParsedDoc { amount: number | null; number: string | null; issueDate: string | null; dueDate: string | null; projectCode: string | null; issuedTo: string | null; billedTo: string | null; description: string | null; lines: ParsedLine[]; note: string }

type Kind = 'invoice' | 'bill';
interface Row { code: string; description: string; unit: string; quantity: string; rate: string }
const emptyRow = (): Row => ({ code: '', description: '', unit: '', quantity: '', rate: '' });

const ACCEPT_DOC = 'application/pdf,.pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
const norm = (s?: string | null) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = (v: string | number) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function FinanceiroPage() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<'receber' | 'pagar'>('receber');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');

  const [inv, setInv] = useState({ projectId: '', issuedTo: '', billedTo: '', number: '', issueDate: '', dueDate: '', amount: '' });
  const [invLines, setInvLines] = useState<Row[]>([emptyRow()]);
  const [invSvc, setInvSvc] = useState<Svc[]>([]);

  const [bill, setBill] = useState({ subcontractorCompanyId: '', projectId: '', number: '', dueDate: '', description: '', amount: '' });
  const [billLines, setBillLines] = useState<Row[]>([emptyRow()]);
  const [billSvc, setBillSvc] = useState<Svc[]>([]);

  const g7 = me ? isG7(me.role) : false;
  const isClient = me?.company.type === 'CLIENT';
  const isSub = me?.company.type === 'SUBCONTRACTOR';

  const load = useCallback(() => {
    api<{ items: Invoice[] }>('/invoices?pageSize=100').then((r) => setInvoices(r.items)).catch(() => {});
    api<{ items: Bill[] }>('/bills?pageSize=100').then((r) => setBills(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    if (isClient) setTab('receber'); else if (isSub) setTab('pagar');
    load();
    api<{ items: Project[] }>('/projects?pageSize=100').then((r) => setProjects(r.items)).catch(() => {});
    if (g7) api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
  }, [me, load, g7, isClient, isSub]);

  // Carrega os itens/preços do projeto selecionado (cruzamento projeto+item).
  useEffect(() => {
    if (!inv.projectId) { setInvSvc([]); return; }
    api<{ services?: Svc[] }>(`/projects/${inv.projectId}`).then((p) => setInvSvc(p.services || [])).catch(() => setInvSvc([]));
  }, [inv.projectId]);
  useEffect(() => {
    if (!bill.projectId) { setBillSvc([]); return; }
    api<{ services?: Svc[] }>(`/projects/${bill.projectId}`).then((p) => setBillSvc(p.services || [])).catch(() => setBillSvc([]));
  }, [bill.projectId]);

  // Preenche taxas vazias quando os itens do projeto chegam (não sobrescreve edições).
  useEffect(() => { if (invSvc.length) setInvLines((p) => fillRates(p, invSvc, 'invoice')); }, [invSvc]);
  useEffect(() => { if (billSvc.length) setBillLines((p) => fillRates(p, billSvc, 'bill')); }, [billSvc]);

  function svcRate(list: Svc[], code: string, kind: Kind): number | null {
    const s = list.find((x) => norm(x.code) === norm(code) && norm(code));
    if (!s) return null;
    return kind === 'invoice' ? num(s.clientValue) : num(s.subValue);
  }
  function svcOf(list: Svc[], code: string): Svc | undefined {
    return list.find((x) => norm(x.code) === norm(code) && norm(code));
  }
  function fillRates(rows: Row[], list: Svc[], kind: Kind): Row[] {
    return rows.map((l) => {
      const s = svcOf(list, l.code);
      if (!s) return l;
      return {
        ...l,
        rate: l.rate || String(kind === 'invoice' ? num(s.clientValue) : num(s.subValue)),
        description: l.description || s.description,
        unit: l.unit || s.unit || '',
      };
    });
  }

  function setLines(kind: Kind, rows: Row[]) { (kind === 'invoice' ? setInvLines : setBillLines)(rows.length ? rows : [emptyRow()]); }
  function updLine(kind: Kind, i: number, patch: Partial<Row>) {
    const list = kind === 'invoice' ? invSvc : billSvc;
    (kind === 'invoice' ? setInvLines : setBillLines)((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const nl = { ...l, ...patch };
      if (patch.code !== undefined) {
        const s = svcOf(list, patch.code);
        if (s) {
          if (!nl.rate) nl.rate = String(kind === 'invoice' ? num(s.clientValue) : num(s.subValue));
          if (!nl.description) nl.description = s.description;
          if (!nl.unit) nl.unit = s.unit || '';
        }
      }
      return nl;
    }));
  }
  function addLine(kind: Kind) { (kind === 'invoice' ? setInvLines : setBillLines)((p) => [...p, emptyRow()]); }
  function rmLine(kind: Kind, i: number) { (kind === 'invoice' ? setInvLines : setBillLines)((p) => (p.length <= 1 ? [emptyRow()] : p.filter((_, idx) => idx !== i))); }

  function pullFromProject(kind: Kind) {
    const list = kind === 'invoice' ? invSvc : billSvc;
    if (!list.length) { setImportNote('Selecione um projeto que tenha itens/preços cadastrados.'); return; }
    const rows = list.map((s) => ({ code: s.code, description: s.description, unit: s.unit || '', quantity: '', rate: String(kind === 'invoice' ? num(s.clientValue) : num(s.subValue)) }));
    setLines(kind, rows);
    setImportNote(`Puxados ${rows.length} item(ns) do projeto (${kind === 'invoice' ? 'valor cheio' : 'valor de repasse'}). Informe as quantidades.`);
  }

  function matchProjectId(code?: string | null): string {
    const n = norm(code);
    if (!n) return '';
    const hit = projects.find((p) => { const pc = norm(p.code); return pc && (pc === n || pc.includes(n) || n.includes(pc)); });
    return hit ? hit.id : '';
  }

  async function importDoc(kind: Kind, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setImporting(true); setImportNote('Lendo o arquivo…'); setError('');
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await api<ParsedDoc>(kind === 'invoice' ? '/invoices/parse' : '/bills/parse', { method: 'POST', body: fd, isForm: true });
      const pid = matchProjectId(r.projectCode);
      // pega os itens do projeto (se casou) p/ cruzar preço projeto+item
      let list = kind === 'invoice' ? invSvc : billSvc;
      if (pid) {
        try { const p = await api<{ services?: Svc[] }>(`/projects/${pid}`); list = p.services || []; (kind === 'invoice' ? setInvSvc : setBillSvc)(list); } catch { /* ignore */ }
      }
      const rows: Row[] = (r.lines || []).map((l) => {
        const crossed = svcRate(list, l.code || '', kind); // preço cruzado projeto+item tem prioridade
        return {
          code: l.code || '',
          description: l.description || '',
          unit: l.unit || '',
          quantity: l.quantity != null ? String(l.quantity) : '',
          rate: String(crossed != null ? crossed : (l.rate ?? '')),
        };
      });
      if (kind === 'invoice') {
        setInv((p) => ({ ...p, projectId: pid || p.projectId, issuedTo: r.issuedTo || p.issuedTo, billedTo: r.billedTo || p.billedTo, number: r.number || p.number, issueDate: r.issueDate || p.issueDate }));
        setLines('invoice', rows);
      } else {
        setBill((p) => ({ ...p, projectId: pid || p.projectId, number: r.number || p.number, dueDate: r.dueDate || p.dueDate }));
        setLines('bill', rows);
      }
      setImportNote(
        pid ? `${r.note} Projeto vinculado e preços cruzados pelo item.`
          : (r.projectCode ? `${r.note} Projeto "${r.projectCode}" não encontrado — selecione manualmente (obrigatório).` : `${r.note} Vincule o projeto manualmente (obrigatório).`),
      );
    } catch (err) {
      setImportNote(''); setError(err instanceof ApiError ? err.message : 'Falha ao ler o arquivo');
    } finally { setImporting(false); }
  }

  function cleanLines(rows: Row[]) {
    return rows
      .filter((l) => l.description.trim() || l.code.trim() || l.quantity || l.rate)
      .map((l) => ({ code: l.code.trim() || undefined, description: (l.description || l.code).trim(), unit: l.unit.trim() || undefined, quantity: num(l.quantity), rate: num(l.rate), total: r2(num(l.quantity) * num(l.rate)) }));
  }
  const invTotal = invLines.reduce((s, l) => s + num(l.quantity) * num(l.rate), 0);
  const billTotal = billLines.reduce((s, l) => s + num(l.quantity) * num(l.rate), 0);

  async function act(url: string) {
    setBusy(true); setError('');
    try { await api(url, { method: 'POST' }); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Falha'); }
    finally { setBusy(false); }
  }

  function resetInv() { setInv({ projectId: '', issuedTo: '', billedTo: '', number: '', issueDate: '', dueDate: '', amount: '' }); setInvLines([emptyRow()]); }
  function resetBill() { setBill({ subcontractorCompanyId: '', projectId: '', number: '', dueDate: '', description: '', amount: '' }); setBillLines([emptyRow()]); }

  async function createInvoice() {
    if (!inv.projectId) return setError('Vincule um projeto (obrigatório)');
    const lines = cleanLines(invLines);
    const amount = lines.length ? lines.reduce((s, l) => s + l.total, 0) : num(inv.amount);
    if (amount <= 0) return setError('Informe as linhas de serviço ou um valor');
    setBusy(true); setError('');
    try {
      await api('/invoices', { method: 'POST', body: {
        projectId: inv.projectId, amount, number: inv.number || undefined,
        issuedTo: inv.issuedTo || undefined, billedTo: inv.billedTo || undefined,
        issueDate: inv.issueDate || undefined, dueDate: inv.dueDate || undefined,
        lines: lines.length ? lines : undefined,
      } });
      setShowForm(false); resetInv(); setImportNote(''); load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Falha ao criar'); }
    finally { setBusy(false); }
  }

  async function createBill() {
    if (!bill.projectId) return setError('Vincule um projeto (obrigatório)');
    if (g7 && !bill.subcontractorCompanyId) return setError('Selecione a subcontratada');
    const lines = cleanLines(billLines);
    const amount = lines.length ? lines.reduce((s, l) => s + l.total, 0) : num(bill.amount);
    if (amount <= 0) return setError('Informe as linhas de serviço ou um valor');
    setBusy(true); setError('');
    try {
      await api('/bills', { method: 'POST', body: {
        amount, projectId: bill.projectId, description: bill.description || undefined,
        number: bill.number || undefined, dueDate: bill.dueDate || undefined,
        subcontractorCompanyId: g7 ? bill.subcontractorCompanyId : undefined,
        lines: lines.length ? lines : undefined,
      } });
      setShowForm(false); resetBill(); setImportNote(''); load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Falha ao criar'); }
    finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;

  const subs = companies.filter((c) => c.type === 'SUBCONTRACTOR');
  const showReceber = g7 || isClient;
  const showPagar = g7 || isSub;

  // Editor de linhas (reutilizado por invoice/payroll) — função (não componente) p/ não perder foco.
  function renderLines(kind: Kind, rows: Row[], total: number) {
    const rateLabel = kind === 'invoice' ? 'Valor cheio' : 'Valor repasse';
    return (
      <>
        <div className="row between" style={{ alignItems: 'center', marginTop: 8 }}>
          <h3 style={{ margin: '8px 0' }}>Linhas de serviço</h3>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn small secondary" style={{ width: 'auto' }} onClick={() => pullFromProject(kind)}>Puxar do projeto</button>
            <button type="button" className="btn small secondary" style={{ width: 'auto' }} onClick={() => addLine(kind)}>+ Linha</button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          A taxa vem do preço do item no projeto ({rateLabel.toLowerCase()}). Total = quantidade × taxa.
        </p>
        {rows.map((l, i) => (
          <div key={i} className="card" style={{ padding: 12, marginTop: 8, background: 'var(--panel2)' }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <strong>Item {i + 1}</strong>
              <button type="button" className="btn small danger" style={{ width: 'auto', padding: '2px 10px' }} onClick={() => rmLine(kind, i)}>Remover</button>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 90px' }}><label>Código</label><input value={l.code} onChange={(e) => updLine(kind, i, { code: e.target.value })} placeholder="FS01" /></div>
              <div style={{ flex: '1 1 90px' }}><label>Unidade</label><input value={l.unit} onChange={(e) => updLine(kind, i, { unit: e.target.value })} /></div>
            </div>
            <label>Descrição</label>
            <input value={l.description} onChange={(e) => updLine(kind, i, { description: e.target.value })} />
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}><label>Qtd</label><input type="number" inputMode="decimal" value={l.quantity} onChange={(e) => updLine(kind, i, { quantity: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label>{rateLabel}</label><input type="number" inputMode="decimal" value={l.rate} onChange={(e) => updLine(kind, i, { rate: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label>Total</label><input value={money(num(l.quantity) * num(l.rate))} disabled /></div>
            </div>
          </div>
        ))}
        <div className="row between" style={{ marginTop: 12, fontWeight: 700 }}>
          <span>Total {kind === 'invoice' ? '(a receber)' : '(repasse)'}</span>
          <span>{money(total)}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <div className="row between">
          <h2 style={{ margin: '4px 0' }}>Invoices &amp; Payroll</h2>
          {((tab === 'receber' && g7) || (tab === 'pagar' && (g7 || isSub))) && (
            <button className="btn small" onClick={() => { setShowForm(!showForm); setError(''); setImportNote(''); }}>+ Novo</button>
          )}
        </div>

        <div className="tabs">
          {showReceber && <button className={`tab ${tab === 'receber' ? 'active' : ''}`} onClick={() => { setTab('receber'); setShowForm(false); setImportNote(''); }}>Invoices</button>}
          {showPagar && <button className={`tab ${tab === 'pagar' ? 'active' : ''}`} onClick={() => { setTab('pagar'); setShowForm(false); setImportNote(''); }}>Payroll</button>}
        </div>

        {error && <div className="error">{error}</div>}

        {/* Formulário Invoice */}
        {showForm && tab === 'receber' && g7 && (
          <div className="card">
            <h3>Novo invoice</h3>
            <div className="card" style={{ background: 'var(--panel2)', padding: 12 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="muted">Importar de arquivo (PDF ou Excel):</span>
                <label className="btn small secondary" style={{ width: 'auto', cursor: 'pointer', margin: 0 }}>
                  {importing ? 'Lendo…' : '📎 Anexar arquivo'}
                  <input type="file" accept={ACCEPT_DOC} hidden disabled={importing} onChange={(e) => importDoc('invoice', e)} />
                </label>
              </div>
              {importNote && <div className="muted" style={{ marginTop: 8 }}>{importNote}</div>}
            </div>

            <div className="form-grid">
              <div>
                <label>Projeto (obrigatório)</label>
                <select value={inv.projectId} onChange={(e) => setInv({ ...inv, projectId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                </select>
              </div>
              <div>
                <label>Número (opcional)</label>
                <input value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} />
              </div>
              <div>
                <label>Issued to</label>
                <input value={inv.issuedTo} onChange={(e) => setInv({ ...inv, issuedTo: e.target.value })} placeholder="GLOBAL7 COMMUNICATIONS LLC" />
              </div>
              <div>
                <label>Billed to</label>
                <input value={inv.billedTo} onChange={(e) => setInv({ ...inv, billedTo: e.target.value })} />
              </div>
              <div>
                <label>Emissão</label>
                <input type="date" value={inv.issueDate} onChange={(e) => setInv({ ...inv, issueDate: e.target.value })} />
              </div>
              <div>
                <label>Vencimento</label>
                <input type="date" value={inv.dueDate} onChange={(e) => setInv({ ...inv, dueDate: e.target.value })} />
              </div>
            </div>

            {renderLines('invoice', invLines, invTotal)}

            <div className="stack actions" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={createInvoice}>Salvar</button>
              <button className="btn secondary" onClick={() => { setShowForm(false); setImportNote(''); }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Formulário Payroll */}
        {showForm && tab === 'pagar' && (g7 || isSub) && (
          <div className="card">
            <h3>Novo payroll</h3>
            <div className="card" style={{ background: 'var(--panel2)', padding: 12 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="muted">Importar de arquivo (PDF ou Excel):</span>
                <label className="btn small secondary" style={{ width: 'auto', cursor: 'pointer', margin: 0 }}>
                  {importing ? 'Lendo…' : '📎 Anexar arquivo'}
                  <input type="file" accept={ACCEPT_DOC} hidden disabled={importing} onChange={(e) => importDoc('bill', e)} />
                </label>
              </div>
              {importNote && <div className="muted" style={{ marginTop: 8 }}>{importNote}</div>}
            </div>

            <div className="form-grid">
              {g7 && (
                <div>
                  <label>Subcontratada</label>
                  <select value={bill.subcontractorCompanyId} onChange={(e) => setBill({ ...bill, subcontractorCompanyId: e.target.value })}>
                    <option value="">Selecione…</option>
                    {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label>Projeto (obrigatório)</label>
                <select value={bill.projectId} onChange={(e) => setBill({ ...bill, projectId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                </select>
              </div>
              <div>
                <label>Número (opcional)</label>
                <input value={bill.number} onChange={(e) => setBill({ ...bill, number: e.target.value })} />
              </div>
              <div>
                <label>Vencimento</label>
                <input type="date" value={bill.dueDate} onChange={(e) => setBill({ ...bill, dueDate: e.target.value })} />
              </div>
              <div className="full">
                <label>Descrição (opcional)</label>
                <input value={bill.description} onChange={(e) => setBill({ ...bill, description: e.target.value })} />
              </div>
            </div>

            {renderLines('bill', billLines, billTotal)}

            <div className="stack actions" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={createBill}>Salvar</button>
              <button className="btn secondary" onClick={() => { setShowForm(false); setImportNote(''); }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Listas */}
        {tab === 'receber' && (
          invoices.length === 0 ? <div className="center">Nenhum invoice.</div> :
          <div className="grid-cards">
          {invoices.map((i) => (
            <div className="card" key={i.id}>
              <div className="row between">
                <h3>{i.project?.code || 'Projeto'} {i.number ? `· ${i.number}` : ''}</h3>
                <span style={{ fontWeight: 700 }}>{money(i.amount)}</span>
              </div>
              <div className="muted">Billed to: {i.billedTo || i.client?.name || '—'} · Venc.: {dateBR(i.dueDate)}</div>
              {(i.lines?.length ?? 0) > 0 && <div className="muted" style={{ marginTop: 4 }}>{i.lines!.length} item(ns)</div>}
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="badge" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{i.status}</span>
                {g7 && (
                  <div className="row" style={{ gap: 8 }}>
                    {i.status === 'DRAFT' && <button className="btn small" disabled={busy} onClick={() => act(`/invoices/${i.id}/send`)}>Enviar</button>}
                    {i.status === 'SENT' && <button className="btn small ok" disabled={busy} onClick={() => act(`/invoices/${i.id}/pay`)}>Marcar recebida</button>}
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        )}
        {tab === 'pagar' && (
          bills.length === 0 ? <div className="center">Nenhum payroll.</div> :
          <div className="grid-cards">
          {bills.map((b) => (
            <div className="card" key={b.id}>
              <div className="row between">
                <h3>{b.subcontractor?.name || 'Subcontratada'} {b.number ? `· ${b.number}` : ''}</h3>
                <span style={{ fontWeight: 700 }}>{money(b.amount)}</span>
              </div>
              <div className="muted">{b.description || '—'} · Projeto: {b.project?.code || '—'} · Venc.: {dateBR(b.dueDate)}</div>
              {(b.lines?.length ?? 0) > 0 && <div className="muted" style={{ marginTop: 4 }}>{b.lines!.length} item(ns)</div>}
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="badge" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{b.status}</span>
                {g7 && (
                  <div className="row" style={{ gap: 8 }}>
                    {b.status === 'SUBMITTED' && <button className="btn small" disabled={busy} onClick={() => act(`/bills/${b.id}/approve`)}>Aprovar</button>}
                    {b.status === 'APPROVED' && <button className="btn small ok" disabled={busy} onClick={() => act(`/bills/${b.id}/pay`)}>Marcar paga</button>}
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        )}
      </div>
    </>
  );
}
