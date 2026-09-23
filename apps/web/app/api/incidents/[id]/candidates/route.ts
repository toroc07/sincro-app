import { zDispatchResponse } from '@dispatch/contracts';
import { getCandidates } from '@/src/server/modules/dispatch';
import { dispatchApiError } from '@/app/api/dispatch/_shared';
import { isLocalPreview, localPreviewCandidates } from '@/src/server/demo/localPreview';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    if (isLocalPreview()) {
      const result = localPreviewCandidates(id);
      if (!result) return Response.json({ error: { code: 'NOT_FOUND', message: 'Incidente no encontrado.' } }, { status: 404 });
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(zDispatchResponse.parse(await getCandidates(id)));
  } catch (error) {
    return dispatchApiError(error);
  }
}
