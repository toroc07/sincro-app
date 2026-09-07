import { apiErrorResponse } from '@/src/server/infra/errors';
import { resolveSession } from '@/src/server/infra/session';
import { getIncidentDetail, getPrimaryReportSummary, listReporterContacts, listLiveIncidents } from '@/src/server/modules/incidents';
import { getStaffProfile } from '@/src/server/modules/staff';
import { UNIVERSAL_VEHICLE_ID } from '@/src/server/modules/vehicles';
import { sweepExpiredOffers } from '@/app/api/dispatch/_shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/responder/current — panel de ambulancia.
 * Si hay sesión de staff activa con turno, vincula su unidad y asignación.
 * Si no, opera con fallback transparente a la ambulancia demo para continuidad del sistema.
 */
export async function GET(request: Request): Promise<Response> {
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
    const [detail, summary, reporters] = await Promise.all([
      getIncidentDetail(incident.id),
      getPrimaryReportSummary(incident.id),
      listReporterContacts(incident.id),
    ]);
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
      liveEtaSeconds: detail.liveEtaSeconds,
      universalVehicleId: vehicleId,
      staff: staffProfile?.user ?? null,
      activeShift: staffProfile?.activeShift ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
