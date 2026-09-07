/**
 * Registro/restauración de sesión de ciudadano y consulta de sus reportes.
 *
 * Passwordless (§ rediseño de flujo): la identidad es el teléfono normalizado.
 * Registrar es un upsert por teléfono; "login" es restaurar la sesión de ese
 * número. Las cuentas VIEJAS que ya tenían contraseña (migración 023) la siguen
 * exigiendo — no se degradan. La verificación real del número (OTP) es Fase H.
 */

import type { CitizenRegisterRequest, CitizenSession } from '@dispatch/contracts';
import { db, newId, tx, type Queryable } from '@/src/server/infra/db';
import { verifyPassword } from '@/src/server/infra/crypto';
import { HttpError } from '@/src/server/infra/errors';
import { normalizePhone } from './internal/phone';

interface CitizenRow {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  password_hash?: string | null;
}

export interface CitizenReportHistoryItem {
  id: string;
  code: string;
  type: string;
  status: string;
  address: string | null;
  createdAt: number;
}

function toSession(row: CitizenRow): CitizenSession {
  return { id: row.id, name: row.name, email: row.email ?? null, phone: row.phone };
}

export async function registerCitizen(input: CitizenRegisterRequest): Promise<CitizenSession> {
  const now = Date.now();
  const phone = normalizePhone(input.phone);
  const name = input.name.trim();
  return tx(async (t: Queryable) => {
    // Upsert por teléfono normalizado: el mismo número (con o sin prefijo país,
    // con o sin espacios) reingresa a la misma cuenta y actualiza el nombre.
    const existing = await t.one<CitizenRow>(
      'SELECT id, name, email, phone FROM citizens WHERE phone = ?',
      [phone],
    );
    if (existing) {
      await t.run('UPDATE citizens SET name = ? WHERE id = ?', [name, existing.id]);
      return toSession({ ...existing, name });
    }
    const id = newId(now);
    await t.run(
      'INSERT INTO citizens (id, name, phone, created_at) VALUES (?, ?, ?, ?)',
      [id, name, phone, now],
    );
    return { id, name, email: null, phone };
  });
}

export async function loginCitizen(identifier: string, password?: string): Promise<CitizenSession> {
  const q = db();
  const phone = normalizePhone(identifier);
  const raw = identifier.trim();
  // Por teléfono normalizado; se acepta también el correo tal cual por si es
  // una cuenta vieja registrada con email.
  const citizen = await q.one<CitizenRow>(
    `SELECT id, name, email, phone, password_hash FROM citizens
      WHERE phone = ? OR (email IS NOT NULL AND lower(email) = lower(?))`,
    [phone, raw],
  );
  if (!citizen) {
    throw new HttpError(404, 'NOT_FOUND', 'No encontramos ese número. Regístrate para continuar.');
  }
  // Una cuenta que YA tenía contraseña no se degrada a passwordless.
  if (citizen.password_hash) {
    if (!password) {
      throw new HttpError(403, 'FORBIDDEN', 'Esta cuenta tiene contraseña. Ingrésala para continuar.');
    }
    if (!verifyPassword(password, citizen.password_hash)) {
      throw new HttpError(403, 'FORBIDDEN', 'Contraseña incorrecta.');
    }
  }
  return toSession(citizen);
}

export async function findCitizen(id: string, q: Queryable = db()): Promise<CitizenSession | null> {
  const row = await q.one<CitizenRow>('SELECT id, name, email, phone FROM citizens WHERE id = ?', [id]);
  return row ? toSession(row) : null;
}

export async function listCitizenReports(citizen: CitizenSession, q: Queryable = db()): Promise<CitizenReportHistoryItem[]> {
  // Match por teléfono (dígitos, sin verificar): intencional para la demo — la
  // verificación real del número es Fase H (OTP). NO se devuelve el
  // tracking_token: es una credencial viva (permite falsear ubicación y tipo
  // vía /api/track/<token>), y el teléfono es un secreto demasiado débil para
  // custodiarla. El historial es informativo: código, tipo, estado, fecha.
  const phone = normalizePhone(citizen.phone);
  const rows = await q.many<{
    id: string;
    code: string;
    type: string;
    status: string;
    address: string | null;
    created_at: string | number;
  }>(`
    SELECT DISTINCT i.id, i.code, i.type, i.status, i.address, i.created_at
    FROM incidents i
    JOIN incident_reports r ON r.incident_id = i.id
    WHERE regexp_replace(r.reporter_contact, '\\D', '', 'g') = ?
       OR regexp_replace(r.reporter_contact, '\\D', '', 'g') = ?
       OR (? <> '' AND lower(r.reporter_contact) = lower(?))
    ORDER BY i.created_at DESC
    LIMIT 20
  `, [phone, `57${phone}`, citizen.email ?? '', citizen.email ?? '']);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    type: r.type,
    status: r.status,
    address: r.address,
    createdAt: Number(r.created_at),
  }));
}
