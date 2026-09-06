import { listVehicles } from '@/src/server/modules/vehicles';
import { listLiveIncidents } from '@/src/server/modules/incidents';
import { listFacilities } from '@/src/server/modules/facilities';
import { apiErrorResponse } from '@/src/server/infra/errors';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
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
      facilities,
      timestamp: Date.now(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
