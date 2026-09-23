import { zAcceptAssignmentRequest, zAssignment } from '@dispatch/contracts';
import { markArrived } from '@/src/server/modules/dispatch';
import { dispatchApiError, optionalJson } from '@/app/api/dispatch/_shared';
import { arriveLocalPreviewAssignment, isLocalPreview } from '@/src/server/demo/localPreview';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    zAcceptAssignmentRequest.parse(await optionalJson(request));
    const { id } = await context.params;
    if (isLocalPreview()) {
      const assignment = arriveLocalPreviewAssignment(id);
      if (!assignment) return Response.json({ error: { code: 'INVALID_TRANSITION', message: 'La unidad debe estar en camino para confirmar llegada.' } }, { status: 409 });
      return Response.json(assignment);
    }
    return Response.json(zAssignment.parse(await markArrived(id)));
  } catch (error) { return dispatchApiError(error); }
}
