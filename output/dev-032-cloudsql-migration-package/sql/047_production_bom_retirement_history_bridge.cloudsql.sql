-- DEV-046 Cloud SQL candidate generated from db/postgres/047_production_bom_retirement_history_bridge.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Migration 047 is permanently reserved by the production ledger.
-- Production applied the historical full BOM retirement on 2026-08-24 from
-- another reviewed release branch. Its verified output checksum is accepted
-- only through config/platform/cloudsql-migration-history-compatibility.json.
--
-- Fresh databases already contain the current baseline, so this source is an
-- intentional no-op. Migration 048 owns the forward-compatible reconstruction,
-- legacy intake retirement, and shared assembly BOM schema.
SELECT 1;
