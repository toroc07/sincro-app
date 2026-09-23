import { z } from 'zod';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { sessionCookie } from '@/src/server/infra/session';
import { loginStaff } from '@/src/server/modules/staff';
import { isLocalPreview } from '@/src/server/demo/localPreview';

export const dynamic = 'force-dynamic';

const zGovLoginRequest = z.object({
  identifier: z.string().min(1, 'Ingresa tu usuario institucional o correo'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const json = await request.json();
    const input = zGovLoginRequest.parse(json);
    if (isLocalPreview()) {
      if (input.identifier.trim().toLowerCase() !== 'admin@sincro.co' || input.password !== 'admin123') {
        throw new HttpError(401, 'UNAUTHORIZED', 'Usuario o contraseña incorrectos.');
      }
      const user = { userId: 'demo-dispatcher', role: 'ADMIN' as const, name: 'Operador de demostración', orgId: 'demo-crued', email: 'admin@sincro.co', phone: null };
      return Response.json({ user }, { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(user.role, user.userId) } });
    }
    const staff = await loginStaff(input.identifier, input.password);

    if (staff.role !== 'ADMIN' && staff.role !== 'DISPATCHER') {
      throw new HttpError(
        403,
        'FORBIDDEN',
        'Acceso restringido: Esta consola es de uso exclusivo para autoridades de salud, CRUED y DADIS.',
      );
    }

    const cookieHeader = sessionCookie(staff.role, staff.userId);
    return new Response(JSON.stringify({ user: staff }), {
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
