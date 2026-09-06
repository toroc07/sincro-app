import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CITIZEN_SESSION_COOKIE, verifyCitizenSession } from '@/src/server/infra/citizenSession';
import { SESSION_COOKIE, verifySession } from '@/src/server/infra/session';
import { LoginClient } from './LoginClient';

export const metadata: Metadata = {
  title: 'Ingresa · SINCRO',
  description: 'Regístrate para reportar una emergencia o accede como personal operativo.',
};

export default async function LoginPage() {
  const store = await cookies();
  const staff = verifySession(store.get(SESSION_COOKIE)?.value);
  if (staff && staff.role === 'RESPONDER') {
    redirect('/responder/profile');
  }

  const citizen = verifyCitizenSession(store.get(CITIZEN_SESSION_COOKIE)?.value);
  if (citizen) {
    redirect('/profile');
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-content-secondary">Cargando...</div>}>
      <LoginClient />
    </Suspense>
  );
}

