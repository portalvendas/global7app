'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';
import { getAccess } from '@/lib/auth';

interface Attachment { id: string; type: string; thumbnailUrl: string | null; uploadStatus: string; mimeType?: string | null }
interface Daily {
  id: string; status: string; productionDate: string; description: string; rejectionReason?: string | null;
  gpsLat?: number | null; gpsLng?: number | null;
  project?: { id?: string; code: string; description?: string }; team?: { id?: string; name: string };
  author?: { id: string; name: string }; reviewedBy?: { name: string } | null;
  attachments: Attachment[];
}
interface Me { id: string; role: string }
interface Opt { id: string; code?: string; name?: string }

function DetailInner() {
  const router = useRouter();
  const id = useSearchParams().get('id') || '';
  const [d, setD] = useState<Daily | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [teams, setTeams] = useState<Opt[]>([]);
  const [form, setForm] = useState({ projectId: '', teamId: '', productionDate: '', description: '' });
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setError('Daily não informado'); return; }
    try { setD(await api<Daily>(`/daily-production/${id}`)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro'); }
  }, [id]);

  useEffect(() => {
    api<Me>('/users/me').then(setMe).catch(() => {});
    api<{ items: Opt[] }>('/projects?pageSize=1000').then((r) => setProjects(r.items)).catch(() => {});
    api<{ items: Opt[] }>('/teams?pageSize=200').then((r) => setTeams(r.items)).catch(() => {});
  }, []);
  useEffect(() => { void load(); }, [load]);

  function startEdit() {
    if (!d) return;
    setForm({ projectId: d.project?.id || '', teamId: d.team?.id || '', productionDate: d.productionDate.slice(0, 10), description: d.description });
    setEditing(true); setError('');
  }
  async function saveEdit() {
    setBusy(true); setError('');
    try {
      await api(`/daily-production/${id}`, { method: 'PATCH', body: {
        projectId: form.projectId || undefined, teamId: form.teamId || undefined,
        productionDate: form.productionDate || undefined, description: form.description || undefined,
      } });
      setEditing(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao salvar'); }
    finally { setBusy(false); }
  }
  async function removeAttachment(attId: string) {
    if (!window.confirm('Remover este anexo?')) return;
    setBusy(true); setError('');
    try { await api(`/daily-production/${id}/attachments/${attId}`, { method: 'DELETE' }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao remover'); }
    finally { setBusy(false); }
  }
  async function openImage(attId: string) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/daily-production/${id}/attachments/${attId}/original`, {
        headers: { Authorization: `Bearer ${getAccess()}` },
      });
      if (!res.ok) throw new Error();
      setLightbox(URL.createObjectURL(await res.blob()));
    } catch { setError('Não consegui abrir a imagem'); }
  }

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

  async function downloadOriginal(attId: string) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/daily-production/${id}/attachments/${attId}/original`, {
        headers: { Authorization: `Bearer ${getAccess()}` },
      });
      if (!res.ok) throw new Error();
      window.open(URL.createObjectURL(await res.blob()), '_blank');
    } catch { setError('Não consegui baixar o arquivo'); }
  }

  if (error && !d) return <div className="container"><div className="error">{error}</div><Link href="/dailies">Voltar</Link></div>;
  if (!d) return <div className="center">Carregando…</div>;

  const isGlobal7 = me?.role === 'GLOBAL7_ADMIN' || me?.role === 'GLOBAL7_STAFF';
  const editable = d.status === 'DRAFT' || d.status === 'REJECTED';
  const mutable = d.status !== 'APPROVED';

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
          {mutable && !editing && (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn small secondary" onClick={startEdit}>Editar</button>
            </div>
          )}
        </div>

        {editing && (
          <div className="card">
            <h3>Editar daily</h3>
            <label>Projeto</label>
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Selecione…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
            <label>Equipe</label>
            <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              <option value="">Selecione…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label>Data de produção</label>
            <input type="date" value={form.productionDate} onChange={(e) => setForm({ ...form, productionDate: e.target.value })} />
            <label>Descrição</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="stack" style={{ marginTop: 12 }}>
              <button className="btn" disabled={busy} onClick={saveEdit}>Salvar</button>
              <button className="btn secondary" onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="row between"><h3>Anexos ({d.attachments.length})</h3></div>
          {d.attachments.length === 0 ? (
            <div className="muted">Sem anexos.</div>
          ) : (
            <div className="thumbs">
              {d.attachments.map((a) => (
                <div
                  className="thumb"
                  key={a.id}
                  style={{ cursor: 'pointer', position: 'relative' }}
                  onClick={() => (a.type === 'REDLINE' ? downloadOriginal(a.id) : openImage(a.id))}
                >
                  {a.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" /> : <div className="center" style={{ fontSize: 11, padding: 6 }}>{a.type === 'REDLINE' ? '📄 baixar' : '🔍 ver'}</div>}
                  <span className="tag">{a.type === 'MAP_PHOTO' ? 'mapa' : a.type === 'REDLINE' ? 'redline' : 'prod'}</span>
                  {mutable && (
                    <button
                      title="Remover"
                      onClick={(e) => { e.stopPropagation(); removeAttachment(a.id); }}
                      style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, lineHeight: '20px', padding: 0, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer' }}
                    >✕</button>
                  )}
                  {mutable && a.type === 'REDLINE' && (a.mimeType || '').includes('pdf') && (
                    <button
                      title="Marcar (editar PDF)"
                      onClick={(e) => { e.stopPropagation(); router.push(`/dailies/redline?daily=${id}&att=${a.id}`); }}
                      style={{ position: 'absolute', bottom: 2, left: 2, padding: '2px 8px', borderRadius: 6, border: 'none', background: 'rgba(37,99,235,.9)', color: '#fff', cursor: 'pointer', fontSize: 12 }}
                    >✏️ Marcar</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {mutable && (
            <div className="stack" style={{ marginTop: 12 }}>
              <label>Adicionar foto de produção</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhoto(e, 'PRODUCTION_PHOTO')} />
              <label>Adicionar foto de mapa</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhoto(e, 'MAP_PHOTO')} />
              <label>Anexar RedLine (PDF/DWG/imagem)</label>
              <input type="file" accept=".pdf,.dwg,.dxf,.kmz,.kml,.zip,application/pdf,image/*" onChange={(e) => addPhoto(e, 'REDLINE')} />
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

        {lightbox && (
          <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <img src={lightbox} alt="" style={{ maxWidth: '96vw', maxHeight: '90vh', objectFit: 'contain' }} />
            <button className="btn small secondary" style={{ position: 'absolute', top: 14, right: 14 }} onClick={() => setLightbox(null)}>Fechar</button>
            <a className="btn small" style={{ position: 'absolute', bottom: 14, right: 14 }} href={lightbox} download onClick={(e) => e.stopPropagation()}>Baixar</a>
          </div>
        )}
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
