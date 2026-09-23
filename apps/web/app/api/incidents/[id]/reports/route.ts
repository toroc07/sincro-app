import { zCreateIncidentRequest, zCreateIncidentResponse } from '@dispatch/contracts';
import { apiErrorResponse } from '@/src/server/infra/errors';
import { appendReportToIncident } from '@/src/server/modules/incidents';
import { readIdempotencyKey, readJson } from '../../_shared';
import { db } from '@/src/server/infra/db';
import { resolveSession } from '@/src/server/infra/session';
import { HttpError } from '@/src/server/infra/errors';
import { isLocalPreview, localPreviewReportMedia } from '@/src/server/demo/localPreview';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const session = resolveSession(request);
    if (!session || !['ADMIN', 'DISPATCHER'].includes(session.role)) {
      throw new HttpError(401, 'FORBIDDEN', 'Se requiere una sesión del centro de mando');
    }
    const { id } = await context.params;
    if (isLocalPreview()) {
      const media = localPreviewReportMedia(id);
      if (!media) throw new HttpError(404, 'NOT_FOUND', 'No se encontró el audio del reporte');
      return Response.json(media, { headers: { 'Cache-Control': 'no-store' } });
    }
    const media = await db().one<{ transcript: string | null; audio_base64: string | null; audio_mime_type: string | null }>(
      `SELECT r.transcript, r.audio_base64, r.audio_mime_type
         FROM incident_reports r JOIN incidents i ON i.primary_report_id = r.id
        WHERE i.id = ? LIMIT 1`, [id],
    );
    if (!media) throw new HttpError(404, 'NOT_FOUND', 'No se encontró el reporte');
    return Response.json({ transcript: media.transcript, audioBase64: media.audio_base64, mimeType: media.audio_mime_type }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const input = zCreateIncidentRequest.parse(await readJson(request));
    const { id } = await context.params;
    const result = await appendReportToIncident(id, input, {
      idempotencyKey: readIdempotencyKey(request),
      actorType: 'DISPATCHER',
    });
    return Response.json(zCreateIncidentResponse.parse(result), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
