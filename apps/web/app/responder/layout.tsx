import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Responder · SINCRO',
  manifest: '/responder-manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Responder' },
};

export default function ResponderLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
