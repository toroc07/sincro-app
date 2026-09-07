/**
 * Entrada de reportes por AUDIO.
 *
 * Se apoya en createIncidentFromReport() en lugar de duplicar su logica: la
 * deduplicacion, el triage por reglas y la maquina de estados son exactamente
 * los mismos que para un reporte escrito. El audio solo cambia COMO llegan los
 * campos, no que se hace con ellos.
 */

import {
  LOW_CONFIDENCE_THRESHOLD,
  type AudioReportRequest,
  type AudioReportResponse,
  type CapabilityLevel,
  type CreateIncidentRequest,
  type IncidentPriority,
  type IncidentType,
} from '@dispatch/contracts';
import { randomBytes } from 'node:crypto';
import { db, tx, type Queryable } from '@/src/server/infra/db';
import { logger } from '@/src/server/infra/logger';
import { createIncidentFromReport, type IncidentEngineOptions } from '../index';
import { appendIncidentEvent } from './events';
import { needsHumanConfirmation, transcribeAudio } from './transcription';
import { applyTriage, parseSignals, ratchetTriage } from './triage';

/** Token de seguimiento: 128 bits. El codigo INC-482 es corto y adivinable;
 *  esto no, y es lo que permite seguir el incidente sin login sin exponer los
 *  incidentes de otras personas. */
function newTrackingToken(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Tipo por defecto cuando ni el audio ni el ciudadano dijeron cual es.
 *
 * OTHER a proposito: el sistema NO adivina un tipo grave para "curarse en
 * salud". Un tipo inventado alteraria el triage y podria mandar una ALS a algo
 * que no la necesita, dejando esa unidad sin cubrir una emergencia real.
 * Se marca needs_review y el operador lo resuelve.
 */
const UNKNOWN_TYPE: IncidentType = 'OTHER';

export interface AudioIntakeResult extends AudioReportResponse {
  incidentId: string;
}

export async function createIncidentFromAudio(
  request: AudioReportRequest,
  options: IncidentEngineOptions = {},
): Promise<AudioIntakeResult> {
  const audio = Buffer.from(request.audioBase64, 'base64');

  // La transcripcion puede devolver null (sin API key, proveedor caido,
  // timeout). El reporte se crea igual: nunca se pierde un aviso por eso.
  const transcription = await transcribeAudio(audio, request.mimeType);
  const needsConfirmation = needsHumanConfirmation(transcription);

  if (!transcription) {
    logger.warn('reporte por audio sin transcripcion', {
      durationSeconds: request.durationSeconds,
      hasFallbackType: Boolean(request.fallbackType),
    });
  }

  // Orden de precedencia del tipo (§24): una regla regex auditable manda; luego
  // el boton que pulso el ciudadano; luego un tipo que SOLO propuso el LLM
  // (podria ser MENOS grave que el boton — LLM "OTHER" vs boton "CARDIAC");
  // luego OTHER. Un tipo solo-LLM ademas nace con `needs_review` (su confianza
  // se fuerza por debajo del umbral en mergeClassification).
  const suggestedType = transcription?.suggestedType ?? null;
  const llmOnly = transcription?.typeSource === 'llm';
  const type: IncidentType =
    (llmOnly ? null : suggestedType) ?? request.fallbackType ?? suggestedType ?? UNKNOWN_TYPE;

  const incidentRequest: CreateIncidentRequest = {
    type,
    point: request.point,
    accuracyM: request.accuracyM,
    description: transcription?.transcript ?? undefined,
    patientCount: transcription?.suggestedPatientCount ?? 1,
    reporterContact: request.reporterContact,
    source: 'WEB',
    // Las señales alimentan la tabla de triage, que es quien decide la
    // prioridad. El modelo propone; las reglas deciden.
    signals: transcription?.signals ?? {},
  };

  const created = await createIncidentFromReport(incidentRequest, options);

  // Persistir audio, transcript y token en una sola transaccion: si algo falla
  // aqui, no queremos un incidente a medio anotar.
  const trackingToken = await tx(async (t: Queryable) => {
    await t.run(
      `UPDATE incident_reports
         SET audio_base64 = ?, audio_mime_type = ?, audio_duration_s = ?,
             transcript = ?, transcript_lang = ?, transcript_confidence = ?,
             transcript_engine = ?, location_hint = ?
       WHERE id = ?`,
      [
        request.audioBase64,
        request.mimeType,
        request.durationSeconds,
        transcription?.transcript ?? null,
        transcription?.language ?? null,
        transcription?.confidence ?? null,
        transcription?.engine ?? null,
        transcription?.locationHint ?? null,
        created.report.id,
      ],
    );

    if (needsConfirmation) {
      await t.run('UPDATE incidents SET needs_review = TRUE WHERE id = ?', [created.incident.id]);
    }

    // Si el reporte se fusiono en un incidente existente, ese incidente ya
    // tiene token: se reutiliza para que ambos ciudadanos vean el mismo
    // seguimiento. Es coherente — es la misma emergencia.
    const existing = await t.one<{ tracking_token: string | null }>(
      'SELECT tracking_token FROM incidents WHERE id = ?',
      [created.incident.id],
    );
    if (existing?.tracking_token) return existing.tracking_token;

    const token = newTrackingToken();
    await t.run('UPDATE incidents SET tracking_token = ? WHERE id = ?', [token, created.incident.id]);
    return token;
  });

  // El resumen consolidado por IA lo dispara `createIncidentFromReport` (cubre
  // las ramas NEW y MERGE por las que pasa este audio) — no se repite aquí.

  return {
    incidentCode: created.incident.code,
    incidentId: created.incident.id,
    reportId: created.report.id,
    wasMerged: created.wasMerged,
    transcription,
    needsConfirmation,
    trackingToken,
  };
}

/**
 * Confirmacion del ciudadano cuando la transcripcion no fue concluyente.
 * Corrige el tipo y vuelve a correr el triage por reglas (§24) con las señales
 * criticas que se persistieron al crear el incidente.
 *
 * Trinquete en las DOS dimensiones (prioridad y capacidad): el ciudadano puede
 * AGRAVAR la clasificacion, nunca rebajarla.
 *  - De-escala (bajaria prioridad o capacidad): no se aplica nada, el incidente
 *    queda `needs_review`, evento REPORTER `{rejected:true}`. Responde void — el
 *    ciudadano no ve error.
 *  - Escala algo: se aplica el tipo + el trinquete, y queda `needs_review` para
 *    que un operador vea que un ciudadano subio la gravedad por un token que
 *    varios reporteros comparten. Evento REPORTER `{viaTrackingToken:true}`.
 *  - Igual en ambas: se fija el tipo confirmado, `needs_review = FALSE`, evento
 *    SYSTEM.
 */
export async function confirmIncidentType(
  trackingToken: string,
  type: IncidentType,
): Promise<void> {
  const incident = await db().one<{
    id: string;
    status: string;
    type: IncidentType;
    priority: IncidentPriority | null;
    required_capability: CapabilityLevel | null;
    patient_count: number;
    signals: string | null;
  }>(
    `SELECT id, status, type, priority, required_capability, patient_count, signals
       FROM incidents WHERE tracking_token = ?`,
    [trackingToken],
  );
  if (!incident) return;

  // Solo antes de que haya unidad en ruta: despues, cambiar el tipo bajo los
  // pies del despachador crearia mas confusion que valor.
  if (!['REPORTED', 'VALIDATING', 'OPEN'].includes(incident.status)) return;

  const signals = parseSignals(incident.signals);
  const retriaged = applyTriage(type, { patientCount: incident.patient_count, ...signals });
  const ratchet = ratchetTriage(
    { priority: incident.priority, requiredCapability: incident.required_capability },
    retriaged,
  );

  await tx(async (t) => {
    if (ratchet.deEscalates) {
      await t.run('UPDATE incidents SET needs_review = TRUE WHERE id = ?', [incident.id]);
      await appendIncidentEvent(t, {
        incidentId: incident.id,
        eventType: 'PRIORITY_SET',
        actorType: 'REPORTER',
        metadata: { requestedType: type, rejected: true, reason: 'de-escalada requiere operador' },
      });
      return;
    }

    const needsReview = ratchet.escalates;
    await t.run(
      `UPDATE incidents
          SET type = ?, priority = ?, required_capability = ?, needs_review = ?
        WHERE id = ?`,
      [type, ratchet.priority, ratchet.requiredCapability, needsReview, incident.id],
    );
    await appendIncidentEvent(t, {
      incidentId: incident.id,
      eventType: 'PRIORITY_SET',
      actorType: ratchet.escalates ? 'REPORTER' : 'SYSTEM',
      metadata: {
        confirmedType: type,
        priority: ratchet.priority,
        requiredCapability: ratchet.requiredCapability,
        ruleId: retriaged.ruleId,
        ...(ratchet.escalates ? { viaTrackingToken: true } : {}),
      },
    });
  });
}

export { LOW_CONFIDENCE_THRESHOLD };
