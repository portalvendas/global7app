'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { isG7, useMe } from '@/lib/session';

interface Team { id: string; name: string; subcontractorCompanyId: string; _count?: { memberships: number } }
interface Company { id: string; name: string; type: string }
interface Member { id: string; user: { id: string; name: string; email: string } }
interface TeamDetail { id: string; name: string; memberships: Member[] }

export default function EquipesPage() {
  const { me, loading } = useMe();
  const [rows, setRows] = useState<Team[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [subId, setSubId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openTeam, setOpenTeam] = useState<TeamDetail | null>(null);
  const [memberUserId, setMemberUserId] = useState('');

  const load = useCallback(() => {
    api<{ items: Team[] }>('/teams?pageSize=100').then((r) => setRows(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    load();
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
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

  async function openMembers(id: string) {
    if (openTeam?.id === id) { setOpenTeam(null); return; }
    try { setOpenTeam(await api<TeamDetail>(`/teams/${id}`)); setMemberUserId(''); setError(''); } catch { /* ignore */ }
  }

  async function addMember(teamId: string) {
    if (!memberUserId.trim()) return;
    setBusy(true); setError('');
    try {
      await api(`/teams/${teamId}/members`, { method: 'POST', body: { userId: memberUserId.trim() } });
      setMemberUserId('');
      setOpenTeam(await api<TeamDetail>(`/teams/${teamId}`));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao adicionar membro');
    } finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <div className="row between">
          <h2 style={{ margin: '4px 0' }}>Equipes</h2>
          {canEdit && <button className="btn small" onClick={() => { setShowForm(!showForm); setError(''); }}>+ Nova</button>}
        </div>

        {showForm && canEdit && (
          <div className="card">
            <h3>Nova equipe</h3>
            {error && <div className="error">{error}</div>}
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
              <h3>{t.name}</h3>
              <span className="muted">{t._count?.memberships ?? 0} membro(s)</span>
            </div>
            {isG7(me.role) && <div className="muted">Subcontratada: {companyName(t.subcontractorCompanyId)}</div>}
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn small secondary" onClick={() => openMembers(t.id)}>
                {openTeam?.id === t.id ? 'Ocultar' : 'Ver membros'}
              </button>
            </div>
            {openTeam?.id === t.id && (
              <div style={{ marginTop: 10 }}>
                {openTeam.memberships.length === 0 ? (
                  <div className="muted">Sem membros.</div>
                ) : openTeam.memberships.map((m) => (
                  <div key={m.id} className="muted" style={{ padding: '4px 0' }}>• {m.user.name} ({m.user.email})</div>
                ))}
                {canEdit && (
                  <>
                    <label>Adicionar membro (ID do usuário)</label>
                    <div className="row" style={{ gap: 8 }}>
                      <input value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} placeholder="cole o ID do usuário" />
                      <button className="btn small" disabled={busy} onClick={() => addMember(t.id)}>Add</button>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>Crie o login em “Acessos”; o vínculo por ID é temporário até termos a busca de usuários.</div>
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
