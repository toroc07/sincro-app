// src/app.ts
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ../packages/contracts/src/enums.ts
var INCIDENT_STATUS = [
  "REPORTED",
  // entró un reporte, aún sin validar
  "VALIDATING",
  // deduplicación / triage por regla
  "OPEN",
  // confirmado, esperando recurso
  "ASSIGNING",
  // motor corriendo / oferta enviada
  "ASSIGNED",
  // unidad aceptó
  "EN_ROUTE",
  "ON_SCENE",
  "TRANSPORTING",
  "COMPLETED",
  "CANCELLED",
  "DUPLICATE",
  // fusionado en otro incidente
  "NO_RESOURCE"
  // sin unidad disponible
];
var VEHICLE_STATUS = [
  "OFFLINE",
  // sin turno
  "AVAILABLE",
  // en turno, libre
  "RESERVED",
  // oferta enviada, esperando respuesta — NO reasignable
  "ASSIGNED",
  // aceptó, aún no arranca
  "EN_ROUTE",
  "ON_SCENE",
  "TRANSPORTING",
  "UNAVAILABLE",
  // en turno pero no despachable (descanso, reabastecimiento)
  "OUT_OF_SERVICE"
  // avería
];
var ASSIGNMENT_STATUS = [
  "OFFERED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "EN_ROUTE",
  "ON_SCENE",
  "TRANSPORTING",
  "COMPLETED",
  "CANCELLED"
];
var INCIDENT_PRIORITY = ["P1", "P2", "P3", "P4"];
var INCIDENT_TYPE = [
  "TRAFFIC_ACCIDENT",
  "CARDIAC",
  "UNCONSCIOUS",
  "FALL",
  "TRAUMA",
  "RESPIRATORY",
  "OBSTETRIC",
  "OTHER"
];
var CAPABILITY_LEVEL = ["MEDICAL_MOTO", "BLS", "ALS", "RESCUE"];
var REPORT_SOURCE = ["WEB", "WHATSAPP", "CALL", "SIM"];
var ETA_SOURCE = ["HAVERSINE_URBAN", "ROUTED", "CACHED"];
var INCIDENT_EVENT_TYPE = [
  "INCIDENT_CREATED",
  "REPORT_ADDED",
  "REPORT_MERGED",
  "PRIORITY_SET",
  "DISPATCH_STARTED",
  "CANDIDATES_CALCULATED",
  "VEHICLE_RECOMMENDED",
  "VEHICLE_ASSIGNED",
  "ASSIGNMENT_ACCEPTED",
  "ASSIGNMENT_REJECTED",
  "ASSIGNMENT_EXPIRED",
  "VEHICLE_EN_ROUTE",
  "ARRIVED_ON_SCENE",
  "TRANSPORT_STARTED",
  "INCIDENT_COMPLETED",
  "INCIDENT_CANCELLED",
  "MANUAL_OVERRIDE",
  "NO_RESOURCE_AVAILABLE",
  // Aditivo (mismo patrón que 'REPORT_MERGED'): el resumen consolidado por IA
  // se (re)generó tras un reporte nuevo.
  "INCIDENT_ENRICHED",
  // Aditivo (mismo patrón): el reporter agregó su teléfono de contacto desde la
  // pantalla de seguimiento, después de enviar el reporte.
  "REPORTER_CONTACT_ADDED"
];
var ACTOR_TYPE = ["REPORTER", "DISPATCHER", "RESPONDER", "SYSTEM", "SIMULATOR"];
var REJECT_REASON = [
  "MECHANICAL",
  "CREW_UNAVAILABLE",
  "ALREADY_COMMITTED",
  "UNSAFE_ACCESS",
  "OTHER"
];

// ../packages/contracts/src/geo.ts
var CARTAGENA_BBOX = {
  minLat: 10.3,
  maxLat: 10.53,
  minLng: -75.6,
  maxLng: -75.42
};
function isWithinCartagena(p) {
  return p.lat >= CARTAGENA_BBOX.minLat && p.lat <= CARTAGENA_BBOX.maxLat && p.lng >= CARTAGENA_BBOX.minLng && p.lng <= CARTAGENA_BBOX.maxLng;
}

// ../packages/contracts/src/dispatch.ts
var DEFAULT_WEIGHTS = {
  overCapabilitySecondsPerLevel: 45,
  coverageSecondsPerDeficitUnit: 120,
  workloadSecondsPerRecentJob: 30,
  staleLocationSecondsPer30s: 20,
  staleLocationMaxSeconds: 180,
  staleLocationHardCutoffMs: 5 * 60 * 1e3,
  outOfZoneSeconds: 60,
  offerTimeoutMs: 30 * 1e3,
  maxEtaSeconds: 20 * 60
};

// ../packages/contracts/src/models.ts
import { z } from "zod";
var zId = z.string().min(1);
var zTimestamp = z.number().int().nonnegative();
var zPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});
var zCartagenaPoint = zPoint.refine(
  (p) => p.lat >= CARTAGENA_BBOX.minLat && p.lat <= CARTAGENA_BBOX.maxLat && p.lng >= CARTAGENA_BBOX.minLng && p.lng <= CARTAGENA_BBOX.maxLng,
  { message: "Coordenada fuera del \xE1rea de operaci\xF3n de Cartagena (\xBFlat/lng invertidos?)" }
);
var zIncidentStatus = z.enum(INCIDENT_STATUS);
var zVehicleStatus = z.enum(VEHICLE_STATUS);
var zAssignmentStatus = z.enum(ASSIGNMENT_STATUS);
var zIncidentPriority = z.enum(INCIDENT_PRIORITY);
var zIncidentType = z.enum(INCIDENT_TYPE);
var zCapabilityLevel = z.enum(CAPABILITY_LEVEL);
var zReportSource = z.enum(REPORT_SOURCE);
var zEtaSource = z.enum(ETA_SOURCE);
var zIncidentEventType = z.enum(INCIDENT_EVENT_TYPE);
var zActorType = z.enum(ACTOR_TYPE);
var zRejectReason = z.enum(REJECT_REASON);
var zIncident = z.object({
  id: zId,
  code: z.string(),
  // 'INC-482'
  status: zIncidentStatus,
  priority: zIncidentPriority.nullable(),
  type: zIncidentType,
  lat: z.number(),
  lng: z.number(),
  address: z.string().nullable(),
  patientCount: z.number().int().min(0),
  requiredCapability: zCapabilityLevel.nullable(),
  zoneId: zId.nullable(),
  primaryReportId: zId.nullable(),
  mergedIntoIncidentId: zId.nullable(),
  createdAt: zTimestamp,
  closedAt: zTimestamp.nullable(),
  // Aditivos-opcionales (migraciones 026/027). Ausentes en clientes/tests que
  // construyen incidentes a mano; presentes cuando salen del mapper de la BD.
  /** Resumen consolidado por IA de todos los reportes. null si no hubo motor LLM. */
  aiSummary: z.string().nullable().optional(),
  aiSummaryUpdatedAt: zTimestamp.nullable().optional(),
  /** Última posición viva del ciudadano que reporta (mientras tiene /track abierto). */
  reporterLat: z.number().nullable().optional(),
  reporterLng: z.number().nullable().optional(),
  reporterLocationAt: zTimestamp.nullable().optional(),
  /** Origen sospechoso (muchos reportes en poco tiempo): no se auto-despacha. */
  suspectedAbuse: z.boolean().optional()
});
var zIncidentReport = z.object({
  id: zId,
  incidentId: zId,
  source: zReportSource,
  reporterContact: z.string().nullable(),
  description: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().nullable(),
  wasMerged: z.boolean(),
  mergeConfidence: z.number().nullable(),
  mergeReason: z.string().nullable(),
  createdAt: zTimestamp
});
var zVehicle = z.object({
  id: zId,
  orgId: zId,
  callsign: z.string(),
  status: zVehicleStatus,
  capabilityLevel: zCapabilityLevel,
  capabilities: z.array(z.string()),
  homeBaseId: zId.nullable(),
  operatingZoneId: zId.nullable(),
  currentAssignmentId: zId.nullable(),
  activeShiftId: zId.nullable(),
  isSimulated: z.boolean(),
  updatedAt: zTimestamp
});
var zVehicleLocation = z.object({
  vehicleId: zId,
  lat: z.number(),
  lng: z.number(),
  heading: z.number().nullable(),
  speedKmh: z.number().nullable(),
  recordedAt: zTimestamp
});
var zVehicleWithLocation = zVehicle.extend({
  location: zVehicleLocation.nullable(),
  isStale: z.boolean()
});
var zDispatchCandidate = z.object({
  vehicleId: zId,
  callsign: z.string(),
  rank: z.number().int().nullable(),
  etaSeconds: z.number().int(),
  distanceM: z.number().int(),
  straightLineM: z.number().int(),
  etaSource: zEtaSource,
  capabilityPenalty: z.number(),
  coveragePenalty: z.number(),
  workloadPenalty: z.number(),
  staleLocationPenalty: z.number(),
  operationalPenalty: z.number(),
  totalScore: z.number(),
  excludedReason: z.string().nullable(),
  explanation: z.string()
});
var zAssignment = z.object({
  id: zId,
  incidentId: zId,
  vehicleId: zId,
  dispatchRunId: zId.nullable(),
  status: zAssignmentStatus,
  offeredAt: zTimestamp,
  expiresAt: zTimestamp,
  respondedAt: zTimestamp.nullable(),
  rejectReason: zRejectReason.nullable(),
  enRouteAt: zTimestamp.nullable(),
  arrivedAt: zTimestamp.nullable(),
  transportStartedAt: zTimestamp.nullable(),
  destinationFacilityId: zId.nullable(),
  completedAt: zTimestamp.nullable(),
  isManualOverride: z.boolean(),
  assignedByUserId: zId.nullable()
});
var zIncidentEvent = z.object({
  id: zId,
  incidentId: zId,
  eventType: zIncidentEventType,
  actorType: zActorType,
  actorId: zId.nullable(),
  metadata: z.record(z.unknown()),
  createdAt: zTimestamp
});
var zFacility = z.object({
  id: zId,
  name: z.string(),
  type: z.enum(["HOSPITAL", "BASE", "TRAUMA_CENTER"]),
  lat: z.number(),
  lng: z.number(),
  capabilities: z.array(z.string())
});
var zZone = z.object({
  id: zId,
  name: z.string(),
  polygon: z.array(z.tuple([z.number(), z.number()])),
  // [[lat,lng],...]
  centerLat: z.number(),
  centerLng: z.number(),
  targetCoverageUnits: z.number().int(),
  populationWeight: z.number()
});
var zZoneCoverage = z.object({
  zoneId: zId,
  zoneName: z.string(),
  availableUnits: z.number().int(),
  targetUnits: z.number().int(),
  deficit: z.number().int(),
  health: z.enum(["HEALTHY", "DEGRADED", "CRITICAL"])
});

// ../packages/contracts/src/api.ts
import { z as z2 } from "zod";
var zCreateIncidentRequest = z2.object({
  type: zIncidentType,
  point: zCartagenaPoint,
  accuracyM: z2.number().optional(),
  description: z2.string().max(1e3).optional(),
  patientCount: z2.number().int().min(0).max(50).default(1),
  reporterContact: z2.string().max(120).optional(),
  source: z2.enum(["WEB", "WHATSAPP", "CALL", "SIM"]).default("WEB"),
  // Señales marcadas con botones explícitos, NO inferidas de texto libre (§24).
  signals: z2.object({
    unconscious: z2.boolean().optional(),
    notBreathing: z2.boolean().optional(),
    severeBleeding: z2.boolean().optional(),
    trapped: z2.boolean().optional()
  }).optional()
});
var zCreateIncidentResponse = z2.object({
  incident: zIncident,
  report: zIncidentReport,
  /** true ⇒ se pegó a un incidente existente. La UI dice "ya hay unidad en camino". */
  wasMerged: z2.boolean(),
  mergedIntoIncidentId: zId.nullable()
});
var zConversationTurn = z2.object({
  role: z2.enum(["user", "assistant"]),
  content: z2.string().max(2e3)
});
var zConverseResponse = z2.object({
  transcript: z2.string().max(1e3),
  reply: z2.string().max(2e3),
  /** Todos los tipos detectados por palabras clave en lo dicho hasta ahora — determinan qué protocolo(s) de primeros auxilios guiaron esta respuesta. Puede haber más de uno (p. ej. inconsciente + trauma). Transparencia, no un campo que el cliente deba usar para nada operativo (eso sigue siendo POST /incidents). */
  detectedTypes: z2.array(zIncidentType),
  /** Audio en base64 de la respuesta hablada. null si ningún proveedor de TTS está disponible — el cliente cae a la voz nativa del navegador. */
  replyAudioBase64: z2.string().nullable(),
  /** audio/mpeg (ElevenLabs) o audio/wav (Groq). null junto con replyAudioBase64. */
  replyAudioMimeType: z2.string().nullable(),
  history: z2.array(zConversationTurn)
});
var zIncidentDetailResponse = z2.object({
  incident: zIncident,
  reports: z2.array(zIncidentReport),
  assignment: zAssignment.nullable(),
  assignedVehicle: zVehicleWithLocation.nullable(),
  events: z2.array(zIncidentEvent),
  /** ETA en vivo hacia el incidente, si hay unidad en ruta. */
  liveEtaSeconds: z2.number().int().nullable()
});
var zUpdateIncidentRequest = z2.object({
  patientCount: z2.number().int().min(0).max(50).optional(),
  address: z2.string().optional(),
  requiredCapability: zCapabilityLevel.optional(),
  priority: z2.enum(["P1", "P2", "P3", "P4"]).optional(),
  // override del operador
  cancel: z2.object({ reason: z2.string() }).optional(),
  // Aditivo: el operador retira la marca de origen sospechoso (Fase F). Un
  // incidente ya revisado por un humano puede auto-despacharse de nuevo.
  clearAbuse: z2.boolean().optional()
});
var zPostLocationRequest = z2.object({
  positions: z2.array(z2.object({
    lat: z2.number(),
    lng: z2.number(),
    heading: z2.number().optional(),
    speedKmh: z2.number().optional(),
    /** Timestamp del DISPOSITIVO, no del servidor. Ver skill de A2. */
    recordedAt: z2.number().int()
  })).min(1).max(100)
});
var zUpdateVehicleStatusRequest = z2.object({
  status: zVehicleStatus
});
var zStartShiftRequest = z2.object({
  crewUserIds: z2.array(zId).default([])
});
var zDispatchRequest = z2.object({
  mode: z2.enum(["RECOMMEND", "AUTO_ASSIGN"]).default("RECOMMEND"),
  /** Si viene, se salta la recomendación. Queda auditado como MANUAL_OVERRIDE. */
  overrideVehicleId: zId.optional(),
  /** Excluidos por reintento: quien rechazó o dejó expirar. */
  excludeVehicleIds: z2.array(zId).optional()
});
var zDispatchResponse = z2.object({
  dispatchRunId: zId,
  incidentId: zId,
  strategyVersion: z2.string(),
  candidates: z2.array(zDispatchCandidate),
  excluded: z2.array(zDispatchCandidate),
  recommendedVehicleId: zId.nullable(),
  /** Por qué el #1 le ganó al #2. Generada por REGLA (§24). */
  recommendationRationale: z2.string().nullable(),
  /** Presente solo si mode=AUTO_ASSIGN u overrideVehicleId y la toma tuvo éxito. */
  assignment: zAssignment.nullable(),
  durationMs: z2.number().int(),
  computedAt: z2.number().int()
});
var zAcceptAssignmentRequest = z2.object({}).optional();
var zRejectAssignmentRequest = z2.object({
  reason: zRejectReason,
  note: z2.string().max(300).optional()
});
var zTransportRequest = z2.object({
  destinationFacilityId: zId
});
var zCompleteAssignmentRequest = z2.object({
  note: z2.string().max(500).optional()
}).optional();
var zOperationsSnapshot = z2.object({
  incidents: z2.array(zIncident),
  vehicles: z2.array(zVehicleWithLocation),
  coverage: z2.array(zZoneCoverage),
  metrics: z2.object({
    openIncidents: z2.number().int(),
    availableUnits: z2.number().int(),
    dispatchedUnits: z2.number().int(),
    avgAssignmentSeconds: z2.number().nullable(),
    avgResponseSeconds: z2.number().nullable(),
    /** La métrica que prueba la tesis del producto (§23). */
    duplicateReportsMerged: z2.number().int(),
    coverageHealth: z2.enum(["HEALTHY", "DEGRADED", "CRITICAL"])
  }),
  serverTime: z2.number().int()
});
var zApiError = z2.object({
  error: z2.object({
    code: z2.enum([
      "VALIDATION_FAILED",
      "NOT_FOUND",
      "INVALID_TRANSITION",
      // 409
      "VEHICLE_UNAVAILABLE",
      // 409 — perdiste la carrera de asignación
      "ASSIGNMENT_EXPIRED",
      // 409
      "NO_RESOURCE",
      "UNAUTHORIZED",
      // 401 — login: identificador o contraseña inválidos (genérico, anti-enumeración)
      "FORBIDDEN",
      "INTERNAL"
    ]),
    message: z2.string(),
    details: z2.record(z2.unknown()).optional()
  })
});
var SSE_TOPICS = [
  "incident:created",
  "incident:updated",
  "incident:merged",
  "vehicle:updated",
  "vehicle:location",
  "dispatch:candidates",
  "assignment:updated",
  "coverage:updated"
];
var zSseEnvelope = z2.object({
  topic: z2.enum(SSE_TOPICS),
  payload: z2.unknown(),
  emittedAt: z2.number().int()
});

// ../packages/contracts/src/audio.ts
import { z as z3 } from "zod";
var MAX_AUDIO_BYTES = 2 * 1024 * 1024;
var MAX_AUDIO_SECONDS = 60;
var zAudioReportRequest = z3.object({
  /** Audio en base64 (data URI sin el prefijo). Se guarda junto al reporte:
   *  es evidencia del incidente y permite reprocesar la transcripcion. */
  audioBase64: z3.string().min(1),
  mimeType: z3.string().default("audio/webm"),
  durationSeconds: z3.number().min(0).max(MAX_AUDIO_SECONDS),
  point: zCartagenaPoint,
  accuracyM: z3.number().optional(),
  reporterContact: z3.string().max(120).optional(),
  /** Si el navegador no pudo grabar, el ciudadano elige tipo con botones.
   *  El sistema NUNCA depende solo del audio para poder despachar. */
  fallbackType: zIncidentType.optional()
});
var zTranscriptionResult = z3.object({
  transcript: z3.string(),
  /** Idioma detectado; el reporte puede venir en español o inglés. */
  language: z3.string().nullable(),
  /** Confianza global 0-1. Por debajo del umbral se marca para revision
   *  del operador en vez de asumir que se entendio bien. */
  confidence: z3.number().min(0).max(1).nullable(),
  /** Campos estructurados propuestos por el modelo. Son SUGERENCIAS. */
  suggestedType: zIncidentType.nullable(),
  suggestedPatientCount: z3.number().int().min(0).max(50).nullable(),
  /** Señales criticas detectadas en el habla. Alimentan triage(), que es
   *  quien decide la prioridad — el modelo no la decide. */
  signals: z3.object({
    unconscious: z3.boolean().optional(),
    notBreathing: z3.boolean().optional(),
    severeBleeding: z3.boolean().optional(),
    trapped: z3.boolean().optional()
  }),
  /** Referencia de ubicacion mencionada en el audio ("frente al Éxito de
   *  Bocagrande"). No sustituye al GPS; ayuda al operador a confirmarla. */
  locationHint: z3.string().nullable(),
  /** Que motor produjo esto. Se persiste: si mañana cambiamos de proveedor,
   *  hay que poder saber que reportes se procesaron con cual. */
  engine: z3.string(),
  /** Aditivo: que combinacion de motores produjo la CLASIFICACION — 'rules' o
   *  'rules+groq:<modelo>'. Las señales/conteo que van a triage() son SIEMPRE
   *  de reglas; el LLM solo puede proponer el tipo. HOY NO se persiste: fluye
   *  en la respuesta de la API (AudioReportResponse.transcription); persistirlo
   *  es follow-up con migracion. */
  classifierEngine: z3.string().optional(),
  /** Aditivo: de donde salio `suggestedType` — 'rules' (regla auditable),
   *  'llm' (solo lo propuso el modelo — no puede pisar el `fallbackType` que
   *  eligio el ciudadano), 'none'. */
  typeSource: z3.enum(["rules", "llm", "none"]).optional()
});
var zAudioReportResponse = z3.object({
  incidentCode: z3.string(),
  incidentId: zId,
  reportId: zId,
  wasMerged: z3.boolean(),
  /** null si no habia motor de transcripcion configurado o si fallo.
   *  El incidente se crea igual: nunca se pierde un reporte por eso. */
  transcription: zTranscriptionResult.nullable(),
  /** true cuando la confianza fue baja o no hubo transcripcion: la UI pide
   *  al ciudadano que confirme el tipo con botones. */
  needsConfirmation: z3.boolean(),
  /** Token opaco para seguir el incidente sin login. */
  trackingToken: z3.string()
});
var TRACKING_STEP = [
  "RECEIVED",
  // recibimos tu reporte
  "ASSIGNING",
  // buscando la unidad mas cercana
  "ON_THE_WAY",
  // la ambulancia va en camino
  "ARRIVED",
  // llego al lugar
  "TRANSPORTING",
  // trasladando al paciente
  "COMPLETED"
];
var zTrackingVehicle = z3.object({
  callsign: z3.string(),
  capabilityLevel: z3.string(),
  lat: z3.number(),
  lng: z3.number(),
  heading: z3.number().nullable(),
  /** Momento de la ultima posicion: la UI muestra "hace 4s" para que el
   *  ciudadano sepa si el punto es fiable o esta congelado. */
  updatedAt: zTimestamp
});
var zTrackingResponse = z3.object({
  incidentCode: z3.string(),
  step: z3.enum(TRACKING_STEP),
  /** Texto ya redactado para el ciudadano. Se genera en el servidor para que
   *  las tres pantallas digan lo mismo y no se reescriba en cada cliente. */
  headline: z3.string(),
  detail: z3.string(),
  incidentLat: z3.number(),
  incidentLng: z3.number(),
  vehicle: zTrackingVehicle.nullable(),
  /** Segundos restantes estimados. null cuando aun no hay unidad asignada. */
  etaSeconds: z3.number().int().nullable(),
  /** Distancia de ruta estimada, en metros. */
  distanceM: z3.number().int().nullable(),
  /** Hitos con marca de tiempo, para la linea de tiempo del ciudadano. */
  timeline: z3.array(z3.object({
    step: z3.enum(TRACKING_STEP),
    at: zTimestamp,
    label: z3.string()
  })),
  /** Cuantos reportes se agruparon en este incidente. Se muestra como
   *  "otras 3 personas reportaron esto": le confirma al ciudadano que su
   *  aviso sirvio aunque no generara una ambulancia propia. */
  reportCount: z3.number().int(),
  /** Aditivo: ¿ya hay un teléfono de contacto guardado para este incidente?
   *  La pantalla de seguimiento lo usa para decidir si insiste con el card de
   *  "agrega tu número". */
  reporterContactOnFile: z3.boolean().optional(),
  /** Aditivo-opcional (migración 027): posición viva del ciudadano que reporta,
   *  solo si es fresca (<60s); null en cualquier otro caso. La pinta el mapa del
   *  panel de ambulancia y también el del propio ciudadano ("te vemos aquí"). */
  reporterLocation: z3.object({
    lat: z3.number(),
    lng: z3.number(),
    at: zTimestamp
  }).nullable().optional(),
  serverTime: zTimestamp
});
var zReporterLocationRequest = z3.object({
  lat: z3.number(),
  lng: z3.number(),
  accuracyM: z3.number().nonnegative().optional()
}).refine((p) => isWithinCartagena(p), {
  message: "Coordenada fuera del \xE1rea de operaci\xF3n de Cartagena (\xBFlat/lng invertidos?)"
});
var zAddReporterContactRequest = z3.object({
  phone: z3.string().trim().min(7, "N\xFAmero demasiado corto").max(120)
});

// ../packages/contracts/src/accounts.ts
import { z as z4 } from "zod";
var zCitizenRegisterRequest = z4.object({
  name: z4.string().trim().min(2).max(120),
  phone: z4.string().trim().min(7).max(30)
});
var zCitizenLoginRequest = z4.object({
  identifier: z4.string().trim().min(3).max(160),
  password: z4.string().max(100).optional()
});
var zCitizenSession = z4.object({
  id: zId,
  name: z4.string(),
  // Opcional-nullable: las cuentas nuevas no traen correo; las viejas si.
  email: z4.string().nullable().optional(),
  phone: z4.string()
});
var zCitizenRegisterResponse = z4.object({ citizen: zCitizenSession });
var zCitizenLoginResponse = z4.object({ citizen: zCitizenSession });
var zRegisterVehicleRequest = z4.object({
  plate: z4.string().trim().toUpperCase().min(4).max(12),
  callsign: z4.string().trim().min(2).max(12),
  hospitalFacilityId: z4.string().min(1),
  capabilityLevel: zCapabilityLevel.default("BLS")
});
var zRegisterVehicleResponse = z4.object({
  vehicleId: zId,
  callsign: z4.string()
});
var zStaffRole = z4.enum(["DISPATCHER", "RESPONDER", "ADMIN"]);
var zStaffSession = z4.object({
  userId: zId,
  role: zStaffRole,
  name: z4.string(),
  orgId: z4.string(),
  phone: z4.string().nullable().optional(),
  email: z4.string().nullable().optional()
});
var zStaffLoginRequest = z4.object({
  identifier: z4.string().trim().min(2).max(160),
  password: z4.string().min(1).max(100)
});
var zStaffLoginResponse = z4.object({
  staff: zStaffSession
});
var zStaffStartShiftRequest = z4.object({
  vehicleId: zId
});
var zStaffActiveShift = z4.object({
  shiftId: zId,
  vehicleId: zId,
  callsign: z4.string(),
  plate: z4.string().nullable().optional(),
  capabilityLevel: zCapabilityLevel,
  startedAt: z4.number()
});
var zStaffEmergencyHistoryItem = z4.object({
  incidentId: zId,
  code: z4.string(),
  type: z4.string(),
  status: z4.string(),
  priority: z4.string().nullable().optional(),
  address: z4.string().nullable().optional(),
  patientCount: z4.number().int().default(1),
  assignmentStatus: z4.string(),
  offeredAt: z4.number(),
  completedAt: z4.number().nullable().optional(),
  vehicleCallsign: z4.string().nullable().optional()
});
var zStaffProfileData = z4.object({
  user: zStaffSession,
  activeShift: zStaffActiveShift.nullable(),
  activeIncident: z4.object({
    id: zId,
    code: z4.string(),
    type: z4.string(),
    status: z4.string(),
    priority: z4.string().nullable().optional(),
    address: z4.string().nullable().optional(),
    patientCount: z4.number().int(),
    assignmentStatus: z4.string()
  }).nullable(),
  stats: z4.object({
    totalMissions: z4.number().int(),
    completedMissions: z4.number().int()
  })
});

// ../packages/contracts/src/mocks.ts
var MOCK_NOW = 1776e9;
function vehicle(id, callsign, status, level, zoneId, lat, lng, ageMs = 4e3) {
  return {
    id,
    orgId: "org-ems",
    callsign,
    status,
    capabilityLevel: level,
    capabilities: level === "ALS" ? ["OXYGEN", "DEFIB", "MONITOR"] : ["OXYGEN"],
    homeBaseId: "f-base-centro",
    operatingZoneId: zoneId,
    currentAssignmentId: null,
    activeShiftId: `shift-${id}`,
    isSimulated: true,
    updatedAt: MOCK_NOW - ageMs,
    location: { vehicleId: id, lat, lng, heading: 45, speedKmh: 0, recordedAt: MOCK_NOW - ageMs },
    isStale: ageMs > 6e4
  };
}
var MOCK_VEHICLES = [
  vehicle("v-a12", "A12", "AVAILABLE", "ALS", "z-centro", 10.418, -75.549),
  vehicle("v-a16", "A16", "AVAILABLE", "ALS", "z-crespo", 10.445, -75.513),
  vehicle("v-a17", "A17", "AVAILABLE", "ALS", "z-bocagrande", 10.402, -75.557),
  vehicle("v-a03", "A03", "AVAILABLE", "BLS", "z-manga", 10.4115, -75.5325),
  vehicle("v-a21", "A21", "AVAILABLE", "ALS", "z-olaya", 10.425, -75.51, 7 * 6e4),
  // GPS viejo
  vehicle("v-a08", "A08", "EN_ROUTE", "BLS", "z-boquilla", 10.475, -75.485),
  vehicle("v-m01", "M01", "AVAILABLE", "MEDICAL_MOTO", "z-centro", 10.424, -75.545),
  vehicle("v-r01", "R01", "AVAILABLE", "RESCUE", "z-centro", 10.42, -75.544)
];
var MOCK_INCIDENT = {
  id: "i-482",
  code: "INC-482",
  status: "OPEN",
  priority: "P2",
  type: "TRAFFIC_ACCIDENT",
  lat: 10.4006,
  lng: -75.556,
  address: "Av. San Mart\xEDn con Cra. 3, Bocagrande",
  patientCount: 2,
  requiredCapability: "ALS",
  zoneId: "z-bocagrande",
  primaryReportId: "r-1",
  mergedIntoIncidentId: null,
  createdAt: MOCK_NOW - 9e4,
  closedAt: null
};
function report(id, lat, lng, offset, merged, reason) {
  return {
    id,
    incidentId: "i-482",
    source: "WEB",
    reporterContact: null,
    description: "Choque entre dos carros, hay personas heridas",
    lat,
    lng,
    accuracyM: 25,
    wasMerged: merged,
    mergeConfidence: merged ? 0.94 : null,
    mergeReason: reason,
    createdAt: MOCK_NOW - 9e4 + offset
  };
}
var MOCK_REPORTS = [
  report("r-1", 10.4006, -75.556, 0, false, null),
  report("r-2", 10.4008, -75.5558, 12e3, true, "A 28m y 12s del reporte primario, tipo compatible"),
  report("r-3", 10.4004, -75.5563, 31e3, true, "A 41m y 31s del reporte primario, tipo compatible"),
  report("r-4", 10.4009, -75.5555, 48e3, true, "A 63m y 48s del reporte primario, tipo compatible")
];
function candidate(vehicleId, callsign, rank, eta, coverage, capability = 0, stale = 0, operational = 0, excluded = null, explanation = "") {
  return {
    vehicleId,
    callsign,
    rank,
    etaSeconds: eta,
    distanceM: Math.round(eta / 3600 * 40 * 1e3),
    straightLineM: Math.round(eta / 3600 * 40 * 1e3 / 1.35),
    etaSource: "HAVERSINE_URBAN",
    capabilityPenalty: capability,
    coveragePenalty: coverage,
    workloadPenalty: 0,
    staleLocationPenalty: stale,
    operationalPenalty: operational,
    totalScore: eta + capability + coverage + stale + operational,
    excludedReason: excluded,
    explanation
  };
}
var MOCK_DISPATCH_RESPONSE = {
  dispatchRunId: "dr-001",
  incidentId: "i-482",
  strategyVersion: "v1",
  candidates: [
    candidate("v-a12", "A12", 1, 252, 20, 0, 0, 0, null, "ETA 4m12s + cobertura 20s = 4m32s"),
    candidate("v-a16", "A16", 2, 221, 120, 0, 0, 0, null, "ETA 3m41s + cobertura 2m00s = 5m41s \u2014 \xFAnica unidad libre en Crespo"),
    candidate("v-r01", "R01", 3, 300, 20, 45, 0, 0, null, "ETA 5m00s + capacidad 45s + cobertura 20s = 6m05s")
  ],
  excluded: [
    candidate("v-a03", "A03", null, 180, 0, 0, 0, 0, "INSUFFICIENT_CAPABILITY", "BLS no cubre el requisito ALS del incidente"),
    candidate("v-a21", "A21", null, 260, 0, 0, 0, 0, "LOCATION_TOO_STALE", "\xDAltima posici\xF3n GPS hace 7 min (corte: 5 min)"),
    candidate("v-a08", "A08", null, 0, 0, 0, 0, 0, "NOT_AVAILABLE", "En ruta a otro incidente")
  ],
  recommendedVehicleId: "v-a12",
  recommendationRationale: "A16 llega 31s antes, pero es la \xFAnica unidad libre en Crespo y sacarla deja esa zona sin cobertura ~12 min. Por eso se recomienda A12.",
  assignment: null,
  durationMs: 8,
  computedAt: MOCK_NOW
};
var MOCK_ASSIGNMENT = {
  id: "as-001",
  incidentId: "i-482",
  vehicleId: "v-a12",
  dispatchRunId: "dr-001",
  status: "OFFERED",
  offeredAt: MOCK_NOW,
  expiresAt: MOCK_NOW + 3e4,
  respondedAt: null,
  rejectReason: null,
  enRouteAt: null,
  arrivedAt: null,
  transportStartedAt: null,
  destinationFacilityId: null,
  completedAt: null,
  isManualOverride: false,
  assignedByUserId: null
};
function event(id, type, actor, offset, metadata = {}) {
  return { id, incidentId: "i-482", eventType: type, actorType: actor, actorId: null, metadata, createdAt: MOCK_NOW - 9e4 + offset };
}
var MOCK_EVENTS = [
  event("e-1", "INCIDENT_CREATED", "REPORTER", 0, { code: "INC-482" }),
  event("e-2", "PRIORITY_SET", "SYSTEM", 200, { priority: "P2", ruleId: "R07_TRAFFIC_MULTI" }),
  event("e-3", "REPORT_MERGED", "SYSTEM", 12e3, { reportId: "r-2", confidence: 0.94 }),
  event("e-4", "REPORT_MERGED", "SYSTEM", 31e3, { reportId: "r-3", confidence: 0.91 }),
  event("e-5", "REPORT_MERGED", "SYSTEM", 48e3, { reportId: "r-4", confidence: 0.89 }),
  event("e-6", "DISPATCH_STARTED", "DISPATCHER", 6e4, { dispatchRunId: "dr-001" }),
  event("e-7", "CANDIDATES_CALCULATED", "SYSTEM", 60100, { candidates: 3, excluded: 3 }),
  event("e-8", "VEHICLE_RECOMMENDED", "SYSTEM", 60150, { vehicleId: "v-a12", score: 272 })
];

// src/app.ts
import cors from "cors";
import express from "express";
import multer, { MulterError } from "multer";
import { z as z5 } from "zod";

// src/errors.ts
var HttpError = class extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "HttpError";
  }
};
function toApiError(error) {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message, ...error.details ? { details: error.details } : {} } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL", message: "Error interno del servicio de audio" } } };
}

// src/modules/incidents/firstAid.ts
var FIRST_AID_PROTOCOLS = {
  TRAFFIC_ACCIDENT: {
    haz: [
      "No mover a la persona salvo peligro inmediato (fuego, tr\xE1fico).",
      "Se\xF1alizar la escena si es seguro hacerlo.",
      "Si hay sangrado, presi\xF3n firme con un pa\xF1o limpio.",
      "Abrigarla y hablarle con calma para mantenerla despierta."
    ],
    evita: [
      "No quitar el casco a un motociclista salvo que no respire.",
      "No dar de comer ni beber.",
      "No mover el cuello ni la espalda."
    ],
    se\u00F1alesDeAlarma: ["p\xE9rdida de consciencia", "dificultad para respirar", "sangrado que no para con presi\xF3n"]
  },
  CARDIAC: {
    haz: [
      "Sentarla en posici\xF3n c\xF3moda, semi-sentada.",
      "Aflojar ropa ajustada al cuello o pecho.",
      "Mantener la calma y no dejarla sola.",
      "Si sabe hacer RCP y la persona deja de responder y no respira con normalidad, iniciarla."
    ],
    evita: ["No darle de comer ni beber.", "No dejarla sola en ning\xFAn momento."],
    se\u00F1alesDeAlarma: ["p\xE9rdida de consciencia", "deja de respirar con normalidad"]
  },
  UNCONSCIOUS: {
    haz: [
      "Verificar si respira, acercando o\xEDdo y mejilla a su boca.",
      "Si respira, colocarla de lado (posici\xF3n lateral de seguridad) para que no se ahogue si vomita.",
      "Si sabe hacer RCP y no respira, iniciarla de inmediato."
    ],
    evita: ["No darle nada de comer ni beber.", "No dejarla boca arriba si hay riesgo de v\xF3mito."],
    se\u00F1alesDeAlarma: ["deja de respirar", "convulsiones"]
  },
  FALL: {
    haz: [
      "Mantenerla quieta si hay sospecha de lesi\xF3n en cuello, espalda o cadera (dolor intenso, no puede mover una extremidad).",
      "Abrigarla y hablarle con calma.",
      "Si hay sangrado, presi\xF3n firme con un pa\xF1o limpio."
    ],
    evita: ["No enderezar una extremidad deformada.", "No forzarla a levantarse o caminar."],
    se\u00F1alesDeAlarma: ["no puede mover brazos o piernas", "dolor intenso en cuello o espalda", "p\xE9rdida de consciencia"]
  },
  TRAUMA: {
    haz: [
      "Presi\xF3n firme y constante sobre la herida con un pa\xF1o limpio.",
      "Si el pa\xF1o se empapa, poner otro encima sin retirar el primero.",
      "Elevar la zona afectada si es posible.",
      "Mantenerla abrigada y calmada."
    ],
    evita: [
      "No quitar objetos clavados o empalados \u2014 dejarlos y evitar que se muevan.",
      "No usar torniquete salvo saber hacerlo y que el sangrado sea masivo e incontrolable."
    ],
    se\u00F1alesDeAlarma: ["sangrado que no se controla con presi\xF3n", "palidez extrema", "p\xE9rdida de consciencia"]
  },
  RESPIRATORY: {
    haz: [
      "Ayudarla a sentarse derecha \u2014 facilita respirar.",
      "Aflojar ropa ajustada al cuello o pecho.",
      "Hablar despacio y mantener la calma.",
      "Si tiene inhalador recetado, ayudarla a usarlo."
    ],
    evita: ["No acostarla.", "No dejarla sola."],
    se\u00F1alesDeAlarma: ["labios o piel azulada", "no puede hablar por falta de aire", "p\xE9rdida de consciencia"]
  },
  OBSTETRIC: {
    haz: [
      "Mantenerla c\xF3moda, preferiblemente recostada de lado izquierdo.",
      "Si el parto parece inminente, tener pa\xF1os limpios a mano y mantener la calma.",
      "Si el beb\xE9 empieza a nacer, dejar que salga solo y sostenerlo con cuidado."
    ],
    evita: ["No tirar del beb\xE9.", "No darle de comer.", 'No cruzarle las piernas para "retener" el parto.'],
    se\u00F1alesDeAlarma: ["sangrado abundante", "el beb\xE9 nace antes de que llegue la ambulancia"]
  },
  OTHER: {
    haz: [
      "Mantener la calma y verificar si la persona responde y respira con normalidad.",
      "Mantenerla segura, c\xF3moda y abrigada."
    ],
    evita: ["No moverla innecesariamente."],
    se\u00F1alesDeAlarma: ["p\xE9rdida de consciencia", "dificultad para respirar"]
  }
};
function formatOne(type) {
  const p = FIRST_AID_PROTOCOLS[type];
  return [
    `\xB7 ${type} \u2014 Haz: ${p.haz.join(" ")}`,
    `  Evita: ${p.evita.join(" ")}`,
    `  Se\xF1ales de alarma: ${p.se\u00F1alesDeAlarma.join(", ")}.`
  ].join("\n");
}
function formatFirstAidProtocols(types) {
  if (types.length === 0) return "";
  const hasTrauma = types.includes("TRAUMA");
  const ordered = [...types].sort((a, b) => a === "TRAUMA" ? -1 : b === "TRAUMA" ? 1 : 0);
  const header = types.length > 1 ? "Esta emergencia calza con m\xE1s de un tipo a la vez \u2014 dales atenci\xF3n a TODOS, no ignores ninguno por atender otro. Si hay control de sangrado pendiente, es la prioridad sobre cualquier otra instrucci\xF3n." : "B\xE1sate en esto, no inventes procedimientos distintos.";
  const traumaDirective = hasTrauma ? "TRAUMA est\xE1 presente: da la instrucci\xF3n de control de sangrado (presi\xF3n firme) como tu PRIMERA frase, de forma directa. No preguntes primero si est\xE1 sangrando para decidir si la das \u2014 en una herida grave o amputaci\xF3n se asume que s\xED y se act\xFAa." : null;
  return [
    `Contexto m\xE9dico de referencia para esta emergencia:`,
    header,
    ...traumaDirective ? [traumaDirective] : [],
    ...ordered.map(formatOne)
  ].join("\n");
}

// src/modules/incidents/voice.ts
var GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
var GROQ_MODEL = "whisper-large-v3-turbo";
var HALLUCINATION_PATTERNS = [
  /^[\s.,!¡¿?…-]*$/,
  /^¡?\s*(muchas\s+)?gracias(\s+por\s+ver(\s+el\s+v[ií]deo)?)?\s*!?\.?$/i,
  /^gracias\s+por\s+(ver|acompañarnos|su\s+atención).*$/i,
  /^subt[ií]tulos?\s+(realizados?\s+por|por\s+la\s+comunidad).*$/i,
  /^subt[ií]tulos?\s+(hechos?\s+)?por\s+.*amara\.org.*$/i,
  /^(¡?\s*)?suscr[ií]b(ete|anse)(\s+al\s+canal)?\s*!?\.?$/i,
  /^(nos\s+vemos|hasta\s+(la\s+)?pr[óo]xima|hasta\s+luego)\s*\.?$/i
];
function isLikelyHallucination(text) {
  return HALLUCINATION_PATTERNS.some((re) => re.test(text));
}
async function transcribeAudio(buffer, mimeType, filename) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new HttpError(500, "INTERNAL", "Transcripci\xF3n de audio no configurada (falta GROQ_API_KEY)");
  const form = new FormData();
  form.set("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), filename);
  form.set("model", GROQ_MODEL);
  form.set("language", "es");
  form.set("response_format", "json");
  const response = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!response.ok) {
    throw new HttpError(502, "INTERNAL", `El servicio de transcripci\xF3n fall\xF3 (${response.status})`);
  }
  const payload = await response.json();
  const text = (payload.text ?? "").trim();
  if (!text || isLikelyHallucination(text)) {
    throw new HttpError(422, "VALIDATION_FAILED", "No te escuchamos bien. Mant\xE9n el bot\xF3n pulsado y habla cerca del micr\xF3fono.");
  }
  return text.slice(0, 1e3);
}
var TYPE_KEYWORDS = {
  TRAFFIC_ACCIDENT: [
    "choque",
    "accidente",
    "atropell",
    "volc\xF3",
    "volco",
    "colisi\xF3n",
    "colision",
    "moto",
    "carro",
    "atropello",
    // Costeño / coloquial ("moto"/"carro" ya cubren "moto contra" y "mototaxi").
    "se llev\xF3 por delante",
    "se llevo por delante",
    "buseta"
  ],
  CARDIAC: [
    "dolor de pecho",
    "infarto",
    "coraz\xF3n",
    "corazon",
    "paro cardiaco",
    "paro card\xEDaco",
    // Costeño / coloquial. `classifyAllIncidentTypes` NO normaliza tildes: se
    // listan ambas formas.
    "le dio algo en el pecho",
    "se agarra el pecho",
    "se agarr\xF3 el pecho",
    "se agarro el pecho",
    "se cogi\xF3 el pecho",
    "se cogio el pecho"
  ],
  UNCONSCIOUS: [
    "inconsciente",
    "no responde",
    "desmay\xF3",
    "desmayo",
    "no reacciona",
    // Costeño / coloquial. Sin "está botado" a secas ("el poste está botado en
    // la vía" no es una persona) — se exige el lugar. Con y sin tilde.
    "se priv\xF3",
    "se privo",
    "patat\xFAs",
    "patatus",
    "botado en el piso",
    "botado en el suelo",
    "botado en el anden",
    "botado en el and\xE9n",
    "no se despierta",
    "se qued\xF3 tieso",
    "se quedo tieso"
  ],
  FALL: ["ca\xEDda", "caida", "se cay\xF3", "se cayo", "cay\xF3 de", "cayo de"],
  // Incluye amputación/sangrado catastrófico — nunca debe perderse frente a
  // otro tipo detectado antes en la conversación (ver classifyAllIncidentTypes).
  TRAUMA: [
    "herida",
    "herido",
    "sangr",
    "golpe",
    "corte",
    "apu\xF1al",
    "disparo",
    "bala",
    "amputa",
    "sin pierna",
    "sin piernas",
    "sin brazo",
    "sin brazos",
    "perdi\xF3 la pierna",
    "perdi\xF3 el brazo",
    "le cort\xF3",
    "le cortaron",
    // Costeño / coloquial: "lo chuzaron", "lo pincharon" (≠ "pincharon la
    // llanta"), "le metieron un cuchillo", "lo pelaron" ('sangr' ya cubre
    // "sangra a chorro" / "botando sangre").
    "chuzaron",
    "lo chuzo",
    "me chuzo",
    "lo pincharon",
    "me pincharon",
    "le metieron un cuchillo",
    "lo pelaron",
    "me pelaron"
  ],
  RESPIRATORY: [
    "no puede respirar",
    "ahog",
    "asfixi",
    "falta de aire",
    "respiraci\xF3n",
    "respiracion",
    // Costeño / coloquial ("se está ahogando" ya lo cubre 'ahog').
    "no coge aire",
    "no le entra el aire"
  ],
  OBSTETRIC: ["embarazada", "parto", "contraccion", "contracci\xF3n", "dando a luz"]
};
function classifyAllIncidentTypes(text) {
  const normalized = text.toLowerCase();
  const matches = [];
  for (const type of INCIDENT_TYPE) {
    if (type === "OTHER") continue;
    const keywords = TYPE_KEYWORDS[type];
    if (keywords.some((keyword) => normalized.includes(keyword))) matches.push(type);
  }
  return matches;
}

// src/modules/incidents/conversation.ts
var GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
var GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b";
var GROQ_CHAT_MAX_TOKENS = 200;
var CALL_SYSTEM_PROMPT = `Eres un asistente de voz que acompa\xF1a a un ciudadano que est\xE1 reportando una emergencia en Cartagena, Colombia, mientras espera la ambulancia. Hablas como un operador de emergencias calmado y claro, en espa\xF1ol, en oraciones cortas \u2014 esto se lee en voz alta, no se lee como texto.

Tu funci\xF3n:
- Dar instrucciones b\xE1sicas y seguras de qu\xE9 hacer MIENTRAS llega la ayuda, basadas en el contexto m\xE9dico de referencia que se te da a continuaci\xF3n si lo hay \u2014 no improvises un procedimiento distinto al de esa referencia.
- Si el reportero menciona una lesi\xF3n grave nueva (sangrado severo, amputaci\xF3n, no respira), esa pasa a ser tu prioridad inmediata en la siguiente respuesta \u2014 nunca la minimices ni la dejes "para despu\xE9s" con frases como "eso no es importante ahora" o "no se preocupe por eso". Reconoce la gravedad y da la instrucci\xF3n correspondiente primero.
- Hacer como m\xE1ximo UNA pregunta de seguimiento breve si falta informaci\xF3n cr\xEDtica (\xBFest\xE1 consciente?, \xBFrespira?, \xBFhay m\xE1s heridos?).
- Mantener la calma del reportero con un tono breve y humano \u2014 calma no es lo mismo que minimizar.

Lo que NUNCA haces:
- Nunca das un diagn\xF3stico m\xE9dico ni nombras una enfermedad.
- Nunca decides ni mencionas la prioridad de la emergencia \u2014 eso lo decide el sistema con reglas expl\xEDcitas, no t\xFA.
- Nunca prometes ni sugieres que la ayuda "ya viene", "est\xE1 en camino", "llegar\xE1 pronto/enseguida" ni das tiempos de llegada de ning\xFAn tipo \u2014 no los conoces. Si el reportero pregunta cu\xE1nto falta, dile que no lo sabes y que se concentre en lo que puede hacer ahora.
- Si hay riesgo vital inmediato, recuerda con calma llamar tambi\xE9n al 123 si a\xFAn no lo han hecho.

Responde en 1-3 frases cortas, en espa\xF1ol, sin markdown ni listas.`;
function prepareTurn(userMessage, history) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new HttpError(500, "INTERNAL", "Conversaci\xF3n no configurada (falta GROQ_API_KEY)");
  const allUserText = [...history.filter((turn) => turn.role === "user").map((turn) => turn.content), userMessage].join(" ");
  const detectedTypes = classifyAllIncidentTypes(allUserText);
  const systemPrompt = detectedTypes.length > 0 ? `${CALL_SYSTEM_PROMPT}

${formatFirstAidProtocols(detectedTypes)}` : CALL_SYSTEM_PROMPT;
  return {
    apiKey,
    detectedTypes,
    messages: [
      { role: "system", content: systemPrompt },
      // Suficiente memoria para una llamada de emergencia corta, sin dejar crecer el prompt sin límite.
      ...history.slice(-12).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: userMessage }
    ]
  };
}
async function converseTurn(userMessage, history) {
  const { apiKey, messages, detectedTypes } = prepareTurn(userMessage, history);
  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GROQ_CHAT_MODEL, temperature: 0.4, max_tokens: GROQ_CHAT_MAX_TOKENS, messages })
  });
  if (!response.ok) throw new HttpError(502, "INTERNAL", `El asistente de voz fall\xF3 (${response.status})`);
  const payload = await response.json();
  const reply = payload.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new HttpError(502, "INTERNAL", "El asistente de voz no respondi\xF3");
  return { reply: reply.slice(0, 2e3), detectedTypes };
}
async function streamConverseTurn(userMessage, history, onDelta) {
  const { apiKey, messages, detectedTypes } = prepareTurn(userMessage, history);
  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_CHAT_MODEL,
      temperature: 0.4,
      max_tokens: GROQ_CHAT_MAX_TOKENS,
      messages,
      stream: true
    })
  });
  if (!response.ok) throw new HttpError(502, "INTERNAL", `El asistente de voz fall\xF3 (${response.status})`);
  if (!response.body) throw new HttpError(502, "INTERNAL", "El asistente de voz no respondi\xF3");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          reply += delta;
          onDelta(delta);
        }
      } catch {
      }
    }
  }
  const trimmed = reply.trim();
  if (!trimmed) throw new HttpError(502, "INTERNAL", "El asistente de voz no respondi\xF3");
  return { reply: trimmed.slice(0, 2e3), detectedTypes };
}
var SPEAKABLE_BOUNDARY = /* @__PURE__ */ new Set([".", "!", "?", "\u2026", ";", ":", "\n"]);
function splitSpeakable(pending, minChars, maxChars = 220) {
  for (let i = 0; i < pending.length; i += 1) {
    if (!SPEAKABLE_BOUNDARY.has(pending[i] ?? "")) continue;
    if (/\d/.test(pending[i - 1] ?? "") && /\d/.test(pending[i + 1] ?? "")) continue;
    const chunk = pending.slice(0, i + 1).trim();
    if (chunk.length < minChars) continue;
    return { chunk, rest: pending.slice(i + 1) };
  }
  if (pending.length > maxChars) {
    const space = pending.lastIndexOf(" ", maxChars);
    const at = space > minChars ? space : maxChars;
    return { chunk: pending.slice(0, at).trim(), rest: pending.slice(at) };
  }
  return null;
}
var ELEVENLABS_TTS_URL = (voiceId) => `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
var ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
var ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
async function synthesizeWithElevenLabs(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch(ELEVENLABS_TTS_URL(ELEVENLABS_VOICE_ID), {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL })
    });
    if (!response.ok) return null;
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: "audio/mpeg" };
  } catch {
    return null;
  }
}
var GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
var GROQ_TTS_MODEL = process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english";
var GROQ_TTS_VOICE = process.env.GROQ_TTS_VOICE || "tara";
async function synthesizeWithGroq(text) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch(GROQ_TTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: GROQ_TTS_MODEL, voice: GROQ_TTS_VOICE, input: text, response_format: "wav" })
    });
    if (!response.ok) return null;
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: "audio/wav" };
  } catch {
    return null;
  }
}
async function synthesizeSpeech(text) {
  return await synthesizeWithElevenLabs(text) ?? await synthesizeWithGroq(text);
}

// src/app.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var MAX_AUDIO_BYTES2 = 8 * 1024 * 1024;
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES2 } });
var app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "../public")));
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "audio-service" });
});
app.get("/", (_req, res) => {
  res.json({
    service: "audio-service",
    endpoints: {
      "GET /health": "estado del servicio",
      "GET /test.html": "p\xE1gina manual para probar la llamada con la IA",
      "POST /api/incidents/converse": "multipart: campos `audio` + `history` (JSON) \u2192 { transcript, reply, replyAudioBase64, history }",
      "POST /api/incidents/converse/stream": "igual, pero NDJSON en vivo: {transcript} \u2192 {reply} por frase \u2192 {audio} por frase \u2192 {done}. Es el que usa la app: se oye la primera frase sin esperar a la \xFAltima."
    }
  });
});
function parseHistory(raw) {
  const text = typeof raw === "string" ? raw : "[]";
  try {
    return z5.array(zConversationTurn).parse(JSON.parse(text));
  } catch {
    throw new HttpError(400, "VALIDATION_FAILED", "`history` debe ser JSON v\xE1lido: [{role, content}]");
  }
}
function requireAudio(req) {
  if (!req.file || req.file.size === 0) {
    throw new HttpError(400, "VALIDATION_FAILED", "Falta el archivo de audio (`audio`)");
  }
  return req.file;
}
app.post("/api/incidents/converse/stream", upload.single("audio"), async (req, res) => {
  let streaming = false;
  const write = (event2) => {
    res.write(`${JSON.stringify(event2)}
`);
  };
  try {
    const file = requireAudio(req);
    const history = parseHistory(req.body?.history);
    const transcript = await transcribeAudio(file.buffer, file.mimetype, file.originalname || "turno.webm");
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    streaming = true;
    write({ type: "transcript", text: transcript });
    let writes = Promise.resolve();
    const speak = (text) => {
      const pending = synthesizeSpeech(text);
      writes = writes.then(async () => {
        const audio = await pending;
        write({
          type: "audio",
          text,
          base64: audio ? audio.buffer.toString("base64") : null,
          mimeType: audio ? audio.mimeType : null
        });
      });
    };
    let buffered = "";
    let spokenChunks = 0;
    const drain = () => {
      for (; ; ) {
        const cut = splitSpeakable(buffered, spokenChunks === 0 ? 24 : 90);
        if (!cut) return;
        buffered = cut.rest;
        spokenChunks += 1;
        write({ type: "reply", text: cut.chunk });
        speak(cut.chunk);
      }
    };
    const { reply, detectedTypes } = await streamConverseTurn(transcript, history, (delta) => {
      buffered += delta;
      drain();
    });
    const tail = buffered.trim();
    if (tail) {
      write({ type: "reply", text: tail });
      speak(tail);
    }
    await writes;
    write({
      type: "done",
      reply,
      detectedTypes,
      history: [...history, { role: "user", content: transcript }, { role: "assistant", content: reply }]
    });
    res.end();
  } catch (error) {
    const mapped = toApiError(error);
    if (streaming) {
      write({ type: "error", message: mapped.body.error.message });
      res.end();
      return;
    }
    res.status(mapped.status).json(mapped.body);
  }
});
app.post("/api/incidents/converse", upload.single("audio"), async (req, res) => {
  try {
    const file = requireAudio(req);
    const history = parseHistory(req.body?.history);
    const transcript = await transcribeAudio(file.buffer, file.mimetype, file.originalname || "turno.webm");
    const { reply, detectedTypes } = await converseTurn(transcript, history);
    const replyAudio = await synthesizeSpeech(reply);
    res.json(zConverseResponse.parse({
      transcript,
      reply,
      detectedTypes,
      replyAudioBase64: replyAudio ? replyAudio.buffer.toString("base64") : null,
      replyAudioMimeType: replyAudio ? replyAudio.mimeType : null,
      history: [...history, { role: "user", content: transcript }, { role: "assistant", content: reply }]
    }));
  } catch (error) {
    const mapped = toApiError(error);
    res.status(mapped.status).json(mapped.body);
  }
});
app.use((error, _req, res, _next) => {
  if (error instanceof MulterError) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "El audio es demasiado largo o el campo es inv\xE1lido" } });
    return;
  }
  const mapped = toApiError(error);
  res.status(mapped.status).json(mapped.body);
});
var app_default = app;
export {
  app_default as default
};
