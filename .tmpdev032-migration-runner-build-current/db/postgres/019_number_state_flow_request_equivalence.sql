BEGIN;

ALTER TABLE numbering_draft_workspaces
  ADD COLUMN IF NOT EXISTS append_reason TEXT;

ALTER TABLE numbering_draft_parts
  ADD COLUMN IF NOT EXISTS universal_reason TEXT;

COMMIT;
