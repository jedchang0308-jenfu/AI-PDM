-- DEV-046 Cloud SQL candidate generated from db/postgres/031_workbench_preview_gallery.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-065: deterministic root drawing lookup for the workbench preview gallery.
CREATE INDEX IF NOT EXISTS idx_drawings_company_root_sequence
  ON drawings(company_id, part_root_id, sequence_no, drawing_number, id);
