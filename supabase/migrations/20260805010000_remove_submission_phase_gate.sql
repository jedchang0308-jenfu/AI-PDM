-- Remove the retired submission approval blocker workflow
-- Source: db/postgres/024_remove_submission_phase_gate.sql
-- Source SHA-256: 2356b3512aa6a402dd449859eb18c75400936234fb354e0a4cf73a011bb997a6
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

-- Remove the legacy submission-level PLM phase-gate workflow from PDM.
-- Immutable audit rows remain in audit_logs; only the active operational table is removed.

BEGIN;

DROP TABLE IF EXISTS public.phase_gate_checks;

COMMIT;
