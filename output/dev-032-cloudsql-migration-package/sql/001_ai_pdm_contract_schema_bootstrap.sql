-- DEV-032 production incremental contract-schema bootstrap
-- Apply to an existing database through the approved privileged SQL-import path.
-- This file intentionally does not create roles or touch existing public-schema tables.
-- Additive privileged bootstrap for the AI-PDM cross-application contract schema.
-- Safe to apply to an existing Cloud SQL database after pdm_runtime and
-- pdm_migration have already been provisioned.

CREATE SCHEMA IF NOT EXISTS ai_pdm_contract;
REVOKE ALL ON SCHEMA ai_pdm_contract FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA ai_pdm_contract TO pdm_migration;
GRANT USAGE ON SCHEMA ai_pdm_contract TO pdm_runtime;
