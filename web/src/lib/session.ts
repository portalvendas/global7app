'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { isLogged } from './auth';

export type Role = 'GLOBAL7_ADMIN' | 'GLOBAL7_STAFF' | 'SUBCONTRACTOR_ADMIN' | 'TEAM_MEMBER' | 'CLIENT_VIEWER';
export type CompanyType = 'OPERATOR' | 'SUBCONTRACTOR' | 'CLIENT';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string;
  company: { id: string; name: string; type: CompanyType };
}

/** Carrega o usuário logado e redireciona pro login se não autenticado. */
export function useMe(): { me: Me | null; loading: boolean } {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLogged()) { router.replace('/login'); return; }
    api<Me>('/users/me')
      .then(setMe)
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  return { me, loading };
}

export const isG7 = (r?: Role) => r === 'GLOBAL7_ADMIN' || r === 'GLOBAL7_STAFF';
