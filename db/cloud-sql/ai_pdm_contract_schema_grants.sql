-- Additive privileged bootstrap for the AI-PDM cross-application contract schema.
-- Safe to apply to an existing Cloud SQL database after pdm_runtime and
-- pdm_migration have already been provisioned.

CREATE SCHEMA IF NOT EXISTS ai_pdm_contract;
REVOKE ALL ON SCHEMA ai_pdm_contract FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA ai_pdm_contract TO pdm_migration;
GRANT USAGE ON SCHEMA ai_pdm_contract TO pdm_runtime;
