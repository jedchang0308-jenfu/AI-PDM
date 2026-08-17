-- Remove the legacy submission-level PLM phase-gate workflow from PDM.
-- Immutable audit rows remain in audit_logs; only the active operational table is removed.

BEGIN;

DROP TABLE IF EXISTS public.phase_gate_checks;

COMMIT;
