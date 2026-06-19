# RD Report - P2 Supplier/Procurement Read-only Share

Date: 2026-05-27

## Implemented

- Added `readonly_shares` schema for time-limited external share tokens.
- Stored only SHA-256 token hashes in the database.
- Added Manager/Admin share management APIs:
  - `GET /api/submissions/[id]/shares`
  - `POST /api/submissions/[id]/shares`
  - `PATCH /api/submissions/[id]/shares/[shareId]`
- Added unauthenticated public read-only APIs:
  - `GET /api/public/shares/[token]`
  - `GET /api/public/shares/[token]/package`
- Added public page:
  - `/share/[token]`
- Added Dashboard share panel for Released submissions with release packages.
- Reused release package path validation for authenticated and public package downloads.
- Added audit log actions:
  - `ReadonlyShareCreated`
  - `ReadonlyShareRevoked`
- Added API regression cases `SHARE-001` through `SHARE-014`.

## Security Boundaries

- Engineers cannot create or revoke read-only shares.
- Pending submissions cannot be shared externally.
- Public share responses exclude `local_path`, `token_hash`, and `audit_logs`.
- Revoked tokens return 404 for metadata and package download.
- The public package endpoint validates the stored package path remains under the release package root.

## Files Changed

- `db/schema.sql`
- `db/postgres/001_initial_schema.sql`
- `src/lib/types.ts`
- `src/lib/db.ts`
- `src/lib/release-package-file.ts`
- `src/lib/readonly-share.ts`
- `src/app/api/submissions/[id]/release-package/route.ts`
- `src/app/api/submissions/[id]/shares/route.ts`
- `src/app/api/submissions/[id]/shares/[shareId]/route.ts`
- `src/app/api/public/shares/[token]/route.ts`
- `src/app/api/public/shares/[token]/package/route.ts`
- `src/app/share/[token]/page.tsx`
- `src/components/dashboard.tsx`
- `src/app/globals.css`
- `scripts/qc-api-test.mjs`
