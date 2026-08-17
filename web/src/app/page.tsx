'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isLogged } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(isLogged() ? '/dashboard' : '/login');
  }, [router]);
  return <div className="center">Carregando…</div>;
}
