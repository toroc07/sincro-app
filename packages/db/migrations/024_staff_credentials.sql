-- 024_staff_credentials.sql
-- Añade soporte para correo electrónico en personal médico/operativo.

ALTER TABLE users
  ADD COLUMN email TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));
