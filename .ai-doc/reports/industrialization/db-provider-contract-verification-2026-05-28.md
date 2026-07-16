# DB Provider Contract Verification - 2026-05-28

## Scope
Verify the data layer has an explicit database provider boundary and feature repository contracts before larger repository extraction work.

## Implemented Boundary
- Added `DatabaseProvider` with a SQLite implementation and lifecycle `close()`.
- Kept SQLite as the only runtime adapter for this build through `SQLiteDatabaseProvider`.
- Added `PDM_DB_PROVIDER=sqlite`; unsupported providers fail closed with `UNSUPPORTED_DB_PROVIDER`.
- Moved direct `better-sqlite3` construction out of `src/lib/db.ts`.
- Added repository contracts for submissions, reviews, BOM, release, sandbox, item locks, and system settings.

## Evidence
- `npm.cmd run qc:db-provider-contract`: PASS.
- `npm.cmd run lint`: PASS.

## Key QC Facts
- `src/lib/db.ts` imports the DB provider boundary and returns `dbProvider.getConnection()`.
- `src/lib/db.ts` no longer imports or instantiates `better-sqlite3` directly.
- Repository contracts are type-only and do not change runtime API behavior.

## Result
PASS.
