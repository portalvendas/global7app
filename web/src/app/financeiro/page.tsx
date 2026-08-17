'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { money, dateBR } from '@/lib/format';
import { isG7, useMe } from '@/lib/session';

interface Ref { id: string; name?: string; code?: string }
interface Invoice { id: string; number?: string | null; amount: string | number; status: string; issueDate?: string | null; dueDate?: string | null; paidAt?: string | null; project?: Ref | null; client?: Ref | null }
interface Bill { id: string; number?: string | null; amount: string | number; status: string; description?: string | null; dueDate?: string | null; project?: Ref | null; subcontractor?: Ref | null }
interface Project { id: string; code: string }
interface Company { id: string; name: string; type: string }

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
  const [inv, setInv] = useState({ projectId: '', amount: '', number: '', issueDate: '', dueDate: '' });
  const [bill, setBill] = useState({ amount: '', projectId: '', description: '', number: '', dueDate: '', subcontractorCompanyId: '' });

  const g7 = me ? isG7(me.role) : false;
  const isClient = me?.company.type === 'CLIENT';
  const isSub = me?.company.type === 'SUBCONTRACTOR';

  const load = useCallback(() => {
    api<{ items: Invoice[] }>('/invoices?pageSize=100').then((r) => setInvoices(r.items)).catch(() => {});
    api<{ items: Bill[] }>('/bills?pageSize=100').then((r) => setBills(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    // clientes só veem receber; subcontratadas só pagar
    if (isClient) setTab('receber'); else if (isSub) setTab('pagar');
    load();
    api<{ items: Project[] }>('/projects?pageSize=100').then((r) => setProjects(r.items)).catch(() => {});
    if (g7) api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
  }, [me, load, g7, isClient, isSub]);

  async function act(url: string) {
    setBusy(true); setError('');
    try { await api(url, { method: 'POST' }); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Falha'); }
    finally { setBusy(false); }
  }

  async function createInvoice() {
    if (!inv.projectId) return setError('Selecione o projeto');
    if (!inv.amount) return setError('Informe o valor');
    setBusy(true); setError('');
    try {
      await api('/invoices', { method: 'POST', body: {
        projectId: inv.projectId, amount: Number(inv.amount), number: inv.number || undefined,
        issueDate: inv.issueDate || undefined, dueDate: inv.dueDate || undefined,
      } });
      setShowForm(false); setInv({ projectId: '', amount: '', number: '', issueDate: '', dueDate: '' }); load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Falha ao criar'); }
    finally { setBusy(false); }
  }

  async function createBill() {
    if (!bill.amount) return setError('Informe o valor');
    if (g7 && !bill.subcontractorCompanyId) return setError('Selecione a subcontratada');
    setBusy(true); setError('');
    try {
      await api('/bills', { method: 'POST', body: {
        amount: Number(bill.amount), projectId: bill.projectId || undefined, description: bill.description || undefined,
        number: bill.number || undefined, dueDate: bill.dueDate || undefined,
        subcontractorCompanyId: g7 ? bill.subcontractorCompanyId : undefined,
      } });
      setShowForm(false); setBill({ amount: '', projectId: '', description: '', number: '', dueDate: '', subcontractorCompanyId: '' }); load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Falha ao criar'); }
    finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;

  const subs = companies.filter((c) => c.type === 'SUBCONTRACTOR');
  const showReceber = g7 || isClient;
  const showPagar = g7 || isSub;

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <div className="row between">
          <h2 style={{ margin: '4px 0' }}>Financeiro</h2>
          {((tab === 'receber' && g7) || (tab === 'pagar' && (g7 || isSub))) && (
            <button className="btn small" onClick={() => { setShowForm(!showForm); setError(''); }}>+ Novo</button>
          )}
        </div>

        <div className="tabs">
          {showReceber && <button className={`tab ${tab === 'receber' ? 'active' : ''}`} onClick={() => { setTab('receber'); setShowForm(false); }}>A receber</button>}
          {showPagar && <button className={`tab ${tab === 'pagar' ? 'active' : ''}`} onClick={() => { setTab('pagar'); setShowForm(false); }}>A pagar</button>}
        </div>

        {error && <div className="error">{error}</div>}

        {/* Formulários */}
        {showForm && tab === 'receber' && g7 && (
          <div className="card">
            <h3>Nova fatura (a receber)</h3>
            <label>Projeto</label>
            <select value={inv.projectId} onChange={(e) => setInv({ ...inv, projectId: e.target.value })}>
              <option value="">Selecione…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
            <label>Valor (USD)</label>
            <input type="number" inputMode="decimal" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} />
            <label>Número (opcional)</label>
            <input value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} />
            <label>Emissão</label>
            <input type="date" value={inv.issueDate} onChange={(e) => setInv({ ...inv, issueDate: e.target.value })} />
            <label>Vencimento</label>
            <input type="date" value={inv.dueDate} onChange={(e) => setInv({ ...inv, dueDate: e.target.value })} />
            <div className="stack" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={createInvoice}>Salvar</button>
              <button className="btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}
        {showForm && tab === 'pagar' && (g7 || isSub) && (
          <div className="card">
            <h3>Nova conta (a pagar)</h3>
            {g7 && (
              <>
                <label>Subcontratada</label>
                <select value={bill.subcontractorCompanyId} onChange={(e) => setBill({ ...bill, subcontractorCompanyId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}
            <label>Valor (USD)</label>
            <input type="number" inputMode="decimal" value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} />
            <label>Projeto (opcional)</label>
            <select value={bill.projectId} onChange={(e) => setBill({ ...bill, projectId: e.target.value })}>
              <option value="">—</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
            <label>Descrição (opcional)</label>
            <input value={bill.description} onChange={(e) => setBill({ ...bill, description: e.target.value })} />
            <label>Número (opcional)</label>
            <input value={bill.number} onChange={(e) => setBill({ ...bill, number: e.target.value })} />
            <label>Vencimento</label>
            <input type="date" value={bill.dueDate} onChange={(e) => setBill({ ...bill, dueDate: e.target.value })} />
            <div className="stack" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={createBill}>Salvar</button>
              <button className="btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Listas */}
        {tab === 'receber' && (
          invoices.length === 0 ? <div className="center">Nenhuma fatura.</div> :
          invoices.map((i) => (
            <div className="card" key={i.id}>
              <div className="row between">
                <h3>{i.project?.code || 'Projeto'} {i.number ? `· ${i.number}` : ''}</h3>
                <span style={{ fontWeight: 700 }}>{money(i.amount)}</span>
              </div>
              <div className="muted">Cliente: {i.client?.name || '—'} · Venc.: {dateBR(i.dueDate)}</div>
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
          ))
        )}
        {tab === 'pagar' && (
          bills.length === 0 ? <div className="center">Nenhuma conta.</div> :
          bills.map((b) => (
            <div className="card" key={b.id}>
              <div className="row between">
                <h3>{b.subcontractor?.name || 'Subcontratada'} {b.number ? `· ${b.number}` : ''}</h3>
                <span style={{ fontWeight: 700 }}>{money(b.amount)}</span>
              </div>
              <div className="muted">{b.description || '—'} · Projeto: {b.project?.code || '—'} · Venc.: {dateBR(b.dueDate)}</div>
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
          ))
        )}
      </div>
    </>
  );
}
