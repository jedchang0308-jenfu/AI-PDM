-- DEV-106: purpose discriminator for shared BOM definitions.
-- Additive and forward-only.  Existing definitions are manufacturing.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:dev106:sales-kit-bom-v1'));

ALTER TABLE bom_definitions ADD COLUMN IF NOT EXISTS purpose TEXT;
UPDATE bom_definitions SET purpose = 'manufacturing' WHERE purpose IS NULL;

ALTER TABLE bom_definitions ALTER COLUMN purpose SET DEFAULT 'manufacturing';
ALTER TABLE bom_definitions ALTER COLUMN purpose SET NOT NULL;
ALTER TABLE bom_definitions DROP CONSTRAINT IF EXISTS bom_definitions_purpose_check;
ALTER TABLE bom_definitions ADD CONSTRAINT bom_definitions_purpose_check
  CHECK (purpose IN ('manufacturing', 'sales_kit'));

CREATE INDEX IF NOT EXISTS idx_bom_definitions_company_purpose
  ON bom_definitions(company_id, purpose, updated_at, id);

CREATE OR REPLACE FUNCTION dev106_guard_bom_definition_purpose() RETURNS trigger AS $$
BEGIN
  IF NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    RAISE EXCEPTION 'BOM_DEFINITION_PURPOSE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bom_definition_purpose_immutable ON bom_definitions;
CREATE TRIGGER trg_bom_definition_purpose_immutable
  BEFORE UPDATE OF purpose ON bom_definitions
  FOR EACH ROW EXECUTE FUNCTION dev106_guard_bom_definition_purpose();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bom_definitions WHERE purpose IS NULL OR purpose NOT IN ('manufacturing', 'sales_kit')) THEN
    RAISE EXCEPTION 'BOM_DEFINITION_PURPOSE_INVALID';
  END IF;
END;
$$;

COMMIT;
