-- Add optional series code to manufactured non-universal part drafts and official part numbers
-- Source: db/postgres/018_part_number_series_code.sql
-- Source SHA-256: 06d274b9115a9e00900a0cb2e607eb248feca22b8ac56a29fd9d31c15920b512
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

BEGIN;

ALTER TABLE part_numbers
  ADD COLUMN IF NOT EXISTS series_code TEXT;

ALTER TABLE numbering_draft_parts
  ADD COLUMN IF NOT EXISTS series_code TEXT;

COMMIT;
