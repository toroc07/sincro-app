import { zAcceptAssignmentRequest, zAssignment } from '@dispatch/contracts';
import { acceptAssignment } from '@/src/server/modules/dispatch';
import { dispatchApiError, optionalJson } from '@/app/api/dispatch/_shared';
import { acceptLocalPreviewAssignment, isLocalPreview } from '@/src/server/demo/localPreview';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    zAcceptAssignmentRequest.parse(await optionalJson(request));
    const { id } = await context.params;
    if (isLocalPreview()) {
      const assignment = acceptLocalPreviewAssignment(id);
      if (!assignment) return Response.json({ error: { code: 'NOT_FOUND', message: 'Asignación no encontrada.' } }, { status: 404 });
      return Response.json(assignment);
    }
    return Response.json(zAssignment.parse(await acceptAssignment(id)));
  } catch (error) { return dispatchApiError(error); }
}
