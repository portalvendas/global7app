'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, API_BASE } from '@/lib/api';
import { getAccess } from '@/lib/auth';
import { Nav } from '@/components/nav';
import { isG7, useMe } from '@/lib/session';
import { CLASS_OPTIONS, extractW9 } from '@/lib/w9';

type CompanyType = 'OPERATOR' | 'SUBCONTRACTOR' | 'CLIENT';
interface Company {
  id: string; type: CompanyType; name: string; legalName?: string | null;
  taxId?: string | null; email?: string | null; phone?: string | null; isActive: boolean;
  w9FileName?: string | null; w9ReceivedAt?: string | null;
  w9BusinessName?: string | null; w9TaxClassification?: string | null; w9Ein?: string | null;
  w9Address?: string | null; w9City?: string | null; w9State?: string | null; w9Zip?: string | null;
}

const TYPE_LABEL: Record<CompanyType, string> = {
  OPERATOR: 'Global 7 (operadora)', SUBCONTRACTOR: 'Subcontratada', CLIENT: 'Cliente',
};

const EMPTY = {
  type: 'SUBCONTRACTOR' as CompanyType, name: '', legalName: '', taxId: '', email: '', phone: '',
  w9BusinessName: '', w9TaxClassification: '', w9Ein: '', w9Address: '', w9City: '', w9State: '', w9Zip: '',
};

export default function EmpresasPage() {
  const { me, loading } = useMe();
  const [rows, setRows] = useState<Company[]>([]);
  const [filter, setFilter] = useState<'' | CompanyType>('');
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [w9File, setW9File] = useState<File | null>(null);
  const [w9Existing, setW9Existing] = useState<{ name?: string | null; at?: string | null }>({});

  const load = useCallback(() => {
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setRows(r.items)).catch(() => {});
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  const canEdit = me ? isG7(me.role) : false;

  function startCreate() {
    setForm(EMPTY); setEditId(null); setW9File(null); setW9Existing({}); setError(''); setNote(''); setShowForm(true);
  }
  function startEdit(c: Company) {
    setForm({
      type: c.type, name: c.name, legalName: c.legalName || '', taxId: c.taxId || '', email: c.email || '', phone: c.phone || '',
      w9BusinessName: c.w9BusinessName || '', w9TaxClassification: c.w9TaxClassification || '', w9Ein: c.w9Ein || '',
      w9Address: c.w9Address || '', w9City: c.w9City || '', w9State: c.w9State || '', w9Zip: c.w9Zip || '',
    });
    setEditId(c.id); setW9File(null); setW9Existing({ name: c.w9FileName, at: c.w9ReceivedAt }); setError(''); setNote(''); setShowForm(true);
  }

  async function onW9(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setW9File(f); setError(''); setNote('Lendo o W-9…');
    const data = await extractW9(f);
    if (!data) { setNote('Não deu pra extrair automaticamente (PDF escaneado/foto). Preencha os campos manualmente — o arquivo será anexado.'); return; }
    setForm((prev) => ({
      ...prev,
      name: prev.name || data.name || '',
      w9BusinessName: data.businessName || prev.w9BusinessName,
      w9TaxClassification: data.taxClassification || prev.w9TaxClassification,
      w9Ein: data.ein || prev.w9Ein,
      w9Address: data.address || prev.w9Address,
      w9City: data.city || prev.w9City,
      w9State: data.state || prev.w9State,
      w9Zip: data.zip || prev.w9Zip,
    }));
    setNote('W-9 lido — confira os campos abaixo e complete o que faltar.');
  }

  async function save() {
    if (!form.name.trim()) { setError('Informe o nome'); return; }
    setBusy(true); setError('');
    const body: Record<string, unknown> = {
      type: form.type, name: form.name.trim(),
      legalName: form.legalName || undefined, taxId: form.taxId || undefined,
      email: form.email || undefined, phone: form.phone || undefined,
      w9BusinessName: form.w9BusinessName || undefined, w9TaxClassification: form.w9TaxClassification || undefined,
      w9Ein: form.w9Ein || undefined, w9Address: form.w9Address || undefined,
      w9City: form.w9City || undefined, w9State: form.w9State || undefined, w9Zip: form.w9Zip || undefined,
    };
    try {
      const saved = editId
        ? await api<Company>(`/companies/${editId}`, { method: 'PATCH', body })
        : await api<Company>('/companies', { method: 'POST', body });
      if (w9File) {
        const fd = new FormData(); fd.append('file', w9File);
        await api(`/companies/${saved.id}/w9`, { method: 'POST', body: fd, isForm: true });
      }
      setShowForm(false); load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally { setBusy(false); }
  }

  async function downloadW9(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/companies/${id}/w9`, { headers: { Authorization: `Bearer ${getAccess()}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch { setError('Não consegui baixar o W-9'); }
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

            <div style={{ borderTop: '1px solid var(--line)', margin: '16px 0 4px' }} />
            <h3 style={{ marginTop: 8 }}>W-9</h3>
            <p className="muted" style={{ marginTop: 0 }}>Anexe o W-9 em PDF preenchível para puxar os dados automaticamente. Se não tiver, preencha à mão. (SSN não é armazenado.)</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <label className="btn small secondary" style={{ width: 'auto', cursor: 'pointer' }}>
                📎 Anexar W-9 (PDF)
                <input type="file" accept="application/pdf,image/*" hidden onChange={onW9} />
              </label>
              {w9File && <span className="muted">{w9File.name}</span>}
              {!w9File && w9Existing.name && (
                <>
                  <span className="muted">anexado: {w9Existing.name}</span>
                  {editId && <button type="button" className="btn small secondary" onClick={() => downloadW9(editId)}>ver</button>}
                </>
              )}
            </div>
            {note && <div className="muted" style={{ marginTop: 8 }}>{note}</div>}

            <label>Nome no W-9 (business name)</label>
            <input value={form.w9BusinessName} onChange={(e) => setForm({ ...form, w9BusinessName: e.target.value })} />
            <label>Classificação fiscal</label>
            <select value={form.w9TaxClassification} onChange={(e) => setForm({ ...form, w9TaxClassification: e.target.value })}>
              {CLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label>EIN</label>
            <input value={form.w9Ein} onChange={(e) => setForm({ ...form, w9Ein: e.target.value })} placeholder="XX-XXXXXXX" />
            <label>Endereço</label>
            <input value={form.w9Address} onChange={(e) => setForm({ ...form, w9Address: e.target.value })} />
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 2 }}><label>Cidade</label><input value={form.w9City} onChange={(e) => setForm({ ...form, w9City: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label>Estado</label><input value={form.w9State} onChange={(e) => setForm({ ...form, w9State: e.target.value })} maxLength={2} /></div>
              <div style={{ flex: 1 }}><label>ZIP</label><input value={form.w9Zip} onChange={(e) => setForm({ ...form, w9Zip: e.target.value })} /></div>
            </div>

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
            <div className="muted" style={{ marginTop: 4 }}>
              W-9: {c.w9FileName ? '✓ anexado' : (c.w9Ein ? 'preenchido' : '—')}{c.w9Ein ? ` · EIN ${c.w9Ein}` : ''}
              {c.w9FileName && <> · <button className="btn small secondary" style={{ padding: '2px 8px' }} onClick={() => downloadW9(c.id)}>ver</button></>}
            </div>
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
