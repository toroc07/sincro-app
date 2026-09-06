'use client';

import type { CitizenSession } from '@dispatch/contracts';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandLockup, Button } from '@/src/components/ui';
import { LocationIcon, PhoneIcon, SosIcon } from '@/src/components/ui/icons';

interface ReportHistory {
  id: string;
  code: string;
  type: string;
  status: string;
  address: string | null;
  createdAt: number;
  trackingToken: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  TRAFFIC_ACCIDENT: 'Accidente de tránsito',
  CARDIAC: 'Emergencia cardíaca',
  UNCONSCIOUS: 'Persona inconsciente',
  FALL: 'Caída o lesión',
  TRAUMA: 'Trauma',
  RESPIRATORY: 'Dificultad respiratoria',
  OBSTETRIC: 'Emergencia obstétrica',
  OTHER: 'Otra emergencia',
};

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  REPORTED: { label: 'Recibido', color: 'bg-info-soft text-info border-info/30' },
  VALIDATING: { label: 'Validando', color: 'bg-info-soft text-info border-info/30' },
  OPEN: { label: 'Buscando ambulancia', color: 'bg-warn-soft text-warn border-warn/30' },
  ASSIGNING: { label: 'Asignando', color: 'bg-warn-soft text-warn border-warn/30' },
  ASSIGNED: { label: 'Unidad asignada', color: 'bg-ok-soft text-ok border-ok/30' },
  EN_ROUTE: { label: 'Ambulancia en camino', color: 'bg-ok-soft text-ok border-ok/30' },
  ON_SCENE: { label: 'En el lugar', color: 'bg-ok-soft text-ok border-ok/30' },
  TRANSPORTING: { label: 'Trasladando', color: 'bg-ok-soft text-ok border-ok/30' },
  COMPLETED: { label: 'Completado', color: 'bg-surface-raised text-content-secondary border-edge-subtle' },
  CANCELLED: { label: 'Cancelado', color: 'bg-surface-raised text-content-muted border-edge-subtle' },
  DUPLICATE: { label: 'Unificado', color: 'bg-surface-raised text-content-muted border-edge-subtle' },
};

export function ProfileClient({ citizen }: { citizen: CitizenSession }) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch('/api/citizens/reports');
        if (res.ok) {
          const data = (await res.json()) as { reports: ReportHistory[] };
          setReports(data.reports || []);
        }
      } catch (err) {
        console.error('Error cargando reportes previos:', err);
      } finally {
        setLoading(false);
      }
    }
    void loadReports();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      try {
        localStorage.removeItem('sincro_citizen_session');
      } catch {}
      await fetch('/api/citizens/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Error cerrando sesión:', err);
      setLoggingOut(false);
    }
  };

  const initials = citizen.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <main className="app-light mobile-app-shell safe-x flex flex-col py-6 min-h-screen screen-enter">
      {/* Cabecera con botón de retorno y marca */}
      <header className="flex items-center justify-between pb-4 border-b border-edge-subtle">
        <BrandLockup height={36} />
        <Link
          href="/"
          className="rounded-xl border border-edge-strong bg-surface-base px-3 py-1.5 text-xs font-semibold text-content hover:bg-surface-raised transition"
        >
          ← Volver
        </Link>
      </header>

      {/* Tarjeta de Perfil */}
      <section className="mt-5 rounded-2xl border border-edge-strong bg-surface-base p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emergency to-[#8a0f1e] text-white font-bold text-lg shadow-sm">
            {initials || 'CI'}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-content truncate">{citizen.name}</h1>
            <p className="text-xs text-content-secondary truncate">{citizen.email}</p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-edge-subtle flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-content-secondary">
            <span className="flex items-center gap-1.5 font-medium">
              <PhoneIcon size={14} className="text-emergency" /> Teléfono de emergencia:
            </span>
            <span className="font-semibold text-content">{citizen.phone}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Link
            href="/"
            className="flex-1 rounded-xl bg-emergency px-4 py-2.5 text-center text-xs font-bold text-white shadow-sm hover:bg-emergency-hover active:scale-[0.98] transition"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
            <SosIcon size={15} />
            Reportar Emergencia
          </span>
          </Link>
          <Button
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="rounded-xl border border-edge-strong bg-surface-raised px-3 py-2 text-xs font-semibold text-content-secondary hover:text-emergency hover:border-emergency transition"
          >
            {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
          </Button>
        </div>
      </section>

      {/* Historial de Reportes */}
      <section className="mt-6 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-content">Historial de Reportes</h2>
          <span className="text-xs text-content-muted font-medium">
            {reports.length} {reports.length === 1 ? 'reporte' : 'reportes'}
          </span>
        </div>

        {loading && (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando historial de reportes">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="my-auto rounded-2xl border border-dashed border-edge-strong p-8 text-center text-content-secondary">
            <p className="text-sm font-semibold">Sin reportes registrados</p>
            <p className="mt-1 text-xs text-content-muted">
              Cuando reportes una emergencia con este teléfono, aparecerá aquí su estado en tiempo real.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl bg-surface-raised px-4 py-2 text-xs font-bold text-content hover:bg-edge-subtle transition"
            >
              Hacer un reporte ahora
            </Link>
          </div>
        )}

        {!loading && reports.length > 0 && (
          <div className="flex flex-col gap-3 pb-8">
            {reports.map((report, i) => {
              const statusInfo = STATUS_BADGES[report.status] || {
                label: report.status,
                color: 'bg-surface-raised text-content-secondary border-edge-subtle',
              };
              const dateStr = new Date(report.createdAt).toLocaleString('es-CO', {
                dateStyle: 'short',
                timeStyle: 'short',
              });

              return (
                <div
                  key={report.id}
                  className="rounded-2xl border border-edge-subtle bg-surface-base p-4 shadow-sm hover:border-edge-strong transition list-in"
                  style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emergency">
                        {report.code}
                      </span>
                      <h3 className="text-sm font-bold text-content">
                        {TYPE_LABELS[report.type] || report.type}
                      </h3>
                    </div>
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.color}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  {report.address && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-content-secondary truncate">
                      <LocationIcon size={14} className="shrink-0 text-content-muted" />
                      {report.address}
                    </p>
                  )}

                  <div className="mt-3 pt-2.5 border-t border-edge-subtle flex items-center justify-between text-[11px] text-content-muted">
                    <span>{dateStr}</span>
                    {report.trackingToken && (
                      <Link
                        href={`/track/${report.trackingToken}`}
                        className="font-bold text-emergency hover:underline"
                      >
                        Ver seguimiento →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
