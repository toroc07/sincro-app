/**
 * Extraccion de campos estructurados a partir del transcript.
 *
 * POR REGLAS, NO POR LLM. Tres razones, en orden de importancia:
 *
 *  1. Auditable. Un operador puede preguntar "¿por que marcaste esto como
 *     cardiaco?" y la respuesta es una regla con nombre, no un embedding.
 *  2. Determinista. La demo da el mismo resultado todas las veces.
 *  3. Sin dependencias. Funciona aunque no haya ninguna API key configurada,
 *     que es exactamente el escenario del dia del hackathon.
 *
 * Un LLM puede AFINAR esto despues (ver enrichWithModel), pero el camino
 * critico no depende de el. Y en ningun caso decide la PRIORIDAD: eso sale de
 * la tabla de triage, que recibe estas señales como entrada.
 */

import type { IncidentType, TranscriptionResult } from '@dispatch/contracts';

/** Normaliza para comparar: minusculas y sin tildes. Quien habla bajo estres
 *  no dicta con ortografia, y el transcriptor tampoco acentua de forma fiable. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

interface TypeRule {
  type: IncidentType;
  /** Se evaluan en orden: gana la primera con match. */
  patterns: RegExp[];
}

/**
 * Orden deliberado: lo mas especifico y mas grave primero. "choque con un
 * herido inconsciente" debe clasificar como accidente de transito (el
 * mecanismo), no como inconsciencia aislada — el mecanismo determina que
 * recurso enviar.
 */
const TYPE_RULES: readonly TypeRule[] = [
  {
    type: 'TRAFFIC_ACCIDENT',
    patterns: [
      /\b(choque|choco|chocaron|accidente de (transito|trafico)|colision|colisionaron)\b/,
      /\b(atropell(o|aron|ado|ada))\b/,
      /\b(volc(o|aron|ado)|se volteo)\b/,
      /\b(moto|carro|camion|bus|taxi|vehiculo)\b.*\b(choc|estrell|accident)/,
      // Costeño: "una moto contra un bus", "se lo llevo por delante".
      /\b(moto|carro|camion|bus|buseta|taxi|mototaxi|vehiculo)\s+contra\b/,
      /\bse (lo|la|los|las|me|te)\s+llevo por delante\b/,
    ],
  },
  {
    type: 'CARDIAC',
    patterns: [
      /\b(infarto|paro cardiaco|ataque al corazon|del corazon)\b/,
      // Corta en la frontera de clausula (coma / "y" / punto): "dolor ... hasta
      // el pecho" (irradiado) SI, "dolor en la pierna y raspones en el pecho"
      // NO. El sobre-triaje es el error tolerable en EMS; el sub-triaje de un
      // P1 no — por eso NO se acota por distancia.
      /\b(dolor|duele|opresion|aprieta|apretando|apreta)\b(?:\s+(?!y\b)[^\s,.;]+)*?\s+(en (el |la )?)?pecho\b/,
      /\bpecho\b.*\b(dolor|duele|aprieta|apretando)\b/,
      // Costeño: "le dio algo en el pecho", "se agarra el pecho". Ventana corta
      // (0-4 palabras): no unir "pecho" con un "algo"/"agarró" de otra frase.
      /\ble dio algo\b(?:\s+\S+){0,4}\s+pecho\b/,
      /\bse (agarr(a|o)|coge|cogio|sujeta)\b(?:\s+\S+){0,4}\s+pecho\b/,
    ],
  },
  {
    type: 'RESPIRATORY',
    patterns: [
      /\b(no puede respirar|le falta el aire|dificultad para respirar)\b/,
      /\basma\b/,
      // Stems: "asfixia", "asfixiando", "atragantado", "ahoga", "ahogandose".
      /\b(asfixi|atragant|ahog)/,
      // Costeño: "no coge aire", "no le entra el aire" ("se esta ahogando" ya
      // lo cubre `ahog`). Frases CONTIGUAS: no unir un "no" lejano con "aire".
      /\bno (le entra el aire|le entra aire|coge aire|coje aire|entra aire)\b/,
    ],
  },
  {
    type: 'OBSTETRIC',
    patterns: [
      /\b(embarazada|parto|dando a luz|contracciones|rompio fuente)\b/,
    ],
  },
  {
    type: 'FALL',
    patterns: [
      /\b(se cayo|se callo|caida|cayo de|se resbalo|rodo por)\b/,
    ],
  },
  {
    type: 'UNCONSCIOUS',
    patterns: [
      /\b(inconsciente|no responde|perdio el conocimiento)\b/,
      /\bdesmay/,
      /\b(no reacciona|esta tirad(o|a) en el piso)\b/,
      // Costeño: "se privo", "le dio el patatus", "esta botado en el piso".
      /\bse privo\b/,
      /\bpatatus\b/,
      // "botado" exige sujeto + lugar CERCA (0-4 palabras). Sin "calle" (choca
      // con cualquier direccion de Cartagena) y sin `.*` que una frases sueltas.
      /\b(esta|estan|estaba|quedo|quedaron|dejaron)\s+botad[oa]s?\b(?:\s+\S+){0,4}\s+(en (el |la )?)?(piso|suelo|anden|acera)\b/,
    ],
  },
  {
    type: 'TRAUMA',
    patterns: [
      // Stems SIN `\b` de cierre: matchean flexiones ("apunalaron", "heridos",
      // "fracturado", "golpearon"). Patrones SIN ñ: `normalize()` descompone la
      // ñ y le quita la tilde (queda "n").
      /\b(apunal|punalad|balaz|herid|fractur|golpe)/,
      // Flexiones explicitas: "dispar" a secas matchea "disparate"/"disparejo".
      /\bdispar(o|os|a|an|aron|amos|aban|ando|aran|ado|ada|ados|adas|en)\b/,
      // "corto"/"quemo" exigen NO ser infraestructura: "se corto la luz", "se
      // quemo el transformador" son habla diaria en Cartagena y no son trauma.
      /\b(le|se|lo|me|te|nos) cort(o|aron|aba)\b(?!\s+(el |la |del )?(luz|agua|internet|senal|servicio|corriente|llamada|linea|telefono|pelo|cabello|calle|via|trabajo|comida|arroz|torta|leche))/,
      /\b(corte profundo|cortada profunda|cortada en (el |la )?(brazo|pierna|mano|dedo|cara|cuello|cabeza|frente|pie)|herida cortante)\b/,
      /\bquemadura/,
      /\bquemad[oa]s?\b(?:\s+\S+){0,3}\s+(la |el |todo |toda |del |de la )?(cara|cuerpo|brazo|pierna|mano|espalda|piel|lado|cuello|pecho)\b/,
      /\b(se|me|lo|la|te|nos) quem(o|aron)\b(?!\s+(el |la )?(transformador|poste|carro|moto|monte|pasto|basura|comida|arroz|olla|motor))/,
      /\b(herida de bala|machete|punal)\b/,
      // Costeño: "lo chuzaron", "lo pincharon" (≠ "pincharon la llanta"),
      // "le metieron un cuchillo", "lo pelaron", "sangra a chorro".
      /\b(chuzaron|chuzando|lo chuzo|me chuzo|lo pincharon|me pincharon|lo pincho|me pincho)\b/,
      /\ble metieron (un |el )?(cuchillo|punal|navaja|pica)\b/,
      /\b(lo|la|me|te|se lo|se la)\s+pelaron\b/,
      /\b(sangra a chorro|chorro de sangre|botando (mucha )?sangre)\b/,
    ],
  },
];

/** Señales criticas. Alimentan triage(), que decide la prioridad. */
const SIGNAL_RULES = {
  notBreathing: [
    /\b(no (esta )?respira(ndo)?|dejo de respirar|no respira)\b/,
    /\b(sin respiracion|no le sale el aire)\b/,
  ],
  unconscious: [
    /\b(inconsciente|no responde|no reacciona|perdio el conocimiento)\b/,
    /\bdesmay/,
    /\b(esta como muert[oa]|no se mueve)\b/,
    // Costeño: "no se despierta", "se quedo tieso".
    /\bno (se despierta|despierta)\b/,
    /\b(se quedo|quedo|se puso) ties[oa]\b/,
  ],
  severeBleeding: [
    /\b(sangra mucho|mucha sangre|hemorragia|sangrando much[oa]|no para de sangrar)\b/,
    /\b(esta lleno de sangre|perdiendo sangre)\b/,
    // Costeño: "sangra a chorro", "botando mucha sangre", "charco de sangre".
    // "botando sangre" a secas NO es señal (puede ser epistaxis) — solo es
    // patron de TIPO trauma, no de hemorragia catastrofica.
    /\b(sangra a chorro|chorro de sangre|botando mucha sangre|charco de sangre)\b/,
  ],
  trapped: [
    // Stems: "atrapado", "atrapados", "prensada", "aprisionado".
    /\b(atrapad|prensad|aprisionad)/,
    /\b(no puede salir|esta debajo del)\b/,
    /\b(quedo dentro del (carro|vehiculo|auto))\b/,
  ],
} as const;

/** Numeros hablados. La gente dice "dos heridos", no "2". */
const SPOKEN_NUMBERS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/**
 * Cuenta de pacientes. Conservador a proposito: ante la duda devuelve null y
 * deja que el valor por defecto (1) aplique, en vez de inventar un numero que
 * dispararia una respuesta de incidente masivo.
 */
export function extractPatientCount(normalized: string): number | null {
  const victimWord = '(herid[oa]s?|lesionad[oa]s?|pacientes?|personas?|victimas?|gente)';

  const digits = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+${victimWord}`));
  if (digits?.[1]) {
    const n = Number.parseInt(digits[1], 10);
    if (n >= 0 && n <= 50) return n;
  }

  const words = Object.keys(SPOKEN_NUMBERS).join('|');
  const spoken = normalized.match(new RegExp(`\\b(${words})\\s+${victimWord}`));
  if (spoken?.[1]) return SPOKEN_NUMBERS[spoken[1]] ?? null;

  // "hay varios heridos" / "un montón de gente" — plural sin numero.
  if (/\b(varios|varias|muchos|muchas|un monton|bastantes)\b/.test(normalized)) return 3;

  return null;
}

/** Referencia de ubicacion hablada. No sustituye al GPS; ayuda a confirmarlo. */
export function extractLocationHint(original: string, normalized: string): string | null {
  const match = normalized.match(
    /\b(?:en|frente a|al frente de|cerca de|por|sobre|en la|en el)\s+((?:la |el |los |las )?[a-z0-9ñ' ]{4,45})/,
  );
  if (!match?.[1]) return null;

  const start = normalized.indexOf(match[1]);
  const hint = original.slice(start, start + match[1].length).trim();
  return hint.length >= 4 ? hint : null;
}

export interface ExtractionOutput {
  suggestedType: IncidentType | null;
  suggestedPatientCount: number | null;
  signals: TranscriptionResult['signals'];
  locationHint: string | null;
  /** Reglas que dispararon. Se persiste para poder auditar la clasificacion. */
  matchedRules: string[];
}

export function extractFromTranscript(transcript: string): ExtractionOutput {
  const normalized = normalize(transcript);
  const matchedRules: string[] = [];

  let suggestedType: IncidentType | null = null;
  for (const rule of TYPE_RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      suggestedType = rule.type;
      matchedRules.push(`type:${rule.type}`);
      break;
    }
  }

  const signals: TranscriptionResult['signals'] = {};
  for (const [signal, patterns] of Object.entries(SIGNAL_RULES)) {
    if (patterns.some((p) => p.test(normalized))) {
      signals[signal as keyof typeof SIGNAL_RULES] = true;
      matchedRules.push(`signal:${signal}`);
    }
  }

  const suggestedPatientCount = extractPatientCount(normalized);
  if (suggestedPatientCount !== null) matchedRules.push(`patients:${suggestedPatientCount}`);

  return {
    suggestedType,
    suggestedPatientCount,
    signals,
    locationHint: extractLocationHint(transcript, normalized),
    matchedRules,
  };
}

/**
 * Confianza de la CLASIFICACION (distinta de la confianza acustica del
 * transcriptor). Si no reconocimos el tipo, no fingimos certeza: la UI pedira
 * confirmacion al ciudadano con botones grandes.
 */
export function classificationConfidence(output: ExtractionOutput, transcript: string): number {
  if (transcript.trim().length < 8) return 0;
  let score = output.suggestedType ? 0.6 : 0.2;
  if (Object.keys(output.signals).length > 0) score += 0.2;
  if (output.suggestedPatientCount !== null) score += 0.1;
  if (transcript.trim().length > 40) score += 0.1;
  return Math.min(1, score);
}
