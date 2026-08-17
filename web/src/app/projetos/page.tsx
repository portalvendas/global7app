'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { money } from '@/lib/format';
import { isG7, useMe } from '@/lib/session';

interface Ref { id: string; name?: string; code?: string }
interface Project {
  id: string; code: string; description: string; contractValue: string | number; currency: string; status: string;
  client?: Ref | null; subcontractor?: Ref | null; team?: Ref | null;
}
interface Company { id: string; name: string; type: 'OPERATOR' | 'SUBCONTRACTOR' | 'CLIENT' }
interface Team { id: string; name: string }

const EMPTY = { code: '', description: '', contractValue: '', clientCompanyId: '', subcontractorCompanyId: '', teamId: '' };

export default function ProjetosPage() {
  const { me, loading } = useMe();
  const [rows, setRows] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ items: Project[] }>('/projects?pageSize=100').then((r) => setRows(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    load();
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
    api<{ items: Team[] }>('/teams?pageSize=100').then((r) => setTeams(r.items)).catch(() => {});
  }, [me, load]);

  const canEdit = me ? isG7(me.role) : false;
  const clients = companies.filter((c) => c.type === 'CLIENT');
  const subs = companies.filter((c) => c.type === 'SUBCONTRACTOR');

  function startCreate() { setForm(EMPTY); setEditId(null); setError(''); setShowForm(true); }
  function startEdit(p: Project) {
    setForm({
      code: p.code, description: p.description, contractValue: String(p.contractValue ?? ''),
      clientCompanyId: p.client?.id || '', subcontractorCompanyId: p.subcontractor?.id || '', teamId: p.team?.id || '',
    });
    setEditId(p.id); setError(''); setShowForm(true);
  }

  async function save() {
    if (!form.code.trim()) { setError('Informe o código'); return; }
    if (!form.description.trim()) { setError('Informe a descrição'); return; }
    if (!form.clientCompanyId) { setError('Selecione o cliente'); return; }
    setBusy(true); setError('');
    const body: Record<string, unknown> = {
      code: form.code.trim(), description: form.description.trim(),
      contractValue: Number(form.contractValue || 0), clientCompanyId: form.clientCompanyId,
      subcontractorCompanyId: form.subcontractorCompanyId || undefined, teamId: form.teamId || undefined,
    };
    try {
      if (editId) await api(`/projects/${editId}`, { method: 'PATCH', body });
      else await api('/projects', { method: 'POST', body });
      setShowForm(false); load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <div className="row between">
          <h2 style={{ margin: '4px 0' }}>Projetos</h2>
          {canEdit && <button className="btn small" onClick={startCreate}>+ Novo</button>}
        </div>

        {showForm && canEdit && (
          <div className="card">
            <h3>{editId ? 'Editar projeto' : 'Novo projeto'}</h3>
            {error && <div className="error">{error}</div>}
            <label>Código</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ex.: PRJ-001" />
            <label>Descrição</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <label>Valor do contrato (USD)</label>
            <input type="number" inputMode="decimal" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} />
            <label>Cliente</label>
            <select value={form.clientCompanyId} onChange={(e) => setForm({ ...form, clientCompanyId: e.target.value })}>
              <option value="">Selecione…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label>Subcontratada (opcional)</label>
            <select value={form.subcontractorCompanyId} onChange={(e) => setForm({ ...form, subcontractorCompanyId: e.target.value })}>
              <option value="">—</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label>Equipe (opcional)</label>
            <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              <option value="">—</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="stack" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
              <button className="btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="center">Nenhum projeto.</div>
        ) : rows.map((p) => (
          <div className="card" key={p.id}>
            <div className="row between">
              <h3>{p.code}</h3>
              <span style={{ fontWeight: 700 }}>{money(p.contractValue)}</span>
            </div>
            <div className="muted">{p.description}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Cliente: {p.client?.name || '—'} · Subcontratada: {p.subcontractor?.name || '—'} · Equipe: {p.team?.name || '—'}
            </div>
            {canEdit && (
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn small secondary" onClick={() => startEdit(p)}>Editar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
