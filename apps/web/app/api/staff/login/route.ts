import { zStaffLoginRequest } from '@dispatch/contracts';
import { apiErrorResponse } from '@/src/server/infra/errors';
import { sessionCookie } from '@/src/server/infra/session';
import { loginStaff } from '@/src/server/modules/staff';
import { isLocalPreview } from '@/src/server/demo/localPreview';
import { HttpError } from '@/src/server/infra/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const json = await request.json();
    const input = zStaffLoginRequest.parse(json);
    if (isLocalPreview()) {
      const identifier = input.identifier.trim().toLowerCase();
      const demo = identifier === 'user-responder' && input.password === 'responder123'
        ? { userId: 'demo-ambulance-crew', role: 'RESPONDER' as const, name: 'Tripulación de demostración', orgId: 'demo-crued', email: null, phone: null }
        : identifier === 'user-dispatcher' && input.password === 'dispatcher123'
          ? { userId: 'demo-dispatcher', role: 'DISPATCHER' as const, name: 'Operador de demostración', orgId: 'demo-crued', email: 'admin@sincro.co', phone: null }
          : null;
      if (!demo) throw new HttpError(401, 'UNAUTHORIZED', 'Usuario o contraseña incorrectos.');
      return Response.json({ staff: demo }, { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(demo.role, demo.userId) } });
    }
    const staff = await loginStaff(input.identifier, input.password);

    const cookieHeader = sessionCookie(staff.role, staff.userId);
    return new Response(JSON.stringify({ staff }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
