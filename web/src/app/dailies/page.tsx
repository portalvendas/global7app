'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { clearTokens, isLogged } from '@/lib/auth';
import { db, DraftDaily } from '@/lib/db';
import { useOnline } from '@/lib/net';
import { flushQueue } from '@/lib/sync';
import { Nav } from '@/components/nav';
import type { Me as SessionMe } from '@/lib/session';

type Role = 'GLOBAL7_ADMIN' | 'GLOBAL7_STAFF' | 'SUBCONTRACTOR_ADMIN' | 'TEAM_MEMBER' | 'CLIENT_VIEWER';
interface Me { id: string; role: Role; company: { type: string } }
interface DailyRow {
  id: string; status: string; productionDate: string; description: string;
  project?: { code: string }; team?: { name: string }; _count?: { attachments: number };
}

const TABS: { key: string; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'SUBMITTED', label: 'Pendentes' },
  { key: 'DRAFT', label: 'Rascunhos' },
  { key: 'APPROVED', label: 'Aprovados' },
  { key: 'REJECTED', label: 'Rejeitados' },
];

export default function DailiesPage() {
  const router = useRouter();
  const online = useOnline();
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState('');
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [localDrafts, setLocalDrafts] = useState<DraftDaily[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const local = (await db.drafts.toArray()).filter((d) => !d.synced);
      setLocalDrafts(local);
      const q = tab ? `?status=${tab}` : '';
      const res = await api<{ items: DailyRow[] }>(`/daily-production${q}`);
      setRows(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [tab, router]);

  useEffect(() => {
    if (!isLogged()) { router.replace('/login'); return; }
    api<Me>('/users/me').then(setMe).catch(() => {});
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (online) flushQueue().then((r) => { if (r.dailies || r.photos) load(); }); }, [online, load]);

  const isGlobal7 = me?.role === 'GLOBAL7_ADMIN' || me?.role === 'GLOBAL7_STAFF';

  async function review(id: string, action: 'approve' | 'reject') {
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('Motivo da rejeição:') || '';
      if (!reason) return;
    }
    try {
      await api(`/daily-production/${id}/${action}`, { method: 'POST', body: action === 'reject' ? { reason } : undefined });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha');
    }
  }

  function logout() { clearTokens(); router.replace('/login'); }

  return (
    <>
      {me ? (
        <Nav me={me as unknown as SessionMe} />
      ) : (
        <div className="topbar">
          <h1>Daily Production</h1>
          <button className="btn small secondary" onClick={logout}>Sair</button>
        </div>
      )}
      <div className="container">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {error && <div className="error">{error}</div>}

        {localDrafts.length > 0 && (tab === '' || tab === 'DRAFT') && (
          <>
            <div className="muted" style={{ margin: '4px 2px 8px' }}>Não enviados (neste aparelho)</div>
            {localDrafts.map((d) => (
              <Link key={d.clientUuid} href={`/dailies/new?draft=${d.clientUuid}`} className="card" style={{ display: 'block' }}>
                <div className="row between">
                  <h3>{d.productionDate}</h3>
                  <span className="badge DRAFT">local</span>
                </div>
                <div className="muted">{d.description.slice(0, 80) || 'sem descrição'}</div>
              </Link>
            ))}
          </>
        )}

        {loading ? (
          <div className="center">Carregando…</div>
        ) : rows.length === 0 && localDrafts.length === 0 ? (
          <div className="center">Nenhum lançamento.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="card">
              <Link href={`/dailies/detail?id=${r.id}`} style={{ display: 'block', color: 'inherit' }}>
                <div className="row between">
                  <h3>{r.project?.code || 'Projeto'} · {new Date(r.productionDate).toLocaleDateString('pt-BR')}</h3>
                  <span className={`badge ${r.status}`}>{r.status}</span>
                </div>
                <div className="muted">{r.team?.name} · {r._count?.attachments ?? 0} foto(s)</div>
                <div className="muted" style={{ marginTop: 4 }}>{r.description.slice(0, 90)}</div>
              </Link>
              {isGlobal7 && r.status === 'SUBMITTED' && (
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn small ok" onClick={() => review(r.id, 'approve')}>Aprovar</button>
                  <button className="btn small danger" onClick={() => review(r.id, 'reject')}>Rejeitar</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <Link href="/dailies/new" className="btn fab">+ Novo Daily</Link>
    </>
  );
}
