-- Migration 047 is permanently reserved by the production ledger.
-- Production applied the historical full BOM retirement on 2026-08-24 from
-- another reviewed release branch. Its verified output checksum is accepted
-- only through config/platform/cloudsql-migration-history-compatibility.json.
--
-- Fresh databases already contain the current baseline, so this source is an
-- intentional no-op. Migration 048 owns the forward-compatible reconstruction,
-- legacy intake retirement, and shared assembly BOM schema.
SELECT 1;
