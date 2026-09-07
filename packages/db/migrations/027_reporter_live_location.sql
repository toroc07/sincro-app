-- Ubicación viva del ciudadano que reporta.
-- Rango 020-029 (dominio incidentes).
--
-- Mientras el ciudadano tiene /track/[token] abierto, su dispositivo transmite
-- su GPS actual. La tripulación ve dónde está AHORA, no dónde estaba al grabar
-- el audio (que se mueve: presenció el accidente desde la acera de enfrente,
-- caminó hasta el herido, etc.).
--
-- Solo la última posición: una emergencia no dura horas y no interesa la
-- traza. `reporter_location_at` deja que la UI descarte posiciones viejas
-- (>60s) en vez de pintar un punto congelado.
ALTER TABLE incidents
  ADD COLUMN reporter_lat         DOUBLE PRECISION,
  ADD COLUMN reporter_lng         DOUBLE PRECISION,
  ADD COLUMN reporter_accuracy_m  DOUBLE PRECISION,
  ADD COLUMN reporter_location_at BIGINT;
