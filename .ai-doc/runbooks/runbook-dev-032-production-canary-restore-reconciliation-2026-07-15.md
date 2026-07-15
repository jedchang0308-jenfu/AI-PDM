# DEV-032 Production Canary Restore/Reconciliation Runbook

Status: pre-canary template; not executed
Scope: DEV-032 / DEV-046 Phase 3A.0 official-numbering and draft production slice
Production action authorized by this file: none

## Purpose

This runbook defines the minimum `HD-8-4 / 1A` evidence required before any named-user production canary traffic. It is not the full PDM/GCS/offline restore drill. Full file/GCS/offline recovery remains deferred to DEV-037 / Phase 3B+.

## Stop Conditions

Stop before execution if any condition is true:

- No exact release commit or immutable release snapshot exists.
- `jenfu-ai-pdm-prod` target, region, Cloud SQL instance and Secret Manager sources are not read back.
- The production seed package is not clean: only new production PDM IDs, minimum company/role/config, initial Admin, numbering sequence and official-number non-reuse reservations are allowed.
- Any source business, draft, demo, test, historical actor, credential, session or mutable source row is included.
- The restore target is not separate and isolated from the source production database.
- The procedure would overwrite, delete or mutate the source database or source archive.
- Any Terraform or Cloud SQL plan contains unapproved delete, replace or non-reviewed write action.
- Production AAL policy is unresolved for the selected canary users.

## Required Inputs

- Exact release commit or immutable source snapshot.
- Production project readback for `jenfu-ai-pdm-prod`.
- Production Cloud SQL target identity and backup/PITR settings.
- Production Secret Manager readback proving required secrets exist without printing values.
- Clean seed and canary allowlist manifest based on `config/platform/clean-production-seed.template.json`.
- Source archive inventory hash and owner.
- Official-number inventory from read-only source archive or approved external official-number list.
- Previous-known-good rollback reference or explicit first-release rollback plan.

## Execution Outline

1. Confirm Cloud SQL automated backup and PITR are enabled on the production database before canary traffic.
2. Apply or import only the reviewed clean seed package to the production database after production target approval.
3. Capture a recovery point after schema, seed and numbering reservation setup.
4. Restore that recovery point to a separate isolated Cloud SQL target. Do not restore in place.
5. Run migration history and schema reconciliation on the isolated target.
6. Run principal/account mapping reconciliation:
   - exactly the named production PDM IDs expected for canary;
   - no legacy source actor ID reused as production user ID;
   - no same-email auto-link from source archive.
7. Run audit, receipt and outbox reconciliation:
   - zero orphan audit rows;
   - zero orphan command receipts;
   - zero orphan outbox entries;
   - no partial command transaction evidence.
8. Run numbering reconciliation:
   - zero duplicate official numbers;
   - zero issued-number reuse;
   - zero sequence regression;
   - every historical or externally communicated official number has a non-reusable reservation;
   - every non-reuse reservation has source archive reference and ledger hash.
9. Run clean-seed exclusion checks:
   - zero source business rows;
   - zero source draft rows;
   - zero demo/test rows;
   - zero source credentials/sessions;
   - source archive remains read-only and hash-addressed.
10. Preserve evidence and mark canary no-go if any check fails or is unexplained.

## Required Evidence Files

The final pre-canary package must include:

- production target readback JSON;
- release source commit/snapshot evidence;
- clean seed and allowlist manifest;
- Cloud SQL backup/PITR readback;
- separate isolated restore transcript;
- schema/migration reconciliation report;
- principal/account mapping reconciliation report;
- audit/receipt/outbox orphan report;
- numbering ledger/sequence/non-reuse reconciliation report;
- rollback readiness readback;
- no-go disposition for every failed or warning check.

## Pass Criteria

The gate can pass only when all are true:

- source production database and source archive are not overwritten or mutated;
- isolated restore target exists and is separate from source;
- all reconciliation checks pass with zero unexplained gaps;
- clean seed contains no source business/draft/demo/test/history rows;
- allowlist is named-user only and fail-closed;
- rollback reference is operational;
- evidence is tied to the exact release commit/snapshot.
