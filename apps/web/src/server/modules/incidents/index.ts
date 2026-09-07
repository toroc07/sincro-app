import {
  assertIncidentTransition,
  type ActorType,
  type CreateIncidentRequest,
  type CreateIncidentResponse,
  type Incident,
  type IncidentDetailResponse,
  type IncidentEvent,
  type IncidentStatus,
  type zUpdateIncidentRequest,
} from '@dispatch/contracts';
import type { z } from 'zod';
import { bus } from '@/src/server/infra/bus';
import { db, newId, tx, type Queryable } from '@/src/server/infra/db';
import { HttpError } from '@/src/server/infra/errors';
import { decideDeduplication, LIVE_LOOKBACK_MS } from './internal/dedup';
import { appendIncidentEvent, type AppendEventInput } from './internal/events';
import {
  findIncident,
  findIncidentForReport,
  findReportByIdempotencyKey,
  insertIncident,
  insertReport,
  listEvents,
  listLive,
  listRecentLiveIncidents,
  listReports,
  readAssignmentContext,
  setIncidentStatus,
  setPrimaryReport,
  setTriage,
  updateOperationalFields,
} from './internal/repository';
import { regenerateIncidentSummary } from './internal/summary';
import {
  applyTriage, mergeSignals, parseSignals, ratchetTriage, type CriticalSignals,
} from './internal/triage';

export type UpdateIncidentRequest = z.infer<typeof zUpdateIncidentRequest>;

export interface IncidentEngineOptions {
  now?: number;
  actorType?: ActorType;
  actorId?: string | null;
  idempotencyKey?: string | null;
  /** El origen (teléfono/IP) superó el rate-limit: el incidente se marca
   *  `suspected_abuse` y no se auto-despacha. Nunca bloquea el reporte. */
  suspectedAbuse?: boolean;
}

async function requireIncident(q: Queryable, incidentId: string): Promise<Incident> {
  const incident = await findIncident(q, incidentId);
  if (!incident) throw new HttpError(404, 'NOT_FOUND', 'Incidente no encontrado');
  return incident;
}

async function transitionIncident(
  q: Queryable,
  incident: Incident,
  next: IncidentStatus,
  closedAt: number | null = null,
): Promise<Incident> {
  assertIncidentTransition(incident.status, next);
  await setIncidentStatus(q, incident.id, next, closedAt);
  return { ...incident, status: next, closedAt };
}

function incidentCode(id: string): string {
  return `INC-${id.slice(-3)}`;
}

async function idempotentResult(q: Queryable, key?: string | null): Promise<CreateIncidentResponse | null> {
  if (!key) return null;
  const report = await findReportByIdempotencyKey(q, key);
  if (!report) return null;
  const incident = await findIncidentForReport(q, report);
  if (!incident) throw new Error('Reporte idempotente sin incidente asociado');
  return {
    incident,
    report,
    wasMerged: report.wasMerged,
    mergedIntoIncidentId: report.wasMerged ? incident.id : null,
  };
}

function signalsFor(request: CreateIncidentRequest) {
  return { patientCount: request.patientCount, ...(request.signals ?? {}) };
}

export async function createIncidentFromReport(
  request: CreateIncidentRequest,
  options: IncidentEngineOptions = {},
): Promise<CreateIncidentResponse> {
  const now = options.now ?? Date.now();
  const actorType = options.actorType ?? 'REPORTER';
  let emittedTopic: 'incident:created' | 'incident:merged' | null = null;
  const result = await tx(async (t) => {
    const previous = await idempotentResult(t, options.idempotencyKey);
    if (previous) return previous;

    const triageResult = applyTriage(request.type, signalsFor(request));
    const decision = decideDeduplication(
      { type: request.type, point: request.point, accuracyM: request.accuracyM, createdAt: now },
      await listRecentLiveIncidents(t, now - LIVE_LOOKBACK_MS),
    );

    if (decision.kind === 'MERGE') {
      const report = {
        id: newId(now), incidentId: decision.incident.id, source: request.source,
        reporterContact: request.reporterContact ?? null,
        description: request.description ?? null,
        lat: request.point.lat, lng: request.point.lng, accuracyM: request.accuracyM ?? null,
        wasMerged: true, mergeConfidence: decision.confidence,
        mergeReason: decision.reason, createdAt: now,
      };
      await insertReport(t, report, options.idempotencyKey ?? undefined);
      await appendIncidentEvent(t, {
        incidentId: decision.incident.id, eventType: 'REPORT_MERGED', actorType,
        actorId: options.actorId, createdAt: now,
        metadata: { reportId: report.id, confidence: decision.confidence, reason: decision.reason },
      });
      // Fusiona señales: si algún reporte de esta emergencia marcó "atrapado",
      // el incidente queda "atrapado". Con las señales fusionadas se recalcula
      // el trinquete de triage — la gravedad nunca baja al llegar más reportes.
      const currentSignalsRow = await t.one<{ signals: string | null }>(
        'SELECT signals FROM incidents WHERE id = ?', [decision.incident.id],
      );
      const mergedSignals = mergeSignals(parseSignals(currentSignalsRow?.signals), request.signals);
      await t.run('UPDATE incidents SET signals = ? WHERE id = ?', [
        JSON.stringify(mergedSignals), decision.incident.id,
      ]);

      const effectivePatientCount = Math.max(request.patientCount, decision.incident.patientCount);
      const mergedTriage = applyTriage(request.type, {
        patientCount: effectivePatientCount, ...mergedSignals,
      });
      const ratchet = ratchetTriage(decision.incident, mergedTriage);
      if (ratchet.escalates) {
        await setTriage(t, decision.incident.id, ratchet.priority, ratchet.requiredCapability);
        await appendIncidentEvent(t, {
          incidentId: decision.incident.id, eventType: 'PRIORITY_SET', actorType: 'SYSTEM', createdAt: now,
          metadata: {
            priority: ratchet.priority, requiredCapability: ratchet.requiredCapability,
            ruleId: mergedTriage.ruleId, escalatedByReportId: report.id,
          },
        });
      }
      if (request.patientCount > decision.incident.patientCount) {
        await updateOperationalFields(t, decision.incident.id, { patientCount: request.patientCount });
      }
      // Un merge es CORROBORACIÓN, no abuso: nunca marca `suspected_abuse`. Y
      // 3+ testigos distintos de la misma emergencia limpian una marca previa —
      // eso ya no parece un bucle roto, parece una emergencia real.
      if (decision.incident.suspectedAbuse) {
        const countRow = await t.one<{ n: number }>(
          'SELECT COUNT(*)::INTEGER AS n FROM incident_reports WHERE incident_id = ?',
          [decision.incident.id],
        );
        if ((countRow?.n ?? 0) >= 3) {
          await t.run('UPDATE incidents SET suspected_abuse = FALSE WHERE id = ?', [decision.incident.id]);
          await appendIncidentEvent(t, {
            incidentId: decision.incident.id, eventType: 'MANUAL_OVERRIDE', actorType: 'SYSTEM', createdAt: now,
            metadata: { clearedAbuseFlag: true, reportCount: countRow?.n ?? 0, reason: 'corroborado por 3+ reportes' },
          });
        }
      }
      emittedTopic = 'incident:merged';
      return {
        incident: await requireIncident(t, decision.incident.id), report,
        wasMerged: true, mergedIntoIncidentId: decision.incident.id,
      };
    }

    const incidentId = newId(now);
    let incident: Incident = {
      id: incidentId, code: incidentCode(incidentId), status: 'REPORTED', priority: null,
      type: request.type, lat: request.point.lat, lng: request.point.lng, address: null,
      patientCount: request.patientCount, requiredCapability: null, zoneId: null,
      primaryReportId: null, mergedIntoIncidentId: null, createdAt: now, closedAt: null,
    };
    await insertIncident(t, {
      id: incident.id, code: incident.code, status: incident.status, type: incident.type,
      lat: incident.lat, lng: incident.lng, patientCount: incident.patientCount, createdAt: now,
    });
    // Señales críticas del reporter (§24): se persisten para que el re-triage
    // desde /track (confirmIncidentType) no corra a ciegas.
    const reportSignals: CriticalSignals = request.signals ?? {};
    if (Object.keys(reportSignals).length > 0) {
      await t.run('UPDATE incidents SET signals = ? WHERE id = ?', [
        JSON.stringify(reportSignals), incidentId,
      ]);
    }
    // Rate-limit superado: se marca el incidente. El reporte se crea igual — una
    // emergencia real no puede perderse — pero la ruta forzará RECOMMEND.
    if (options.suspectedAbuse) {
      await t.run('UPDATE incidents SET suspected_abuse = TRUE WHERE id = ?', [incidentId]);
    }
    await appendIncidentEvent(t, {
      incidentId, eventType: 'INCIDENT_CREATED', actorType, actorId: options.actorId,
      metadata: decision.kind === 'SUGGEST'
        ? { possibleDuplicateIncidentId: decision.incident.id, confidence: decision.confidence, reason: decision.reason }
        : {},
      createdAt: now,
    });
    incident = await transitionIncident(t, incident, 'VALIDATING');

    const report = {
      id: newId(now), incidentId, source: request.source,
      reporterContact: request.reporterContact ?? null,
      description: request.description ?? null,
      lat: request.point.lat, lng: request.point.lng, accuracyM: request.accuracyM ?? null,
      wasMerged: false,
      mergeConfidence: decision.kind === 'SUGGEST' ? decision.confidence : null,
      mergeReason: decision.kind === 'SUGGEST' ? decision.reason : null,
      createdAt: now,
    };
    await insertReport(t, report, options.idempotencyKey ?? undefined);
    await setPrimaryReport(t, incidentId, report.id);
    await appendIncidentEvent(t, {
      incidentId, eventType: 'REPORT_ADDED', actorType, actorId: options.actorId,
      metadata: { reportId: report.id }, createdAt: now,
    });
    await setTriage(t, incidentId, triageResult.priority, triageResult.requiredCapability);
    await appendIncidentEvent(t, {
      incidentId, eventType: 'PRIORITY_SET', actorType: 'SYSTEM', createdAt: now,
      metadata: { priority: triageResult.priority, requiredCapability: triageResult.requiredCapability, ruleId: triageResult.ruleId },
    });
    incident = await transitionIncident(t, incident, 'OPEN');
    emittedTopic = 'incident:created';
    return {
      incident: await requireIncident(t, incidentId), report,
      wasMerged: false, mergedIntoIncidentId: null,
    };
  });

  if (emittedTopic) {
    bus.emit(emittedTopic, result.incident);
    // Resumen consolidado por IA: fuera del tx y SIN await — un reporte nuevo
    // (creado o fusionado) regenera la síntesis de todos los reportes, pero eso
    // nunca puede retrasar la respuesta al ciudadano ni tumbarla si el LLM
    // falla. En un replay idempotente (`emittedTopic` null) no hay datos nuevos
    // y no se regenera.
    void regenerateIncidentSummary(result.incident.id).catch(() => {});
  }

  return result;
}

export async function appendReportToIncident(
  incidentId: string,
  request: CreateIncidentRequest,
  options: IncidentEngineOptions = {},
): Promise<CreateIncidentResponse> {
  const now = options.now ?? Date.now();
  let changed = false;
  const result = await tx(async (t) => {
    const previous = await idempotentResult(t, options.idempotencyKey);
    if (previous) return previous;
    const incident = await requireIncident(t, incidentId);
    if (['COMPLETED', 'CANCELLED', 'DUPLICATE'].includes(incident.status)) {
      throw new HttpError(409, 'INVALID_TRANSITION', 'No se pueden agregar reportes a un incidente cerrado');
    }
    const report = {
      id: newId(now), incidentId, source: request.source,
      reporterContact: request.reporterContact ?? null, description: request.description ?? null,
      lat: request.point.lat, lng: request.point.lng, accuracyM: request.accuracyM ?? null,
      wasMerged: true, mergeConfidence: 1,
      mergeReason: 'Reporte asociado explícitamente al incidente por el operador', createdAt: now,
    };
    await insertReport(t, report, options.idempotencyKey ?? undefined);
    await appendIncidentEvent(t, {
      incidentId, eventType: 'REPORT_MERGED', actorType: options.actorType ?? 'DISPATCHER',
      actorId: options.actorId, metadata: { reportId: report.id, confidence: 1, reason: report.mergeReason }, createdAt: now,
    });
    changed = true;
    return { incident, report, wasMerged: true, mergedIntoIncidentId: incidentId };
  });
  if (changed) bus.emit('incident:merged', result.incident);
  return result;
}

export async function getIncidentDetail(incidentId: string, q: Queryable = db()): Promise<IncidentDetailResponse> {
  const incident = await requireIncident(q, incidentId);
  return {
    incident,
    reports: await listReports(q, incidentId),
    events: await listEvents(q, incidentId),
    ...await readAssignmentContext(q, incidentId),
  };
}

export async function listLiveIncidents(q: Queryable = db()): Promise<Incident[]> {
  return await listLive(q);
}

export async function updateIncident(
  incidentId: string,
  request: UpdateIncidentRequest,
  options: IncidentEngineOptions = {},
): Promise<Incident> {
  if ('status' in request) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Los clientes envían acciones, no status');
  }
  if (request.cancel) return cancelIncident(incidentId, request.cancel.reason, options);
  const now = options.now ?? Date.now();
  const updated = await tx(async (t) => {
    await requireIncident(t, incidentId);
    await updateOperationalFields(t, incidentId, request);
    if (request.priority || request.requiredCapability) {
      await appendIncidentEvent(t, {
        incidentId, eventType: 'MANUAL_OVERRIDE', actorType: options.actorType ?? 'DISPATCHER',
        actorId: options.actorId, createdAt: now,
        metadata: { priority: request.priority, requiredCapability: request.requiredCapability },
      });
    }
    if (request.clearAbuse) {
      // El operador revisó el incidente: retira la marca de origen sospechoso
      // para que pueda auto-despacharse con el SLA normal.
      await t.run('UPDATE incidents SET suspected_abuse = FALSE WHERE id = ?', [incidentId]);
      await appendIncidentEvent(t, {
        incidentId, eventType: 'MANUAL_OVERRIDE', actorType: options.actorType ?? 'DISPATCHER',
        actorId: options.actorId, createdAt: now, metadata: { clearedAbuseFlag: true },
      });
    }
    return requireIncident(t, incidentId);
  });
  bus.emit('incident:updated', updated);
  return updated;
}

export async function cancelIncident(
  incidentId: string,
  reason: string,
  options: IncidentEngineOptions = {},
): Promise<Incident> {
  const now = options.now ?? Date.now();
  const cancelled = await tx(async (t) => {
    const current = await requireIncident(t, incidentId);
    const next = await transitionIncident(t, current, 'CANCELLED', now);
    await appendIncidentEvent(t, {
      incidentId, eventType: 'INCIDENT_CANCELLED', actorType: options.actorType ?? 'DISPATCHER',
      actorId: options.actorId, metadata: { reason }, createdAt: now,
    });
    return next;
  });
  bus.emit('incident:updated', cancelled);
  return cancelled;
}

export async function appendEvent(input: AppendEventInput, q: Queryable = db()): Promise<IncidentEvent> {
  await requireIncident(q, input.incidentId);
  return appendIncidentEvent(q, input);
}

/** Resumen del reporte primario del incidente — lo que el panel de la
 *  ambulancia muestra tal cual (la descripción ya la estructuró la IA en
 *  audio-intake.ts) más el contacto para poder llamar. Consulta liviana a
 *  propósito: el panel la pide cada 1s mientras hay una asignación activa. */
export async function getPrimaryReportSummary(
  incidentId: string,
  q: Queryable = db(),
): Promise<{ description: string | null; reporterContact: string | null }> {
  const row = await q.one<{ description: string | null; reporter_contact: string | null }>(
    `SELECT description, reporter_contact FROM incident_reports
     WHERE incident_id = ? AND (description IS NOT NULL OR reporter_contact IS NOT NULL)
     ORDER BY (id = (SELECT primary_report_id FROM incidents WHERE id = ?)) DESC, created_at
     LIMIT 1`,
    [incidentId, incidentId],
  );
  return { description: row?.description ?? null, reporterContact: row?.reporter_contact ?? null };
}

export interface ReporterContact {
  contact: string;
  name: string | null;
  snippet: string | null;
  at: number;
  isPrimary: boolean;
}

/** Todos los contactos que reportaron esta emergencia — una emergencia real
 *  suele tener varios testigos y la ambulancia necesita poder llamar a
 *  cualquiera, no solo al primero. Se deduplica por número quedándose con el
 *  reporte más reciente; el que corresponde al reporte primario se marca.
 *
 *  El `name` sale de casar el teléfono contra `citizens` comparando solo
 *  dígitos (los reportes traen el número tecleado con o sin prefijo/espacios).
 *  Es una PISTA, no identidad verificada: cualquiera puede teclear un número
 *  ajeno. */
export async function listReporterContacts(
  incidentId: string,
  q: Queryable = db(),
): Promise<ReporterContact[]> {
  const rows = await q.many<{
    reporter_contact: string;
    name: string | null;
    description: string | null;
    created_at: number;
    is_primary: boolean;
  }>(
    `SELECT r.reporter_contact, c.name, r.description, r.created_at,
            (r.id = i.primary_report_id) AS is_primary
       FROM incident_reports r
       JOIN incidents i ON i.id = r.incident_id
       LEFT JOIN citizens c
         ON regexp_replace(c.phone, '\\D', '', 'g') = regexp_replace(r.reporter_contact, '\\D', '', 'g')
        AND length(regexp_replace(r.reporter_contact, '\\D', '', 'g')) >= 7
      WHERE r.incident_id = ? AND r.reporter_contact IS NOT NULL
      ORDER BY r.created_at DESC`,
    [incidentId],
  );

  const byContact = new Map<string, ReporterContact>();
  for (const row of rows) {
    const existing = byContact.get(row.reporter_contact);
    if (existing) {
      // Ya se guardó la fila más reciente (orden DESC); solo falta arrastrar el
      // flag de primario si aparece en un reporte anterior del mismo número.
      if (row.is_primary) existing.isPrimary = true;
      continue;
    }
    byContact.set(row.reporter_contact, {
      contact: row.reporter_contact,
      name: row.name ?? null,
      snippet: row.description ? row.description.slice(0, 90) : null,
      at: row.created_at,
      isPrimary: row.is_primary === true,
    });
  }

  return [...byContact.values()].sort(
    (a, b) => b.at - a.at || (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0),
  );
}

export { areIncidentTypesCompatible, decideDeduplication } from './internal/dedup';
export { applyTriage } from './internal/triage';
export { confirmIncidentType, createIncidentFromAudio } from './internal/audio-intake';
export { attachReporterContact, getTracking, updateReporterLocation } from './internal/tracking';
export { buildIncidentSummary, regenerateIncidentSummary } from './internal/summary';
