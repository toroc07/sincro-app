# 4. Base de Datos, Migraciones y Semillas

## Contexto
SINCRO utiliza **PostgreSQL** (alojado en la nube con **Neon**) gestionado a través de `@dispatch/db`. La persistencia maneja entidades críticas: organizaciones, usuarios con contraseñas cifradas, instalaciones médicas, zonas operativas, flota de vehículos, ubicaciones históricas/en tiempo real, incidentes, reportes y turnos de guardia.

---

## 1. Carga Automática de Variables de Entorno en CLI

- **Archivo**: [`packages/db/src/client.ts`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/packages/db/src/client.ts)
- **Problema previo**: Al ejecutar `npm run db:migrate` o `npm run db:seed` desde la consola de Windows, los scripts fallaban con:
  `Error: DATABASE_URL no esta definida. Copia .env.example a .env.local` debido a que `dotenv` no se cargaba automáticamente en los comandos CLI que ejecutan `migrate-cli.ts` o `seed-cli.ts`.
- **Solución implementada**:
  En `packages/db/src/client.ts`, se implementó una rutina que busca recursivamente el archivo `.env.local` en el directorio de trabajo y en el directorio raíz del proyecto:
  ```typescript
  import { existsSync, readFileSync } from 'node:fs';
  import { resolve } from 'node:path';

  if (!process.env.DATABASE_URL) {
    const candidates = [
      resolve(process.cwd(), '.env.local'),
      resolve(process.cwd(), '..', '..', '.env.local'),
      resolve(__dirname, '..', '..', '..', '.env.local'),
    ];
    for (const file of candidates) {
      if (existsSync(file)) {
        // Carga variables al process.env automáticamente
      }
    }
  }
  ```
  Ahora los comandos `npm run db:migrate` y `npm run db:seed` funcionan directamente sin necesidad de exportar variables de entorno manuales.

---

## 2. Normalización de Checksums en Migraciones (CRLF vs LF)

- **Archivo**: [`packages/db/src/migrations.ts`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/packages/db/src/migrations.ts)
- **Problema previo**: Cuando Git clona un repositorio en Windows, por defecto convierte los saltos de línea a CRLF (`\r\n`), mientras que en Linux/macOS se guardan con LF (`\n`). El sistema de migraciones calcula un hash SHA-256 sobre el contenido de cada archivo `.sql`. Si un hash difería por los saltos de línea, el comando fallaba con `CHECKSUM_MISMATCH`.
- **Solución implementada**:
  Antes de calcular el hash SHA-256 de cualquier archivo `.sql`, el contenido se normaliza a saltos de línea estándar Unix (`\n`):
  ```typescript
  const normalizedSql = rawSql.replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(normalizedSql, 'utf8').digest('hex');
  ```
  Esto garantiza que las migraciones sean 100% compatibles y reproducibles tanto en entornos Windows locales como en servidores de integración continua (CI) Linux.

---

## 3. Nuevas Migraciones Agregadas

### Migración `023_citizen_auth_and_passwords.sql`
- Añade soporte para el registro y autenticación de ciudadanos.
- Campos para correo electrónico, número de teléfono y hash de contraseña.

### Migración `024_staff_credentials.sql`
- Actualiza la tabla `users` para almacenar credenciales cifradas para personal operativo:
  - `password_hash`: Cadena con formato `salt:hex_hash` generada con el algoritmo estándar de la industria `scrypt`.
  - Roles soportados: `ADMIN`, `DISPATCHER`, `RESPONDER`.

---

## 4. Idempotencia y Limpieza en Cascada de Semillas (`seed/index.ts`)

- **Archivo**: [`packages/db/seed/index.ts`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/packages/db/seed/index.ts)
- **Reseed Idempotente**:
  Para permitir ejecutar `npm run db:seed` repetidamente sin violar claves foráneas ni duplicar registros:
  ```sql
  DELETE FROM dispatch_candidates WHERE vehicle_id IN (...);
  DELETE FROM assignments WHERE vehicle_id IN (...);
  UPDATE dispatch_runs SET recommended_vehicle_id = NULL WHERE recommended_vehicle_id IN (...);
  DELETE FROM vehicle_current_location WHERE vehicle_id IN (...);
  DELETE FROM vehicle_locations WHERE vehicle_id IN (...);
  DELETE FROM shifts WHERE vehicle_id IN (...);
  DELETE FROM vehicles WHERE id IN (...);
  ```
- **Flota Sembrada y Tripulación Única**:
  - **Unidad A05 (`seed-vehicle-05`)**: Asignada exclusivamente al usuario paramédico de prueba `user-responder` (`responder@sincro.co`). Nivel `RESCUE` para que nunca sea excluida del despacho en la demo.
  - **Unidades A01 a A28**: Asignadas a tripulaciones simuladas (`crew-01` a `crew-28`) para poblar el mapa distrital de Cartagena.
  - **Unidades A29 y A30**: Sembradas en estado `OFFLINE` y sin turno activo (`active_shift_id = NULL`) como **flota de reserva en base**, permitiendo probar la disponibilidad y cambio de unidades en el perfil del rescatista.

---

## Tabla Resumen de Cuentas del Sistema

| Tipo de Cuenta | Identificador / Correo | Contraseña | Rol | Destino en la Aplicación |
| :--- | :--- | :--- | :--- | :--- |
| **Gubernamental B2G** | `admin@sincro.co` | `admin123` | `ADMIN` | `/command-center` |
| **Despachador CRUED** | `dispatcher@sincro.co` | `dispatcher123` | `DISPATCHER` | `/command-center` |
| **Paramédico / Rescatista** | `responder@sincro.co` | `responder123` | `RESPONDER` | `/responder` & `/responder/profile` |
| **Ciudadano de Prueba** | `ciudadano@sincro.co` | `ciudadano123` | `CITIZEN` | `/` & `/profile` |
