import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CITIZEN_SESSION_COOKIE, verifyCitizenSession } from '@/src/server/infra/citizenSession';
import { ProfileClient } from './ProfileClient';

export const metadata: Metadata = {
  title: 'Mi Perfil · SINCRO',
  description: 'Historial de reportes de emergencia y datos de contacto.',
};

export default async function ProfilePage() {
  const store = await cookies();
  const citizen = verifyCitizenSession(store.get(CITIZEN_SESSION_COOKIE)?.value);
  if (!citizen) {
    redirect('/login');
  }

  return <ProfileClient citizen={citizen} />;
}
