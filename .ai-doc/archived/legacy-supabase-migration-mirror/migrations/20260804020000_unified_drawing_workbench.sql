-- Add DEV-053 source drawing and part context for candidate workspaces
-- Source: db/postgres/022_unified_drawing_workbench.sql
-- Source SHA-256: bb591af7db5e4750dcfc2349a2cc592e9296e8c1fa079a1a6acb8c01ead23e95
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

-- Add DEV-053 source drawing/part context to candidate workspaces.
-- This migration is additive-only and intentionally leaves every existing row NULL.

BEGIN;

ALTER TABLE public.numbering_draft_workspaces
  ADD COLUMN IF NOT EXISTS source_drawing_number_id TEXT,
  ADD COLUMN IF NOT EXISTS source_part_number_id TEXT,
  ADD COLUMN IF NOT EXISTS source_link_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'numbering_draft_workspaces_source_drawing_fkey'
      AND conrelid = 'public.numbering_draft_workspaces'::regclass
  ) THEN
    ALTER TABLE public.numbering_draft_workspaces
      ADD CONSTRAINT numbering_draft_workspaces_source_drawing_fkey
      FOREIGN KEY (source_drawing_number_id)
      REFERENCES public.drawing_numbers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'numbering_draft_workspaces_source_part_fkey'
      AND conrelid = 'public.numbering_draft_workspaces'::regclass
  ) THEN
    ALTER TABLE public.numbering_draft_workspaces
      ADD CONSTRAINT numbering_draft_workspaces_source_part_fkey
      FOREIGN KEY (source_part_number_id)
      REFERENCES public.part_numbers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'numbering_draft_workspaces_source_link_type_check'
      AND conrelid = 'public.numbering_draft_workspaces'::regclass
  ) THEN
    ALTER TABLE public.numbering_draft_workspaces
      ADD CONSTRAINT numbering_draft_workspaces_source_link_type_check
      CHECK (source_link_type IS NULL OR source_link_type IN ('primary_manufacturing', 'reference'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'numbering_draft_workspaces_source_context_check'
      AND conrelid = 'public.numbering_draft_workspaces'::regclass
  ) THEN
    ALTER TABLE public.numbering_draft_workspaces
      ADD CONSTRAINT numbering_draft_workspaces_source_context_check
      CHECK (
        (source_drawing_number_id IS NULL AND source_part_number_id IS NULL AND source_link_type IS NULL)
        OR (
          draft_mode = 'append_part'
          AND source_drawing_number_id IS NOT NULL
          AND source_part_number_id IS NULL
          AND source_link_type IS NOT NULL
        )
        OR (
          draft_mode = 'append_drawing'
          AND source_drawing_number_id IS NULL
          AND source_part_number_id IS NOT NULL
          AND source_link_type IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_numbering_draft_workspaces_source_drawing
  ON public.numbering_draft_workspaces(company_id, source_drawing_number_id)
  WHERE source_drawing_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_numbering_draft_workspaces_source_part
  ON public.numbering_draft_workspaces(company_id, source_part_number_id)
  WHERE source_part_number_id IS NOT NULL;

COMMIT;
