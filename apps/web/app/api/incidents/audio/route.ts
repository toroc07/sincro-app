import { MAX_AUDIO_BYTES, zAudioReportRequest } from '@dispatch/contracts';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { createIncidentFromAudio } from '@/src/server/modules/incidents';
import { runDispatch } from '@/src/server/modules/dispatch';
import { reportRateLimitKeys } from '@/src/server/infra/report-source';
import { checkReportRateLimit } from '@/src/server/infra/rate-limit';
import { sweepExpiredOffers } from '@/app/api/dispatch/_shared';
import { readIdempotencyKey, readJson } from '../_shared';

export const dynamic = 'force-dynamic';
// `pg` y la transcripcion necesitan APIs de Node; el edge runtime no sirve.
export const runtime = 'nodejs';
// Presupuestos en serie en el camino critico: transcripcion 12s + clasificador
// LLM 3,5s + despacho. 30s deja margen.
export const maxDuration = 30;

/**
 * POST /api/incidents/audio — entrada por voz del ciudadano.
 *
 * Sin login (§2A del brief): quien presencia un accidente no se registra
 * primero. Devuelve un token de seguimiento para que pueda ver la ambulancia
 * en camino sin cuenta.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const input = zAudioReportRequest.parse(await readJson(request));

    // El tope tambien se valida aqui, no solo en el cliente: un cliente puede
    // mentir, y decodificar 50 MB de base64 tumbaria la funcion.
    const approximateBytes = Math.floor((input.audioBase64.length * 3) / 4);
    if (approximateBytes > MAX_AUDIO_BYTES) {
      throw new HttpError(
        400,
        'VALIDATION_FAILED',
        `El audio supera el máximo de ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB`,
      );
    }

    const idempotencyKey = readIdempotencyKey(request);

    // Rate-limit best-effort: nunca 429; si el origen abusa, el incidente se
    // marca y entra en RECOMMEND aunque el audio venga bien clasificado. El
    // Idempotency-Key evita cobrar cupo por un reintento del mismo POST.
    const { limited } = checkReportRateLimit(
      reportRateLimitKeys(request, input.reporterContact),
      Date.now(),
      idempotencyKey ?? undefined,
    );

    const result = await createIncidentFromAudio(input, {
      idempotencyKey,
      actorType: 'REPORTER',
      suspectedAbuse: limited,
    });

    // No hay Command Center: el único panel de ambulancia (universal, es
    // demo) depende de que la asignación exista apenas llega el reporte. Si
    // el despacho falla (p. ej. ninguna unidad con ubicación fresca) el
    // ciudadano igual recibe su código de seguimiento — el panel simplemente
    // no verá asignación todavía.
    if (!result.wasMerged) {
      try {
        // Una oferta vieja sin contestar mantiene la unidad reservada: si no se
        // caduca primero, este reporte nace directamente en NO_RESOURCE.
        await sweepExpiredOffers();
        // Compuerta de despacho: un reporte de baja confianza (sin transcripción
        // o tipo sin clasificar) no compromete una unidad de forma automática.
        // Entra en RECOMMEND —candidatos persistidos, ninguna unidad reservada—
        // y espera a que un operador lo confirme o a que el SLA lo promueva.
        const mode = limited || result.needsConfirmation ? 'RECOMMEND' : 'AUTO_ASSIGN';
        await runDispatch(result.incidentId, { mode }, { triggeredBy: 'AUTO' });
      } catch (dispatchError) {
        console.error('auto-dispatch falló tras reporte de audio', dispatchError);
      }
    }

    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
