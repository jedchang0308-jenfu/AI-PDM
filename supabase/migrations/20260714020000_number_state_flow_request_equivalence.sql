-- Add DEV-048 request-equivalence reasons to draft workspaces and parts
-- Source: db/postgres/019_number_state_flow_request_equivalence.sql
-- Source SHA-256: b24bd3d58e86a63156c6de3108c16fcebeebe012fb159f96389c14c28c22a9cf
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

BEGIN;

ALTER TABLE numbering_draft_workspaces
  ADD COLUMN IF NOT EXISTS append_reason TEXT;

ALTER TABLE numbering_draft_parts
  ADD COLUMN IF NOT EXISTS universal_reason TEXT;

COMMIT;
