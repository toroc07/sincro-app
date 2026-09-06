# 2. Sistema de Guardia y Gestión de Flota

## Contexto
En el modelo operativo de SINCRO, los rescatistas y paramédicos operan mediante turnos de guardia vinculados a vehículos de emergencias médicas de la red. Cada tripulación inicia turno en una ambulancia específica, la cual pasa a estar disponible para el motor de despacho algorítmico. Al finalizar el turno, el vehículo queda liberado en base para la siguiente tripulación.

---

## 1. Autenticación de Personal y Portal Operativo

- **Acceso Staff**: [`/login?type=staff`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/login/page.tsx)
- **Credenciales Demo de Paramédico**:
  - **Identificador**: `responder@sincro.co` (o `user-responder`)
  - **Contraseña**: `responder123`
- **Portal de Perfil del Rescatista**: [`/responder/profile`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/responder/profile/page.tsx)
  - Despliega la tarjeta de identidad y credencial del tripulante.
  - Métricas de misiones asignadas y completadas con éxito.
  - Historial de incidentes atendidos con fecha, código, tipo y vehículo utilizado.
  - Módulo de control de turno operativo (iniciar y finalizar guardia).

---

## 2. El Problema de Disponibilidad y Exclusión de Flota

### Síntomas Identificados:
1. Al pulsar **"Finalizar Turno"** en la ambulancia A05, el paramédico no podía volver a seleccionarla porque no aparecía en el selector de ambulancias disponibles.
2. En su lugar, el selector mostraba las otras 29 ambulancias como si estuvieran disponibles, a pesar de que ya estaban ocupadas por otras tripulaciones en patrullaje.
3. Al intentar iniciar turno en cualquiera de esas otras ambulancias, el servidor arrojaba un error de conflicto:  
   `409 Conflict: El vehículo ya tiene un turno activo`.

### Causa Raíz (Análisis Técnico):
En [`src/server/modules/vehicles/internal/repository.ts`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/src/server/modules/vehicles/internal/repository.ts), la función `findAvailableVehicles()` original contenía la siguiente cláusula SQL:

```sql
-- ❌ Consulta antigua con error conceptual
WHERE v.status = 'AVAILABLE' AND v.active_shift_id IS NOT NULL
```

- **Por qué fallaba**:
  - Se escribió esa función asumiendo que "disponible" significaba *"ambulancia patrullando lista para ser despachada por el 911 a un accidente"*, lo cual requiere que tenga tripulación activa (`active_shift_id IS NOT NULL`).
  - Sin embargo, el endpoint `/api/vehicles/available` es consumido por la interfaz de inicio de turno ([`ProfileClient.tsx`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/responder/profile/ProfileClient.tsx)). Para iniciar un turno, se necesita lo opuesto: **un vehículo libre, sin turno activo** (`active_shift_id IS NULL`).
  - Al cerrar turno en A05, esta pasaba a `status = 'OFFLINE'` y `active_shift_id = NULL`. La consulta la descartaba de inmediato por tener `active_shift_id IS NULL`, mientras que incluía a todas las demás ambulancias que sí tenían tripulación.

---

## 3. Solución Implementada

### 1. Separación de Consultas en Repositorio
En [`apps/web/src/server/modules/vehicles/internal/repository.ts`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/src/server/modules/vehicles/internal/repository.ts):

```typescript
/**
 * Retorna vehículos disponibles para iniciar turno operativo (sin tripulación / turno activo asignado).
 * Excluye unidades que ya están ocupadas con turno activo o fuera de servicio por mantenimiento.
 */
export async function findAvailableVehicles(q: Queryable = db()): Promise<VehicleWithLocation[]> {
  const rows = await q.many<Row>(`${VEHICLE_SELECT}
    WHERE v.active_shift_id IS NULL
      AND v.status != 'OUT_OF_SERVICE'
    ORDER BY v.callsign
  `);
  return rows.map((row) => mapVehicle(row));
}

/**
 * Retorna vehículos en servicio operativo listos para recibir despacho de emergencia.
 */
export async function findDispatchReadyVehicles(q: Queryable = db()): Promise<VehicleWithLocation[]> {
  const rows = await q.many<Row>(`${VEHICLE_SELECT}
    WHERE v.status = 'AVAILABLE' AND v.active_shift_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.vehicle_id = v.id
          AND a.status IN (${ACTIVE_ASSIGNMENT_STATUSES.map(() => '?').join(',')})
      )
    ORDER BY v.callsign
  `, [...ACTIVE_ASSIGNMENT_STATUSES]);
  return rows.map((row) => mapVehicle(row));
}
```

### 2. Preselección Inteligente en la Interfaz
En [`ProfileClient.tsx`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/responder/profile/ProfileClient.tsx):
- Al cargar la lista de vehículos disponibles, el sistema prioriza automáticamente la ambulancia propia (**Unidad A05**) o la primera disponible en base.
- Las opciones se presentan con etiquetas claras:  
  `Unidad A05 (RESCUE) — En base (Libre para iniciar guardia)`.
- Las ambulancias ocupadas por otras tripulaciones quedan **estrictamente excluidas** del selector.

### 3. Flota de Reserva en Base de Datos
En [`packages/db/seed/index.ts`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/packages/db/seed/index.ts):
- Se dejaron las unidades **A29** y **A30** como flota de reserva en base (`status = 'OFFLINE'`, `active_shift_id = NULL`).
- Si el paramédico desea probar el cambio de vehículo, puede elegir entre retomar la **A05** o subirse a la **A29** o **A30**.
- Al iniciar turno en cualquiera de ellas, la transición a `AVAILABLE` se completa sin errores de conflicto.

---

## 4. Verificación del Ciclo de Vida

El ciclo se validó de punta a punta simulando peticiones HTTP reales de sesión:
1. **Inicio de Sesión**: `POST /api/staff/login` con credenciales de `responder@sincro.co` → `200 OK`.
2. **Turno Inicial**: Unidad activa **A05**.
3. **Cierre de Turno**: `DELETE /api/staff/shift` → `200 OK`.
4. **Consulta de Disponibles**: `GET /api/vehicles/available` → Retorna exactamente `['A05', 'A29', 'A30']`.
5. **Reinicio de Turno en A05**: `POST /api/staff/shift` con `vehicleId: 'seed-vehicle-05'` → `201 Created`.
6. **Validación de Exclusión**: `GET /api/vehicles/available` → Retorna `['A29', 'A30']` (A05 ya no está libre porque está en uso).
