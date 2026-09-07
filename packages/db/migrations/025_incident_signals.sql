-- Señales críticas del triage persistidas en el incidente.
-- Rango 020-029 (dominio incidentes).
--
-- Las 4 señales (unconscious, notBreathing, severeBleeding, trapped) las marca
-- el reporter con botones o las extrae el transcriptor del audio. Alimentan
-- triage(), que es quien decide la prioridad (§24) — no el modelo.
--
-- Antes vivían solo en el request y se perdían tras crear el incidente: cuando
-- el ciudadano confirmaba el tipo desde /track, el re-triage corría SIN señales
-- y se equivocaba (rebajaba un P1 marcado "no respira" a P2 por tipo). Ahora se
-- guardan y el re-triage las respeta.
--
-- JSON en TEXT (no JSONB): el volumen es trivial y el resto de metadata del
-- esquema usa el mismo patrón.
ALTER TABLE incidents
  ADD COLUMN signals TEXT NOT NULL DEFAULT '{}';
