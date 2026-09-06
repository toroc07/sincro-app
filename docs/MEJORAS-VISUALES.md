# 5. Mejoras Visuales, Animaciones y Consistencia de Estilos

Este documento registra el conjunto de mejoras **puramente visuales y de experiencia** aplicadas al frontend de SINCRO sobre el commit `056c53b` (centro de mando B2G, login institucional y de ciudadanos, perfiles, reporte y seguimiento).

> **Alcance:** únicamente capa de presentación (`apps/web/app`, `apps/web/src`, `apps/web/app/globals.css`). No se modificó la base de datos, la lógica de negocio, los contratos ni los endpoints de API.

---

## 1. Base visual global — `apps/web/app/globals.css`

| Mejora | Resultado |
| :--- | :--- |
| Tema claro automático | `@media (prefers-color-scheme: light)` re-asigna los tokens (superficies, texto, bordes) a una paleta clara sin tocar el código de cada pantalla. Se preserva `.app-light` (fuerza el tema claro para las UIs móviles de ciudadano/responder). |
| Clase `forced-dark` | Aísla el centro de mando y su login del tema automático del navegador (siempre oscuro e institucional). |
| `custom-scrollbar` definida | La clase se usaba en el centro de mando pero **no existía** en CSS; ahora hay una scrollbar compacta y discreta a partir de los tokens `--border-strong`. |
| `screen-enter` | Animación de entrada de pantalla (fade + translación) en login, reporte, perfil ciudadano, perfil responder, consola de responder y tracking. |
| Skeleton + shimmer | `.skeleton` (bloque con barrido animado) + `.skeleton-static`, sustituyen los textos "Cargando…" que empujaban el layout. |
| `list-in` | Entrada escalonada (stagger) para filas de listas y tarjetas de historial. |
| `.tnum` y `tabular-nums` | Números de telemetría (reloj, contadores, códigos) sin saltos de ancho. |
| `.pressable` | Hit-target/active feedback para controles táctiles. |
| Tokens de sombra | `--shadow-xs/sm/md/lg` para profundidades consistentes. |
| `font: inherit` | Inputs, botones, select y textarea heredan la tipografía del sistema (evita fuentes de navegador). |
| `text-wrap: balance` | Titulares `h1–h3` balanceados multilínea. |
| `::selection` | Selección de texto con colores de marca. |

**Accesibilidad**
- `@media (prefers-reduced-motion: reduce)`: desactiva todas las animaciones (entrada, shimmer, pulsos, keyframes globales).
- `@media (prefers-contrast: more)`: aumenta la opacidad de bordes y superficies para contraste alto.
- Transición de `background-color` / `color` en `body` para el cambio de tema.

---

## 2. Centro de Mando — tokens semánticos

Se reemplazó la paleta hardcodeada (hex/`slate`/`sky`) por los **tokens del diseño** definidos en `apps/web/tailwind.config.ts`. Los tokens existentes eran: `surface` (base/raised/overlay/pressed), `content` (default/secondary/muted), `emergency` (default/hover/pressed/soft/ring/ink), `ok`, `warn`, `info` (con soft), `edge` (subtle/strong).

### Archivos tocados
- `apps/web/app/command-center/layout.tsx` — contenedor con `forced-dark` + `bg-surface-base` / `text-content`; se quitó `selection:bg-sky-500/30`.
- `apps/web/app/command-center/page.tsx` — pestañas y paneles con tokens; skeleton de carga (cards + mapa) en lugar de un único spinner; estado de error con `bg-emergency-soft border-emergency/30 text-emergency` y botón de reintento.
- `apps/web/src/components/command-center/CommandCenterNav.tsx` — fondos, bordes y textos a tokens; reloj con `tabular-nums` y placeholder `—:—:—` (se representa con `\u2014\u2014:\u2014\u2014:\u2014\u2014`) en vez de pestañear antes del primer tick.
- `apps/web/src/components/command-center/MetricCard.tsx` — mapa estático `VARIANT_STYLES` (emerald→`ok`, rose→`emergency`, amber→`warn`, sky/indigo→`info`) con **strings de clases completos** (Tailwind no genera clases por interpolación dinámica).
- `apps/web/src/components/command-center/CommandCenterMap.tsx` — marcadores y popups en estilos inline con `var(--ok)`, `var(--emergency)`, `var(--info)`, `var(--surface-overlay)`, `var(--border-subtle)` y `var(--font-sans)`; `aria-pressed` en los filtros; popups con `maxWidth: 240px`.
- Listas de incidentes, flota y hospitales (`ActiveIncidentsList.tsx`, `FleetStatusList.tsx`, `HospitalStatusList.tsx`):
  - Prioridades: P1→`emergency`, P2→`warn`, P3→`ok`.
  - Estados operativos: `OPEN`/`ASSIGNING`→`warn`, `ASSIGNED`/`EN_ROUTE`→`info`, `ON_SCENE`/`TRANSPORTING`→`info`.
  - Disponibilidad de flota: `AVAILABLE`→`ok`, asignada/en ruta→`emergency`, `RESERVED`→`warn`.

---

## 3. Animaciones del Centro de Mando

- **Contadores con tween**: `useAnimatedNumber` en `MetricCard` anima el valor con `requestAnimationFrame` (550 ms, `ease-out` cúbico) y respeta `prefers-reduced-motion`.
- **Entrada escalonada**: tarjetas de métricas con `animate-fade-up` y `animationDelay: min(index × 45ms, 220ms)`; filas de lista con `.list-in` y `min(i × 35ms, 300ms)`.
- **Transición de pestañas**: los paneles llevan `key` propio para re-animar (`animate-fade-up`) al cambiar de tab.
- **Marcadores del mapa**: nueva animación `dispatch-pulse` (definida en `globals.css`) que sustituye a `animate-pulse`/`animate-ping` de Tailwind, que no funcionan en estilos inline de MapLibre.
- **Badges en vivo**: punto latente en la cabecera de listas y badges de "RECEPTOR ACTIVO" con `ok`.

---

## 4. Login y Registro — `apps/web/app/login/LoginClient.tsx`

- **Nota de consistencia**: se corrigieron los hover inexistentes `hover:bg-emergency-dark` y `hover:bg-info-dark` (que el navegador ignoraba) por `hover:bg-emergency-hover` y `hover:bg-info`, presentes en el token set.
- Componente `PasswordField`: toggle mostrar/ocultar contraseña (iconos `EyeIcon`/`EyeOffIcon`), `autoComplete` correcto y soporte de `required`.
- Sustitución de **emojis por iconos SVG** (`src/components/ui/icons.tsx`):
  - `👤` → `UserIcon`, `🚑` → `AmbulanceIcon`, `🚨` → `SosIcon`, `⚡` → `BoltIcon`, `📡` → indicador de punto con tokens.
  - Los emojis renderizan distinto según el sistema operativo; los SVG son consistentes y escalables.
- Animación `screen-enter` en el `<main>`.

---

## 5. Perfiles

### Ciudadano — `apps/web/app/profile/ProfileClient.tsx`
- Avatar con gradiente de marca (`from-emergency to-[#8a0f1e]`).
- `🚨 Reportar Emergencia` → `SosIcon`.
- Historial: al cargar se muestran **3 bloques skeleton** en vez de un texto que movía el layout.
- Tarjetas de reportes con `.list-in` y stagger `min(i × 45ms, 300ms)`.
- `screen-enter` en el `<main>`.

### Responder — `apps/web/app/responder/profile/ProfileClient.tsx`
- Emojis → iconos: `🚑` → `AmbulanceIcon` (badge de rol y enlace a consola GPS), `⚡` → `BoltIcon` (abrir navegación), `🚀` eliminado del botón de guardia, `📋` → `LocationIcon` dentro de círculo en el estado vacío.
- Historial de emergencias atendidas con skeleton de carga y estados a tokens (`COMPLETED`→`ok`, `CANCELLED`→`emergency`).
- `screen-enter` en el `<main>`.

---

## 6. Reporte, Responder y Seguimiento

- `apps/web/app/report/ReportClient.tsx` — `👤` → `UserIcon` (con `text-emergency`), indicador de teléfono `✓ LISTO` → `CheckIcon`, `screen-enter`.
- `apps/web/app/responder/ResponderClient.tsx` — `👤` → `UserIcon` en el enlace de perfil, `screen-enter`.
- `apps/web/app/track/[token]/TrackingClient.tsx` — el estado de carga usa skeleton (`Preparando tu seguimiento…`), `screen-enter` en la pantalla y mantiene el estado de reconexión offline.

---

## 7. Iconografía nueva — `apps/web/src/components/ui/icons.tsx`

Iconos agregados para sustituir emojis: `UserIcon`, `EyeIcon`, `EyeOffIcon`, `BoltIcon`. El resto del set (Mic, Stop, Phone, Sos, Ambulance, Location, Check, Alert, etc.) ya existía y se reutilizó.

---

## 8. Verificación

- `npm run typecheck` — OK (contracts, db, web, audio-service).
- `npm run check:layers` — OK (164 archivos, sin violaciones de capas).
- `npm run build` — OK (rutas `/command-center`, `/login`, `/profile`, `/report`, `/responder`, `/track/[token]` compiladas).

> La validación visual completa con datos requiere base de datos; al no haberse tocado la base de datos durante esta iteración, la verificación se realizó de forma estática + compilación (no se ejecutó el servidor de desarrollo).