'use client';

import { api } from './api';
import { db } from './db';

let running = false;

/** Envia rascunhos não sincronizados e depois as fotos pendentes. Idempotente. */
export async function flushQueue(): Promise<{ dailies: number; photos: number }> {
  if (running || typeof navigator === 'undefined' || !navigator.onLine) {
    return { dailies: 0, photos: 0 };
  }
  running = true;
  let dailies = 0;
  let photos = 0;
  try {
    // IndexedDB não indexa boolean — carrega tudo e filtra em memória.
    const drafts = (await db.drafts.toArray()).filter((d) => !d.synced);

    for (const d of drafts) {
      try {
        const saved = await api<{ id: string }>('/daily-production', {
          method: 'POST',
          body: {
            clientUuid: d.clientUuid,
            projectId: d.projectId,
            teamId: d.teamId,
            productionDate: d.productionDate,
            description: d.description,
            gpsLat: d.gpsLat,
            gpsLng: d.gpsLng,
          },
        });
        await db.drafts.update(d.clientUuid, { synced: true, serverId: saved.id });
        dailies++;
      } catch {
        /* deixa na fila p/ próxima tentativa */
      }
    }

    // fotos: precisam do serverId do daily já sincronizado
    const pending = (await db.photos.toArray()).filter((p) => !p.uploaded);
    for (const p of pending) {
      const draft = await db.drafts.get(p.clientUuid);
      if (!draft?.serverId) continue;
      try {
        const form = new FormData();
        form.append('file', p.blob, p.filename);
        form.append('type', p.type);
        if (p.gpsLat != null) form.append('gpsLat', String(p.gpsLat));
        if (p.gpsLng != null) form.append('gpsLng', String(p.gpsLng));
        if (p.capturedAt) form.append('capturedAt', p.capturedAt);
        await api(`/daily-production/${draft.serverId}/attachments`, {
          method: 'POST',
          body: form,
          isForm: true,
        });
        if (p.id != null) await db.photos.update(p.id, { uploaded: true });
        photos++;
      } catch {
        /* mantém na fila */
      }
    }
  } finally {
    running = false;
  }
  return { dailies, photos };
}
