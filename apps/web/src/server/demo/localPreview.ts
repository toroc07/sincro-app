import type {
  Assignment, DispatchCandidate, DispatchResponse, Facility, Incident, IncidentType,
  TrackingResponse, VehicleWithLocation,
} from '@dispatch/contracts';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Local preview used only by `next dev` when PostgreSQL has not been configured. */
export const isLocalPreview = () => process.env.NODE_ENV !== 'production'
  && (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('usuario:password@host:5432'));

interface DemoState {
  incidents: Incident[];
  vehicles: VehicleWithLocation[];
  facilities: Facility[];
  assignments: Assignment[];
  reports: Map<string, { incidentId: string; description: string | null; contact: string | null; audioBase64?: string | null; mimeType?: string | null }>;
  tokens: Map<string, string>;
  citizens: Map<string, { id: string; name: string; phone: string }>;
  serial: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __sincroLocalPreview: DemoState | undefined;
}

const now = Date.now();
function state(): DemoState {
  const file = resolve(process.cwd(), '.next', 'sincro-local-preview.json');
  if (existsSync(file)) {
    try {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as Omit<DemoState, 'reports' | 'tokens' | 'citizens'> & {
        reports: Array<[string, { incidentId: string; description: string | null; contact: string | null; audioBase64?: string | null; mimeType?: string | null }]>;
        tokens: Array<[string, string]>;
        citizens: Array<[string, { id: string; name: string; phone: string }]>;
      };
      globalThis.__sincroLocalPreview = { ...stored, reports: new Map(stored.reports), tokens: new Map(stored.tokens), citizens: new Map(stored.citizens) };
      // Migra solo las tres coordenadas ficticias antiguas si siguen intactas;
      // cualquier GPS real recibido después se conserva sin alteraciones.
      const oldDemoPoints: Record<string, { lat: number; lng: number; next: { lat: number; lng: number } }> = {
        'demo-ambulance-123': { lat: 10.4148, lng: -75.5292, next: { lat: 10.4180, lng: -75.5490 } },
        'demo-ambulance-456': { lat: 10.4321, lng: -75.5008, next: { lat: 10.4115, lng: -75.5325 } },
        'demo-ambulance-789': { lat: 10.3928, lng: -75.5484, next: { lat: 10.4020, lng: -75.5570 } },
      };
      let migrated = false;
      for (const item of globalThis.__sincroLocalPreview.vehicles) {
        const old = oldDemoPoints[item.id];
        if (old && item.location?.lat === old.lat && item.location.lng === old.lng) {
          item.location.lat = old.next.lat;
          item.location.lng = old.next.lng;
          migrated = true;
        }
      }
      if (migrated) persist(globalThis.__sincroLocalPreview);
      return globalThis.__sincroLocalPreview;
    } catch {
      // Si el archivo se interrumpió durante una escritura, se vuelve a la demo vacía.
    }
  }
  if (!globalThis.__sincroLocalPreview) {
    globalThis.__sincroLocalPreview = {
      incidents: [],
      vehicles: [
        // Puntos de demostración sobre zonas urbanas/calles, no coordenadas
        // de costa o bahía que hagan parecer que una unidad está en el agua.
        vehicle('demo-ambulance-123', 'A-123', 10.4180, -75.5490, 'AVAILABLE'),
        vehicle('demo-ambulance-456', 'A-456', 10.4115, -75.5325, 'AVAILABLE'),
        vehicle('demo-ambulance-789', 'A-789', 10.4020, -75.5570, 'AVAILABLE'),
      ],
      facilities: [
        { id: 'demo-hospital-1', name: 'Hospital Universitario del Caribe', type: 'HOSPITAL', lat: 10.4022, lng: -75.5071, capabilities: ['URGENCIAS', 'TRAUMA'] },
        { id: 'demo-hospital-2', name: 'Clínica Cartagena del Mar', type: 'TRAUMA_CENTER', lat: 10.4256, lng: -75.5452, capabilities: ['URGENCIAS', 'TRAUMA', 'UCI'] },
        { id: 'demo-base-1', name: 'Base Centro', type: 'BASE', lat: 10.411, lng: -75.535, capabilities: ['BLS', 'ALS'] },
      ],
      assignments: [], reports: new Map(), tokens: new Map(), citizens: new Map(), serial: 0,
    };
  }
  persist(globalThis.__sincroLocalPreview);
  return globalThis.__sincroLocalPreview;
}

function persist(data: DemoState): void {
  globalThis.__sincroLocalPreview = data;
  const file = resolve(process.cwd(), '.next', 'sincro-local-preview.json');
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({
    ...data,
    reports: [...data.reports], tokens: [...data.tokens], citizens: [...data.citizens],
  }), 'utf8');
  renameSync(temp, file);
}

function vehicle(id: string, callsign: string, lat: number, lng: number, status: VehicleWithLocation['status']): VehicleWithLocation {
  return {
    id, orgId: 'demo-crued', callsign, plate: `AMB-${callsign.slice(-3)}`, status, capabilityLevel: 'ALS', capabilities: ['BLS', 'ALS', 'TRAUMA'],
    homeBaseId: 'demo-base-1', operatingZoneId: 'cartagena', currentAssignmentId: null, activeShiftId: 'demo-shift',
    isSimulated: true, updatedAt: Date.now(), isStale: false,
    location: { vehicleId: id, lat, lng, heading: 0, speedKmh: 0, recordedAt: Date.now() },
  };
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function realTranscript(value: string | null | undefined): string | null {
  if (!value || /^Reporte de [A-Z_]+\.$/.test(value)) return null;
  return value;
}

export function createLocalPreviewReport(input: {
  type: IncidentType; lat: number; lng: number; description?: string | null; contact?: string | null; audioBase64?: string | null; mimeType?: string | null;
}) {
  const data = state();
  data.serial += 1;
  const id = `demo-incident-${data.serial}`;
  const reportId = `demo-report-${data.serial}`;
  const token = `local-${data.serial}-${Math.random().toString(36).slice(2, 14)}`;
  const code = `INC-${String(900 + data.serial).padStart(3, '0')}`;
  const at = Date.now();
  const incident: Incident = {
    id, code, status: 'OPEN', priority: input.type === 'CARDIAC' || input.type === 'UNCONSCIOUS' ? 'P1' : 'P2',
    type: input.type, lat: input.lat, lng: input.lng, address: 'Ubicación indicada en el mapa · Cartagena',
    patientCount: 1, requiredCapability: 'ALS', zoneId: 'cartagena', primaryReportId: reportId,
    mergedIntoIncidentId: null, createdAt: at, closedAt: null,
    aiSummary: input.description ?? null, aiSummaryUpdatedAt: at, reporterLat: input.lat, reporterLng: input.lng,
    reporterLocationAt: at, suspectedAbuse: false,
  };
  data.incidents.unshift(incident);
  data.reports.set(reportId, { incidentId: id, description: input.description ?? null, contact: input.contact ?? null, audioBase64: input.audioBase64 ?? null, mimeType: input.mimeType ?? null });
  data.tokens.set(token, id);
  persist(data);
  return { incident, reportId, token };
}

export function localPreviewOverview() {
  const d = state();
  const incidents = d.incidents.filter((incident) => !['COMPLETED', 'CANCELLED', 'DUPLICATE'].includes(incident.status));
  const busy = d.vehicles.filter((v) => v.status === 'ASSIGNED' || v.status === 'EN_ROUTE' || v.status === 'ON_SCENE' || v.status === 'TRANSPORTING').length;
  const available = d.vehicles.filter((v) => v.status === 'AVAILABLE').length;
  return {
    metrics: { totalVehicles: d.vehicles.length, availableVehicles: available, busyVehicles: busy,
      offlineVehicles: d.vehicles.length - available - busy, activeIncidents: incidents.length,
      criticalIncidents: incidents.filter((i) => i.priority === 'P1').length,
      hospitalsCount: d.facilities.filter((f) => f.type !== 'BASE').length, totalFacilities: d.facilities.length },
    vehicles: d.vehicles, incidents,
    transcripts: Object.fromEntries(incidents.map((incident) => [incident.id, realTranscript(d.reports.get(incident.primaryReportId ?? '')?.description)])),
    facilities: d.facilities, timestamp: Date.now(), preview: true,
  };
}

function candidatesFor(incident: Incident): DispatchCandidate[] {
  return state().vehicles.map((v) => {
    const meters = v.location ? distanceM(incident, v.location) : 0;
    const excludedReason = v.status === 'AVAILABLE' ? null : 'NOT_AVAILABLE';
    const etaSeconds = Math.max(60, Math.round(meters / 6.5));
    return {
      vehicleId: v.id, callsign: v.callsign, rank: excludedReason ? null : 1, etaSeconds, distanceM: Math.round(meters * 1.25),
      straightLineM: meters, etaSource: 'HAVERSINE_URBAN' as const, capabilityPenalty: 0, coveragePenalty: 0,
      workloadPenalty: 0, staleLocationPenalty: 0, operationalPenalty: 0, totalScore: etaSeconds,
      excludedReason, explanation: excludedReason ? 'La unidad ya está atendiendo otro servicio.' : `Disponible · a ${(meters / 1000).toFixed(1)} km · ETA aproximado ${Math.max(1, Math.round(etaSeconds / 60))} min.`,
    };
  }).sort((a, b) => a.totalScore - b.totalScore);
}

export function localPreviewCandidates(incidentId: string): DispatchResponse | null {
  const d = state();
  const incident = d.incidents.find((item) => item.id === incidentId);
  if (!incident) return null;
  const candidates = candidatesFor(incident);
  const available = candidates.filter((item) => !item.excludedReason);
  return {
    dispatchRunId: `demo-run-${incidentId}`, incidentId, strategyVersion: 'local-preview',
    candidates: available, excluded: candidates.filter((item) => item.excludedReason),
    recommendedVehicleId: available[0]?.vehicleId ?? null,
    recommendationRationale: available[0] ? `${available[0].callsign} es la unidad disponible más cercana.` : 'No hay unidades disponibles.',
    assignment: d.assignments.find((item) => item.incidentId === incidentId) ?? null, durationMs: 1, computedAt: Date.now(),
  };
}

export function dispatchLocalPreview(incidentId: string, preferredVehicleId?: string): DispatchResponse | null {
  const d = state();
  const incident = d.incidents.find((item) => item.id === incidentId);
  if (!incident) return null;
  const existing = d.assignments.find((item) => item.incidentId === incidentId && item.status !== 'COMPLETED');
  const candidates = candidatesFor(incident);
  const available = candidates.filter((item) => !item.excludedReason);
  if (existing) {
    const assigned = d.vehicles.find((item) => item.id === existing.vehicleId);
    return {
      dispatchRunId: existing.dispatchRunId ?? `demo-run-${incidentId}`, incidentId, strategyVersion: 'local-preview',
      candidates: available, excluded: candidates.filter((item) => item.excludedReason),
      recommendedVehicleId: existing.vehicleId, recommendationRationale: `${assigned?.callsign ?? 'La unidad'} ya está asignada a este reporte.`,
      assignment: existing, durationMs: 1, computedAt: Date.now(),
    };
  }
  const chosen = available.find((item) => item.vehicleId === preferredVehicleId) ?? available[0];
  if (!chosen) return null;
  const assignment: Assignment = {
    id: `demo-assignment-${incidentId}`, incidentId, vehicleId: chosen.vehicleId,
    dispatchRunId: `demo-run-${incidentId}`, status: 'OFFERED', offeredAt: Date.now(), expiresAt: Date.now() + 300_000,
    respondedAt: null, rejectReason: null, enRouteAt: null, arrivedAt: null, transportStartedAt: null,
    destinationFacilityId: null, completedAt: null, isManualOverride: Boolean(preferredVehicleId), assignedByUserId: 'demo-dispatcher',
  };
  d.assignments.push(assignment);
  incident.status = 'ASSIGNED';
  const assignedVehicle = d.vehicles.find((item) => item.id === chosen.vehicleId)!;
  assignedVehicle.status = 'ASSIGNED';
  assignedVehicle.currentAssignmentId = assignment.id;
  assignedVehicle.updatedAt = Date.now();
  persist(d);
  return {
    dispatchRunId: assignment.dispatchRunId ?? `demo-run-${incidentId}`, incidentId, strategyVersion: 'local-preview',
    candidates: available, excluded: candidates.filter((item) => item.excludedReason),
    recommendedVehicleId: chosen.vehicleId, recommendationRationale: `${chosen.callsign} enviada desde el centro de mando.`,
    assignment, durationMs: 1, computedAt: Date.now(),
  };
}

export function localPreviewReportMedia(incidentId: string) {
  const d = state();
  const incident = d.incidents.find((item) => item.id === incidentId);
  const report = incident?.primaryReportId ? d.reports.get(incident.primaryReportId) : null;
  return report ? { transcript: realTranscript(report.description), audioBase64: report.audioBase64 ?? null, mimeType: report.mimeType ?? null } : null;
}

export function acceptLocalPreviewAssignment(assignmentId: string): Assignment | null {
  const d = state();
  const assignment = d.assignments.find((item) => item.id === assignmentId);
  if (!assignment) return null;
  assignment.status = 'ACCEPTED'; assignment.respondedAt = Date.now();
  persist(d);
  return assignment;
}

export function setLocalPreviewEnRoute(vehicleId: string): VehicleWithLocation | null {
  const d = state();
  const vehicle = d.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return null;
  vehicle.status = 'EN_ROUTE'; vehicle.updatedAt = Date.now();
  const assignment = d.assignments.find((item) => item.vehicleId === vehicleId && item.status !== 'COMPLETED');
  if (assignment) {
    assignment.status = 'EN_ROUTE'; assignment.enRouteAt = Date.now();
    const incident = d.incidents.find((item) => item.id === assignment.incidentId);
    if (incident) incident.status = 'EN_ROUTE';
  }
  persist(d);
  return vehicle;
}

export function arriveLocalPreviewAssignment(assignmentId: string): Assignment | null {
  const d = state();
  const assignment = d.assignments.find((item) => item.id === assignmentId && item.status === 'EN_ROUTE');
  if (!assignment) return null;
  assignment.status = 'ON_SCENE'; assignment.arrivedAt = Date.now();
  const incident = d.incidents.find((item) => item.id === assignment.incidentId);
  const vehicle = d.vehicles.find((item) => item.id === assignment.vehicleId);
  if (incident) incident.status = 'ON_SCENE';
  if (vehicle) { vehicle.status = 'ON_SCENE'; vehicle.updatedAt = Date.now(); }
  persist(d);
  return assignment;
}

export function completeLocalPreviewAssignment(assignmentId: string): Assignment | null {
  const d = state();
  const assignment = d.assignments.find((item) => item.id === assignmentId && item.status === 'ON_SCENE');
  if (!assignment) return null;
  assignment.status = 'COMPLETED'; assignment.completedAt = Date.now();
  const incident = d.incidents.find((item) => item.id === assignment.incidentId);
  const vehicle = d.vehicles.find((item) => item.id === assignment.vehicleId);
  if (incident) { incident.status = 'COMPLETED'; incident.closedAt = Date.now(); }
  if (vehicle) { vehicle.status = 'AVAILABLE'; vehicle.currentAssignmentId = null; vehicle.updatedAt = Date.now(); }
  persist(d);
  return assignment;
}

export function localPreviewTracking(token: string): TrackingResponse | null {
  const d = state();
  const incidentId = d.tokens.get(token);
  const incident = d.incidents.find((item) => item.id === incidentId);
  if (!incident) return null;
  const assignment = d.assignments.find((item) => item.incidentId === incident.id);
  const vehicle = assignment ? d.vehicles.find((item) => item.id === assignment.vehicleId) : null;
  const enRoute = assignment?.status === 'EN_ROUTE' || assignment?.status === 'ON_SCENE' || assignment?.status === 'TRANSPORTING';
  const step = assignment?.status === 'COMPLETED' ? 'COMPLETED'
    : assignment?.status === 'ON_SCENE' ? 'ARRIVED'
      : assignment?.status === 'TRANSPORTING' ? 'TRANSPORTING'
        : enRoute ? 'ON_THE_WAY' : 'ASSIGNING';
  const timeline: TrackingResponse['timeline'] = [
    { step: 'RECEIVED', at: incident.createdAt, label: 'Reporte recibido' },
    { step: 'ASSIGNING', at: incident.createdAt, label: 'Centro de mando coordinando una unidad' },
  ];
  if (enRoute && assignment?.enRouteAt) timeline.push({ step: 'ON_THE_WAY', at: assignment.enRouteAt, label: 'Ambulancia en camino' });
  if (assignment?.arrivedAt) timeline.push({ step: 'ARRIVED', at: assignment.arrivedAt, label: 'Unidad en el lugar' });
  if (assignment?.completedAt) timeline.push({ step: 'COMPLETED', at: assignment.completedAt, label: 'Atención completada' });
  const etaSeconds = vehicle?.location ? Math.max(60, Math.round(distanceM(incident, vehicle.location) / 6.5)) : null;
  return {
      incidentCode: incident.code, transcript: realTranscript(d.reports.get(incident.primaryReportId ?? '')?.description), step,
    headline: step === 'COMPLETED' ? 'Atención completada'
      : step === 'ARRIVED' ? `La ambulancia ${vehicle?.callsign ?? ''} llegó al lugar`
          : enRoute ? `La ambulancia ${vehicle?.callsign ?? ''} va en camino`
          : assignment ? `La ambulancia ${vehicle?.callsign ?? ''} aceptó tu solicitud` : 'Estamos coordinando una ambulancia',
    detail: step === 'COMPLETED' ? 'El servicio fue cerrado y la ambulancia quedó disponible.'
      : step === 'ARRIVED' ? 'La unidad confirmó su llegada al lugar del reporte.'
        : enRoute ? 'Sigue su recorrido en el mapa. La ubicación proviene del dispositivo de la unidad.'
          : assignment ? `Unidad ${vehicle?.callsign ?? ''}${vehicle?.plate ? ` · placa ${vehicle.plate}` : ''}. El equipo está preparando la salida.` : 'El centro de mando está buscando y asignando la unidad más cercana.',
    incidentLat: incident.lat, incidentLng: incident.lng,
      vehicle: vehicle?.location ? { callsign: vehicle.callsign, plate: vehicle.plate ?? null, capabilityLevel: vehicle.capabilityLevel, lat: vehicle.location.lat,
      lng: vehicle.location.lng, heading: vehicle.location.heading, updatedAt: vehicle.location.recordedAt } : null,
    etaSeconds, distanceM: etaSeconds === null ? null : Math.round(etaSeconds * 6.5), timeline, reportCount: 1,
    reporterContactOnFile: Boolean(d.reports.get(incident.primaryReportId ?? '')?.contact),
    reporterLocation: { lat: incident.reporterLat ?? incident.lat, lng: incident.reporterLng ?? incident.lng, at: incident.reporterLocationAt ?? incident.createdAt },
    serverTime: Date.now(),
  };
}

export function confirmLocalPreviewType(token: string, type: IncidentType) {
  const d = state(); const id = d.tokens.get(token); const incident = d.incidents.find((item) => item.id === id);
  if (!incident) return false;
  incident.type = type; incident.priority = type === 'CARDIAC' || type === 'UNCONSCIOUS' ? 'P1' : 'P2';
  incident.aiSummary = `Tipo confirmado por quien reporta: ${typeLabel(type)}.`;
  incident.aiSummaryUpdatedAt = Date.now();
  return true;
}

export function localPreviewResponderCurrent() {
  const d = state();
  const assignment = [...d.assignments].reverse().find((item) => item.status !== 'COMPLETED') ?? null;
  const incident = assignment ? d.incidents.find((item) => item.id === assignment.incidentId) ?? null : null;
  const vehicle = assignment ? d.vehicles.find((item) => item.id === assignment.vehicleId) ?? null : null;
  const report = incident ? d.reports.get(incident.primaryReportId ?? '') : null;
  return {
    incident, reportSummary: realTranscript(report?.description), reporterContact: report?.contact ?? null,
    nearestHospital: incident ? state().facilities.filter((facility) => facility.type !== 'BASE').map((facility) => ({
      ...facility, distanceM: distanceM(incident, facility),
    })).sort((a, b) => a.distanceM - b.distanceM)[0] ?? null : null,
    reporters: report?.contact ? [{ contact: report.contact, name: null, snippet: null, at: incident?.createdAt ?? Date.now(), isPrimary: true }] : [],
    aiSummary: incident?.aiSummary ?? null,
    reporterLocation: incident?.reporterLat != null && incident.reporterLng != null ? { lat: incident.reporterLat, lng: incident.reporterLng, at: incident.reporterLocationAt ?? Date.now() } : null,
    assignment, assignedVehicle: vehicle, liveEtaSeconds: incident && vehicle?.location ? Math.round(distanceM(incident, vehicle.location) / 6.5) : null,
    universalVehicleId: vehicle?.id ?? d.vehicles[0]?.id,
    staff: null, activeShift: vehicle ? { callsign: vehicle.callsign, shiftId: 'demo-shift' } : null,
  };
}

export function demoIncident(id: string) { return state().incidents.find((item) => item.id === id) ?? null; }
export function demoVehicle(id: string) { return state().vehicles.find((item) => item.id === id) ?? null; }
export function demoAssignment(id: string) { return state().assignments.find((item) => item.id === id) ?? null; }
export function updateLocalPreviewReporterLocation(token: string, lat: number, lng: number) {
  const d = state(); const id = d.tokens.get(token); const incident = d.incidents.find((item) => item.id === id);
  if (!incident) return false;
  incident.reporterLat = lat; incident.reporterLng = lng; incident.reporterLocationAt = Date.now(); persist(d); return true;
}
export function updateLocalPreviewVehicleLocation(id: string, lat: number, lng: number, recordedAt = Date.now()) {
  const d = state();
  const vehicle = d.vehicles.find((item) => item.id === id);
  if (!vehicle?.location) return false;
  vehicle.location.lat = lat; vehicle.location.lng = lng; vehicle.location.recordedAt = recordedAt; vehicle.updatedAt = recordedAt; persist(d); return true;
}
export function registerLocalPreviewCitizen(name: string, phone: string) {
  const d = state(); const cleanPhone = phone.replace(/\D/g, '');
  const citizen = { id: d.citizens.get(cleanPhone)?.id ?? `demo-citizen-${cleanPhone}`, name: name.trim(), phone: cleanPhone };
  d.citizens.set(cleanPhone, citizen); persist(d); return citizen;
}
export function loginLocalPreviewCitizen(phone: string) { return state().citizens.get(phone.replace(/\D/g, '')) ?? null; }
export function localPreviewCitizenReports() { return []; }
export function typeLabel(type: IncidentType): string {
  const labels: Record<IncidentType, string> = { TRAFFIC_ACCIDENT: 'Accidente de tránsito', CARDIAC: 'Emergencia cardíaca', UNCONSCIOUS: 'Persona inconsciente', FALL: 'Caída o lesión', RESPIRATORY: 'Dificultad para respirar', OBSTETRIC: 'Emergencia obstétrica', OTHER: 'Otra emergencia', TRAUMA: 'Trauma' };
  return labels[type];
}
