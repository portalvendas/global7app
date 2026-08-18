'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { isG7, useMe } from '@/lib/session';

interface Team { id: string; name: string; subcontractorCompanyId: string; _count?: { memberships: number } }
interface Company { id: string; name: string; type: string }
interface Member { id: string; user: { id: string; name: string; email: string } }
interface TeamDetail { id: string; name: string; subcontractorCompanyId?: string; memberships: Member[] }
interface UserRow { id: string; name: string; email: string; companyId: string }

export default function EquipesPage() {
  const { me, loading } = useMe();
  const [rows, setRows] = useState<Team[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [subId, setSubId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openTeam, setOpenTeam] = useState<TeamDetail | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(() => {
    api<{ items: Team[] }>('/teams?pageSize=200').then((r) => setRows(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    load();
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
    api<{ items: UserRow[] }>('/users?pageSize=500').then((r) => setUsers(r.items)).catch(() => {});
  }, [me, load]);

  const canEdit = me ? (isG7(me.role) || me.role === 'SUBCONTRACTOR_ADMIN') : false;
  const subs = companies.filter((c) => c.type === 'SUBCONTRACTOR');
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name || '—';

  async function create() {
    if (!name.trim()) { setError('Informe o nome da equipe'); return; }
    if (me && isG7(me.role) && !subId) { setError('Selecione a subcontratada'); return; }
    setBusy(true); setError('');
    try {
      await api('/teams', { method: 'POST', body: { name: name.trim(), subcontractorCompanyId: subId || undefined } });
      setShowForm(false); setName(''); setSubId(''); load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar');
    } finally { setBusy(false); }
  }

  function startRename(t: Team) { setEditId(t.id); setEditName(t.name); setError(''); }
  async function saveRename() {
    if (!editId || !editName.trim()) { setError('Informe o nome'); return; }
    setBusy(true); setError('');
    try {
      await api(`/teams/${editId}`, { method: 'PATCH', body: { name: editName.trim() } });
      setEditId(null); load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao renomear');
    } finally { setBusy(false); }
  }

  async function openMembers(id: string) {
    if (openTeam?.id === id) { setOpenTeam(null); return; }
    try { setOpenTeam(await api<TeamDetail>(`/teams/${id}`)); setMemberUserId(''); setError(''); } catch { /* ignore */ }
  }

  async function addMember(teamId: string) {
    if (!memberUserId) return;
    setBusy(true); setError('');
    try {
      await api(`/teams/${teamId}/members`, { method: 'POST', body: { userId: memberUserId } });
      setMemberUserId('');
      setOpenTeam(await api<TeamDetail>(`/teams/${teamId}`));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao adicionar membro');
    } finally { setBusy(false); }
  }

  async function removeMember(teamId: string, userId: string) {
    setBusy(true); setError('');
    try {
      await api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      setOpenTeam(await api<TeamDetail>(`/teams/${teamId}`));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover membro');
    } finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;

  // usuários elegíveis p/ a equipe aberta: da mesma empresa da equipe; senão todos.
  const teamCompanyId = openTeam && rows.find((r) => r.id === openTeam.id)?.subcontractorCompanyId;
  const memberIds = new Set((openTeam?.memberships ?? []).map((m) => m.user.id));
  const eligible = users
    .filter((u) => !memberIds.has(u.id))
    .filter((u) => (teamCompanyId ? u.companyId === teamCompanyId : true));
  const pickList = eligible.length ? eligible : users.filter((u) => !memberIds.has(u.id));

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <div className="row between">
          <h2 style={{ margin: '4px 0' }}>Equipes</h2>
          {canEdit && <button className="btn small" onClick={() => { setShowForm(!showForm); setError(''); }}>+ Nova</button>}
        </div>

        {error && <div className="error">{error}</div>}

        {showForm && canEdit && (
          <div className="card">
            <h3>Nova equipe</h3>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Equipe A" />
            {isG7(me.role) && (
              <>
                <label>Subcontratada</label>
                <select value={subId} onChange={(e) => setSubId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}
            <div className="stack" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={create}>{busy ? 'Salvando…' : 'Criar'}</button>
              <button className="btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="center">Nenhuma equipe.</div>
        ) : rows.map((t) => (
          <div className="card" key={t.id}>
            <div className="row between">
              {editId === t.id ? (
                <div className="row" style={{ gap: 8, flex: 1 }}>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <button className="btn small" disabled={busy} onClick={saveRename}>Salvar</button>
                  <button className="btn small secondary" onClick={() => setEditId(null)}>Cancelar</button>
                </div>
              ) : (
                <>
                  <h3>{t.name}</h3>
                  <span className="muted">{t._count?.memberships ?? 0} membro(s)</span>
                </>
              )}
            </div>
            {isG7(me.role) && editId !== t.id && <div className="muted">Subcontratada: {companyName(t.subcontractorCompanyId)}</div>}
            {canEdit && editId !== t.id && (
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn small secondary" onClick={() => openMembers(t.id)}>
                  {openTeam?.id === t.id ? 'Ocultar' : 'Membros'}
                </button>
                <button className="btn small secondary" onClick={() => startRename(t)}>Renomear</button>
              </div>
            )}
            {openTeam?.id === t.id && (
              <div style={{ marginTop: 10 }}>
                {openTeam.memberships.length === 0 ? (
                  <div className="muted">Sem membros.</div>
                ) : openTeam.memberships.map((m) => (
                  <div key={m.id} className="row between" style={{ padding: '4px 0' }}>
                    <span className="muted">• {m.user.name} ({m.user.email})</span>
                    {canEdit && <button className="btn small danger" style={{ width: 'auto', padding: '2px 8px' }} disabled={busy} onClick={() => removeMember(t.id, m.user.id)}>Remover</button>}
                  </div>
                ))}
                {canEdit && (
                  <>
                    <label>Adicionar membro</label>
                    <div className="row" style={{ gap: 8 }}>
                      <select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)}>
                        <option value="">Selecione um usuário…</option>
                        {pickList.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                      </select>
                      <button className="btn small" disabled={busy || !memberUserId} onClick={() => addMember(t.id)}>Add</button>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>Os usuários vêm de “Acessos”. Crie o login lá se a pessoa ainda não aparece.</div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
