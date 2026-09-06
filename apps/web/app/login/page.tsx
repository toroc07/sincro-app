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
    <Suspense
      fallback={
        <div className="app-light min-h-screen bg-surface-base flex flex-col justify-center items-center px-4" role="status">
          <div className="w-full max-w-md space-y-4">
            <div className="h-10 w-10 mx-auto rounded-full bg-surface-overlay skeleton" />
            <div className="h-6 w-48 mx-auto rounded-md bg-surface-overlay skeleton" style={{ animationDelay: '80ms' }} />
            <div className="h-4 w-64 mx-auto rounded-md bg-surface-overlay skeleton" style={{ animationDelay: '160ms' }} />
            <div className="h-44 w-full rounded-2xl bg-surface-overlay skeleton" style={{ animationDelay: '240ms' }} />
          </div>
          <span className="sr-only">Cargando la aplicación</span>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}

