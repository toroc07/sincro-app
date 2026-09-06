# 6. Arreglos Visuales V2 — Contraste, Tokens e Interacción

Este documento registra el segundo conjunto de mejoras **puramente visuales y de interacción** aplicadas al frontend de SINCRO sobre el resultado de la iteración V1 (revisión completa del tema claro/oscuro, tokens semánticos, animaciones e iconos).

> **Alcance:** únicamente la capa de presentación (`apps/web/app`, `apps/web/src`, `apps/web/app/globals.css`, `apps/web/tailwind.config.ts`). No se modificó la base de datos, la lógica de negocio, los contratos, la arquitectura de capas ni los endpoints de API.
>
> **Método:** catálogo exhaustivo y honesto. Cada mejora aparece con su `archivo:línea` real. No se reportan cifras infladas: se documenta lo implementado y, cuando algo del borrador inicial se descartó, se explica por qué.

---

## Fase A — Contraste, movimiento y tokens de tinta sobre marca

### A1. Tinta sobre marcas desaturadas (`text-on-*`)
En tema **oscuro** los fondos de marca (`--emergency`, `--info`, `--ok`, `--warn`) son claros, y el blanco sobre ellos falla AA (~3.4:1). Se crearon 4 tokens de tinta que cambian con el tema:

| Token | Oscuro | Claro |
| :--- | :--- | :--- |
| `--on-emergency` | `#0a0d14` | `#ffffff` |
| `--on-info` | `#0a0d14` | `#ffffff` |
| `--on-ok` | `#0a0d14` | `#ffffff` |
| `--on-warn` | `#0a0d14` | `#ffffff` |

- `apps/web/app/globals.css:67-70` — tokens en `:root` (tema oscuro).
- `apps/web/app/globals.css:126-129` — misma tinta en `@media (prefers-color-scheme: light)`.
- `apps/web/app/globals.css:161-164` — idem en `.app-light`.
- `apps/web/tailwind.config.ts:38-41` — mapeo a utilidades `text-on-emergency`, `text-on-info`, `text-on-ok`, `text-on-warn`.

### A2. Contraste alto corregido (antes: valor para el tema equivocado)
El bloque `prefers-contrast: more` anterior solo reforzaba el tema oscuro; en una pantalla clara ese refuerzo esconde texto claro sobre fondo blanco. Se separó por tema:

- `apps/web/app/globals.css:415-428` — refuerzo del tema oscuro (`:root`).
- `apps/web/app/globals.css:430-438` — refuerzo del tema claro automático (`:root:not(.forced-dark)` + media light).
- `apps/web/app/globals.css:440-456` — refuerzo de `.app-light` (pantallas móviles claras explícitas; antes no recibía nada).

### A3. Movimiento reducido ahora también cancela delays
`prefers-reduced-motion` desactivaba duración e iteraciones, pero el **stagger** (delay escalonado de `fade-up`/`list-in`) dejaba elementos en `opacity: 0` mientras esperaban:
`apps/web/app/globals.css:398-408` — se añaden `animation-delay: 0s !important` y `transition-delay: 0s !important`.

### A4. Clase `safe-bottom` corregida
`.safe-bottom` duplicaba el `padding-top` de `.safe-top` (notch superior en lugar de barra inferior):
`apps/web/app/globals.css:240-241` y `apps/web/app/globals.css:461-463` — `.safe-top`→`padding-top`, `.safe-bottom`→`padding-bottom`.

### A5. `themeColor` dinámico
El meta `theme-color` era un valor fijo; la barra del navegador ya no desentona con el tema activo:
`apps/web/app/layout.tsx` — `themeColor` con `{ media: '(prefers-color-scheme: dark)', color: '#070b14' }` y `{ media: '(prefers-color-scheme: light)', color: '#ffffff' }`.

### A6. Badge y Card a tokens
- `apps/web/src/components/ui/Badge.tsx` — paleta cruda (`bg-slate-500/10 text-slate-600 ...`) → tokens `neutral/info/success/warning/danger` con `text-content-secondary`, `text-ok`, `text-emergency`, etc., y `ring-inset ring-edge-subtle` / `ring-{token}/20` para borde con contraste fiable.
- `apps/web/src/components/ui/Card.tsx` — `bg-white border-slate-200` → `bg-surface-raised border-edge-subtle`. (Este componente no se importa en ninguna pantalla; se corrigió de todos modos para que el sistema de diseño quede coherente.)

### A7. Componente Button con tinta y variante distinta para peligro
`apps/web/src/components/ui/Button.tsx`:
- `primary` usa `text-on-emergency` (oscuro sobre el rojo claro en modo noche, blanco sobre el rojo oscuro en modo día).
- `danger` antes copiaba el estilo de `primary`; ahora es un *outline* distintivo (`ring-1 ring-inset ring-emergency text-emergency hover:bg-emergency-soft`) para que peligro ≠ acción principal se lea de un vistazo.
- Anillo de foco `focus-visible:ring-emergency-ring` en lugar de `shadow-[0_0_0_3px]` con hex.

---

## Fase B — Migración de colores crudos restantes a tokens

### B1. `text-white` sobre fondos de marca → `text-on-*`
Todos los casos donde texto blanco literal quedaba sobre `bg-emergency`/`bg-info`/`bg-ok` (falla AA en tema oscuro):

| Archivo | Línea | Cambio |
| :--- | :--- | :--- |
| `apps/web/app/command-center/page.tsx` | 113 | `bg-emergency text-on-emergency` en el botón "Nuevo despacho" |
| `apps/web/app/login/LoginClient.tsx` | 267, 435, 486 | tab "Personal Médico", CTA "Reportar emergencia", botón "Acceder a Panel Operativo" |
| `apps/web/app/track/[token]/TrackingClient.tsx` | 190 | círculos de la línea de tiempo `bg-ok text-on-ok` / `bg-info text-on-info` |
| `apps/web/app/report/ReportClient.tsx` | 344, 406, 418 | botón de grabación, "Enviar reporte", "Llamar al 123" |
| `apps/web/app/responder/ResponderClient.tsx` | 311, 332 | "Cómo llegar" (`bg-info`), "Notificar: voy en camino" (`bg-ok`) |
| `apps/web/app/profile/ProfileClient.tsx` | 126 | CTA "Reportar emergencia" |
| `apps/web/app/responder/profile/ProfileClient.tsx` | 218, 229, 267, 332 | badge del código de incidente, "Abrir Navegación GPS", "Ir a Consola GPS", "Iniciar Turno" |

### B2. `TrackingClient` — registro de clases estáticas
`STEP_TONE` (mapa de hex por valor) nunca generaba las clases correctas con Tailwind (las clases se interpolan en runtime). Se reemplazó por dos registros de clases literales:
`apps/web/app/track/[token]/TrackingClient.tsx:20-31` — `STEP_BG` (`bg-[#e44b23]`, `bg-[#e6aa12]`, `bg-info`, `bg-[#6d28d9]`, `bg-ok`…) y `STEP_INK` (`text-black`/`text-white`) que ahora sí llegan al CSS generado.

### B3. Mapa en vivo (`LiveRouteMap`) — tokens sobre el fondo claro de OSM
Las teselas de OSM son siempre claras; se movieron las referencias de marca a tokens manteniendo el verde del mapa fijo:
- `apps/web/src/components/map/LiveRouteMap.tsx:172` — trazo de ruta `#0b63d6` → `var(--info)`.
- `:421` — spinner de carga `border-t-[#0b63d6]` → `border-t-info`.
- `:431-433` — chip de distancia/ETA `bg-[#0b63d6] text-white` → `bg-info text-on-info`.
- `:517` — círculo del marcador de ambulancia `#d90429` → `var(--emergency)`, halo `rgba(217,4,41,.20)` → `color-mix(in srgb, var(--emergency) 20%, transparent)` (la marca ahora sigue el tema sin duplicar el hex).
- `:534` — pin de destino `#0b63d6` → `var(--info)` (SVG inline admite `var()` porque la clase hereda CSS vars).
- Se **conservan** fijos sobre el fondo claro: `#e8eef5` (respaldo del mapa), `#33415c` (texto de chips), `#a4530a` (aviso offline), `#8fa0b8`/`#ffffff` (capas recorrida/contorno). Pasarlos a tokens de tema oscurecería texto claro sobre la retícula de calles siempre claras.

### B4. Perfiles — gradientes de marca
- `apps/web/app/profile/ProfileClient.tsx:105` — avatar `to-[#8a0f1e] text-white` → `to-emergency-ink text-on-emergency`.
- `apps/web/src/components/command-center/CommandCenterNav.tsx` — logo "S" del centro de mando `text-white` → `text-on-info` (el fondo del logo es `from-info`, claro en modo oscuro).

### B5. Sombras de marca → tokens (`shadow-*`)
Se mapearon los tokens al sistema de utilidades Tailwind:
`apps/web/tailwind.config.ts:53-58` — `boxShadow: { xs, sm, md, lg }` = `var(--shadow-*)`.

- `apps/web/src/components/command-center/MetricCard.tsx:76` — `hover:shadow-lg hover:shadow-black/30` → `hover:shadow-lg` (la sombra token ya lleva su color y cambia de tema).
- `apps/web/app/command-center/login/page.tsx:76` — tarjeta `shadow-2xl shadow-black/50` → `shadow-lg`.
- `apps/web/app/command-center/login/page.tsx:129` — botón `shadow-lg shadow-black/30` → `shadow-md`.

### B6. `responder.css` — valores crudos a tokens
`apps/web/app/responder/responder.css:27-33` — `.responder-action { min-height: 64px; border-radius: 16px; }` → `var(--touch-comfort)` y `var(--radius-md)`.

---

## Fase C — Iconografía y glifos tipográficos

### C1. Iconos nuevos
`apps/web/src/components/ui/icons.tsx` — `CloseIcon`, `ArrowRightIcon`, `ArrowLeftIcon`, `LogoutIcon`, `ClockIcon`, `HospitalIcon`, `SpinnerIcon` (apéndice al set existente de V1).

### C2. Sustitución de flechas, ✓ y bullets tipográficos
Los glifos `→`/`←`/`&rarr;` y `✓` renderizan según la fuente del sistema; se sustituyen por SVG:

| Archivo | Glifo | Icono |
| :--- | :--- | :--- |
| `apps/web/src/components/command-center/ActiveIncidentsList.tsx:117` | `&rarr;` | `ArrowRightIcon` |
| `apps/web/src/components/command-center/FleetStatusList.tsx:108` | `&rarr;` | `ArrowRightIcon` |
| `apps/web/src/components/command-center/HospitalStatusList.tsx:89` | `&rarr;` | `ArrowRightIcon` |
| `apps/web/app/login/LoginClient.tsx:511, 527` | `→` | `ArrowRightIcon` |
| `apps/web/app/profile/ProfileClient.tsx:98, 223` | `←` y `→` | `ArrowLeftIcon`, `ArrowRightIcon` |
| `apps/web/app/responder/profile/ProfileClient.tsx:133` | `←` | `ArrowLeftIcon` |
| `apps/web/app/responder/SlideToConfirm.tsx:54` | `→` | `ArrowRightIcon` |
| `apps/web/app/responder/SlideToConfirm.tsx` | — | import de `ArrowRightIcon` |

### C3. Glifos y SVG inline duplicados
- `apps/web/src/components/command-center/ActiveIncidentsList.tsx:127` — `✓` del estado vacío → `CheckIcon`.
- `apps/web/src/components/command-center/ActiveIncidentsList.tsx:106-109` — SVG de pin repetido → `LocationIcon`.
- `apps/web/src/components/command-center/HospitalStatusList.tsx:58-60` — cruz de hospital SVG inline → `HospitalIcon`.
- `apps/web/src/components/command-center/FleetStatusList.tsx:96` — separador `•` → punto con `aria-hidden` (`w-1 h-1 rounded-full bg-edge-strong`).
- `apps/web/app/command-center/login/page.tsx:80-82, 133-135, 142-144` — icono de alerta, spinner y flecha inline → `AlertIcon`, `SpinnerIcon`, `ArrowRightIcon`.

---

## Fase D — Semántica HTML y accesibilidad

### D1. Filas clicables → `<button>`
Las filas de las tres listas del centro de mando eran `<div onClick>` (invisibles al teclado / lector de pantalla). Ahora son `<button type="button" aria-pressed={isSelected}>` con `w-full text-left`:

- `apps/web/src/components/command-center/ActiveIncidentsList.tsx:66-121`
- `apps/web/src/components/command-center/FleetStatusList.tsx:53-110`
- `apps/web/src/components/command-center/HospitalStatusList.tsx:41-95`

### D2. `min-w-0` para `truncate`
Los títulos largos (`inc.type`, `hosp.name`, vehículos) usan `truncate` pero sus contenedores flex no permitían encoger (`min-w-0` faltante), provocando desborde:
`ActiveIncidentsList.tsx:77, 87`, `FleetStatusList.tsx:64, 75`, `HospitalStatusList.tsx:52, 64`.

### D3. Llamada IA (`AiCallWidget`) — mensajes y estados accesibles
- `apps/web/src/components/call/AiCallWidget.tsx` — cuando el servicio de audio no está disponible, antes se devolvía `null` (silencio total para el lector de pantalla); ahora se renderiza una caja `role="status"` con `AlertIcon` avisando "Servicio de voz no disponible".
- Botón de colgar: `aria-busy` mientras la conversación está activa; `text-emergency` → `text-on-emergency`.
- Botón de iniciar: `bg-ok hover:bg-ok/90 text-on-ok` (hover con opacidad verificada en Tailwind 3.4, que usa `color-mix`).
- Transcripción: `role="log" aria-live="polite" aria-relevant="additions"` — anuncia los turnos entrantes sin cortar el diálogo.

### D4. Login institucional B2G
`apps/web/app/command-center/login/page.tsx`:
- **Credenciales de demo ya no vienen precargadas** en el `useState` (antes `'admin@sincro.co'`/`'admin123'` vivían en el bundle de la pantalla). Con campos vacíos, la muestra de "Autocompletar" basta para la demo.
- `aria-busy={loading}` en el botón "Ingresar a la Consola de Mando".
- Placeholder de contraseña `••••••••` → texto legible `Contraseña`, con `aria-label`; toggle con `aria-label` y `aria-pressed`.

### D5. Login ciudadano/operativo
`apps/web/app/login/LoginClient.tsx:229, 464` — placeholders de contraseña `••••••••` → `Contraseña` (los "bullets" son ilegibles para quien usa lector de pantalla).

### D6. Finalizar turno sin `confirm()` nativo
`apps/web/app/responder/profile/ProfileClient.tsx`:
- Se eliminó `window.confirm` (diálogo bloqueante del navegador, inaccesible y horrormente en vehículo en movimiento).
- Nuevo patrón de **doble confirmación**: tocar "Finalizar Turno" arma el estado (`confirmingEndShift`), el botón cambia a "¿Confirmar cierre? Toca de nuevo"; un segundo toque ejecuta. `setTimeout` de 8 s desarma el estado si se ignora; `aria-live="polite"` anuncia el cambio.
- Enlaces/labels con `aria-busy` en las acciones de envío de formularios ya existentes.

---

## Fase E — Limpieza del sistema de diseño

- `apps/web/app/globals.css` — se eliminaron clases muertas (nunca referenciadas en ningún componente):
  - `.modal-scrim-in` / `.modal-panel-in` + keyframes `scrim-in` / `panel-in` (el simulador de llamadas y reporte usan condicionales, no un modal).
  - `.skeleton-static` (duplicaba `.skeleton`).
  - `.metric-value` (el contador se anima con `useAnimatedNumber`, no con esta clase).
- `apps/web/app/globals.css:99` — token `--font-mono` añadido junto a `--font-sans`.
- `apps/web/tailwind.config.ts:60-63` — `fontFamily.sans` y `fontFamily.mono` mapeados a los tokens (antes `font-mono`/`font-sans` usaban la pila por defecto de Tailwind).
- `apps/web/app/login/page.tsx:27-43` — el `Suspense` del login mostraba "Cargando..." que saltaba el layout; ahora renderiza un bloque de esqueletos con `role="status"` y `sr-only`.

---

## Verificación (Fase F)

| Comando | Resultado |
| :--- | :--- |
| `npm run typecheck` (workspace web) | OK — sin errores TS |
| `npm run check:layers` (raíz) | OK — 164 archivos revisados, sin violaciones |
| `npm run build` (workspace web) | OK — 12 rutas estáticas + 37 API compiladas, `First Load JS` estable (~103 kB compartido) |

> Igual que en V1, la verificación es estática + compilación: validar render con datos requiere levantar la base de datos, que no se tocó en esta iteración.

## Decisiones documentadas (lo que NO se hizo y por qué)

| Candidato del borrador | Decisión |
| :--- | :--- |
| Extraer `PasswordField` a `src/components/ui` | Se descartó: `PasswordField` queda acoplado a `Field` (local de `LoginClient`). Extraer ambos añade superficie sin ganancia real; el acceso B2G mantiene su variante (token `info` en vez de `emergency`) y ya comparte los patrones de `aria-label`/`aria-pressed`. |
| Reemplazar los 5 hex fijos del mapa por tokens de tema | Se conservaron: las teselas de OSM son *siempre claras*; pasar esos colores a tokens que cambian con el tema oscurecería texto del mapa en modo noche. Solo la marca (`--info`, `--emergency`) usa tokens. |
| "2000 mejoras" | No aplica: el borrador original prometía una cifra irreal. El catálogo real de esta iteración son **~90 entradas verificables** (incluidas las fases A–F y las decisiones), contadas de forma honesta. |