-- DEV-065: deterministic root drawing lookup for the workbench preview gallery.
CREATE INDEX IF NOT EXISTS idx_drawings_company_root_sequence
  ON drawings(company_id, part_root_id, sequence_no, drawing_number, id);
