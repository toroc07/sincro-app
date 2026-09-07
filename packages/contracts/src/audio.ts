/**
 * CONTRACTS — reporte por AUDIO y seguimiento en vivo.
 *
 * El reporte por voz es la entrada principal del ciudadano: quien presencia un
 * accidente no llena formularios, habla. Grabar es un gesto; escribir bajo
 * estres no lo es.
 *
 * LIMITE QUE NO SE MUEVE: la transcripcion y la extraccion de campos las hace
 * un modelo, pero la PRIORIDAD MEDICA la sigue decidiendo la tabla de reglas
 * de triage.ts. El modelo propone tipo y señales; las reglas deciden urgencia;
 * el operador puede sobrescribir. Ver la seccion de IA del README.
 */

import { z } from 'zod';
import { isWithinCartagena } from './geo.js';
import { zCartagenaPoint, zIncidentType, zId, zTimestamp } from './models.js';

// ─── ENTRADA POR AUDIO ──────────────────────────────────────────────────────

/** Tope de subida. ~60s de opus a 24kbps caben de sobra; evita que un dedo
 *  atascado en el boton mande 20 MB desde una red movil mala. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 60;

export const zAudioReportRequest = z.object({
  /** Audio en base64 (data URI sin el prefijo). Se guarda junto al reporte:
   *  es evidencia del incidente y permite reprocesar la transcripcion. */
  audioBase64: z.string().min(1),
  mimeType: z.string().default('audio/webm'),
  durationSeconds: z.number().min(0).max(MAX_AUDIO_SECONDS),
  point: zCartagenaPoint,
  accuracyM: z.number().optional(),
  reporterContact: z.string().max(120).optional(),
  /** Si el navegador no pudo grabar, el ciudadano elige tipo con botones.
   *  El sistema NUNCA depende solo del audio para poder despachar. */
  fallbackType: zIncidentType.optional(),
});
export type AudioReportRequest = z.infer<typeof zAudioReportRequest>;

/** Lo que el modelo EXTRAE del audio. Todo opcional: un audio puede ser
 *  ininteligible y el sistema debe seguir funcionando. */
export const zTranscriptionResult = z.object({
  transcript: z.string(),
  /** Idioma detectado; el reporte puede venir en español o inglés. */
  language: z.string().nullable(),
  /** Confianza global 0-1. Por debajo del umbral se marca para revision
   *  del operador en vez de asumir que se entendio bien. */
  confidence: z.number().min(0).max(1).nullable(),
  /** Campos estructurados propuestos por el modelo. Son SUGERENCIAS. */
  suggestedType: zIncidentType.nullable(),
  suggestedPatientCount: z.number().int().min(0).max(50).nullable(),
  /** Señales criticas detectadas en el habla. Alimentan triage(), que es
   *  quien decide la prioridad — el modelo no la decide. */
  signals: z.object({
    unconscious: z.boolean().optional(),
    notBreathing: z.boolean().optional(),
    severeBleeding: z.boolean().optional(),
    trapped: z.boolean().optional(),
  }),
  /** Referencia de ubicacion mencionada en el audio ("frente al Éxito de
   *  Bocagrande"). No sustituye al GPS; ayuda al operador a confirmarla. */
  locationHint: z.string().nullable(),
  /** Que motor produjo esto. Se persiste: si mañana cambiamos de proveedor,
   *  hay que poder saber que reportes se procesaron con cual. */
  engine: z.string(),
  /** Aditivo: que combinacion de motores produjo la CLASIFICACION — 'rules' o
   *  'rules+groq:<modelo>'. Las señales/conteo que van a triage() son SIEMPRE
   *  de reglas; el LLM solo puede proponer el tipo. HOY NO se persiste: fluye
   *  en la respuesta de la API (AudioReportResponse.transcription); persistirlo
   *  es follow-up con migracion. */
  classifierEngine: z.string().optional(),
  /** Aditivo: de donde salio `suggestedType` — 'rules' (regla auditable),
   *  'llm' (solo lo propuso el modelo — no puede pisar el `fallbackType` que
   *  eligio el ciudadano), 'none'. */
  typeSource: z.enum(['rules', 'llm', 'none']).optional(),
});
export type TranscriptionResult = z.infer<typeof zTranscriptionResult>;

/** Umbral por debajo del cual el incidente se marca para revision humana. */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;

export const zAudioReportResponse = z.object({
  incidentCode: z.string(),
  incidentId: zId,
  reportId: zId,
  wasMerged: z.boolean(),
  /** null si no habia motor de transcripcion configurado o si fallo.
   *  El incidente se crea igual: nunca se pierde un reporte por eso. */
  transcription: zTranscriptionResult.nullable(),
  /** true cuando la confianza fue baja o no hubo transcripcion: la UI pide
   *  al ciudadano que confirme el tipo con botones. */
  needsConfirmation: z.boolean(),
  /** Token opaco para seguir el incidente sin login. */
  trackingToken: z.string(),
});
export type AudioReportResponse = z.infer<typeof zAudioReportResponse>;

// ─── SEGUIMIENTO EN VIVO (estilo Uber/Rappi) ────────────────────────────────

/** Pasos que ve el ciudadano. Es una proyeccion SIMPLIFICADA de la maquina de
 *  estados: no le mostramos RESERVED ni ASSIGNING, que no significan nada para
 *  el. Cinco pasos, siempre los mismos, para que se entienda de un vistazo. */
export const TRACKING_STEP = [
  'RECEIVED',     // recibimos tu reporte
  'ASSIGNING',    // buscando la unidad mas cercana
  'ON_THE_WAY',   // la ambulancia va en camino
  'ARRIVED',      // llego al lugar
  'TRANSPORTING', // trasladando al paciente
  'COMPLETED',
] as const;
export type TrackingStep = (typeof TRACKING_STEP)[number];

export const zTrackingVehicle = z.object({
  callsign: z.string(),
  capabilityLevel: z.string(),
  lat: z.number(),
  lng: z.number(),
  heading: z.number().nullable(),
  /** Momento de la ultima posicion: la UI muestra "hace 4s" para que el
   *  ciudadano sepa si el punto es fiable o esta congelado. */
  updatedAt: zTimestamp,
});
export type TrackingVehicle = z.infer<typeof zTrackingVehicle>;

export const zTrackingResponse = z.object({
  incidentCode: z.string(),
  step: z.enum(TRACKING_STEP),
  /** Texto ya redactado para el ciudadano. Se genera en el servidor para que
   *  las tres pantallas digan lo mismo y no se reescriba en cada cliente. */
  headline: z.string(),
  detail: z.string(),

  incidentLat: z.number(),
  incidentLng: z.number(),

  vehicle: zTrackingVehicle.nullable(),
  /** Segundos restantes estimados. null cuando aun no hay unidad asignada. */
  etaSeconds: z.number().int().nullable(),
  /** Distancia de ruta estimada, en metros. */
  distanceM: z.number().int().nullable(),

  /** Hitos con marca de tiempo, para la linea de tiempo del ciudadano. */
  timeline: z.array(z.object({
    step: z.enum(TRACKING_STEP),
    at: zTimestamp,
    label: z.string(),
  })),

  /** Cuantos reportes se agruparon en este incidente. Se muestra como
   *  "otras 3 personas reportaron esto": le confirma al ciudadano que su
   *  aviso sirvio aunque no generara una ambulancia propia. */
  reportCount: z.number().int(),

  /** Aditivo: ¿ya hay un teléfono de contacto guardado para este incidente?
   *  La pantalla de seguimiento lo usa para decidir si insiste con el card de
   *  "agrega tu número". */
  reporterContactOnFile: z.boolean().optional(),

  /** Aditivo-opcional (migración 027): posición viva del ciudadano que reporta,
   *  solo si es fresca (<60s); null en cualquier otro caso. La pinta el mapa del
   *  panel de ambulancia y también el del propio ciudadano ("te vemos aquí"). */
  reporterLocation: z.object({
    lat: z.number(),
    lng: z.number(),
    at: zTimestamp,
  }).nullable().optional(),

  serverTime: zTimestamp,
});
export type TrackingResponse = z.infer<typeof zTrackingResponse>;

/** POST /api/track/:token/location — el dispositivo del ciudadano transmite su
 *  GPS mientras espera la ambulancia. Aditivo. */
export const zReporterLocationRequest = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().nonnegative().optional(),
}).refine((p) => isWithinCartagena(p), {
  message: 'Coordenada fuera del área de operación de Cartagena (¿lat/lng invertidos?)',
});
export type ReporterLocationRequest = z.infer<typeof zReporterLocationRequest>;

/** POST /api/track/:token/contact — el reporter agrega su celular DESPUÉS de
 *  enviar el reporte, para que la tripulación pueda llamarlo. Aditivo. */
export const zAddReporterContactRequest = z.object({
  phone: z.string().trim().min(7, 'Número demasiado corto').max(120),
});
export type AddReporterContactRequest = z.infer<typeof zAddReporterContactRequest>;

/** Mapea el estado interno del incidente al paso que ve el ciudadano. */
export function toTrackingStep(incidentStatus: string): TrackingStep {
  switch (incidentStatus) {
    case 'REPORTED':
    case 'VALIDATING':
      return 'RECEIVED';
    case 'OPEN':
    case 'ASSIGNING':
    case 'NO_RESOURCE':
      return 'ASSIGNING';
    case 'ASSIGNED':
    case 'EN_ROUTE':
      return 'ON_THE_WAY';
    case 'ON_SCENE':
      return 'ARRIVED';
    case 'TRANSPORTING':
      return 'TRANSPORTING';
    default:
      return 'COMPLETED';
  }
}
