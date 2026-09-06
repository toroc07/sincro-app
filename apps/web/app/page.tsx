import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { CITIZEN_SESSION_COOKIE, verifyCitizenSession } from '@/src/server/infra/citizenSession';
import { ReportClient } from './report/ReportClient';

export const metadata: Metadata = {
  title: 'Emergencia · SINCRO',
  description: 'Reporta una emergencia con tu voz y sigue la ayuda en tiempo real.',
};

/**
 * La raíz es la app ciudadana. Permite reporte rápido inmediato
 * y anónimo, o con cuenta si ya inició sesión.
 */
export default async function HomePage() {
  const store = await cookies();
  const citizen = verifyCitizenSession(store.get(CITIZEN_SESSION_COOKIE)?.value);
  return <ReportClient citizen={citizen} />;
}
