-- Preserve the canonical Part structure classification independently from the
-- retired BOM module.  This migration must not recreate BOM tables, columns,
-- routes, or runtime capabilities.

ALTER TABLE part_numbers
  ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'single_part';

ALTER TABLE part_numbers
  DROP CONSTRAINT IF EXISTS part_numbers_structure_type_check;

ALTER TABLE part_numbers
  ADD CONSTRAINT part_numbers_structure_type_check
  CHECK (structure_type IN ('single_part', 'assembly', 'unclassified'));
