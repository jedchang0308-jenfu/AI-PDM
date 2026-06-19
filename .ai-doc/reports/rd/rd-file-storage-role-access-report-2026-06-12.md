# RD Report: DEV-STORAGE-COST-001 File Storage Role Access QC

Date: 2026-06-12

## Scope

- Task: `DEV-STORAGE-COST-001`
- Phase: released-only role and public share access gate
- Goal: prove local file delivery, release package delivery, and supplier package share access stay scoped to the intended user role or token boundary.

## Changes

- Added `scripts/qc-file-storage-role-access.mjs`.
- Registered `qc:file-storage-role-access` in `package.json`.

## Coverage

- Manufacturing / Procurement released-only role helper remains centralized in `src/lib/permissions.ts`.
- Submission file lookup uses `canReadSubmission(...)`; file route authenticates before lookup and audits only after authorized storage-backed read.
- Release package route uses `canReadSubmission(...)`, requires `Released` or `Obsolete` package state, and audits after storage-backed read.
- PDF preview keeps the PDF-only guard and blocks non-PDF inline preview with `415`.
- Public supplier package route is scoped by share token, does not accept actor cookies for scope, records public share access, and uses `actorId: null`.
- Read-only share lookup rejects revoked or expired shares through repository status normalization plus `getPublicShare(...)`.
- Existing `qc:api` assertions still cover package download, revoked share blocking, share metadata redaction, and procurement release API role denial/redaction.
- Existing local provider regression still locks release/share storage audit assertions.

## Verification

- `node --check scripts/qc-file-storage-role-access.mjs` passed.
- `npm.cmd run qc:file-storage-role-access` passed 21/21.

## Boundary

- This gate is static / fixture evidence only.
- No Supabase connector call, no live provider request, no DB migration, no provider pointer update, no file migration, and no production data mutation was performed.
- Current product scope proves supplier access to shared release packages. Specified single-file supplier share is not productized yet and remains outside this completed claim.
