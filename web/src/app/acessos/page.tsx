'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { isG7, useMe } from '@/lib/session';

interface Company { id: string; name: string; type: string }

const ROLES: { value: string; label: string }[] = [
  { value: 'SUBCONTRACTOR_ADMIN', label: 'Admin da subcontratada' },
  { value: 'TEAM_MEMBER', label: 'Membro de equipe' },
  { value: 'CLIENT_VIEWER', label: 'Cliente (visualização)' },
  { value: 'GLOBAL7_STAFF', label: 'Equipe Global 7' },
  { value: 'GLOBAL7_ADMIN', label: 'Admin Global 7' },
];

const EMPTY = { name: '', email: '', password: '', role: 'SUBCONTRACTOR_ADMIN', companyId: '' };

export default function AcessosPage() {
  const { me, loading } = useMe();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
  }, [me]);

  async function create() {
    setError(''); setOk('');
    if (!form.name.trim()) return setError('Informe o nome');
    if (!form.email.trim()) return setError('Informe o e-mail');
    if (form.password.length < 8) return setError('Senha de no mínimo 8 caracteres');
    if (!form.companyId) return setError('Selecione a empresa do usuário');
    setBusy(true);
    try {
      await api('/auth/register', {
        method: 'POST',
        body: { name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password, role: form.role, companyId: form.companyId },
      });
      setOk(`Acesso criado para ${form.email.trim().toLowerCase()}.`);
      setForm({ ...EMPTY, role: form.role, companyId: form.companyId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar acesso');
    } finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;
  if (!isG7(me.role)) return (<><Nav me={me} /><div className="center">Acesso restrito à Global 7.</div></>);

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <h2 style={{ margin: '4px 0 14px' }}>Acessos</h2>
        <p className="muted" style={{ marginTop: 0 }}>Crie logins para subcontratadas, equipes e clientes. Cada um vê apenas os próprios dados.</p>
        <div className="card">
          {error && <div className="error">{error}</div>}
          {ok && <div className="error" style={{ background: '#0f2e1a', color: '#4ade80', borderColor: '#166534' }}>{ok}</div>}
          <label>Nome</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>E-mail</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
          <label>Senha provisória (mín. 8)</label>
          <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="off" placeholder="a pessoa troca depois" />
          <label>Papel</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <label>Empresa</label>
          <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
            <option value="">Selecione…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
          </select>
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy} onClick={create}>{busy ? 'Criando…' : 'Criar acesso'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
