# QA Validation Plan - BOM Workbench Released-only Permission

Date: 2026-06-01
Task: DEV-BOM-WORKBENCH-001
Scope: Manufacturing and Procurement roles must be able to consume Released BOM Snapshot exports, but must not read or mutate BOM Draft data through API routes.

## Validation Scope

- Verify `Manufacturing` and `Procurement` are valid system user roles in SQLite schema, Postgres shadow schema, demo auth seed, and create-user CLI validation.
- Verify BOM Draft API routes reject released-only roles:
  - `GET /api/bom/workbench?submissionId=...`
  - `GET /api/bom/drafts/[draftId]`
  - `PATCH /api/bom/drafts/[draftId]`
  - `POST /api/bom/drafts/[draftId]/active`
  - `POST /api/bom/drafts/[draftId]/submit-review`
  - `POST /api/bom/drafts/from-assembly`
- Verify released-only roles can export official Released BOM Snapshot CSV.
- Verify existing RD/manager BOM draft, review, and release flow still works.

## User Critical Flows

- R&D Manager creates and reads a BOM Draft during engineering work.
- Engineer submits Active Draft for review.
- R&D Manager approves the review and creates a Released Snapshot.
- Manufacturing and Procurement attempt to access Draft routes and receive 403.
- Manufacturing and Procurement export the Released Snapshot and receive the fixed filename CSV.

## FMEA Risk Table

| Risk | Cause | Effect | Detection | Priority | Mitigation |
|---|---|---|---|---|---|
| Released-only roles can read Draft | BOM routes reuse broad submission read permission | Manufacturing/procurement see unapproved engineering structure | API test each Draft read/mutate route as both roles | High | Add `canReadBomDraft` guard denying released-only roles |
| Released-only roles cannot consume official BOM | Guard blocks all BOM endpoints | Manufacturing/procurement cannot work from approved BOM | Export Released Snapshot as both roles | High | Add `canReadBomReleasedSnapshot` guard |
| New roles cannot log in | DB CHECK or seed list still only allows old roles | QC cannot verify role boundary; production setup fails | Login as demo manufacturing/procurement | High | Update schema, runtime SQLite role migration, seed, login, CLI |
| Existing users table fails after schema change | SQLite `CREATE TABLE IF NOT EXISTS` does not update CHECK constraints | Demo seed insert fails on existing DB | Start app with existing data and run role login | High | Rebuild users table only when role CHECK lacks new roles |
| Existing BOM release flow regresses | Guard too strict for engineer/manager | RD cannot create/release BOM | Exercise manager create/read and engineer submit/manager approve | High | Keep RD/manager path on `canReadSubmission` |

## Test Cases

1. `tsc --noEmit` passes after role union and guard changes.
2. `qc:bom-workbench-released-only-permission` passes:
   - Logs in as Engineer, R&D Manager, Manufacturing, Procurement.
   - Creates released child and parent assembly.
   - Creates BOM Draft as manager.
   - Confirms manager can read workbench and draft detail.
   - Confirms Manufacturing and Procurement receive 403 on all Draft routes.
   - Submits and approves review to create Released Snapshot.
   - Confirms Manufacturing and Procurement can export Released BOM CSV with fixed filename.
3. `qc:bom-workbench-review-release` still passes to prove review/release regression coverage.
4. `qc:bom-workbench-release-export` still passes to prove export route behavior remains intact.
5. `lint` and `build` pass.
6. `git diff --check` reports no whitespace errors beyond existing line-ending warnings.

## Pass Criteria

- Every QC script assertion passes.
- TypeScript, lint, and build pass.
- Manufacturing/Procurement Draft route access is proven by HTTP 403 responses.
- Manufacturing/Procurement Released Snapshot CSV access is proven by HTTP 200, fixed filename, and exported child content.
- Existing manager release and export tests remain green.

## Evidence Collection

- Console JSON output from `qc:bom-workbench-released-only-permission`.
- Console JSON output from BOM regression scripts.
- `tsc`, `lint`, `build`, and `git diff --check` command results.
- Final dev task checkbox update after QC passes.
