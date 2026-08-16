'use client';

const ACCESS = 'g7_access';
const REFRESH = 'g7_refresh';

export function getAccess(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS);
}
export function getRefresh(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH);
}
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}
export function isLogged(): boolean {
  return !!getAccess();
}

/** Decodifica o payload do JWT (sem verificar assinatura) só para UI. */
export function decodeToken(): { sub?: string } | null {
  const t = getAccess();
  if (!t) return null;
  try {
    return JSON.parse(atob(t.split('.')[1]));
  } catch {
    return null;
  }
}
