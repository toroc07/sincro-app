/**
 * CONTRACTS — registro de ciudadano y de ambulancia (§33, aditivo).
 *
 * El ciudadano se registra con nombre y telefono, nada mas. El telefono es lo
 * que permite al responder llamarlo desde el panel de la ambulancia cuando un
 * reporte no trae suficiente informacion, y es la clave de identidad (un
 * telefono repetido reingresa a la misma cuenta via upsert).
 *
 * Sin contraseña ni correo a proposito (§ rediseño de flujo): quien reporta una
 * emergencia no debe pelear con un formulario. La sesion es una cookie firmada
 * de 1 año (mismo patron HMAC que session.ts); las contraseñas son solo para
 * staff. `email` se conserva como campo opcional para no romper cuentas viejas.
 */

import { z } from 'zod';
import { zCapabilityLevel, zId } from './models.js';

// ─── CIUDADANO ──────────────────────────────────────────────────────────────

// Cambio documentado (§ rediseño de flujo): `email` y `password` salen del
// registro; el ciudadano es passwordless y sin correo.
export const zCitizenRegisterRequest = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
});
export type CitizenRegisterRequest = z.infer<typeof zCitizenRegisterRequest>;

// "login" es en realidad "restaurar sesion por telefono": el identifier es el
// numero. `password` es opcional y solo lo exige una cuenta VIEJA que ya tenia
// contraseña (migracion 023): esas no se degradan. Las cuentas nuevas son
// passwordless a proposito — el telefono es un secreto debil, como el numero
// de callback de una llamada al 123.
export const zCitizenLoginRequest = z.object({
  identifier: z.string().trim().min(3).max(160),
  password: z.string().max(100).optional(),
});
export type CitizenLoginRequest = z.infer<typeof zCitizenLoginRequest>;

export const zCitizenSession = z.object({
  id: zId,
  name: z.string(),
  // Opcional-nullable: las cuentas nuevas no traen correo; las viejas si.
  email: z.string().nullable().optional(),
  phone: z.string(),
});
export type CitizenSession = z.infer<typeof zCitizenSession>;

export const zCitizenRegisterResponse = z.object({ citizen: zCitizenSession });
export type CitizenRegisterResponse = z.infer<typeof zCitizenRegisterResponse>;

export const zCitizenLoginResponse = z.object({ citizen: zCitizenSession });
export type CitizenLoginResponse = z.infer<typeof zCitizenLoginResponse>;

// ─── AMBULANCIA ─────────────────────────────────────────────────────────────

/** Registra una unidad nueva: placa + numero de unidad (callsign) + hospital
 *  al que pertenece. No reemplaza el seed de la flota — la complementa. */
export const zRegisterVehicleRequest = z.object({
  plate: z.string().trim().toUpperCase().min(4).max(12),
  callsign: z.string().trim().min(2).max(12),
  hospitalFacilityId: z.string().min(1),
  capabilityLevel: zCapabilityLevel.default('BLS'),
});
export type RegisterVehicleRequest = z.infer<typeof zRegisterVehicleRequest>;

export const zRegisterVehicleResponse = z.object({
  vehicleId: zId,
  callsign: z.string(),
});
export type RegisterVehicleResponse = z.infer<typeof zRegisterVehicleResponse>;

// ─── PERSONAL MÉDICO Y OPERATIVO (STAFF) ────────────────────────────────────

export const zStaffRole = z.enum(['DISPATCHER', 'RESPONDER', 'ADMIN']);
export type StaffRole = z.infer<typeof zStaffRole>;

export const zStaffSession = z.object({
  userId: zId,
  role: zStaffRole,
  name: z.string(),
  orgId: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});
export type StaffSession = z.infer<typeof zStaffSession>;

export const zStaffLoginRequest = z.object({
  identifier: z.string().trim().min(2).max(160),
  password: z.string().min(1).max(100),
});
export type StaffLoginRequest = z.infer<typeof zStaffLoginRequest>;

export const zStaffLoginResponse = z.object({
  staff: zStaffSession,
});
export type StaffLoginResponse = z.infer<typeof zStaffLoginResponse>;

export const zStaffStartShiftRequest = z.object({
  vehicleId: zId,
});
export type StaffStartShiftRequest = z.infer<typeof zStaffStartShiftRequest>;

export const zStaffActiveShift = z.object({
  shiftId: zId,
  vehicleId: zId,
  callsign: z.string(),
  plate: z.string().nullable().optional(),
  capabilityLevel: zCapabilityLevel,
  startedAt: z.number(),
});
export type StaffActiveShift = z.infer<typeof zStaffActiveShift>;

export const zStaffEmergencyHistoryItem = z.object({
  incidentId: zId,
  code: z.string(),
  type: z.string(),
  status: z.string(),
  priority: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  patientCount: z.number().int().default(1),
  assignmentStatus: z.string(),
  offeredAt: z.number(),
  completedAt: z.number().nullable().optional(),
  vehicleCallsign: z.string().nullable().optional(),
});
export type StaffEmergencyHistoryItem = z.infer<typeof zStaffEmergencyHistoryItem>;

export const zStaffProfileData = z.object({
  user: zStaffSession,
  activeShift: zStaffActiveShift.nullable(),
  activeIncident: z.object({
    id: zId,
    code: z.string(),
    type: z.string(),
    status: z.string(),
    priority: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    patientCount: z.number().int(),
    assignmentStatus: z.string(),
  }).nullable(),
  stats: z.object({
    totalMissions: z.number().int(),
    completedMissions: z.number().int(),
  }),
});
export type StaffProfileData = z.infer<typeof zStaffProfileData>;
