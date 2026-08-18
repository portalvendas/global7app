'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { isG7, useMe } from '@/lib/session';

interface Company { id: string; name: string; type: string }
interface UserRow { id: string; name: string; email: string; role: string; isActive: boolean; companyId: string; company?: { id: string; name: string; type: string } }

const ROLES: { value: string; label: string }[] = [
  { value: 'SUBCONTRACTOR_ADMIN', label: 'Admin da subcontratada' },
  { value: 'TEAM_MEMBER', label: 'Membro de equipe' },
  { value: 'CLIENT_VIEWER', label: 'Cliente (visualização)' },
  { value: 'GLOBAL7_STAFF', label: 'Equipe Global 7' },
  { value: 'GLOBAL7_ADMIN', label: 'Admin Global 7' },
];
const roleLabel = (v: string) => ROLES.find((r) => r.value === v)?.label || v;

const EMPTY = { name: '', email: '', password: '', role: 'SUBCONTRACTOR_ADMIN', companyId: '' };

export default function AcessosPage() {
  const { me, loading } = useMe();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  // edição
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', email: '', role: '', isActive: true, password: '' });

  const loadUsers = useCallback(() => {
    api<{ items: UserRow[] }>('/users?pageSize=500').then((r) => setUsers(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
    loadUsers();
  }, [me, loadUsers]);

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
      loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar acesso');
    } finally { setBusy(false); }
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setEdit({ name: u.name, email: u.email, role: u.role, isActive: u.isActive, password: '' });
    setError(''); setOk('');
  }
  async function saveEdit() {
    if (!editId) return;
    if (!edit.name.trim()) return setError('Informe o nome');
    if (edit.password && edit.password.length < 8) return setError('Senha de no mínimo 8 caracteres');
    setBusy(true); setError('');
    try {
      await api(`/users/${editId}`, { method: 'PATCH', body: {
        name: edit.name.trim(), email: edit.email.trim().toLowerCase(), role: edit.role, isActive: edit.isActive,
        password: edit.password ? edit.password : undefined,
      } });
      setEditId(null); setOk('Usuário atualizado.'); loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;
  if (!isG7(me.role)) return (<><Nav me={me} /><div className="center">Acesso restrito à Global 7.</div></>);

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <h2 style={{ margin: '4px 0 14px' }}>Acessos</h2>
        <p className="muted" style={{ marginTop: 0 }}>Crie e edite logins para subcontratadas, equipes e clientes. Cada um vê apenas os próprios dados.</p>

        <div className="card">
          <h3>Novo acesso</h3>
          {error && <div className="error">{error}</div>}
          {ok && <div className="error" style={{ background: '#0f2e1a', color: '#4ade80', borderColor: '#166534' }}>{ok}</div>}
          <div className="form-grid">
            <div><label>Nome</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label>E-mail</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" /></div>
            <div><label>Senha provisória (mín. 8)</label><input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="off" placeholder="a pessoa troca depois" /></div>
            <div>
              <label>Papel</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="full">
              <label>Empresa</label>
              <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                <option value="">Selecione…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            </div>
          </div>
          <div className="stack actions" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy} onClick={create}>{busy ? 'Criando…' : 'Criar acesso'}</button>
          </div>
        </div>

        <h3 style={{ marginTop: 18 }}>Usuários</h3>
        {users.length === 0 ? (
          <div className="center">Nenhum usuário.</div>
        ) : (
          <div className="grid-cards">
            {users.map((u) => (
              <div className="card" key={u.id}>
                {editId === u.id ? (
                  <>
                    <label>Nome</label>
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    <label>E-mail</label>
                    <input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} autoComplete="off" />
                    <label>Papel</label>
                    <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <label>Nova senha (opcional, mín. 8)</label>
                    <input type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="off" placeholder="deixe vazio p/ manter" />
                    <label className="row" style={{ gap: 8, alignItems: 'center', marginTop: 10 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
                      <span>Ativo</span>
                    </label>
                    <div className="stack actions" style={{ marginTop: 14 }}>
                      <button className="btn" disabled={busy} onClick={saveEdit}>Salvar</button>
                      <button className="btn secondary" onClick={() => setEditId(null)}>Cancelar</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="row between">
                      <h3 style={{ margin: 0 }}>{u.name}</h3>
                      <span className="badge" style={{ background: u.isActive ? '#0f2e1a' : '#3a1414', color: u.isActive ? '#4ade80' : '#f87171' }}>{u.isActive ? 'ativo' : 'inativo'}</span>
                    </div>
                    <div className="muted">{u.email}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{roleLabel(u.role)} · {u.company?.name || '—'}</div>
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <button className="btn small secondary" onClick={() => startEdit(u)}>Editar</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
