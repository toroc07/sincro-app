-- Reporte de origen sospechoso (muchos reportes en poco tiempo del mismo
-- teléfono/IP). No se bloquea —una emergencia real no puede perderse— pero
-- el incidente nunca se auto-despacha: entra en RECOMMEND y espera al
-- operador o a un SLA de promoción más largo (120s en vez de 45s).
-- Rango 020-029.
ALTER TABLE incidents ADD COLUMN suspected_abuse BOOLEAN NOT NULL DEFAULT FALSE;
