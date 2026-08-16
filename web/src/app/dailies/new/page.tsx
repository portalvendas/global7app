'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { db, QueuedPhoto } from '@/lib/db';
import { useOnline } from '@/lib/net';
import { flushQueue } from '@/lib/sync';

interface Opt { id: string; code?: string; name?: string }

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function NewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnline();
  const editUuid = params.get('draft');

  const [clientUuid] = useState(() => editUuid || uuid());
  const [projects, setProjects] = useState<Opt[]>([]);
  const [teams, setTeams] = useState<Opt[]>([]);
  const [projectId, setProjectId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ items: Opt[] }>('/projects').then((r) => setProjects(r.items)).catch(() => {});
    api<{ items: Opt[] }>('/teams').then((r) => setTeams(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editUuid) return;
    db.drafts.get(editUuid).then((d) => {
      if (!d) return;
      setProjectId(d.projectId); setTeamId(d.teamId); setDate(d.productionDate);
      setDescription(d.description);
      if (d.gpsLat != null && d.gpsLng != null) setGps({ lat: d.gpsLat, lng: d.gpsLng });
    });
    refreshPhotos(editUuid);
  }, [editUuid]);

  async function refreshPhotos(cu: string) {
    setPhotos((await db.photos.where('clientUuid').equals(cu).toArray()));
  }

  function captureGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError('Não consegui pegar o GPS (permissão negada?)'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>, type: QueuedPhoto['type']) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      try {
        const blob = await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true });
        await db.photos.add({
          clientUuid, type, blob, filename: f.name || `foto-${Date.now()}.jpg`,
          gpsLat: gps?.lat, gpsLng: gps?.lng, capturedAt: new Date().toISOString(), uploaded: false,
        });
      } catch {
        setError('Falha ao processar uma foto');
      }
    }
    refreshPhotos(clientUuid);
  }

  async function persistDraft() {
    await db.drafts.put({
      clientUuid, projectId, teamId, productionDate: date, description,
      gpsLat: gps?.lat, gpsLng: gps?.lng, synced: false, updatedAt: Date.now(),
    });
  }

  function validate(): string | null {
    if (!projectId) return 'Selecione o projeto';
    if (!teamId) return 'Selecione a equipe';
    if (description.trim().length < 3) return 'Descreva o serviço do dia';
    return null;
  }

  async function saveDraft() {
    const v = validate(); if (v) { setError(v); return; }
    setBusy(true); setError('');
    try {
      await persistDraft();
      if (online) await flushQueue();
      router.replace('/dailies');
    } finally { setBusy(false); }
  }

  async function submit() {
    const v = validate(); if (v) { setError(v); return; }
    setBusy(true); setError('');
    try {
      await persistDraft();
      if (!online) { setError('Sem conexão — salvei como rascunho; envie para aprovação quando estiver online.'); setBusy(false); return; }
      await flushQueue();
      const draft = await db.drafts.get(clientUuid);
      if (!draft?.serverId) { setError('Não consegui sincronizar agora; ficou salvo como rascunho.'); setBusy(false); return; }
      await api(`/daily-production/${draft.serverId}/submit`, { method: 'POST' });
      router.replace('/dailies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar');
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="topbar">
        <h1>{editUuid ? 'Editar Daily' : 'Novo Daily'}</h1>
        <Link href="/dailies" className="btn small secondary">Voltar</Link>
      </div>
      <div className="container">
        {error && <div className="error">{error}</div>}

        <label>Projeto</label>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Selecione…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>

        <label>Equipe</label>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Selecione…</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <label>Data de produção</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <label>Descrição do serviço</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que foi executado hoje…" />

        <label>Local (GPS)</label>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn small secondary" onClick={captureGps}>📍 Capturar GPS</button>
          <span className="muted">{gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : 'não capturado'}</span>
        </div>

        <label>Fotos de produção</label>
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => onFiles(e, 'PRODUCTION_PHOTO')} />
        <label>Fotos de mapa</label>
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => onFiles(e, 'MAP_PHOTO')} />

        {photos.length > 0 && (
          <div className="thumbs">
            {photos.map((p) => (
              <div className="thumb" key={p.id}>
                <img src={URL.createObjectURL(p.blob)} alt="" />
                <span className="tag">{p.type === 'MAP_PHOTO' ? 'mapa' : 'prod'}</span>
                {!p.uploaded && <span className="pending">pend.</span>}
              </div>
            ))}
          </div>
        )}

        <div className="stack" style={{ marginTop: 20 }}>
          <button className="btn ok" disabled={busy} onClick={submit}>Enviar para aprovação</button>
          <button className="btn secondary" disabled={busy} onClick={saveDraft}>Salvar rascunho</button>
        </div>
        <p className="muted center" style={{ marginTop: 14 }}>
          Tudo é salvo no aparelho primeiro. Fotos e dados sobem sozinhos quando houver conexão.
        </p>
      </div>
    </>
  );
}

export default function NewDailyPage() {
  return (
    <Suspense fallback={<div className="center">Carregando…</div>}>
      <NewInner />
    </Suspense>
  );
}
