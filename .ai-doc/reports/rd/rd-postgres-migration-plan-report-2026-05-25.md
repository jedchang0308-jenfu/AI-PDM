# RD Report: PostgreSQL Migration Plan

Date: 2026-05-25
Scope: P2 SQLite to Supabase/PostgreSQL migration script

## Summary

Added a repeatable migration generator for the future SQLite-to-Supabase/PostgreSQL upgrade path.

## Changes

- Added `scripts/generate-postgres-migration.mjs`.
- Added npm script `db:postgres:migration`.
- Added `db/postgres/README.md`.
- Generated `db/postgres/001_initial_schema.sql`.
- Updated `PDM_dev_task.md` to mark `P2 規劃 SQLite 升級 Supabase/PostgreSQL 的 migration script` complete.

## Migration Decisions

- Preserve current application-generated `TEXT` IDs instead of switching to UUID defaults.
- Convert SQLite timestamp defaults to PostgreSQL `TIMESTAMPTZ DEFAULT now()`.
- Convert `audit_logs.detail_json` from text JSON to `JSONB`.
- Add PostgreSQL update triggers for tables with `updated_at`.
- Keep Supabase RLS policy design out of this migration because the current app authorization boundary is the Next.js API.

## Verification

Recommended local validation:

```powershell
npm.cmd run db:postgres:migration
node --check scripts/generate-postgres-migration.mjs
npm.cmd run qc:file-hashes
```
