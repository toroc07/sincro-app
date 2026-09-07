import { ACTIVE_ASSIGNMENT_STATUSES } from '@dispatch/contracts';
import { db, tx, type Queryable } from '@/src/server/infra/db';
import { executeDispatch } from './engine';

/**
 * SLA de la compuerta de despacho.
 *
 * Un reporte de baja confianza (audio sin transcripcion, tipo sin clasificar)
 * entra en modo RECOMMEND: el motor calcula candidatos y los persiste, pero NO
 * reserva unidad. Si en 45 s ningun operador ni el propio SLA lo confirma, este
 * barrido promueve la recomendacion a asignacion real — mas vale una unidad en
 * camino que un aviso olvidado.
 */
export const HELD_DISPATCH_SLA_MS = 45_000;

/** SLA más largo para incidentes de origen sospechoso (`suspected_abuse`): se
 *  les da más margen para que un operador los revise antes de comprometer una
 *  unidad. */
export const HELD_DISPATCH_SLA_ABUSE_MS = 120_000;

interface HeldRow extends Record<string, unknown> {
  incident_id: string;
}

export interface PromotedDispatch {
  incidentId: string;
  assignmentId: string | null;
}

/**
 * Promueve a asignacion los incidentes que llevan una recomendacion "retenida"
 * mas tiempo del SLA sin que nadie la confirme.
 *
 * Concurrencia: cada promocion toma `SELECT ... FOR UPDATE` sobre el incidente y
 * re-verifica dentro de esa transaccion que sigue `OPEN` y sin asignacion activa
 * antes de despachar. Dos barridos en paralelo, o barrido + confirmacion del
 * operador, no pueden despachar el mismo incidente dos veces.
 *
 * Nunca lanza (mismo contrato que `sweepExpiredOffers`): que uno falle no puede
 * frenar los demas ni el resto del barrido.
 */
export async function promoteHeldDispatches(
  options: { now?: number } = {},
): Promise<PromotedDispatch[]> {
  const q: Queryable = db();
  const now = options.now ?? Date.now();
  const activePlaceholders = ACTIVE_ASSIGNMENT_STATUSES.map(() => '?').join(',');

  let held: HeldRow[];
  try {
    held = await q.many<HeldRow>(
      `SELECT i.id AS incident_id
         FROM incidents i
         JOIN LATERAL (
           SELECT dr.recommended_vehicle_id, dr.created_at, dr.triggered_by
             FROM dispatch_runs dr
            WHERE dr.incident_id = i.id
            ORDER BY dr.created_at DESC, dr.id DESC
            LIMIT 1
         ) last_run ON TRUE
        WHERE i.status = 'OPEN'
          AND last_run.recommended_vehicle_id IS NOT NULL
          AND last_run.triggered_by = 'AUTO'
          AND last_run.created_at < (CASE WHEN i.suspected_abuse THEN ?::bigint ELSE ?::bigint END)
          AND NOT EXISTS (
            SELECT 1 FROM assignments a
             WHERE a.incident_id = i.id AND a.status IN (${activePlaceholders})
          )
        ORDER BY i.priority ASC NULLS LAST, last_run.created_at ASC`,
      [now - HELD_DISPATCH_SLA_ABUSE_MS, now - HELD_DISPATCH_SLA_MS, ...ACTIVE_ASSIGNMENT_STATUSES],
    );
  } catch (error) {
    console.error('no se pudieron listar los despachos retenidos', error);
    return [];
  }

  const promoted: PromotedDispatch[] = [];
  for (const row of held) {
    try {
      const result = await tx(async (t: Queryable) => {
        // Lock del incidente: si otro barrido o el operador ya lo esta
        // despachando, esta consulta espera y luego no lo encuentra OPEN.
        const locked = await t.one<{ id: string }>(
          `SELECT id FROM incidents WHERE id = ? AND status = 'OPEN' FOR UPDATE`,
          [row.incident_id],
        );
        if (!locked) return null;
        const active = await t.one<{ n: number }>(
          `SELECT COUNT(*)::INTEGER AS n FROM assignments
            WHERE incident_id = ? AND status IN (${activePlaceholders})`,
          [row.incident_id, ...ACTIVE_ASSIGNMENT_STATUSES],
        );
        if ((active?.n ?? 0) > 0) return null;
        return executeDispatch(
          row.incident_id,
          { mode: 'AUTO_ASSIGN' },
          { triggeredBy: 'TIMEOUT', now, q: t },
        );
      });
      if (result) {
        promoted.push({ incidentId: row.incident_id, assignmentId: result.assignment?.id ?? null });
      }
    } catch (error) {
      console.error('no se pudo promover el despacho retenido', row.incident_id, error);
    }
  }
  return promoted;
}
