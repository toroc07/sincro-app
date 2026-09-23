import { zAssignment, zCompleteAssignmentRequest } from '@dispatch/contracts';
import { completeAssignment } from '@/src/server/modules/dispatch';
import { dispatchApiError, optionalJson } from '@/app/api/dispatch/_shared';
import { completeLocalPreviewAssignment, isLocalPreview } from '@/src/server/demo/localPreview';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    zCompleteAssignmentRequest.parse(await optionalJson(request));
    const { id } = await context.params;
    if (isLocalPreview()) {
      const assignment = completeLocalPreviewAssignment(id);
      if (!assignment) return Response.json({ error: { code: 'INVALID_TRANSITION', message: 'Confirma primero la llegada al lugar para cerrar la atención.' } }, { status: 409 });
      return Response.json(assignment);
    }
    return Response.json(zAssignment.parse(await completeAssignment(id)));
  } catch (error) { return dispatchApiError(error); }
}
