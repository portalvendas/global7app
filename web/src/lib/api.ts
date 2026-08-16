'use client';

import { clearTokens, getAccess, getRefresh, setTokens } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL || '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefresh();
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const json = await res.json();
  const data = json.data ?? json;
  if (data.accessToken && data.refreshToken) {
    setTokens(data.accessToken, data.refreshToken);
    return true;
  }
  return false;
}

interface ApiOpts {
  method?: string;
  body?: unknown;
  auth?: boolean;
  isForm?: boolean;
  _retried?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = true, isForm = false } = opts;
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isForm) {
      payload = body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: payload });

  if (res.status === 401 && auth && !opts._retried) {
    const ok = await refreshTokens();
    if (ok) return api<T>(path, { ...opts, _retried: true });
    clearTokens();
    throw new ApiError(401, 'Sessão expirada');
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || json?.message || `Erro ${res.status}`;
    throw new ApiError(res.status, typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return (json.data ?? json) as T;
}

export const API_BASE = BASE;
