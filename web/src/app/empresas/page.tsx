'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { isG7, useMe } from '@/lib/session';

type CompanyType = 'OPERATOR' | 'SUBCONTRACTOR' | 'CLIENT';
interface Company {
  id: string; type: CompanyType; name: string; legalName?: string | null;
  taxId?: string | null; email?: string | null; phone?: string | null; isActive: boolean;
}

const TYPE_LABEL: Record<CompanyType, string> = {
  OPERATOR: 'Global 7 (operadora)', SUBCONTRACTOR: 'Subcontratada', CLIENT: 'Cliente',
};

const EMPTY = { type: 'SUBCONTRACTOR' as CompanyType, name: '', legalName: '', taxId: '', email: '', phone: '' };

export default function EmpresasPage() {
  const { me, loading } = useMe();
  const [rows, setRows] = useState<Company[]>([]);
  const [filter, setFilter] = useState<'' | CompanyType>('');
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setRows(r.items)).catch(() => {});
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  const canEdit = me ? isG7(me.role) : false;

  function startCreate() { setForm(EMPTY); setEditId(null); setError(''); setShowForm(true); }
  function startEdit(c: Company) {
    setForm({ type: c.type, name: c.name, legalName: c.legalName || '', taxId: c.taxId || '', email: c.email || '', phone: c.phone || '' });
    setEditId(c.id); setError(''); setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) { setError('Informe o nome'); return; }
    setBusy(true); setError('');
    const body: Record<string, unknown> = {
      type: form.type, name: form.name.trim(),
      legalName: form.legalName || undefined, taxId: form.taxId || undefined,
      email: form.email || undefined, phone: form.phone || undefined,
    };
    try {
      if (editId) await api(`/companies/${editId}`, { method: 'PATCH', body });
      else await api('/companies', { method: 'POST', body });
      setShowForm(false); load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally { setBusy(false); }
  }

  const shown = rows.filter((c) => (filter ? c.type === filter : true));

  if (loading || !me) return <div className="center">Carregando…</div>;

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <div className="row between">
          <h2 style={{ margin: '4px 0' }}>Empresas</h2>
          {canEdit && <button className="btn small" onClick={startCreate}>+ Nova</button>}
        </div>

        <div className="tabs">
          {(['', 'SUBCONTRACTOR', 'CLIENT', 'OPERATOR'] as const).map((t) => (
            <button key={t} className={`tab ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
              {t === '' ? 'Todas' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {showForm && canEdit && (
          <div className="card">
            <h3>{editId ? 'Editar empresa' : 'Nova empresa'}</h3>
            {error && <div className="error">{error}</div>}
            <label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CompanyType })} disabled={!!editId}>
              <option value="SUBCONTRACTOR">Subcontratada</option>
              <option value="CLIENT">Cliente</option>
              <option value="OPERATOR">Global 7 (operadora)</option>
            </select>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label>Razão social</label>
            <input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
            <label>Tax ID / CNPJ</label>
            <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label>Telefone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <div className="stack" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
              <button className="btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {shown.length === 0 ? (
          <div className="center">Nenhuma empresa.</div>
        ) : shown.map((c) => (
          <div className="card" key={c.id}>
            <div className="row between">
              <h3>{c.name}</h3>
              <span className="badge" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{TYPE_LABEL[c.type]}</span>
            </div>
            <div className="muted">{[c.legalName, c.taxId, c.email, c.phone].filter(Boolean).join(' · ') || 'sem detalhes'}</div>
            {canEdit && (
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn small secondary" onClick={() => startEdit(c)}>Editar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
