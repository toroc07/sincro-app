import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession } from '@/src/server/infra/session';
import { getStaffProfile } from '@/src/server/modules/staff';
import { ProfileClient } from './ProfileClient';

export const metadata: Metadata = {
  title: 'Perfil Operativo · SINCRO',
  description: 'Panel de guardia y control del paramédico / personal médico.',
};

export default async function ResponderProfilePage() {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect('/login?type=staff');
  }

  let initialProfile = null;
  try {
    initialProfile = await getStaffProfile(session.userId);
  } catch {
    redirect('/login?type=staff');
  }

  return <ProfileClient initialProfile={initialProfile} />;
}
