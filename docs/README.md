# Documentación Técnica SINCRO

Bienvenido a la documentación técnica de **SINCRO** (Sistema Integrado de Comunicaciones y Respuesta Operativa). Este repositorio centraliza la supervisión distrital de emergencias médicas en Cartagena de Indias, integrando a ciudadanos, tripulaciones de ambulancia, red hospitalaria y organismos reguladores (CRUED / DADIS).

---

## Índice de Documentación

| Documento | Descripción |
| :--- | :--- |
| [**1. Arquitectura y Centro de Mando (B2G)**](./01_ARQUITECTURA_Y_CENTRO_DE_MANDO.md) | Módulo gubernamental exclusivo para el CRUED y DADIS. KPIs en vivo, mapa interactivo con OpenStreetMap, capas de incidentes, ambulancias y hospitales. |
| [**2. Sistema de Guardia y Gestión de Flota**](./02_SISTEMA_DE_GUARDIA_Y_FLOTA.md) | Ciclo de vida operativo del personal médico, autenticación, control de turno (iniciar/finalizar guardia), disponibilidad real de ambulancias y resolución de conflictos. |
| [**3. Reporte Ciudadano y Enlace de Contacto**](./03_REPORTE_CIUDADANO_Y_CONTACTO.md) | Flujo de emergencia por voz inmediato sin registro, captura y validación de celular anónimo, geolocalización y enlace telefónico directo en cabina de ambulancia. |
| [**4. Base de Datos, Migraciones y Semillas**](./04_BASE_DE_DATOS_Y_MIGRACIONES.md) | Esquema relacional en PostgreSQL (Neon), normalización de checksums en migraciones multiplataforma, scripts CLI y configuración de flota de reserva. |
| [**5. Mejoras Visuales y Animaciones**](./MEJORAS-VISUALES.md) | Revisión visual del frontend: tema automático claro/oscuro, tokens semánticos, skeletons, animaciones escalonadas, iconos SVG y consistencia en login, centro de mando, perfiles y reporte. |

---

## Mapa de Rutas de la Aplicación

### 1. Nivel Ciudadano (Atención Inmediata)
- **`/` (o `/report`)**: Interfaz principal de reporte por voz con detección de ubicación GPS y captura obligatoria de teléfono de contacto para la ambulancia.
- **`/track/[token]`**: Consola de seguimiento en tiempo real del estado de la ambulancia asignada.
- **`/login`**: Acceso y registro para ciudadanos con historial de reportes.
- **`/profile`**: Perfil del ciudadano autenticado con sus datos y reportes previos.

### 2. Nivel Operativo (Tripulaciones de Ambulancia / Responders)
- **`/login?type=staff`**: Acceso para personal operativo y médico con credenciales cifradas.
- **`/responder`**: Consola de navegación GPS en cabina de ambulancia, recepción de misiones, botón de llamada directa al alertante y gestión de estados (`EN_ROUTE`, `ON_SCENE`, `TRANSPORTING`, `COMPLETED`).
- **`/responder/profile`**: Perfil operativo del paramédico, métricas de misiones y control de guardia (iniciar/finalizar turno en ambulancia).

### 3. Nivel Distrital y Gubernamental (B2G - CRUED / DADIS / Alcaldía)
- **`/command-center/login`**: Portal de acceso institucional aislado con validación de roles de alta jerarquía (`ADMIN` y `DISPATCHER`).
- **`/command-center`**: Centro de mando interactivo con mapa distrital de Cartagena, telemetría de 30 unidades, estado hospitalario y gestión de incidentes críticos.

---

## Comandos Principales del Proyecto

```bash
# Iniciar el servidor de desarrollo local
npm run dev

# Ejecutar migraciones de base de datos
npm run db:migrate

# Sembrar datos de demostración en PostgreSQL (flota, zonas, hospitales, usuarios)
npm run db:seed

# Validar tipado TypeScript sin emitir código
npm run typecheck

# Ejecutar suite de pruebas automatizadas
npm run test
```
