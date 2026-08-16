'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Attachment { id: string; type: string; thumbnailUrl: string | null; uploadStatus: string }
interface Daily {
  id: string; status: string; productionDate: string; description: string; rejectionReason?: string | null;
  gpsLat?: number | null; gpsLng?: number | null;
  project?: { code: string; description?: string }; team?: { name: string };
  author?: { id: string; name: string }; reviewedBy?: { name: string } | null;
  attachments: Attachment[];
}
interface Me { id: string; role: string }

function DetailInner() {
  const id = useSearchParams().get('id') || '';
  const [d, setD] = useState<Daily | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setError('Daily não informado'); return; }
    try { setD(await api<Daily>(`/daily-production/${id}`)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro'); }
  }, [id]);

  useEffect(() => { api<Me>('/users/me').then(setMe).catch(() => {}); }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(action: 'submit' | 'approve' | 'reject') {
    let body: unknown;
    if (action === 'reject') {
      const reason = window.prompt('Motivo da rejeição:') || '';
      if (!reason) return;
      body = { reason };
    }
    setBusy(true); setError('');
    try { await api(`/daily-production/${id}/${action}`, { method: 'POST', body }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha'); }
    finally { setBusy(false); }
  }

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>, type: string) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file); form.append('type', type);
      form.append('capturedAt', new Date().toISOString());
      await api(`/daily-production/${id}/attachments`, { method: 'POST', body: form, isForm: true });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha no upload'); }
    finally { setBusy(false); }
  }

  if (error && !d) return <div className="container"><div className="error">{error}</div><Link href="/dailies">Voltar</Link></div>;
  if (!d) return <div className="center">Carregando…</div>;

  const isGlobal7 = me?.role === 'GLOBAL7_ADMIN' || me?.role === 'GLOBAL7_STAFF';
  const editable = d.status === 'DRAFT' || d.status === 'REJECTED';

  return (
    <>
      <div className="topbar">
        <h1>{d.project?.code || 'Daily'}</h1>
        <Link href="/dailies" className="btn small secondary">Voltar</Link>
      </div>
      <div className="container">
        {error && <div className="error">{error}</div>}
        <div className="card">
          <div className="row between">
            <h3>{new Date(d.productionDate).toLocaleDateString('pt-BR')}</h3>
            <span className={`badge ${d.status}`}>{d.status}</span>
          </div>
          <div className="muted">{d.team?.name} · por {d.author?.name}</div>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{d.description}</p>
          {d.gpsLat != null && d.gpsLng != null && (
            <a className="muted" href={`https://maps.google.com/?q=${d.gpsLat},${d.gpsLng}`} target="_blank" rel="noreferrer">
              📍 {d.gpsLat.toFixed(5)}, {d.gpsLng.toFixed(5)}
            </a>
          )}
          {d.status === 'REJECTED' && d.rejectionReason && (
            <div className="error" style={{ marginTop: 10 }}>Rejeitado: {d.rejectionReason}</div>
          )}
          {d.reviewedBy && <div className="muted" style={{ marginTop: 6 }}>Revisado por {d.reviewedBy.name}</div>}
        </div>

        <div className="card">
          <div className="row between"><h3>Fotos ({d.attachments.length})</h3></div>
          {d.attachments.length === 0 ? (
            <div className="muted">Sem fotos.</div>
          ) : (
            <div className="thumbs">
              {d.attachments.map((a) => (
                <div className="thumb" key={a.id}>
                  {a.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" /> : <div className="center">sem preview</div>}
                  <span className="tag">{a.type === 'MAP_PHOTO' ? 'mapa' : 'prod'}</span>
                </div>
              ))}
            </div>
          )}
          {editable && (
            <div className="stack" style={{ marginTop: 12 }}>
              <label>Adicionar foto de produção</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhoto(e, 'PRODUCTION_PHOTO')} />
              <label>Adicionar foto de mapa</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhoto(e, 'MAP_PHOTO')} />
            </div>
          )}
        </div>

        <div className="stack">
          {editable && <button className="btn ok" disabled={busy} onClick={() => act('submit')}>Enviar para aprovação</button>}
          {isGlobal7 && d.status === 'SUBMITTED' && (
            <>
              <button className="btn ok" disabled={busy} onClick={() => act('approve')}>Aprovar</button>
              <button className="btn danger" disabled={busy} onClick={() => act('reject')}>Rejeitar</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function DailyDetailPage() {
  return (
    <Suspense fallback={<div className="center">Carregando…</div>}>
      <DetailInner />
    </Suspense>
  );
}
