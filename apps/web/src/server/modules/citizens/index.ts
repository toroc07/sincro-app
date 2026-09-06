/**
 * Registro/login de ciudadano y consulta de sus reportes previos.
 *
 * Admite autenticación con contraseña y también inicio ágil con identificador
 * para facilitar el acceso rápido a reportes previos y al perfil.
 */

import type { CitizenRegisterRequest, CitizenSession } from '@dispatch/contracts';
import { db, newId, tx, type Queryable } from '@/src/server/infra/db';
import { HttpError } from '@/src/server/infra/errors';
import { hashPassword, verifyPassword } from './internal/crypto';

interface CitizenRow {
  id: string;
  name: string;
  email: string;
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
  trackingToken: string | null;
}

function toSession(row: CitizenRow): CitizenSession {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone };
}

export async function registerCitizen(input: CitizenRegisterRequest): Promise<CitizenSession> {
  const now = Date.now();
  return tx(async (t: Queryable) => {
    const existing = await t.one<CitizenRow>(
      'SELECT id, name, email, phone, password_hash FROM citizens WHERE lower(email) = lower(?) OR phone = ?',
      [input.email, input.phone],
    );
    if (existing) {
      if (existing.password_hash && input.password) {
        const matches = verifyPassword(input.password, existing.password_hash);
        if (!matches) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Ya existe una cuenta con este correo o teléfono y la contraseña no coincide. Inicia sesión.',
          );
        }
      }
      const newHash = input.password ? hashPassword(input.password) : (existing.password_hash ?? null);
      await t.run(
        'UPDATE citizens SET name = ?, email = ?, phone = ?, password_hash = ? WHERE id = ?',
        [input.name, input.email, input.phone, newHash, existing.id],
      );
      return { id: existing.id, name: input.name, email: input.email, phone: input.phone };
    }
    const id = newId(now);
    const passwordHash = input.password ? hashPassword(input.password) : null;
    await t.run(
      'INSERT INTO citizens (id, name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, input.name, input.email, input.phone, passwordHash, now],
    );
    return { id, name: input.name, email: input.email, phone: input.phone };
  });
}

export async function loginCitizen(identifier: string, password?: string): Promise<CitizenSession> {
  const q = db();
  const clean = identifier.trim();
  const citizen = await q.one<CitizenRow>(
    'SELECT id, name, email, phone, password_hash FROM citizens WHERE lower(email) = lower(?) OR phone = ?',
    [clean, clean],
  );
  if (!citizen) {
    throw new HttpError(404, 'NOT_FOUND', 'No encontramos una cuenta con ese correo o teléfono. Regístrate para continuar.');
  }

  // Si la cuenta tiene contraseña protegida:
  if (citizen.password_hash) {
    if (!password) {
      throw new HttpError(403, 'FORBIDDEN', 'Esta cuenta está protegida con contraseña. Por favor ingrésala.');
    }
    const ok = verifyPassword(password, citizen.password_hash);
    if (!ok) {
      throw new HttpError(403, 'FORBIDDEN', 'Contraseña incorrecta. Por favor verifica tus credenciales.');
    }
  } else if (password && password.length >= 4) {
    // Si no tenía contraseña asignada, se la vinculamos ahora
    const newHash = hashPassword(password);
    await q.run('UPDATE citizens SET password_hash = ? WHERE id = ?', [newHash, citizen.id]);
  }

  return toSession(citizen);
}

export async function findCitizen(id: string, q: Queryable = db()): Promise<CitizenSession | null> {
  const row = await q.one<CitizenRow>('SELECT id, name, email, phone FROM citizens WHERE id = ?', [id]);
  return row ? toSession(row) : null;
}

export async function listCitizenReports(citizen: CitizenSession, q: Queryable = db()): Promise<CitizenReportHistoryItem[]> {
  const rows = await q.many<{
    id: string;
    code: string;
    type: string;
    status: string;
    address: string | null;
    created_at: string | number;
    tracking_token: string | null;
  }>(`
    SELECT DISTINCT i.id, i.code, i.type, i.status, i.address, i.created_at, i.tracking_token
    FROM incidents i
    JOIN incident_reports r ON r.incident_id = i.id
    WHERE r.reporter_contact = ? OR r.reporter_contact = ?
    ORDER BY i.created_at DESC
    LIMIT 20
  `, [citizen.phone, citizen.email]);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    type: r.type,
    status: r.status,
    address: r.address,
    createdAt: Number(r.created_at),
    trackingToken: r.tracking_token,
  }));
}
