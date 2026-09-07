-- Resumen consolidado por IA del incidente.
-- Rango 020-029 (dominio incidentes).
--
-- Un incidente puede acumular varios reportes (varios testigos de la misma
-- emergencia). Cada uno se conserva intacto en incident_reports; este campo es
-- la SÍNTESIS de todos ellos, con procedencia temporal, regenerada en cada
-- reporte nuevo. Nunca sustituye a los reportes individuales.
--
-- Nullable: si no hay motor LLM configurado (o falla), el incidente funciona
-- igual y el resumen queda en NULL. `ai_summary_updated_at` permite a la UI
-- saber si el resumen es fresco respecto al último reporte.
ALTER TABLE incidents
  ADD COLUMN ai_summary            TEXT,
  ADD COLUMN ai_summary_updated_at BIGINT;
