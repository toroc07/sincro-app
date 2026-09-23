# SINCRO: vista previa local y cambios

## Accesos locales

- Ciudadanía / reporte de emergencia: `http://localhost:3000/`
- Ambulancias / equipo de respuesta: `http://localhost:3000/responder`
- Centro de mando: `http://localhost:3000/command-center`
- Seguimiento de un reporte de demostración: `http://localhost:3000/track/<token>` (el token se genera al crear el reporte).

## Identidades de demostración

Cuando se ejecuta en desarrollo sin `DATABASE_URL`, el centro de mando admite `admin@sincro.co` / `admin123`. El acceso de personal de demostración usa `user-responder` / `responder123` y `user-dispatcher` / `dispatcher123`. Son únicamente credenciales locales de demostración; no deben usarse ni habilitarse en producción.

## Diseño y recursos visuales

Se unificó la interfaz en una base clara cálida, texto grafito y rojo SINCRO para acciones y alertas; verde y ámbar se reservan para estados operativos. Se sustituyeron acentos azules heredados por tonos neutros, se ajustaron textos de incidentes/estados al español y se conservaron los iconos SVG existentes. La marca usa el emblema S del proyecto, separado de los iconos de navegación y de los marcadores de mapa. El favicon no se modificó.

El flujo ciudadano mantiene el reporte por voz, el mapa para revisar/marcar la ubicación y el mapa de seguimiento del caso. La transcripción literal se muestra cuando un proveedor STT configurado logra procesar el audio. El mapa del centro de mando muestra incidentes, unidades y centros; al seleccionar un incidente se pueden consultar ambulancias disponibles por cercanía y enviar una unidad concreta. La ubicación operacional de una ambulancia debe llegar del GPS del dispositivo que tiene abierta la vista de respuesta: si falta una lectura reciente, no se presenta una coordenada fija como si fuera actual.

El panel de ambulancia muestra el tipo y la transcripción literal del reporte, ofrece llamada telefónica cuando hay un número de contacto y abre navegación al destino. El conductor confirma el inicio de ruta, la llegada y el cierre de la atención; cerrar libera la unidad y quita el incidente de los elementos activos. El seguimiento del ciudadano incluye la transcripción disponible, la ubicación reportada, la ambulancia y el estado. La transcripción ahora tiene un presupuesto total de 10 segundos para evitar largas esperas por varios motores STT en cascada.

Al abrir un reporte en el centro de mando se carga el audio original con un endpoint protegido por sesión, para poder escucharlo si el STT no devolvió una transcripción. Una asignación activa se devuelve como existente tanto en la vista de candidatos como en el despacho, evitando reservar otra unidad para el mismo reporte. En seguimiento, “aceptó” se distingue de “va en camino” y se muestra el indicativo y la placa cuando están disponibles. El marcador de ambulancia es una ilustración isométrica animada que se desplaza sobre la ruta del mapa; es una representación visual 2D, no un modelo 3D navegable. Al confirmar llegada, la vista de respuesta recomienda y permite navegar al hospital/centro más cercano. Las coordenadas de ejemplo se ubicaron en puntos urbanos conocidos; para operación real prevalece el GPS del dispositivo y no se debe falsificar si reporta una posición inesperada.

## Vista previa sin base de datos

El modo local de demostración se activa solo fuera de producción cuando falta la configuración de base de datos. Usa datos de muestra y persiste el estado compartido entre rutas del servidor en `apps/web/.next/sincro-local-preview.json`; ese archivo vive bajo `.next` y no forma parte del código versionado. Incluye unidades A-123, A-456 y A-789, centros de atención e incidentes de prueba. Para probar un caso limpio se puede detener el servidor y retirar únicamente ese archivo de vista previa, que se volverá a crear con los datos iniciales al siguiente arranque.

Con base de datos configurada, autenticación, datos y despacho continúan por las rutas normales de la aplicación; no se debe exponer el modo de demostración en un despliegue.

## Verificación manual sugerida

1. Abrir las tres rutas locales de arriba y entrar al centro de mando con las credenciales locales.
2. Desde ciudadanía, permitir ubicación o marcar una zona manualmente y crear un reporte de voz.
3. Comprobar que el reporte aparece como punto destacado en el mapa del centro de mando.
4. Abrir el reporte, revisar las unidades cercanas y enviar una ambulancia.
5. En la vista de respuesta, habilitar ubicación del dispositivo y comprobar que su GPS actualiza el marcador; luego confirmar ruta, llegada y cierre. Verificar que el centro de mando libera la unidad y retira el caso activo.
6. Volver a intentar despachar el mismo incidente: debe conservarse la unidad asignada. Aceptar la oferta y comprobar que el seguimiento muestra la aceptación y placa antes de pasar a “en camino”. Si el audio no tuvo transcripción, debe poder reproducirse desde el panel del centro de mando.

Las ambulancias precargadas de la vista previa son datos de muestra. La transcripción requiere configurar al menos uno de los proveedores STT (`GROQ_API_KEY`, `ELEVENLABS_API_KEY` o `OPENAI_API_KEY`) en `.env.local`; sin credenciales se conserva el reporte y el usuario puede precisar el tipo, pero no se inventa una transcripción. Las distancias y ETA locales son aproximadas; no representan navegación vial ni una operación real.
