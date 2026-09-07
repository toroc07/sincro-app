# HANDOFF — Rediseño del flujo reporte → despacho → seguimiento

Fecha: 2026-09-06. Rama `main`, **sin commit** (todo en working tree).

## Qué se hizo

Rediseño del flujo de emergencia en 6 fases (A–G). Plan completo y razonado:
`/tmp/.../scratchpad/PLAN-flujo-optimo.md` (o pídelo — resumen abajo).

Estado de verificación al cierre (RE-verificado por CC tras el merge de `origin/main`):
`npm run typecheck` ✓ · `check:layers` ✓ (175 archivos) · `npm test` ✓ (77 web + 42 audio) ·
`npm run build` ✓ ("Compiled successfully" + 12/12 páginas) — **todos verdes**.
Verificación `curl` manual del subagente `backend` de cada fase — OK (FIX A/B/E/F).

### Merge de `origin/main` (`d15bccf` "Arreglo tracking")  ✅ aplicado al working tree, SIN commit
Upstream tocó 2 archivos que también tocamos nosotros — cambios **complementarios**,
aplicados a mano (cherry-pick/apply fallan con working tree sucio):
- `incidents/internal/tracking.ts`: `getTracking(token, q = db())` (param opcional) +
  copy propio para incidentes `CANCELLED` ("Este reporte se cerró"). Nuestro
  `updateReporterLocation` + `reporterLocation` intactos.
- `track/[token]/TrackingClient.tsx`: deja de sondear en `step === 'COMPLETED'`;
  `Timeline` muestra `currentHeadline` en el paso activo. Nuestro `useReporterTracking`
  + marcador `reporter` intactos.
- `backend/routing/test_route.py`: archivo vacío, borrado por upstream — borrado aquí también.

### Revisión adversarial `critic` de C–F + pasada de fixes A–G  ✅ hecho + re-verificado
`critic` (Opus) encontró 2 BLOCKING + 6 IMPORTANT sobre C–F. Todos resueltos por un
subagente `backend` (Sonnet) en la pasada FIX A–G:
- **FIX A** (BLOCKING — toma de cuenta): `loginCitizen` por teléfono devolvía historial
  con `tracking_token` → falsificar ubicación/tipo vía `/api/track/<token>`. Quitado el
  token del historial (ahora solo código/tipo/estado/fecha). Cuentas viejas con
  `password_hash` (migración 023) **siguen exigiendo contraseña** — no se degradan.
- **FIX B** (BLOCKING — flag de abuso): falsos positivos por CGNAT, nunca se limpiaba,
  se propagaba en merge, reintentos idempotentes consumían cupo. Ahora: merge NO propaga
  el flag; 3+ reportes distintos lo **limpian** (`MANUAL_OVERRIDE`); acción de operador
  `PATCH /api/incidents/[id] {"clearAbuse":true}`; cupos separados IP (20/60s) vs
  teléfono (5/60s); `Idempotency-Key` no cobra cupo dos veces.
- **FIX C**: doble llamada a Groq (audio-intake + index). Ahora una sola, en `index.ts`
  dentro de `if (emittedTopic)` (salta replay idempotente); `now` antes del await;
  debounce 15s por incidente.
- **FIX D**: Map de rate-limit sin poda + IP spoofeable. Poda perezosa de claves vacías;
  IP = ÚLTIMO salto de `x-forwarded-for`.
- **FIX E**: inyección de prompt en el resumen que lee el paramédico. Reportes
  delimitados `<reporte n="1" t="00:00">`, system prompt endurecido, sanitización de
  cierres de bloque, label "sin verificar" en la UI.
- **FIX F**: sin índice para el barrido + el sweep bloqueaba el poll del ciudadano.
  Migración `030_dispatch_runs_index.sql`; sweep con `void ...catch()` en `/api/track`.
- **FIX G**: normalización de teléfono inconsistente. `citizens/internal/phone.ts`
  (`normalizePhone` — dígitos, quita prefijo `57` si son 12). Migración
  `031_normalize_citizen_phone.sql` normaliza los `citizens.phone` existentes.

Progresión de tests: 42 baseline → 77 web (+ 42 audio) al cierre.

### A — Compuerta de despacho  ✅ hecho + verificado + revisión adversarial + fixes
El auto-despacho ya **no es incondicional**. Un reporte de baja confianza
(audio sin transcripción → `needsConfirmation`, o texto `OTHER`, o rate-limited)
entra en `runDispatch({mode:'RECOMMEND'})`: el motor calcula y persiste
candidatos pero **no reserva unidad**; el incidente queda `OPEN`.
- Se promueve a `AUTO_ASSIGN` cuando: un operador confirma
  (`POST /api/incidents/[id]/dispatch {"mode":"AUTO_ASSIGN"}`, ruta ya existente),
  **o** el barrido `promoteHeldDispatches()` lo hace tras el SLA
  (`HELD_DISPATCH_SLA_MS = 45s`; `HELD_DISPATCH_SLA_ABUSE_MS = 120s`).
- El barrido corre desde `sweepExpiredOffers()` — invocado en `POST /api/incidents`,
  `/api/incidents/audio`, `/api/incidents/[id]/dispatch`, **`GET /api/track/[token]`**
  (latido del dispositivo del ciudadano, cada ~4s), **`GET /api/responder/current`**
  (~3s) y **`GET /api/keepalive`** (cron cada 10 min, respaldo).
- Concurrencia: cada promoción toma `SELECT ... FOR UPDATE` y re-verifica
  `status='OPEN'` + sin asignación activa dentro de la tx. `engine.ts` no degrada
  a `NO_RESOURCE` un incidente que ya tiene oferta viva.
- Archivos clave: `apps/web/src/server/modules/dispatch/internal/held.ts` (nuevo),
  `engine.ts`, `app/api/dispatch/_shared.ts`.

### B — Contactos de múltiples reporteros  ✅
`listReporterContacts(incidentId)` en `modules/incidents/index.ts` → todos los
números que reportaron, dedup por teléfono, más reciente primero, primario marcado,
nombre vía `citizens` (JOIN normalizado a dígitos). `/api/responder/current`
devuelve `reporters[]`. `ResponderClient.tsx` pinta lista de botones `tel:` si hay >1.

### G — Guarda de de-escalada  ✅
`confirmIncidentType` (token de `/track`) re-corre triage con las señales
persistidas y **trinquete en prioridad Y capacidad**: el ciudadano puede agravar,
nunca rebajar. De-escalada → no aplica, `needs_review=TRUE`, evento REPORTER
`{rejected:true}`. Escalada vía token → aplica + `needs_review=TRUE` +
`{viaTrackingToken:true}` (trazable). Ver `triage.ts` (`ratchetTriage`, `parseSignals`).

### C — Resumen consolidado por IA  ✅ wiring verificado; salida real NO (sin key)
`incidents.ai_summary` sintetiza todos los transcripts con procedencia, regenerado
fire-and-forget en cada reporte. `internal/summary.ts` (Groq, mismo patrón que
`transcription.ts`, presupuesto 4s). **Degrada a `null` sin `GROQ_API_KEY`** — el
incidente funciona igual. Evento `INCIDENT_ENRICHED`. Se muestra en el panel de
ambulancia, no al ciudadano.
> **Para verificar el resumen real**: pon `GROQ_API_KEY` en `backend/.env` y
> `apps/web` lo lee de `.env.local` (o exporta la var). Sin eso solo está el
> camino de degradación probado.

### D — Ubicación viva del ciudadano  ✅
`POST /api/track/[token]/location` ← el dispositivo del ciudadano transmite GPS
mientras tiene `/track` abierto. Hook `app/track/[token]/useReporterTracking.ts`
(clon de `useVehicleTracking` + Page Visibility API, cadencia 10s, sin cola
persistente). `incidents.reporter_lat/lng/accuracy_m/location_at`. La tripulación
ve la posición **actual** (solo si <60s de antigüedad) como 3er marcador ámbar en
`LiveRouteMap` (track + responder). `zTrackingResponse.reporterLocation` (aditivo).

### E — Ciudadano passwordless  ✅
Registro = **nombre + teléfono**, nada más. Sin email, sin contraseña. Cookie
firmada de 1 año. Reingreso con el mismo teléfono → upsert (misma cuenta).
`accounts.ts`: `zCitizenRegisterRequest`/`zCitizenLoginRequest` sin `email`/`password`;
`zCitizenSession.email` → `.nullable().optional()`. Migración `028` deja `email`
nullable y dropea `ux_citizens_email` (mantiene `ux_citizens_phone`). `password_hash`
queda como columna muerta. `internal/crypto.ts` **borrado** (staff usa `infra/crypto.ts`).
Form de staff en `/login` intacto (sí lleva contraseña).

### F — Rate limiting + flag de abuso  ✅
`infra/rate-limit.ts` — ventana deslizante en memoria (5/60s por teléfono y por IP).
Un reporte rate-limited **se crea igual** (nunca 429), pero: `incidents.suspected_abuse=TRUE`,
`mode` forzado a `RECOMMEND`, y SLA de promoción de 120s. Badge "Origen sin verificar"
en el panel de ambulancia. **Caveat serverless**: cada instancia tiene su Map — es
best-effort, no un límite duro (mismo modelo que el bus de eventos).

## Decisiones tomadas (NO re-litigar)

1. **RECOMMEND ya existía** como modo de despacho — no se creó una máquina de
   estados nueva. La compuerta es `mode` + barrido oportunista, no un estado `HELD`.
2. **Contratos congelados** (`enums`, `dispatch`, `triage`, `state-machines`): solo
   cambios aditivos-opcionales. Excepción documentada: `accounts.ts` quita
   `email`/`password` del registro de ciudadano (era el objetivo de la Fase E).
3. **`INCIDENT_ENRICHED`** añadido a `INCIDENT_EVENT_TYPE` — aditivo, mismo patrón
   que `REPORT_MERGED` en su día.
4. **Migración `025_incident_signals.sql`**: persiste las 4 señales críticas
   (`unconscious`/`notBreathing`/`severeBleeding`/`trapped`) en `incidents.signals`
   (JSON en TEXT). Antes vivían solo en el request y se perdían → el re-triage de
   `confirmIncidentType` se equivocaba. La rama MERGE ahora fusiona señales (OR).
5. **El latido del SLA** se apoya en el poll de `/track` del ciudadano + el de
   `/responder` + el cron `keepalive`. NO se metió en `GET /api/command-center/overview`
   (mutar estado en un GET sin auth es abusable — lo señaló `critic`).
6. **Ciudadano sin OTP** (Fase H diferida): sin proveedor SMS. El teléfono es una
   pista de contacto, no identidad verificada — comentado en el código.

## Callejones sin salida / cosas que NO funcionaron

- **antigravity (`agy`)**: cuota agotada (reset ~16h). Toda la implementación la
  hicieron subagentes `backend` (Sonnet) de Claude Code, con revisión `critic` (Opus).
- El **server dev de larga vida se corrompe**: tras 5h y 6 fases de cambios a
  workspace packages (`@dispatch/contracts`, `@dispatch/db`) + un `db:reset`, empezó
  a devolver 500 en todo. Solución: `pkill -f "next dev"; rm -rf apps/web/.next` y
  relanzar. Los tests/build nunca fallaron — era solo el proceso dev.
- El **rate-limit del dev server persiste entre corridas** (Map en memoria del
  proceso) — al probar Fase F con `curl` el límite salta antes del hit exacto si
  hubo intentos previos en la misma ventana de 60s. El corte 5→6 está probado
  determinista en `rate-limit.test.ts`.

## Pendiente (no hecho)

- **Fase H — OTP por SMS**: verificación de teléfono post-reporte, no bloqueante.
  Diseño en el plan. Necesita proveedor SMS + `citizens.phone_verified`.
- **UI del centro de mando B2G** para la cola "confirmar despacho" (los incidentes
  retenidos en `OPEN` con `needs_review`/candidatos listos). El endpoint existe
  (`POST /api/incidents/[id]/dispatch`); falta la pantalla que lo llama.
- **`GROQ_API_KEY`** para que el resumen IA (Fase C) haga algo.
- **Commit**: nada está commiteado. El working tree tiene: fases A–G + fixes A–G +
  el contenido de `origin/main` (`d15bccf`) ya aplicado a mano. HEAD sigue en `efb08fd`,
  1 commit por detrás de `origin/main`. Al commitear: como `git commit` deja el árbol
  = d15bccf + nuestros cambios, un `git merge -s ours origin/main` posterior (o rebasar)
  cierra el desfase sin re-aplicar nada. Sugerencia de commits: un commit por fase
  (A+G, B, C, D, E, F) o dos (compuerta+multicontacto, enriquecimiento+identidad).
- Migración de datos: `031` normaliza `citizens.phone`. Nuevas migraciones 025–031,
  todas aplicadas en local (`db:migrate` dice "sin pendientes").
- Migración de datos reales: `citizens` viejos con email/password quedan intactos y
  `loginCitizen` los encuentra por email, pero ese camino no se probó con datos
  preexistentes (el seed no crea ciudadanos).

## Cómo levantar local

```bash
docker start sincro-pg    # Postgres 16, ya creado: dispatch / postgres:postgres @ 5432
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/dispatch' npm run db:reset
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/dispatch' DEMO_MODE=true npm run dev
```
`.env.local` tiene el placeholder de `DATABASE_URL` sin rellenar (el hook
`protect-secrets` impide editarlo por herramienta) — de ahí el inline.

Credenciales staff (seed): `responder@sincro.co` / `responder123`,
`dispatcher@sincro.co` / `dispatcher123`, `admin@sincro.co` / `admin123`.
