import { apiErrorResponse } from '@/src/server/infra/errors';
import { resolveSession } from '@/src/server/infra/session';
import { getIncidentDetail, getPrimaryReportSummary, listLiveIncidents } from '@/src/server/modules/incidents';
import { getStaffProfile } from '@/src/server/modules/staff';
import { UNIVERSAL_VEHICLE_ID } from '@/src/server/modules/vehicles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/responder/current — panel de ambulancia.
 * Si hay sesión de staff activa con turno, vincula su unidad y asignación.
 * Si no, opera con fallback transparente a la ambulancia demo para continuidad del sistema.
 */
export async function GET(request: Request): Promise<Response> {
  try {
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
        incident: null, reportSummary: null, reporterContact: null,
        assignment: null, assignedVehicle: null, liveEtaSeconds: null,
        universalVehicleId: vehicleId,
        staff: staffProfile?.user ?? null,
        activeShift: staffProfile?.activeShift ?? null,
      });
    }
    const [detail, summary] = await Promise.all([
      getIncidentDetail(incident.id),
      getPrimaryReportSummary(incident.id),
    ]);
    return Response.json({
      incident: detail.incident,
      reportSummary: summary.description,
      reporterContact: summary.reporterContact,
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
