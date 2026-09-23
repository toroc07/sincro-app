import { listVehicles } from '@/src/server/modules/vehicles';
import { getPrimaryReportSummary, listLiveIncidents } from '@/src/server/modules/incidents';
import { listFacilities } from '@/src/server/modules/facilities';
import { apiErrorResponse } from '@/src/server/infra/errors';
import { isLocalPreview, localPreviewOverview } from '@/src/server/demo/localPreview';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  if (isLocalPreview()) return Response.json(localPreviewOverview(), { headers: { 'Cache-Control': 'no-store' } });
  try {
    const [vehicles, incidents, facilities] = await Promise.all([
      listVehicles(),
      listLiveIncidents(),
      listFacilities(),
    ]);

    const availableCount = vehicles.filter((v) => v.status === 'AVAILABLE').length;
    const busyCount = vehicles.filter((v) =>
      ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING'].includes(v.status),
    ).length;

    const criticalIncidents = incidents.filter((i) => i.priority === 'P1').length;

    const hospitalsCount = facilities.filter(
      (f) => f.type === 'HOSPITAL' || f.type === 'TRAUMA_CENTER',
    ).length;
    const transcripts = Object.fromEntries(await Promise.all(incidents.map(async (incident) => [
      incident.id, (await getPrimaryReportSummary(incident.id)).description,
    ] as const)));

    return Response.json({
      metrics: {
        totalVehicles: vehicles.length,
        availableVehicles: availableCount,
        busyVehicles: busyCount,
        offlineVehicles: vehicles.length - availableCount - busyCount,
        activeIncidents: incidents.length,
        criticalIncidents,
        hospitalsCount,
        totalFacilities: facilities.length,
      },
      vehicles,
      incidents,
      transcripts,
      facilities,
      timestamp: Date.now(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
