'use client';

import type {
  StaffEmergencyHistoryItem,
  StaffProfileData,
  VehicleWithLocation,
} from '@dispatch/contracts';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertIcon, AmbulanceIcon, ArrowLeftIcon, BoltIcon, CheckIcon, LocationIcon } from '@/src/components/ui/icons';
import { Badge, BrandMark, Button } from '@/src/components/ui';

export function ProfileClient({ initialProfile }: { initialProfile: StaffProfileData }) {
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfileData>(initialProfile);
  const [history, setHistory] = useState<StaffEmergencyHistoryItem[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<VehicleWithLocation[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmingEndShift, setConfirmingEndShift] = useState(false);

  useEffect(() => {
    if (!confirmingEndShift) return;
    const t = setTimeout(() => setConfirmingEndShift(false), 8000);
    return () => clearTimeout(t);
  }, [confirmingEndShift]);

  // Carga historial de emergencias atendidas
  useEffect(() => {
    fetch('/api/staff/history')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Error al cargar historial'))))
      .then((data: { history?: StaffEmergencyHistoryItem[] }) => {
        if (data?.history) {
          setHistory(data.history);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  // Carga vehículos disponibles si no tiene turno activo
  useEffect(() => {
    if (!profile.activeShift) {
      fetch('/api/vehicles/available')
        .then((res) => (res.ok ? res.json() : []))
        .then((vehicles: VehicleWithLocation[]) => {
          setAvailableVehicles(vehicles);
          if (vehicles.length > 0) {
            setSelectedVehicleId((prev) => {
              if (prev && vehicles.some((v) => v.id === prev)) return prev;
              const preferred = vehicles.find((v) => v.id === 'seed-vehicle-05');
              return preferred ? preferred.id : vehicles[0]!.id;
            });
          }
        })
        .catch(() => {});
    }
  }, [profile.activeShift]);

  const refreshProfile = async () => {
    try {
      const res = await fetch('/api/staff/me');
      if (res.ok) {
        const updated = (await res.json()) as StaffProfileData;
        setProfile(updated);
      }
    } catch {}
  };

  const handleStartShift = async () => {
    if (!selectedVehicleId) return;
    setLoadingAction(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/staff/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicleId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? 'No se pudo iniciar el turno en esta unidad');
      }
      setActionSuccess('¡Turno iniciado con éxito! Tu ambulancia está disponible para emergencias.');
      await refreshProfile();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error al iniciar turno');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleEndShift = async () => {
    if (confirmingEndShift) {
      return await endShift();
    }
    setConfirmingEndShift(true);
  };

  const endShift = async () => {
    setLoadingAction(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/staff/shift', { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? 'No se pudo finalizar el turno');
      }
      setActionSuccess('Turno operativo finalizado con éxito.');
      setConfirmingEndShift(false);
      await refreshProfile();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error al finalizar turno');
      setConfirmingEndShift(false);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/staff/logout', { method: 'POST' });
    } catch {}
    try {
      localStorage.removeItem('sincro_staff_session');
    } catch {}
    router.push('/login?type=staff');
    router.refresh();
  };

  const { user, activeShift, activeIncident, stats } = profile;

  return (
    <main className="app-light mobile-app-shell safe-x flex flex-col py-5 min-h-screen screen-enter">
      {/* Cabecera de Navegación y Perfil */}
      <header className="flex items-center justify-between pb-4 border-b border-edge-subtle">
        <Link
          href="/responder"
          className="flex items-center gap-1.5 text-xs font-bold text-content-secondary hover:text-content transition py-1 px-2 rounded-lg bg-surface-raised border border-edge-subtle"
        >
          <ArrowLeftIcon size={14} />
          <span>Consola Ambulancia</span>
        </Link>
        <div className="flex items-center gap-2">
          <BrandMark size={28} tone="color" />
          <span className="text-sm font-bold text-content">SINCRO Staff</span>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="text-xs font-bold text-emergency hover:underline py-1 px-2"
        >
          Cerrar Sesión
        </button>
      </header>

      {/* Tarjeta de Identidad del Paramédico */}
      <section className="mt-4 rounded-2xl bg-surface-base p-4 border border-edge-strong shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emergency-soft px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-emergency">
              <AmbulanceIcon size={15} /> {user.role === 'RESPONDER' ? 'Paramédico / Rescatista' : user.role}
            </span>
            <h1 className="mt-1.5 text-xl font-bold text-content">{user.name}</h1>
            <p className="text-xs text-content-secondary">{user.orgId === 'org-ems' ? 'Red de Emergencias Cartagena' : user.orgId}</p>
          </div>
          <div className="flex flex-col items-end">
            <span className="flex items-center gap-1.5 rounded-full bg-ok-soft px-2 py-0.5 text-[10px] font-bold text-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" />
              Conectado
            </span>
            {user.phone && <span className="mt-1 text-[11px] text-content-muted">{user.phone}</span>}
          </div>
        </div>

        {/* Métricas Rápidas */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-edge-subtle pt-3 text-center">
          <div className="rounded-xl bg-surface-raised p-2.5">
            <span className="block text-2xl font-black text-content">{stats.totalMissions}</span>
            <span className="block text-[11px] font-semibold text-content-secondary">Misiones Asignadas</span>
          </div>
          <div className="rounded-xl bg-surface-raised p-2.5">
            <span className="block text-2xl font-black text-ok">{stats.completedMissions}</span>
            <span className="block text-[11px] font-semibold text-content-secondary">Completadas con Éxito</span>
          </div>
        </div>
      </section>

      {/* Alertas de Acción */}
      {actionError && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-emergency text-xs rounded-xl bg-emergency-soft p-3">
          <AlertIcon size={16} className="shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </p>
      )}
      {actionSuccess && (
        <p className="mt-3 flex items-center gap-2 text-ok text-xs rounded-xl bg-ok-soft p-3">
          <CheckIcon size={16} className="shrink-0" />
          <span>{actionSuccess}</span>
        </p>
      )}

      {/* Emergencia Activa (Si la ambulancia tiene asignación en curso) */}
      {activeIncident && (
        <section className="mt-4 rounded-2xl border-2 border-emergency bg-emergency-soft/30 p-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emergency">
              <span className="h-2.5 w-2.5 rounded-full bg-emergency animate-ping" />
              Emergencia en Curso
            </span>
            <Badge className="bg-emergency text-on-emergency font-mono font-bold text-xs">{activeIncident.code}</Badge>
          </div>
          <h2 className="mt-1.5 text-lg font-bold text-content">{activeIncident.type}</h2>
          {activeIncident.address && (
            <p className="mt-1 flex items-center gap-1 text-xs text-content-secondary">
              <LocationIcon size={14} className="shrink-0 text-emergency" />
              <span>{activeIncident.address}</span>
            </p>
          )}
          <Link
            href="/responder"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emergency py-3 text-sm font-bold text-on-emergency shadow-md hover:bg-emergency-hover active:scale-[0.98] transition w-full"
          >
            <BoltIcon size={16} /> Abrir Navegación GPS y Atender
          </Link>
        </section>
      )}

      {/* Control de Guardia / Turno Operativo */}
      <section className="mt-4 rounded-2xl bg-surface-base p-4 border border-edge-strong shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-content-secondary">
          Estado de Turno Operativo
        </h2>

        {activeShift ? (
          <div className="mt-3">
            <div className="flex items-center justify-between rounded-xl bg-surface-raised p-3 border border-edge-subtle">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-content">Unidad {activeShift.callsign}</span>
                  <Badge className="bg-surface-overlay text-content text-[11px] font-bold">
                    {activeShift.capabilityLevel}
                  </Badge>
                </div>
                {activeShift.plate && (
                  <p className="mt-0.5 text-xs text-content-muted">Placa: {activeShift.plate}</p>
                )}
                <p className="mt-1 text-[11px] text-content-secondary">
                  Turno iniciado: {new Date(activeShift.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <span className="rounded-full bg-ok/15 text-ok px-2.5 py-1 text-xs font-bold ring-1 ring-ok/30">
                En Turno Activo
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <Link
                href="/responder"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-info py-2.5 text-xs font-bold text-on-info shadow-sm hover:bg-info transition"
              >
                <span className="flex items-center gap-1.5">
                  <AmbulanceIcon size={15} />
                  Ir a Consola GPS
                </span>
              </Link>
<Button
  type="button"
  variant="danger"
  disabled={loadingAction || Boolean(activeIncident)}
  aria-live="polite"
  onClick={() => void handleEndShift()}
  className="py-2.5 px-3 text-xs font-semibold"
  title={activeIncident ? 'Finaliza la emergencia activa antes de cerrar turno' : undefined}
>
  {loadingAction ? (
    'Cerrando…'
  ) : confirmingEndShift ? (
    '¿Confirmar cierre? Toca de nuevo'
  ) : (
    'Finalizar Turno'
  )}
</Button>
            </div>
            {activeIncident && (
              <p className="mt-2 text-[11px] text-content-muted text-center">
                * Debes completar o transferir la emergencia activa antes de poder cerrar el turno.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <div className="rounded-xl bg-surface-overlay p-3 border border-edge-subtle text-center">
              <p className="text-xs font-semibold text-content-secondary">
                Actualmente no tienes un turno activo en ninguna unidad.
              </p>
              <p className="mt-0.5 text-[11px] text-content-muted">
                Selecciona una ambulancia disponible para iniciar tu guardia.
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-content-secondary">
                Ambulancia a tripular
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="w-full rounded-xl border border-edge-strong bg-surface-base px-3.5 py-2.5 text-sm font-semibold text-content focus:border-emergency focus:outline-none"
              >
                {availableVehicles.length === 0 && (
                  <option value="">No hay ambulancias libres para iniciar turno</option>
                )}
                {availableVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    Unidad {v.callsign} ({v.capabilityLevel}) — {v.status === 'OFFLINE' ? 'En base (Libre para iniciar guardia)' : 'Disponible para guardia'}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                disabled={loadingAction || !selectedVehicleId}
                onClick={() => void handleStartShift()}
                className="mt-1 bg-emergency hover:bg-emergency-hover text-on-emergency font-bold py-2.5 text-xs rounded-xl"
              >
                {loadingAction ? 'Iniciando guardia…' : 'Iniciar Turno en esta Ambulancia'}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Historial de Emergencias Atendidas */}
      <section className="mt-5 pb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-content">
            Historial de Emergencias Atendidas
          </h2>
          <span className="text-xs text-content-muted">
            {history.length} {history.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {loadingHistory ? (
          <div className="flex flex-col gap-2.5">
            <div className="skeleton h-24 rounded-xl border border-edge-subtle" />
            <div className="skeleton h-24 rounded-xl border border-edge-subtle" style={{ animationDelay: '80ms' }} />
            <div className="skeleton h-24 rounded-xl border border-edge-subtle" style={{ animationDelay: '160ms' }} />
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl bg-surface-base p-6 text-center border border-edge-subtle">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-content-muted mx-auto">
              <LocationIcon size={20} />
            </div>
            <p className="mt-2 text-xs font-bold text-content">Sin emergencias registradas aún</p>
            <p className="mt-1 text-[11px] text-content-secondary max-w-xs mx-auto">
              Las emergencias despachadas a tu unidad durante tus turnos aparecerán automáticamente aquí con su estado y resolución.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {history.map((item) => (
              <article
                key={item.incidentId}
                className="rounded-xl bg-surface-base p-3.5 border border-edge-subtle shadow-sm flex flex-col gap-1.5 hover:border-edge-strong transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-black text-emergency">{item.code}</span>
                  <Badge
                    className={`text-[10px] font-bold ${
                      item.assignmentStatus === 'COMPLETED'
                        ? 'bg-ok-soft text-ok'
                        : item.assignmentStatus === 'CANCELLED'
                          ? 'bg-emergency-soft text-emergency'
                          : 'bg-info/15 text-info'
                    }`}
                  >
                    {item.assignmentStatus === 'COMPLETED' ? 'Atendida' : item.assignmentStatus}
                  </Badge>
                </div>
                <h3 className="text-sm font-bold text-content leading-snug">{item.type}</h3>
                {item.address && (
                  <p className="text-xs text-content-secondary truncate flex items-center gap-1">
                    <LocationIcon size={12} className="shrink-0 text-content-muted" />
                    <span>{item.address}</span>
                  </p>
                )}
                <div className="mt-1 flex items-center justify-between text-[11px] text-content-muted border-t border-edge-subtle/60 pt-1.5">
                  <span>Unidad: {item.vehicleCallsign ?? 'Ambulancia'}</span>
                  <time dateTime={new Date(item.offeredAt).toISOString()}>
                    {new Date(item.offeredAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
