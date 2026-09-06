/**
 * Módulo de Personal Operativo y Médico (Staff / Responders / Dispatchers).
 *
 * Administra la autenticación del personal en la tabla `users`, el control de guardia/turno
 * individual sobre ambulancias y el historial de emergencias asignadas a la tripulación.
 */

import type {
  StaffActiveShift,
  StaffEmergencyHistoryItem,
  StaffProfileData,
  StaffSession,
} from '@dispatch/contracts';
import { db, type Queryable } from '@/src/server/infra/db';
import { HttpError } from '@/src/server/infra/errors';
import { verifyPassword } from '@/src/server/infra/crypto';
import { endShift, startShift } from '@/src/server/modules/vehicles';

interface UserRow {
  id: string;
  org_id: string;
  role: 'DISPATCHER' | 'RESPONDER' | 'ADMIN';
  name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  created_at: number;
}

function toStaffSession(u: UserRow): StaffSession {
  return {
    userId: u.id,
    role: u.role,
    name: u.name,
    orgId: u.org_id,
    email: u.email,
    phone: u.phone,
  };
}

export async function loginStaff(identifier: string, password?: string, q: Queryable = db()): Promise<StaffSession> {
  const clean = identifier.trim().toLowerCase();
  const user = await q.one<UserRow>(
    `SELECT id, org_id, role, name, email, phone, password_hash, created_at
     FROM users
     WHERE lower(id) = ? OR lower(email) = ? OR phone = ?`,
    [clean, clean, identifier.trim()],
  );

  if (!user) {
    throw new HttpError(404, 'NOT_FOUND', 'Personal no encontrado. Verifica tu identificador o credenciales.');
  }

  if (!user.password_hash) {
    // Si la cuenta no tenía contraseña asignada, se permite en demo o se requiere
    return toStaffSession(user);
  }

  if (!password) {
    throw new HttpError(403, 'FORBIDDEN', 'Ingresa la contraseña de tu cuenta operativa.');
  }

  const matches = verifyPassword(password, user.password_hash);
  if (!matches) {
    throw new HttpError(403, 'FORBIDDEN', 'Contraseña incorrecta. Por favor verifica tus datos.');
  }

  return toStaffSession(user);
}

export async function findStaffUser(userId: string, q: Queryable = db()): Promise<StaffSession | null> {
  const user = await q.one<UserRow>(
    `SELECT id, org_id, role, name, email, phone, password_hash, created_at
     FROM users
     WHERE id = ?`,
    [userId],
  );
  return user ? toStaffSession(user) : null;
}

export async function getStaffActiveShift(userId: string, q: Queryable = db()): Promise<StaffActiveShift | null> {
  const crewPattern = `%"${userId}"%`;
  const row = await q.one<{
    shift_id: string;
    vehicle_id: string;
    callsign: string;
    plate: string | null;
    capability_level: 'BLS' | 'ALS' | 'MEDICAL_MOTO' | 'RESCUE';
    started_at: string | number;
  }>(
    `SELECT s.id as shift_id, s.vehicle_id, s.started_at,
            v.callsign, v.plate, v.capability_level
     FROM shifts s
     JOIN vehicles v ON v.id = s.vehicle_id
     WHERE s.ended_at IS NULL AND s.crew_user_ids LIKE ?
     ORDER BY s.started_at DESC
     LIMIT 1`,
    [crewPattern],
  );

  if (!row) return null;

  return {
    shiftId: row.shift_id,
    vehicleId: row.vehicle_id,
    callsign: row.callsign,
    plate: row.plate,
    capabilityLevel: row.capability_level,
    startedAt: Number(row.started_at),
  };
}

export async function getStaffProfile(userId: string, q: Queryable = db()): Promise<StaffProfileData> {
  const user = await findStaffUser(userId, q);
  if (!user) {
    throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
  }

  const activeShift = await getStaffActiveShift(userId, q);

  let activeIncident: StaffProfileData['activeIncident'] = null;
  if (activeShift) {
    const incRow = await q.one<{
      id: string;
      code: string;
      type: string;
      status: string;
      priority: string | null;
      address: string | null;
      patient_count: number;
      assignment_status: string;
    }>(
      `SELECT i.id, i.code, i.type, i.status, i.priority, i.address, i.patient_count,
              a.status as assignment_status
       FROM assignments a
       JOIN incidents i ON i.id = a.incident_id
       WHERE a.vehicle_id = ?
         AND a.status IN ('OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING')
       ORDER BY a.offered_at DESC
       LIMIT 1`,
      [activeShift.vehicleId],
    );

    if (incRow) {
      activeIncident = {
        id: incRow.id,
        code: incRow.code,
        type: incRow.type,
        status: incRow.status,
        priority: incRow.priority,
        address: incRow.address,
        patientCount: incRow.patient_count,
        assignmentStatus: incRow.assignment_status,
      };
    }
  }

  const crewPattern = `%"${userId}"%`;
  const statsRow = await q.one<{ total: string | number; completed: string | number }>(
    `SELECT count(DISTINCT a.id) as total,
            count(DISTINCT CASE WHEN a.status = 'COMPLETED' THEN a.id END) as completed
     FROM shifts s
     JOIN assignments a ON a.vehicle_id = s.vehicle_id
          AND a.offered_at >= s.started_at
          AND (s.ended_at IS NULL OR a.offered_at <= s.ended_at)
     WHERE s.crew_user_ids LIKE ?`,
    [crewPattern],
  );

  return {
    user,
    activeShift,
    activeIncident,
    stats: {
      totalMissions: Number(statsRow?.total ?? 0),
      completedMissions: Number(statsRow?.completed ?? 0),
    },
  };
}

export async function listStaffEmergencyHistory(
  userId: string,
  q: Queryable = db(),
): Promise<StaffEmergencyHistoryItem[]> {
  const crewPattern = `%"${userId}"%`;
  const rows = await q.many<{
    incident_id: string;
    code: string;
    type: string;
    status: string;
    priority: string | null;
    address: string | null;
    patient_count: number;
    assignment_status: string;
    offered_at: string | number;
    completed_at: string | number | null;
    vehicle_callsign: string | null;
  }>(
    `SELECT i.id as incident_id, i.code, i.type, i.status, i.priority, i.address, i.patient_count,
            a.status as assignment_status, a.offered_at, a.completed_at, v.callsign as vehicle_callsign
     FROM shifts s
     JOIN assignments a ON a.vehicle_id = s.vehicle_id
          AND a.offered_at >= s.started_at
          AND (s.ended_at IS NULL OR a.offered_at <= s.ended_at)
     JOIN incidents i ON i.id = a.incident_id
     JOIN vehicles v ON v.id = s.vehicle_id
     WHERE s.crew_user_ids LIKE ?
     ORDER BY a.offered_at DESC
     LIMIT 50`,
    [crewPattern],
  );

  return rows.map((r) => ({
    incidentId: r.incident_id,
    code: r.code,
    type: r.type,
    status: r.status,
    priority: r.priority,
    address: r.address,
    patientCount: r.patient_count,
    assignmentStatus: r.assignment_status,
    offeredAt: Number(r.offered_at),
    completedAt: r.completed_at ? Number(r.completed_at) : null,
    vehicleCallsign: r.vehicle_callsign,
  }));
}

export async function startStaffShift(
  userId: string,
  vehicleId: string,
  q: Queryable = db(),
): Promise<StaffActiveShift> {
  const existing = await getStaffActiveShift(userId, q);
  if (existing) {
    throw new HttpError(409, 'INVALID_TRANSITION', `Ya te encuentras en un turno activo con la unidad ${existing.callsign}`);
  }

  await startShift(vehicleId, [userId], q);
  const active = await getStaffActiveShift(userId, q);
  if (!active) {
    throw new HttpError(500, 'INTERNAL', 'No se pudo iniciar el turno en el vehículo');
  }
  return active;
}

export async function endStaffShift(
  userId: string,
  q: Queryable = db(),
): Promise<void> {
  const existing = await getStaffActiveShift(userId, q);
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'No tienes ningún turno activo para finalizar');
  }

  await endShift(existing.vehicleId, q);
}
