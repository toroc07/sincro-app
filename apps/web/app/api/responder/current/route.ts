import { apiErrorResponse } from '@/src/server/infra/errors';
import { resolveSession } from '@/src/server/infra/session';
import { getIncidentDetail, getPrimaryReportSummary, listReporterContacts, listLiveIncidents } from '@/src/server/modules/incidents';
import { getStaffProfile } from '@/src/server/modules/staff';
import { UNIVERSAL_VEHICLE_ID } from '@/src/server/modules/vehicles';
import { sweepExpiredOffers } from '@/app/api/dispatch/_shared';
import { isLocalPreview, localPreviewResponderCurrent } from '@/src/server/demo/localPreview';
import { listFacilities } from '@/src/server/modules/facilities';

export const dynamic = 'force-dynamic';

/**
 * GET /api/responder/current — panel de ambulancia.
 * Si hay sesión de staff activa con turno, vincula su unidad y asignación.
 * Si no, opera con fallback transparente a la ambulancia demo para continuidad del sistema.
 */
export async function GET(request: Request): Promise<Response> {
  if (isLocalPreview()) return Response.json(localPreviewResponderCurrent(), { headers: { 'Cache-Control': 'no-store' } });
  try {
    // El panel de ambulancia pollea cada 3 s: es uno de los latidos que hacen
    // cumplir el SLA de despacho (caducar ofertas, promover retenidos). Nunca
    // lanza; se aísla igual para no dejar al conductor sin pantalla.
    try { await sweepExpiredOffers(); } catch { /* el panel se sirve igual */ }

    const session = resolveSession(request);
    let staffProfile = null;
    if (session) {
      try {
        staffProfile = await getStaffProfile(session.userId);
      } catch {
        // Ignorar si el usuario no existe o expiró
      }
    }

    const live = await listLiveIncidents();
    // Si el staff tiene un incidente activo asignado a su ambulancia, priorizamos ese
    const activeIncidentId = staffProfile?.activeIncident?.id;
    const incident = (activeIncidentId ? live.find((i) => i.id === activeIncidentId) : null) ?? live[0] ?? null;

    const vehicleId = staffProfile?.activeShift?.vehicleId ?? UNIVERSAL_VEHICLE_ID;

    if (!incident) {
      return Response.json({
        incident: null, reportSummary: null, reporterContact: null, reporters: [],
        aiSummary: null, reporterLocation: null,
        assignment: null, assignedVehicle: null, liveEtaSeconds: null,
        universalVehicleId: vehicleId,
        staff: staffProfile?.user ?? null,
        activeShift: staffProfile?.activeShift ?? null,
      });
    }
    const [detail, summary, reporters, facilities] = await Promise.all([
      getIncidentDetail(incident.id),
      getPrimaryReportSummary(incident.id),
      listReporterContacts(incident.id),
      listFacilities(),
    ]);
    const nearestHospital = facilities.filter((facility) => facility.type !== 'BASE')
      .map((facility) => ({ ...facility, distanceM: Math.round(Math.hypot((facility.lat - incident.lat) * 111_000, (facility.lng - incident.lng) * 111_000 * Math.cos(incident.lat * Math.PI / 180))) }))
      .sort((a, b) => a.distanceM - b.distanceM)[0] ?? null;
    // La posición viva del reportante solo si es fresca (<60s); si no, el mapa
    // pintaría un punto congelado.
    const inc = detail.incident;
    const reporterLocation = inc.reporterLat != null && inc.reporterLng != null
      && inc.reporterLocationAt != null && Date.now() - inc.reporterLocationAt < 60_000
      ? { lat: inc.reporterLat, lng: inc.reporterLng, at: inc.reporterLocationAt }
      : null;
    return Response.json({
      incident: detail.incident,
      reportSummary: summary.description,
      reporterContact: summary.reporterContact,
      reporters,
      aiSummary: inc.aiSummary ?? null,
      reporterLocation,
      assignment: detail.assignment,
      assignedVehicle: detail.assignedVehicle,
      nearestHospital,
      liveEtaSeconds: detail.liveEtaSeconds,
      universalVehicleId: vehicleId,
      staff: staffProfile?.user ?? null,
      activeShift: staffProfile?.activeShift ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
