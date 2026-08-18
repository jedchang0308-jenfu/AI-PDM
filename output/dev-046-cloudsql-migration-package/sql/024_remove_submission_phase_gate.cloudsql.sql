-- DEV-046 Cloud SQL candidate generated from db/postgres/024_remove_submission_phase_gate.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Remove the legacy submission-level PLM phase-gate workflow from PDM.
-- Immutable audit rows remain in audit_logs; only the active operational table is removed.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:4

DROP TABLE IF EXISTS public.phase_gate_checks;

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:8
