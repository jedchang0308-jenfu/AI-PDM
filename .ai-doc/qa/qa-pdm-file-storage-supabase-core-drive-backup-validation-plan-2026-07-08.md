# QA Plan: DEV-PDM-FILE-STORAGE-001 Supabase Core and Google Drive Backup

Status: Historical local adapter QA/QC passed; production target superseded on 2026-07-13
Date: 2026-07-08
Related SPEC: `.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`

Current validation authority is `.ai-doc/qa/qa-pdm-erp-google-supabase-platform-validation-plan-2026-07-13.md`. This plan remains evidence for the completed provider-neutral storage pointer, integrity, fail-closed, and migration controls; it does not authorize or validate the current GCS production target.

## 1. QA Objective

Validate that AI_PDM can safely move to Supabase Postgres + Supabase Storage as the single authority, migrate all existing files before cutover, and mirror files to Google Drive as non-authoritative backup without filename collisions or lifecycle confusion.

## 2. Phase Gates

### Gate 0 - Documentation Consistency

Acceptance:

- Human decisions `1B 2A 3A` are recorded in SPEC and ADR.
- `dev_task.md` and `documentation_map.md` point to the same DEV and files.
- All phases have authorization status and stop conditions.
- No release/deploy/rollback artifacts are present.

Evidence:

- File review of SPEC / ADR / QA / dev_task / documentation map.

### Gate 1 - Supabase Core Readiness

Acceptance:

- Private buckets are defined for source, preview, release and quarantine objects.
- Service role / S3 secrets are server-only and never `NEXT_PUBLIC_*`.
- Storage metadata can represent provider, bucket, key, hash, size, owner, lifecycle and migration batch.
- Supabase Storage access is fail-closed when required env is missing.
- Download and signed URL generation require PDM permission before Storage access.

Suggested QC:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:file-storage-contract`
- `npm.cmd run qc:file-storage-local-provider-regression`
- Supabase storage RLS / grant / advisor evidence after implementation.

Negative tests:

- Browser bundle must not contain service role or S3 secret.
- Public bucket for PDM source file must fail review.
- Signed URL without PDM permission must fail.

### Gate 2 - One-Time Existing File Migration

Acceptance:

- Inventory includes all `submission_files`, `file_assets`, release packages and derivatives.
- Dry-run writes no data and lists every source, target bucket/key and expected hash.
- Execute mode verifies every Supabase object by SHA-256 and size.
- Cutover is blocked unless all candidates are verified or user approves an exception list.

Suggested QC:

- Storage inventory report.
- Migration dry-run report.
- Migration execute report on disposable/staging copy.
- Hash verification report.
- Exception report.

Negative tests:

- Missing legacy bytes cannot be marked migrated.
- Hash mismatch cannot be ignored.
- Existing Supabase object with same key but different hash cannot be overwritten.

### Gate 3 - Runtime Cutover

Acceptance:

- New submission uploads, master attachments, previews and release packages write to Supabase.
- PDM can submit, preview, approve and package without Google Drive configured.
- `gdrive_status` is not a release prerequisite.
- Role-based file access remains unchanged.

Suggested QC:

- API regression for submission, attachment, preview, release package and public share routes.
- UI smoke for submission detail and master attachment preview without Drive config.
- Access audit report.

Negative tests:

- Missing Drive service account must not block Supabase-backed PDM release.
- Release cannot become complete if Supabase file evidence is missing.
- Engineer cannot download another company's restricted file via signed URL.

### Gate 4 - Google Drive Backup Mirror

Acceptance:

- Backup worker reads from Supabase only.
- Backup coverage follows user choice `1C`: released files/packages are required, active working/master files are selective, generated preview derivatives are `not_required` by default.
- Different revisions with same original filename land in different `Rev-*` folders.
- Same-folder collisions are blocked by PDM validation or suffixed with `__PDM-{short_file_id}`.
- Manifest records original filename, Drive filename, Supabase object identity and SHA-256.
- Non-secret metadata snapshots are generated with an explicit allowlist.
- First-version backup does not delete or overwrite existing Drive file blobs.
- Backup failure is visible but non-blocking for PDM release.

Suggested QC:

- Mock Drive API backup integration test.
- Version-folder filename collision test.
- Manifest hash verification test.
- Backup retry idempotency test.
- Backup coverage classification test.
- Metadata snapshot allowlist / secret-redaction test.
- No-delete/no-overwrite regression test.
- Settings UI wording test.

Negative tests:

- Drive file rename/delete must be detected as backup drift, not accepted as PDM state.
- Backup cannot read from local path after Supabase cutover.
- Backup cannot mark verified without manifest/hash evidence.
- Generated preview derivatives cannot become required backup candidates by default.
- Backup worker cannot delete or overwrite prior Drive backup file blobs in the first version.
- Metadata snapshots cannot include service keys, Drive credentials, session tokens, signed URLs or password/auth payloads.

### Gate 5 - Restore Drill and Monitoring

Acceptance:

- Backup drift report detects missing/renamed Drive files.
- Restore drill downloads backup, verifies manifest and hash, and writes only to quarantine/staging.
- Metadata snapshot reconstructs a sample PDM file/release index in quarantine/staging only.
- Restore cannot overwrite Supabase authority without explicit repair authorization.
- Admin can see backup freshness and failed backup status.

Suggested QC:

- Drive restore drill report.
- Backup freshness report.
- Drift detection report.
- Quarantine restore hash verification.
- Metadata snapshot quarantine rebuild report.

Negative tests:

- Missing manifest blocks restore.
- Hash mismatch blocks restore.
- Snapshot/manifest conflict blocks restore proposal.
- Restore-to-production authority without explicit repair gate is rejected.

## 3. Final Acceptance Criteria

- Supabase is the only core source after cutover.
- Existing files are fully migrated and verified before cutover.
- Google Drive backup is one-way, version-isolated and manifest-backed.
- Drive backup coverage is tiered, no-delete/no-overwrite in the first version, and includes non-secret metadata snapshots as recovery aids only.
- No PDM workflow depends on Drive backup success unless the user explicitly changes the product decision.
- All storage access paths are server-mediated, permission-checked and auditable.

## 3.1 Executed Local QC Evidence - 2026-07-08

Passed:

- `npm run qc:pdm-file-storage-supabase-core-drive-backup`: 37/37.
- `npm run qc:file-storage-contract`: 82/82.
- `npm run qc:file-storage-local-provider-regression`: 34/34.
- `npm run qc:file-storage-migration-dry-run`: 17/17.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint -- --quiet`: passed.

Blocked / not executed:

- `npm run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on `http://127.0.0.1:3000/` with PID `47036`; no bypass was used.
- Supabase bucket creation, live Supabase Storage writes, one-time migration execution, provider pointer switch, live Google Drive backup writes, restore drill against real Drive files, production deploy/cutover, merge, PR, rollback and production smoke were not performed.

QC report:

- `.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`

## 4. QA Risks

| Risk | Severity | Required test |
|---|---|---|
| Dual authority between Supabase and Drive | P0 | Runtime cutover and backup negative tests |
| Missing legacy file during one-time migration | P0 | Inventory + exception report gate |
| Service role exposed to browser | P0 | Static env/bundle QC |
| Supabase object hash mismatch | P0 | Hash verification report |
| Drive same-folder filename collision | P1 | Version-folder/collision fallback tests |
| Backup failure blocking release unexpectedly | P1 | Release + backup failure flow |
| Signed URL bypassing PDM permission | P0 | Access-control negative test |
| Drive backup grows into unbounded duplicate storage | P1 | Backup coverage classification + generated-preview exclusion |
| Automated backup cleanup deletes evidence | P0 | No-delete/no-overwrite regression |
| Metadata snapshot leaks secrets or becomes authority | P0 | Snapshot allowlist/redaction + quarantine restore tests |

## 5. Out Of QA Scope Until Release Authorization

- Production deploy.
- Production migration.
- Production rollback.
- Production smoke.
- Live data repair/deletion.
- Merge/PR release checklist.
