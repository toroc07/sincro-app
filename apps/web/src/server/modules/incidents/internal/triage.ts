import {
  CAPABILITY_RANK,
  triage,
  type CapabilityLevel,
  type IncidentPriority,
  type IncidentType,
  type TriageResult,
  type TriageSignals,
} from '@dispatch/contracts';

export interface TriageDecision extends TriageResult {
  overriddenByOperator: boolean;
}

export function applyTriage(
  type: IncidentType,
  signals: TriageSignals,
  operatorOverride?: IncidentPriority,
): TriageDecision {
  const result = triage(type, signals);
  return {
    ...result,
    priority: operatorOverride ?? result.priority,
    overriddenByOperator: operatorOverride !== undefined,
  };
}

/** Escala de gravedad: 1 es lo más grave. */
export const PRIORITY_RANK: Record<IncidentPriority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
export { CAPABILITY_RANK };

/** Las 4 señales críticas que el reporter marca con botones (§24). Sin `patientCount`. */
export type CriticalSignals = Pick<
  TriageSignals,
  'unconscious' | 'notBreathing' | 'severeBleeding' | 'trapped'
>;

const SIGNAL_KEYS: ReadonlyArray<keyof CriticalSignals> = [
  'unconscious', 'notBreathing', 'severeBleeding', 'trapped',
];

/** Parsea el JSON de `incidents.signals`. Tolera null/basura devolviendo `{}`. */
export function parseSignals(raw: string | null | undefined): CriticalSignals {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: CriticalSignals = {};
    for (const key of SIGNAL_KEYS) if (parsed[key] === true) out[key] = true;
    return out;
  } catch {
    return {};
  }
}

/** OR de dos conjuntos: una señal marcada por cualquiera de los reportes queda marcada. */
export function mergeSignals(
  a: CriticalSignals | undefined,
  b: CriticalSignals | undefined,
): CriticalSignals {
  const out: CriticalSignals = {};
  for (const key of SIGNAL_KEYS) if (a?.[key] === true || b?.[key] === true) out[key] = true;
  return out;
}

export interface CurrentTriage {
  priority: IncidentPriority | null;
  requiredCapability: CapabilityLevel | null;
}

export interface RatchetOutcome {
  priority: IncidentPriority;
  requiredCapability: CapabilityLevel;
  /** El resultado trinquete difiere del estado actual (subió algo). */
  escalates: boolean;
  /** La triage propuesta bajaría prioridad o capacidad respecto al estado actual. */
  deEscalates: boolean;
}

/**
 * Trinquete de triage: la gravedad de un incidente ya clasificado nunca baja.
 * Devuelve, para cada dimensión, la más grave entre el estado actual y la nueva
 * clasificación, más si el cambio propuesto subía (`escalates`) o bajaba
 * (`deEscalates`) algo.
 */
export function ratchetTriage(current: CurrentTriage, next: TriageResult): RatchetOutcome {
  const priority = current.priority == null
    || PRIORITY_RANK[next.priority] < PRIORITY_RANK[current.priority]
    ? next.priority
    : current.priority;
  const requiredCapability = current.requiredCapability == null
    || CAPABILITY_RANK[next.requiredCapability] > CAPABILITY_RANK[current.requiredCapability]
    ? next.requiredCapability
    : current.requiredCapability;
  const deEscalates = (current.priority != null
      && PRIORITY_RANK[next.priority] > PRIORITY_RANK[current.priority])
    || (current.requiredCapability != null
      && CAPABILITY_RANK[next.requiredCapability] < CAPABILITY_RANK[current.requiredCapability]);
  const escalates = priority !== current.priority
    || requiredCapability !== current.requiredCapability;
  return { priority, requiredCapability, escalates, deEscalates };
}
