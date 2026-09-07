-- promoteHeldDispatches() hace un JOIN LATERAL "último run por incidente" en
-- cada barrido (poll de /track, /responder, keepalive). Sin índice es un
-- seq-scan de dispatch_runs, tabla que solo crece.
CREATE INDEX IF NOT EXISTS ix_dispatch_runs_incident_created
  ON dispatch_runs (incident_id, created_at DESC);
