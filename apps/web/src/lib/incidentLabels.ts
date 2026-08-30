import type { Incident } from '@dispatch/contracts';

// Única fuente de las etiquetas en español de IncidentType para toda la UI
// (antes vivía duplicado dentro de CommandCenter.tsx).
export const INCIDENT_TYPE_LABEL: Record<Incident['type'], string> = {
  TRAFFIC_ACCIDENT: 'Accidente vehicular',
  CARDIAC: 'Evento cardíaco',
  UNCONSCIOUS: 'Persona inconsciente',
  FALL: 'Caída',
  TRAUMA: 'Trauma',
  RESPIRATORY: 'Dificultad respiratoria',
  OBSTETRIC: 'Emergencia obstétrica',
  OTHER: 'Otra emergencia',
};
