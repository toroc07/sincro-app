-- Ciudadano sin contraseña ni correo: solo nombre + teléfono (§ rediseño de flujo).
-- Rango 020-029.
--
-- `password_hash` se deja como columna muerta (no se dropea para no perder
-- filas existentes que la tengan). `email` pasa a opcional: las cuentas nuevas
-- se crean sin correo y el índice único que lo exigía se retira.
--
-- El índice único de `phone` (ux_citizens_phone) se MANTIENE: es la clave del
-- upsert por teléfono.
ALTER TABLE citizens ALTER COLUMN email DROP NOT NULL;
DROP INDEX IF EXISTS ux_citizens_email;
