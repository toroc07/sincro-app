/**
 * Proyeccion de SEGUIMIENTO para el ciudadano (estilo Uber/Rappi).
 *
 * Es una vista deliberadamente SIMPLIFICADA de la maquina de estados. El
 * ciudadano no ve RESERVED ni ASSIGNING: ve "buscando unidad" y "va en camino".
 * Mostrarle el estado interno seria honesto pero inutil, y en una emergencia la
 * claridad vale mas que la fidelidad al modelo.
 *
 * Los textos se redactan AQUI, en el servidor, para que todas las pantallas
 * digan exactamente lo mismo y no se reescriban en cada cliente.
 */

import {
  toTrackingStep,
  type TrackingResponse,
  type TrackingStep,
} from '@dispatch/contracts';
import { db, type Queryable } from '@/src/server/infra/db';
import { fetchGraphRoute } from '@/src/server/infra/routing';

/** El seguimiento se refresca cada pocos segundos: si el servicio de rutas
 *  está dormido, es preferible el ETA en línea recta al instante que una
 *  pantalla congelada esperando el A*. */
const ROUTE_TIMEOUT_MS = 2_500;

interface IncidentRow {
  id: string;
  code: string;
  status: string;
  lat: number;
  lng: number;
  created_at: number;
}

interface AssignmentRow {
  id: string;
  status: string;
  offered_at: number;
  responded_at: number | null;
  en_route_at: number | null;
  arrived_at: number | null;
  transport_started_at: number | null;
  completed_at: number | null;
  callsign: string;
  capability_level: string;
  v_lat: number | null;
  v_lng: number | null;
  heading: number | null;
  recorded_at: number | null;
}

/** Copy por paso. Tono: directo, sin tecnicismos y sin prometer de mas. */
const COPY: Record<TrackingStep, { headline: string; detail: string }> = {
  RECEIVED: {
    headline: 'Recibimos tu reporte',
    detail: 'Estamos confirmando la ubicación y el tipo de emergencia.',
  },
  ASSIGNING: {
    headline: 'Buscando la unidad más cercana',
    detail: 'Estamos evaluando qué ambulancia puede llegar antes sin dejar otra zona sin cobertura.',
  },
  ON_THE_WAY: {
    headline: 'La ambulancia va en camino',
    detail: 'Mantén el teléfono cerca. Si puedes, despeja el acceso al lugar.',
  },
  ARRIVED: {
    headline: 'La ambulancia llegó',
    detail: 'El personal está atendiendo en el lugar.',
  },
  TRANSPORTING: {
    headline: 'Trasladando al paciente',
    detail: 'La unidad va rumbo al centro asistencial.',
  },
  COMPLETED: {
    headline: 'Atención completada',
    detail: 'Gracias por reportar. Tu aviso ayudó a que llegara ayuda.',
  },
};

const STEP_LABEL: Record<TrackingStep, string> = {
  RECEIVED: 'Reporte recibido',
  ASSIGNING: 'Buscando unidad',
  ON_THE_WAY: 'Unidad en camino',
  ARRIVED: 'Unidad en el lugar',
  TRANSPORTING: 'Traslado iniciado',
  COMPLETED: 'Atención completada',
};

export async function getTracking(
  trackingToken: string,
  q: Queryable = db(),
): Promise<TrackingResponse | null> {
  const incident = await q.one<IncidentRow & Record<string, unknown>>(
    `SELECT id, code, status, lat, lng, created_at
       FROM incidents WHERE tracking_token = ?`,
    [trackingToken],
  );
  if (!incident) return null;

  const assignment = await q.one<AssignmentRow & Record<string, unknown>>(
    `SELECT a.id, a.status, a.offered_at, a.responded_at, a.en_route_at, a.arrived_at,
            a.transport_started_at, a.completed_at,
            v.callsign, v.capability_level,
            l.lat AS v_lat, l.lng AS v_lng, l.heading, l.recorded_at
       FROM assignments a
       JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN vehicle_current_location l ON l.vehicle_id = a.vehicle_id
      WHERE a.incident_id = ?
        AND a.status IN ('OFFERED','ACCEPTED','EN_ROUTE','ON_SCENE','TRANSPORTING','COMPLETED')
      ORDER BY a.offered_at DESC
      LIMIT 1`,
    [incident.id],
  );

  const reportCountRow = await q.one<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM incident_reports WHERE incident_id = ?',
    [incident.id],
  );

  const step = toTrackingStep(incident.status);
  const now = Date.now();

  // ETA recalculado EN VIVO desde la posicion actual del vehiculo, no el ETA
  // congelado del momento del despacho. Es lo que hace que la cuenta atras se
  // sienta real mientras la unidad se acerca.
  //
  // Por la RUTA REAL de calles, la misma que dibuja el mapa que el ciudadano
  // tiene justo encima: con la linea recta, el numero grande de la pantalla y
  // el trazo azul del mapa se contradecian cada vez que habia que rodear la
  // bahia. Si el servicio del grafo no responde, `fetchGraphRoute` degrada
  // solo a la estimacion recta.
  let etaSeconds: number | null = null;
  let distanceM: number | null = null;

  const vehicleMoving = step === 'ON_THE_WAY';
  if (vehicleMoving && assignment?.v_lat != null && assignment.v_lng != null) {
    const route = await fetchGraphRoute(
      { lat: assignment.v_lat, lng: assignment.v_lng },
      { lat: incident.lat, lng: incident.lng },
      ROUTE_TIMEOUT_MS,
    );
    etaSeconds = Math.round(route.durationSeconds);
    distanceM = Math.round(route.distanceMeters);
  }

  const timeline: TrackingResponse['timeline'] = [
    { step: 'RECEIVED', at: incident.created_at, label: STEP_LABEL.RECEIVED },
  ];
  if (assignment) {
    timeline.push({ step: 'ASSIGNING', at: assignment.offered_at, label: STEP_LABEL.ASSIGNING });
    const enRoute = assignment.en_route_at ?? assignment.responded_at;
    if (enRoute) timeline.push({ step: 'ON_THE_WAY', at: enRoute, label: STEP_LABEL.ON_THE_WAY });
    if (assignment.arrived_at) {
      timeline.push({ step: 'ARRIVED', at: assignment.arrived_at, label: STEP_LABEL.ARRIVED });
    }
    if (assignment.transport_started_at) {
      timeline.push({
        step: 'TRANSPORTING', at: assignment.transport_started_at, label: STEP_LABEL.TRANSPORTING,
      });
    }
    if (assignment.completed_at) {
      timeline.push({ step: 'COMPLETED', at: assignment.completed_at, label: STEP_LABEL.COMPLETED });
    }
  }

  // CANCELLED no tiene paso propio en TRACKING_STEP (son 6, congelados en
  // contracts): toTrackingStep() lo cae al default 'COMPLETED' para que la
  // barra de progreso no se rompa. Pero el copy de COMPLETED ("Gracias por
  // reportar, tu aviso ayudó a que llegara ayuda") es FALSO si nunca llegó
  // nadie — decirle eso al ciudadano es peor que no decir nada. Se sobrescribe
  // aquí, no en COPY, porque es el único paso donde el texto depende del
  // status crudo y no solo del TrackingStep.
  const cancelled = incident.status === 'CANCELLED';
  const copy = cancelled
    ? {
        headline: 'Este reporte se cerró',
        detail: 'El centro de despacho cerró este caso sin enviar unidad. Si la emergencia sigue activa, llama al 123.',
      }
    : COPY[step];

  return {
    incidentCode: incident.code,
    step,
    headline: copy.headline,
    // Cuando hay ETA se antepone al detalle: es lo primero que la persona
    // quiere saber.
    detail: etaSeconds !== null
      ? `Llega en aproximadamente ${Math.max(1, Math.round(etaSeconds / 60))} min. ${copy.detail}`
      : copy.detail,
    incidentLat: incident.lat,
    incidentLng: incident.lng,
    vehicle: assignment && assignment.v_lat != null && assignment.v_lng != null
      ? {
          callsign: assignment.callsign,
          capabilityLevel: assignment.capability_level,
          lat: assignment.v_lat,
          lng: assignment.v_lng,
          heading: assignment.heading,
          updatedAt: assignment.recorded_at ?? now,
        }
      : null,
    etaSeconds,
    distanceM,
    timeline,
    reportCount: reportCountRow?.n ?? 1,
    serverTime: now,
  };
}