import { zCreateIncidentRequest, zCreateIncidentResponse } from '@dispatch/contracts';
import { apiErrorResponse } from '@/src/server/infra/errors';
import { createIncidentFromReport, listLiveIncidents } from '@/src/server/modules/incidents';
import { runDispatch } from '@/src/server/modules/dispatch';
import { reportRateLimitKeys } from '@/src/server/infra/report-source';
import { checkReportRateLimit } from '@/src/server/infra/rate-limit';
import { sweepExpiredOffers } from '@/app/api/dispatch/_shared';
import { readIdempotencyKey, readJson } from './_shared';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    return Response.json(await listLiveIncidents());
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const input = zCreateIncidentRequest.parse(await readJson(request));
    const idempotencyKey = readIdempotencyKey(request);

    // Rate-limit best-effort: si el origen supera el cupo, el reporte se crea
    // igual (nunca 429) pero el incidente se marca y nunca se auto-despacha.
    // El Idempotency-Key hace que un reintento del mismo POST no cobre cupo.
    const { limited } = checkReportRateLimit(
      reportRateLimitKeys(request, input.reporterContact),
      Date.now(),
      idempotencyKey ?? undefined,
    );

    const result = await createIncidentFromReport(input, {
      idempotencyKey,
      suspectedAbuse: limited,
    });
    if (!result.wasMerged) {
      try {
        // Una oferta vieja sin contestar mantiene la unidad reservada: si no se
        // caduca primero, este reporte nace directamente en NO_RESOURCE.
        await sweepExpiredOffers();
        // Compuerta de despacho: un reporte de texto sin clasificar (OTHER), o
        // uno de origen sospechoso, no compromete una unidad automáticamente.
        // Entra en RECOMMEND y espera confirmación del operador o del SLA.
        const mode = limited || input.type === 'OTHER' ? 'RECOMMEND' : 'AUTO_ASSIGN';
        await runDispatch(result.incident.id, { mode }, { triggeredBy: 'AUTO' });
      } catch (dispatchError) {
        console.error('auto-dispatch falló tras reporte', dispatchError);
      }
    }
    return Response.json(zCreateIncidentResponse.parse(result), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
