# 1. Arquitectura y Centro de Mando Distrital (B2G)

## Contexto y Objetivo
El módulo **B2G (Business-to-Government)** de SINCRO fue diseñado como una consola de mando unificada para organismos de regulación en salud de Cartagena de Indias (**CRUED - Centro Regulador de Urgencias y Emergencias** y **DADIS - Departamento Administrativo Distrital de Salud**).

Permite monitorear en tiempo real:
1. La ubicación y estado operativo de toda la flota de ambulancias del distrito.
2. Los incidentes activos georreferenciados clasificados por nivel de gravedad (P1 Rojo, P2 Amarillo, P3 Verde).
3. La red de instituciones prestadoras de salud (hospitales y clínicas de trauma) receptoras de pacientes.

---

## 1. Acceso Institucional Aislado

Para salvaguardar la seriedad del acceso gubernamental y no sobrecargar la pantalla pública de login ciudadano, se implementó un acceso aislado:

- **Ruta de Acceso**: [`/command-center/login`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/command-center/login/page.tsx)
- **Control de Acceso y Roles**:
  - Verifica las credenciales en la tabla `users` mediante hashing seguro (`scrypt`).
  - Restringe el acceso estrictamente a los roles **`ADMIN`** y **`DISPATCHER`**.
  - Si un usuario con otro rol (o un ciudadano) intenta ingresar, el servidor rechaza la petición con código **`403 FORBIDDEN`** y un mensaje de advertencia de seguridad distrital.
- **Credenciales Preconfiguradas para Demostración**:
  - **Identificador**: `admin@sincro.co`
  - **Contraseña**: `admin123`
  - *(Cuenta con botón de autocompletado en un clic para agilizar demostraciones ante jurados o autoridades).*

---

## 2. Centro de Mando y Dashboard Principal

- **Ruta del Dashboard**: [`/command-center`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/command-center/page.tsx)

### Componentes de Interfaz:
1. **Barra de Navegación Ejecutiva (`CommandCenterNav.tsx`)**:
   - Muestra el identificador del operador conectado y su rol oficial.
   - Reloj digital sincronizado con la hora local de Cartagena (UTC-5).
   - Indicador de telemetría activa con pulso verde en vivo.
   - Botón de cierre de sesión seguro.

2. **Panel de Indicadores Clave (KPIs)**:
   - **Flota Total**: Conteo total de vehículos registrados en la red.
   - **Unidades Disponibles**: Ambulancias libres en base o patrullaje listas para despacho.
   - **Unidades en Misión**: Ambulancias en traslado, en escena o transportando pacientes hacia hospitales.
   - **Emergencias Activas**: Total de incidentes en curso en el distrito.
   - **Casos Críticos (P1)**: Emergencias con prioridad vital (código rojo).
   - **Centros de Trauma e IPS**: Nodos hospitalarios habilitados.

3. **Mapa Georreferenciado Interactivo (`CommandCenterMap.tsx`)**:
   - Construido sobre **MapLibre GL** utilizando teselas cartográficas estándar de **OpenStreetMap** (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), eliminando dependencias de APIs con marcas de agua o límites de cuotas.
   - **Marcadores Dinámicos**:
     - 🚑 **Ambulancias**: Verde para disponibles, rojo para unidades en misión, amarillo para reservadas y gris para fuera de servicio. Al hacer clic, despliega la placa, indicativo (ej: A05), nivel de soporte (ALS/BLS/RESCUE) y velocidad actual.
     - 🚨 **Emergencias**: Círculos pulsantes codificados por gravedad (P1/P2/P3), con información del tipo de incidente y dirección.
     - 🏥 **Hospitales**: Marcadores de instalaciones con su clasificación (Trauma Nivel III/IV, General) y especialidades disponibles (Urgencias, Quirófano, UCI).
   - **Filtros de Capas**: Controles flotantes para alternar la visibilidad de ambulancias, incidentes u hospitales con un solo clic.

4. **Panel Lateral Operativo**:
   - **Pestaña Emergencias**: Listado de casos activos con tiempo transcurrido y botón de "Localizar" que desplaza suavemente la cámara del mapa hacia las coordenadas exactas del evento.
   - **Pestaña Ambulancias**: Estado de cada vehículo de la flota con nivel de soporte vital y estado de conexión GPS.
   - **Pestaña Hospitales**: Listado de centros asistenciales receptores.

---

## 3. Endpoints de Backend Desarrollados

| Método | Endpoint | Propósito |
| :--- | :--- | :--- |
| `POST` | `/api/command-center/auth/login` | Autentica administradores/despachadores y genera cookie de sesión `dispatch_session`. |
| `POST` | `/api/command-center/auth/logout` | Revoca la sesión del centro de mando y limpia cookies. |
| `GET` | `/api/command-center/auth/me` | Verifica la validez de la sesión activa del operador. |
| `GET` | `/api/command-center/overview` | Agrega y totaliza las métricas de flota, emergencias y capacidad hospitalaria. |
| `GET` | `/api/facilities` | Retorna el catálogo de hospitales de la base de datos (con fallback automático a fixtures si la red fallase). |
