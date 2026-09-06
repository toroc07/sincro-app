'use client';

import Link from 'next/link';
import { estimateEta, type Assignment, type Incident, type VehicleWithLocation } from '@dispatch/contracts';
import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, LocationIcon, PhoneIcon, UserIcon } from '@/src/components/ui/icons';
import { Badge, BrandLockup, BrandMark, Button } from '@/src/components/ui';
import { LiveRouteMap } from '@/src/components/map/LiveRouteMap';
import { useKeepAlive } from '@/src/hooks/useKeepAlive';
import { useLiveResource } from '@/src/hooks/useLiveResource';
import type { RouteResult } from '@/src/lib/routing';
import { useVehicleTracking, type GpsState } from './useVehicleTracking';
import { useOfferAlert } from './useOfferAlert';
import { assignmentActionOutcome } from './responderState';

/** Misma unidad que UNIVERSAL_VEHICLE_ID en src/server/modules/vehicles —
 *  no hay selector ni login de unidad (§ remodel: un solo panel recibe todo
 *  sin importar cuenta ni ubicación). El navegador de este panel ES la
 *  ambulancia: reporta su GPS real bajo ese id fijo todo el tiempo. Nivel
 *  RESCUE en el seed para no quedar nunca excluida por capacidad. */
const UNIVERSAL_VEHICLE_ID = 'seed-vehicle-05';

/** Centro de Cartagena — respaldo cuando el navegador no da permiso de GPS
 *  (o tarda). Sin esto, negar el permiso deja la unidad sin ubicación fresca
 *  para siempre y el despacho nunca encuentra candidato (§ demo: que nunca
 *  se quede sin asignar por un permiso del navegador). */
const FALLBACK_LOCATION = { lat: 10.4056, lng: -75.5144 };

const GPS_LABELS: Record<GpsState, string> = {
  waiting: 'Buscando GPS', sending: 'GPS en vivo', offline: 'GPS sin conexión',
  denied: 'GPS sin permiso', unsupported: 'GPS no disponible',
};

interface ResponderCurrent {
  incident: Incident | null;
  reportSummary: string | null;
  reporterContact: string | null;
  assignment: Assignment | null;
  assignedVehicle: VehicleWithLocation | null;
  staff?: { name: string; role: string } | null;
  activeShift?: { callsign: string; shiftId: string } | null;
  universalVehicleId?: string;
}

const INITIAL: ResponderCurrent = {
  incident: null, reportSummary: null, reporterContact: null, assignment: null, assignedVehicle: null,
  staff: null, activeShift: null, universalVehicleId: UNIVERSAL_VEHICLE_ID,
};

function selectCurrent(payload: unknown): ResponderCurrent {
  if (!payload || typeof payload !== 'object') throw new Error('Respuesta de despacho inválida');
  return payload as ResponderCurrent;
}

/** Hora local de Cartagena (UTC-5, sin horario de verano) — mismo cálculo
 *  que candidates.ts usa en el servidor para el perfil de velocidad. */
function cartagenaHour(): number {
  return (new Date().getUTCHours() + 19) % 24;
}

export function ResponderClient() {
  const live = useLiveResource({
    initialData: INITIAL,
    endpoint: '/api/responder/current',
    topics: ['incident:created', 'incident:merged', 'incident:updated', 'assignment:updated', 'vehicle:location'],
    select: selectCurrent,
  });
  const { incident, reportSummary, reporterContact, assignment, assignedVehicle, staff, activeShift } = live.data;
  const vehicleId = live.data.universalVehicleId ?? UNIVERSAL_VEHICLE_ID;
  const tracking = useVehicleTracking(vehicleId, true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [alertsArmed, setAlertsArmed] = useState(false);
  const redispatchingRef = useRef(false);

  useKeepAlive();

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/responder/sw.js', { scope: '/responder/' });
  }, []);

  // El navegador solo deja timbrar, vibrar y notificar después de que el
  // conductor haya tocado la pantalla al menos una vez. Se aprovecha el primer
  // toque —el que sea— para pedir el permiso y dejar el canal listo, en vez de
  // descubrir que el teléfono estaba mudo justo cuando entra la emergencia.
  useEffect(() => {
    const arm = () => {
      setAlertsArmed(true);
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    };
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') setAlertsArmed(true);
    window.addEventListener('pointerdown', arm, { once: true });
    return () => window.removeEventListener('pointerdown', arm);
  }, []);

  // Late de respaldo con el centro de Cartagena: el despacho excluye una
  // unidad con ubicación de más de 5 min. Si el navegador niega el GPS o
  // tarda, esto igual mantiene la unidad "viva" para el motor de despacho —
  // en cuanto haya GPS real, sus posiciones son más recientes y ganan.
  useEffect(() => {
    const send = () => {
      void fetch(`/api/vehicles/${vehicleId}/location`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ positions: [{ ...FALLBACK_LOCATION, recordedAt: Date.now() }] }),
      }).catch(() => {
        // Ignora desconexiones o recargas temporales de red para no disparar overlay
      });
    };
    send();
    const timer = window.setInterval(send, 20_000);
    return () => window.clearInterval(timer);
  }, [vehicleId]);

  // Sin Command Center no hay humano que dispare el despacho: la primera
  // pasada corre sola en app/api/incidents/audio/route.ts. Si esa pasada no
  // encontró ninguna unidad con ubicación fresca (p. ej. este panel recién se
  // abrió), reintenta seguido hasta que haya asignación.
  useEffect(() => {
    if (!incident || assignment || redispatchingRef.current) return;
    redispatchingRef.current = true;
    const timer = window.setTimeout(() => {
      void fetch(`/api/incidents/${encodeURIComponent(incident.id)}/dispatch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'AUTO_ASSIGN' }),
      })
        .catch(() => {})
        .finally(() => {
          redispatchingRef.current = false;
          void live.refresh();
        });
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [incident, assignment, live]);

  const acceptOffer = async (assignmentId: string) => {
    const response = await fetch(`/api/assignments/${encodeURIComponent(assignmentId)}/accept`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    return assignmentActionOutcome(response.status);
  };

  /** Vuelve a despachar el incidente y devuelve el id de la oferta nueva.
   *  Se usa cuando la anterior caducó: aquí no hay otra unidad a la que
   *  ofrecérsela, así que la oferta vuelve a esta misma ambulancia. */
  const claimFreshOffer = async (incidentId: string): Promise<string | null> => {
    const response = await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/dispatch`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'AUTO_ASSIGN' }),
    });
    if (!response.ok) return null;
    const result = await response.json() as { assignment: { id: string } | null };
    return result.assignment?.id ?? null;
  };

  /** Acepta la oferta si hace falta y marca la unidad en camino en un solo
   *  paso — el ciudadano ya lo ve reflejado en su seguimiento en vivo. */
  const notifyEnRoute = async () => {
    if (!incident || !assignment || !assignedVehicle || busy) return;
    setBusy(true); setMessage(null);
    try {
      let assignmentId = assignment.id;
      if (assignment.status === 'OFFERED') {
        let outcome = await acceptOffer(assignmentId);
        // La oferta caduca a los 30 s. Al conductor, que estaba mirando el
        // mapa o arrancando, decirle "esta asignación ya no está disponible"
        // sobre un reporte que sigue en su pantalla es mentira y le hace
        // perder el viaje: se vuelve a pedir la oferta y se acepta esa.
        if (outcome.kind === 'conflict') {
          const fresh = await claimFreshOffer(incident.id);
          if (!fresh) { setMessage(outcome.message); await live.refresh(); return; }
          assignmentId = fresh;
          outcome = await acceptOffer(assignmentId);
        }
        if (outcome.kind === 'conflict') { setMessage(outcome.message); await live.refresh(); return; }
        if (outcome.kind === 'error') throw new Error('No se pudo aceptar el reporte');
      }
      const statusResponse = await fetch(`/api/vehicles/${encodeURIComponent(assignedVehicle.id)}/status`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'EN_ROUTE' }),
      });
      if (!statusResponse.ok) throw new Error('No se pudo notificar que vas en camino');
      await live.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible completar la acción');
    } finally {
      setBusy(false);
    }
  };

  const notified = Boolean(assignment && assignment.status !== 'OFFERED' && assignment.status !== 'ACCEPTED');

  // El reporte TIMBRA, vibra y se lee en voz alta hasta que el conductor pulsa
  // "voy en camino" — como una carrera entrante de Didi/inDriver, no como una
  // notificación silenciosa que se pierde entre otras. Se engancha al
  // incidente y no a la asignación a propósito: el panel ya muestra el reporte
  // en cuanto entra, y esperar a que el motor asigne sería regalar segundos.
  useOfferAlert(
    Boolean(incident) && !notified,
    incident?.id ?? null,
    incident
      ? {
          type: incident.type,
          address: incident.address,
          patientCount: incident.patientCount,
          priority: incident.priority,
        }
      : null,
  );

  // El GPS del propio dispositivo va por delante del que ya viajó al servidor:
  // para SU mapa, el conductor debe verse donde está, no donde estaba hace unos
  // segundos. La posición del servidor queda de respaldo.
  const vehiclePoint = tracking.position ?? assignedVehicle?.location ?? null;

  // La ruta del grafo manda; `estimateEta` en línea recta solo cubre el hueco
  // hasta que llega (o si el servicio de rutas está caído).
  const fallbackEta = vehiclePoint && incident
    ? estimateEta(vehiclePoint, incident, cartagenaHour())
    : null;
  const distanceKm = route ? route.distanceMeters / 1000 : fallbackEta ? fallbackEta.distanceM / 1000 : null;
  const etaMinutes = route
    ? Math.max(1, Math.round(route.durationSeconds / 60))
    : fallbackEta ? Math.max(1, Math.round(fallbackEta.etaSeconds / 60)) : null;

  return (
    <main className="app-light responder-shell screen-enter">
      <ResponderHeader
        gps={tracking.state}
        queued={tracking.queued}
        tone={incident ? (notified ? 'green' : 'red') : 'slate'}
        status={incident ? (notified ? 'En camino' : 'Reporte activo') : 'En espera'}
        staff={staff}
        activeShift={activeShift}
      />

      {!incident ? (
        <IdleState gps={tracking.state} alertsArmed={alertsArmed} />
      ) : (
        <>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-emergency">
                {notified ? 'Vas en camino' : 'Reporte recibido'}
              </p>
              <h1 className="mt-0.5 text-2xl font-bold leading-tight">{incidentTypeLabel(incident.type)}</h1>
            </div>
            <Badge className="tnum shrink-0 bg-surface-overlay px-3 py-2 text-content-secondary">{incident.code}</Badge>
          </div>

          <section className="state-card mt-4 overflow-hidden">
            <LiveRouteMap
              vehicle={vehiclePoint}
              destination={{ lat: incident.lat, lng: incident.lng }}
              vehicleLabel="Tu ambulancia"
              destinationLabel={`Emergencia ${incident.code}`}
              onRoute={setRoute}
              height={264}
            />

            {/* Distancia y tiempo primero y en grande: es lo que el conductor
                mira de reojo mientras conduce. */}
            {etaMinutes !== null && (
              <div className="flex items-end gap-5 border-b border-edge-subtle px-4 py-3">
                <span className="flex items-baseline gap-1.5">
                  <span className="tnum text-4xl font-bold leading-none text-ok">{etaMinutes}</span>
                  <span className="text-sm font-bold text-content-secondary">min</span>
                </span>
                {distanceKm !== null && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="tnum text-2xl font-bold leading-none">{distanceKm.toFixed(1)}</span>
                    <span className="text-sm font-bold text-content-secondary">km</span>
                  </span>
                )}
                <span className="ml-auto pb-1 text-[11px] font-semibold text-content-muted">
                  {route?.source === 'graph' ? 'por calles' : 'estimado'}
                </span>
              </div>
            )}

            <div className="p-4">
              <p className="flex items-start gap-2 font-semibold leading-snug">
                <LocationIcon className="mt-0.5 shrink-0 text-emergency" size={18} />
                {incident.address ?? 'Ubicación GPS del incidente'}
              </p>
              <p className="mt-2 text-sm font-semibold text-content-secondary">{incident.patientCount} paciente(s)</p>
              {/* El reporte que estructuró la IA (audio-intake.ts), tal cual — es lo único operativo que ve el responder. */}
              {reportSummary && (
                <p className="mt-3 rounded-xl bg-surface-overlay p-3 text-sm italic leading-relaxed text-content-secondary">
                  &ldquo;{reportSummary}&rdquo;
                </p>
              )}
              {!assignment && (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-info">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-info" />
                  Buscando ambulancia disponible…
                </p>
              )}
            </div>
          </section>

          <div className="mt-auto flex flex-col gap-3 pt-5">
            <div className="grid grid-cols-2 gap-3">
              {/* Navegación paso a paso: el mapa da contexto, pero al volante
                  hace falta voz. Se delega en la app que el conductor ya usa. */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${incident.lat},${incident.lng}&travelmode=driving`}
                target="_blank" rel="noopener noreferrer"
                className="pressable flex min-h-touch-lg items-center justify-center gap-2 rounded-xl bg-info font-bold text-on-info"
              >
                <LocationIcon size={19} /> Cómo llegar
              </a>
              {/* Llamar no depende de que ya haya asignación: es el contacto del
               *  reporte, útil desde el primer segundo. */}
              <a
                href={reporterContact ? `tel:${reporterContact}` : undefined}
                aria-disabled={!reporterContact}
                className={`pressable flex min-h-touch-lg items-center justify-center gap-2 rounded-xl border border-edge-strong font-bold ${reporterContact ? 'text-info' : 'pointer-events-none text-content-muted opacity-50'}`}
              >
                <PhoneIcon size={19} /> Llamar
              </a>
            </div>

            {assignment && (
              notified ? (
                <p className="flex items-center justify-center gap-2 rounded-xl bg-ok-soft py-3 font-semibold text-ok">
                  <CheckIcon size={18} /> Ya avisamos que vas en camino
                </p>
              ) : (
                <Button className="responder-action bg-ok text-on-ok" disabled={busy} onClick={() => void notifyEnRoute()}>
                  {busy ? 'Enviando…' : 'Notificar: voy en camino'}
                </Button>
              )
            )}
          </div>
        </>
      )}

      {(message || live.error) && <p role="alert" className="responder-alert">{message ?? live.error?.message}</p>}
    </main>
  );
}

function ResponderHeader({
  gps,
  queued,
  tone,
  status,
  staff,
  activeShift,
}: {
  gps: GpsState;
  queued: number;
  tone: 'green' | 'red' | 'slate';
  status: string;
  staff?: { name: string; role: string } | null;
  activeShift?: { callsign: string; shiftId: string } | null;
}) {
  const backgrounds = { green: 'bg-ok', red: 'bg-emergency', slate: 'bg-[#1f2a3d]' };
  const danger = gps !== 'sending';
  return (
    <header className={`responder-header ${backgrounds[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 px-2">
          {/* Tinta blanca: la cabecera cambia de color según el estado y el
              isotipo a color se ensucia sobre el rojo. */}
          <BrandMark size={34} tone="white" />
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-[.18em] opacity-75">SINCRO · Panel de</span>
            <span className="block text-2xl font-bold leading-tight">Ambulancia</span>
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <Link
              href="/responder/profile"
              className="rounded-full bg-white/20 hover:bg-white/30 px-2.5 py-1 text-xs font-bold text-white transition flex items-center gap-1 ring-1 ring-white/30"
              title="Ir al perfil de guardia del paramédico"
            >
              <UserIcon size={15} className="inline-block" />
              <span className="max-w-[95px] truncate">{staff ? staff.name : (activeShift ? `U-${activeShift.callsign}` : 'Mi Guardia')}</span>
            </Link>
            <span className="rounded-full bg-white/18 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/30">{status}</span>
          </div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${danger ? 'bg-white text-emergency' : 'bg-white/18 text-white ring-1 ring-white/30'}`}>
            {GPS_LABELS[gps]}{queued ? ` · ${queued} en cola` : ''}
          </span>
        </div>
      </div>
    </header>
  );
}

/** Sin reportes: la pantalla debe leerse de un vistazo desde el asiento del
 *  conductor y dejar claro que el panel SÍ está escuchando. Si además el GPS
 *  no está enviando, eso es lo único accionable aquí y se dice explícitamente. */
function IdleState({ gps, alertsArmed }: { gps: GpsState; alertsArmed: boolean }) {
  const gpsBroken = gps === 'denied' || gps === 'unsupported' || gps === 'offline';
  return (
    <section className="my-auto flex flex-col items-center py-12 text-center">
      <span className="relative grid h-24 w-24 place-items-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ok-soft" />
        <span className="relative grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok">
          <CheckIcon size={30} />
        </span>
      </span>
      <h1 className="mt-6 text-xl font-bold">Sin reportes activos</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-content-secondary">
        La unidad está disponible. Apenas un ciudadano reporte, el teléfono suena, vibra y te lee la
        emergencia en voz alta.
      </p>
      {!alertsArmed && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-info-soft px-4 py-3 text-left text-sm font-semibold text-info">
          <AlertIcon className="mt-0.5 shrink-0" size={18} />
          Toca la pantalla una vez para activar el timbre y el aviso: el navegador no deja sonar sin
          un primer toque.
        </p>
      )}
      {gpsBroken && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-left text-sm font-semibold text-warn">
          <AlertIcon className="mt-0.5 shrink-0" size={18} />
          Sin GPS activo el despacho no puede calcular tu distancia. Permite la ubicación en el navegador.
        </p>
      )}
      {/* Pantalla de espera: es la que más horas está encendida en el
          parabrisas, y el único hueco donde la marca no le quita sitio a nada. */}
      <BrandLockup height={26} className="mt-10 opacity-50" />
    </section>
  );
}

function incidentTypeLabel(type: string): string {
  const labels: Record<string, string> = { TRAFFIC_ACCIDENT: 'Accidente de tránsito', CARDIAC: 'Emergencia cardiaca', UNCONSCIOUS: 'Persona inconsciente', FALL: 'Caída o lesión', TRAUMA: 'Trauma', RESPIRATORY: 'Emergencia respiratoria', OBSTETRIC: 'Emergencia obstétrica', OTHER: 'Otra emergencia' };
  return labels[type] ?? type;
}
