# 3. Reporte Ciudadano y Enlace de Contacto

## Contexto
En una emergencia médica real, cada segundo cuenta. Quien presencia un paro cardíaco o un accidente de tránsito no puede perder tiempo creando cuentas o recordando contraseñas. Por ello, SINCRO permite el **reporte inmediato por voz sin registro previo**.

Sin embargo, para que la ambulancia enviada pueda ubicar a la persona, pedir referencias de acceso o confirmar el estado del paciente en el trayecto, **es indispensable que el alertante proporcione un número de celular de contacto**.

---

## 1. Flujo de Reporte por Voz Inmediato

- **Ruta Principal**: [`/`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/report/ReportClient.tsx)
- **Acceso Directo desde Login**: Botón destacado en `/login`:  
  *`🚨 Reportar emergencia ahora (Sin registro)`*

### Pasos del Usuario:
1. **Detección GPS Automática**: El navegador adquiere las coordenadas de latitud/longitud y el radio de precisión (ej: `±15 m`).
2. **Entrada de Celular de Contacto**: Campo visible en la pantalla principal para ingresar el número telefónico antes o después de hablar.
3. **Grabación de Voz**: Pulsando el botón central rojo, el ciudadano describe lo ocurrido con sus propias palabras (la IA transcribe y extrae la prioridad clínica y la cantidad de pacientes).
4. **Confirmación Rápida**: Pregunta de confirmación del tipo de incidente y verificación del número celular.
5. **Seguimiento en Vivo**: Redirección a `/track/[token]` donde el ciudadano observa el mapa en tiempo real con la ambulancia aproximándose.

---

## 2. Captura y Validación del Número de Celular Anónimo

En [`apps/web/app/report/ReportClient.tsx`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/report/ReportClient.tsx):

### 1. Barra de Celular en la Pantalla Principal
Ubicada estratégicamente debajo del indicador de ubicación:
- **Icono y Etiqueta**: `📱 CELULAR PARA QUE LA AMBULANCIA TE LLAME`
- **Validación en Tiempo Real**:
  - Si el campo está vacío o tiene menos de 7 dígitos numéricos, muestra la insignia en rojo: `Requerido`.
  - En cuanto se ingresa un teléfono válido (ej: `3001234567`), cambia dinámicamente a la insignia verde: `✓ Listo`.
- **Persistencia en el Dispositivo**: Se guarda en `localStorage` (`sincro_contact_phone`). Si la persona vuelve a abrir la app, su número ya está precompletado y no tiene que volver a escribirlo en medio del pánico. Si está autenticado como ciudadano, toma el teléfono de su perfil.

### 2. Tarjeta Destacada en el Panel de Envío (`ReviewPanel`)
Antes de enviar el reporte:
- Muestra una tarjeta con borde de alerta si aún no se ha digitado el celular:  
  *"La tripulación médica te llamará a este número para confirmar la llegada o si necesita indicaciones de cómo entrar"*.
- Si el usuario intenta presionar **"Enviar reporte"** sin ingresar un número válido, el envío se detiene y se muestra un mensaje de alerta:  
  *`Por favor ingresa tu número de celular para que la tripulación de la ambulancia pueda comunicarse contigo.`*

---

## 3. Enlace Directo con la Cabina de la Ambulancia

En [`apps/web/app/responder/ResponderClient.tsx`](file:///c:/Users/darye/Desktop/Hackaton/sincro-app/apps/web/app/responder/ResponderClient.tsx):

1. **Almacenamiento**: Al emitirse el reporte a `POST /api/incidents/audio`, el teléfono se guarda en la columna `reporter_contact` de la tabla `incident_reports`.
2. **Entrega a la Tripulación**: Cuando el incidente se asigna a la unidad, la API `/api/responder/current` entrega el `reporterContact`.
3. **Botón de Llamada Activo**:
   - En la consola del paramédico, el botón que antes decía *"Sin teléfono de contacto"* se transforma en un botón interactivo azul:
     ```html
     <a href="tel:3001234567" class="text-info font-bold">
       📞 Llamar al reportante (3001234567)
     </a>
     ```
   - Al tocarlo en el celular o tablet de la ambulancia, se abre inmediatamente el marcador telefónico del dispositivo para llamar al alertante.

---

## 4. Verificación en Navegador y Base de Datos

1. **Prueba en Navegador**: Se navegó a `http://localhost:3000/`, se digitó el celular `30091234567`, verificando la transición dinámica de `Requerido` a `✓ Listo`.
2. **Prueba en Base de Datos**: Se emitió un reporte con `reporterContact: '3009876543'`, y se consultó la tabla `incident_reports`, confirmando que el registro quedó asociado correctamente al nuevo incidente:
   ```json
   {
     "code": "INC-CN7",
     "source": "WEB",
     "reporter_contact": "3009876543",
     "description": null
   }
   ```
