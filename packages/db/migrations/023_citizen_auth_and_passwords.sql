-- 023_citizen_auth_and_passwords.sql
-- Autenticación con contraseña opcional para ciudadanos y personal operativo.

ALTER TABLE citizens
  ADD COLUMN password_hash TEXT;

ALTER TABLE users
  ADD COLUMN password_hash TEXT;
