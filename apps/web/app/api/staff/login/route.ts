import { zStaffLoginRequest } from '@dispatch/contracts';
import { apiErrorResponse } from '@/src/server/infra/errors';
import { sessionCookie } from '@/src/server/infra/session';
import { loginStaff } from '@/src/server/modules/staff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const json = await request.json();
    const input = zStaffLoginRequest.parse(json);
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
