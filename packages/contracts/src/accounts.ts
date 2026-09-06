/**
 * CONTRACTS — registro de ciudadano y de ambulancia (§33, aditivo).
 *
 * El ciudadano se registra con nombre, correo y telefono antes de reportar.
 * El telefono es lo que permite al responder llamarlo desde el panel de la
 * ambulancia cuando un reporte no trae suficiente informacion — por eso es
 * el unico dato realmente obligatorio para que el sistema funcione; nombre
 * y correo son identificacion, no bloquean el flujo si son minimos.
 *
 * Sin contraseña a proposito: es una demo de hackathon, no un sistema de
 * cuentas con recuperacion de acceso. La sesion es una cookie firmada
 * (mismo patron HMAC que session.ts), no hay verificacion de identidad
 * real — un telefono/correo repetido simplemente reingresa a esa cuenta.
 */

import { z } from 'zod';
import { zCapabilityLevel, zId } from './models.js';

// ─── CIUDADANO ──────────────────────────────────────────────────────────────

export const zCitizenRegisterRequest = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(4).max(100).optional(),
});
export type CitizenRegisterRequest = z.infer<typeof zCitizenRegisterRequest>;

export const zCitizenLoginRequest = z.object({
  identifier: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(100),
});
export type CitizenLoginRequest = z.infer<typeof zCitizenLoginRequest>;

export const zCitizenSession = z.object({
  id: zId,
  name: z.string(),
  email: z.string(),
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
