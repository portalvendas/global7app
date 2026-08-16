import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppChrome } from './app-chrome';

export const metadata: Metadata = {
  title: 'Global 7 — Daily',
  description: 'Lançamento diário de produção',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Global 7' },
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppChrome />
        {children}
      </body>
    </html>
  );
}
