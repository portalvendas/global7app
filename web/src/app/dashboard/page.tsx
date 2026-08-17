'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Nav } from '@/components/nav';
import { useMe } from '@/lib/session';

interface Money { amount: number; count: number }
interface Summary {
  currency: string;
  receivable: { outstanding: number; paid: number; draft: number; total: number; byStatus: Record<string, Money> } | null;
  payable: { pendingApproval: number; toPay: number; paid: number; total: number; byStatus: Record<string, Money> } | null;
  production: { pendingReview: number; approved: number; total: number; byStatus: Record<string, number> } | null;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="muted">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {hint && <div className="muted" style={{ marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { me, loading } = useMe();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me) return;
    api<Summary>('/dashboard/summary').then(setData).catch((e) => setError(e?.message || 'Erro'));
  }, [me]);

  if (loading || !me) return <div className="center">Carregando…</div>;

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <h2 style={{ margin: '4px 0 14px' }}>Painel</h2>
        {error && <div className="error">{error}</div>}
        {!data ? (
          <div className="center">Carregando…</div>
        ) : (
          <div className="stack">
            {data.receivable && (
              <section>
                <div className="muted" style={{ marginBottom: 8, fontWeight: 700 }}>A receber (clientes)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  <Stat label="Em aberto (enviadas)" value={money(data.receivable.outstanding)} />
                  <Stat label="Recebido" value={money(data.receivable.paid)} />
                  <Stat label="Rascunho" value={money(data.receivable.draft)} />
                  <Stat label="Total" value={money(data.receivable.total)} />
                </div>
              </section>
            )}
            {data.payable && (
              <section style={{ marginTop: 8 }}>
                <div className="muted" style={{ marginBottom: 8, fontWeight: 700 }}>A pagar (subcontratadas)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  <Stat label="Aguardando aprovação" value={money(data.payable.pendingApproval)} />
                  <Stat label="A pagar (aprovadas)" value={money(data.payable.toPay)} />
                  <Stat label="Pago" value={money(data.payable.paid)} />
                  <Stat label="Total" value={money(data.payable.total)} />
                </div>
              </section>
            )}
            {data.production && (
              <section style={{ marginTop: 8 }}>
                <div className="muted" style={{ marginBottom: 8, fontWeight: 700 }}>Produção (Daily)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  <Stat label="Aguardando revisão" value={String(data.production.pendingReview)} />
                  <Stat label="Aprovados" value={String(data.production.approved)} />
                  <Stat label="Total" value={String(data.production.total)} />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
