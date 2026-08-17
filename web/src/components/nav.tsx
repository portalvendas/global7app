'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/auth';
import { isG7, Me } from '@/lib/session';

interface Item {
  href: string;
  label: string;
  show: (me: Me) => boolean;
}

const ITEMS: Item[] = [
  { href: '/dashboard', label: 'Painel', show: () => true },
  { href: '/dailies', label: 'Daily', show: (m) => m.company.type !== 'CLIENT' },
  { href: '/projetos', label: 'Projetos', show: () => true },
  { href: '/equipes', label: 'Equipes', show: (m) => isG7(m.role) || m.role === 'SUBCONTRACTOR_ADMIN' },
  { href: '/empresas', label: 'Empresas', show: (m) => isG7(m.role) },
  { href: '/acessos', label: 'Acessos', show: (m) => isG7(m.role) },
  { href: '/financeiro', label: 'Financeiro', show: (m) => isG7(m.role) || m.company.type !== 'OPERATOR' },
];

export function Nav({ me }: { me: Me }) {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearTokens();
    router.replace('/login');
  }

  const items = ITEMS.filter((i) => i.show(me));

  return (
    <div className="topbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div className="row between">
        <h1>Global 7</h1>
        <div className="row" style={{ gap: 8 }}>
          <span className="muted">{me.name?.split(' ')[0] || me.role.replace('GLOBAL7_', 'G7 ')}</span>
          <button className="btn small secondary" onClick={logout}>Sair</button>
        </div>
      </div>
      <div className="tabs" style={{ paddingTop: 0 }}>
        {items.map((i) => {
          const active = pathname === i.href || pathname.startsWith(i.href + '/');
          return (
            <Link key={i.href} href={i.href} className={`tab ${active ? 'active' : ''}`}>
              {i.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
