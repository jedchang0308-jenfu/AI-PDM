# PostgreSQL / Supabase Migration

This folder contains the planned PostgreSQL schema migration for a future SQLite-to-Supabase upgrade.

Generate the migration:

```powershell
npm.cmd run db:postgres:migration
```

Generated file:

```text
db/postgres/001_initial_schema.sql
```

Notes:

- IDs stay as application-generated `TEXT` values to preserve compatibility with the current SQLite model.
- SQLite `datetime('now')` defaults are converted to PostgreSQL `now()`.
- Timestamp columns use `TIMESTAMPTZ`.
- `audit_logs.detail_json` is converted from SQLite text JSON to PostgreSQL `JSONB`.
- The migration creates update triggers for tables that have `updated_at`.
- Supabase Row Level Security policies are not enabled here because the application still enforces authorization in the Next.js API layer. RLS should be designed separately before exposing tables directly to clients.
