'use client';

import { useEffect } from 'react';
import { useOnline } from '@/lib/net';
import { flushQueue } from '@/lib/sync';

/** Registra o service worker, mostra a barra de offline e dispara o sync ao voltar online. */
export function AppChrome() {
  const online = useOnline();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (online) void flushQueue();
  }, [online]);

  if (online) return null;
  return <div className="offline-bar">Offline — seus lançamentos ficam salvos e sobem sozinhos quando voltar a conexão.</div>;
}
