'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { setTokens } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
      setTokens(res.accessToken, res.refreshToken);
      router.replace('/dailies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 48 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--accent)' }}>G7</div>
        <div className="muted">Global 7 — Daily Production</div>
      </div>
      <form onSubmit={submit} className="card">
        {error && <div className="error">{error}</div>}
        <label>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        <label>Senha</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <div style={{ marginTop: 18 }}>
          <button className="btn" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        </div>
      </form>
      <p className="muted center">Acesso para equipes e Global 7.</p>
    </div>
  );
}
