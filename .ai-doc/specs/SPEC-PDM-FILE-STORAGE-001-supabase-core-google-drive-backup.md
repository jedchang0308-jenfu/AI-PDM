# SPEC-PDM-FILE-STORAGE-001: Supabase Core File Storage and Google Drive Backup Mirror

Status: Local RD Implementation Complete / Local QC Passed; Production Cutover Not Authorized
Date: 2026-07-08
DEV: `DEV-PDM-FILE-STORAGE-001`
Decision source: User HCS guided answers `1B 2A 3A`; RD supervisor follow-up `1C 2A 3B` on 2026-07-08
Related: `DEV-SUPABASE-DB-001`, `DEV-STORAGE-COST-001`, `SPEC-SUPABASE-DB-001`, `ADR-SUPABASE-DB-001`

## 1. Human Decision Brief

Confirmed decisions:

| HCS question | User choice | Product decision |
|---|---|---|
| 1. Supabase core scope | `1B` | Supabase Postgres and Supabase Storage become the formal core. PDM metadata, permissions, lifecycle, audit and file blobs must have one Supabase authority boundary. |
| 2. Existing file migration strategy | `2A` | Existing local / legacy Drive files must be migrated in a controlled one-time migration and verified before runtime cutover. No long-term mixed primary storage. |
| 3. Google Drive backup model | `3A` | Google Drive becomes async best-effort backup only, using version-isolated folders to avoid Windows/File Explorer same-name conflicts. |
| 4. Drive backup coverage | `1C` | Use tiered backup coverage: formal released files are permanently mirrored; draft / in-review / master attachment files are mirrored only when necessary or recent; generated preview derivatives are not backed up by default. |
| 5. Drive backup retention first version | `2A` | First version does not automatically delete or overwrite old Drive backup file blobs. It may add new version folders and update manifests while preserving prior manifest entries. |
| 6. Backup metadata snapshot | `3B` | Drive backup includes a non-secret PDM metadata snapshot to help humans rebuild the index, but this snapshot is restore assistance only and never becomes the PDM authority. |

Rejected options:

- Supabase Storage-only core while DB metadata remains elsewhere: rejected because it leaves split authority.
- New files only to Supabase with old files read from legacy storage indefinitely: rejected because it extends dual-source risk.
- Google Drive backup as release blocker: rejected because backup is not the authoritative PDM source.
- Flat Drive filenames as the primary backup structure: rejected because the intended human browsing model is Windows/File Explorer style folder navigation.
- Backing up every generated preview derivative by default: rejected because preview derivatives should be rebuildable from Supabase source files and would inflate Drive backup cost/noise.
- Automated deletion or overwrite of Drive backup files in the first version: rejected because backup evidence should be append-friendly until retention governance is explicitly authorized.
- Drive as a complete disaster-recovery authority: rejected because it would turn Drive into a second PDM authority and increase security / synchronization risk.

AI assumptions:

- `DEV-SUPABASE-DB-001` staging evidence remains useful background but does not authorize production or storage cutover.
- Existing `DEV-STORAGE-COST-001` provider-neutral work is supporting evidence, not the current authority for this product decision.
- The 2026-07-08 development pass authorizes and completes local/non-production implementation of provider-aware storage pointers, Supabase-core runtime contracts, migration dry-run safety, Drive backup planning/execution helpers, manifest templates, non-secret metadata sidecars, restore index and drift report templates. Supabase bucket creation, migration execution, runtime provider pointer switch, live Google Drive writes and release/deploy artifacts require explicit later authorization.
- The "necessary or recent" working-file backup class is an implementation policy decision inside Phase 4, but it must not include generated previews by default and must not create Drive as a second runtime source.

Re-entry triggers:

- Changing from one-time migration to rolling/background migration.
- Making Google Drive backup release-blocking.
- Changing backup coverage from tiered backup to "all files forever" or "released files only".
- Authorizing automated Drive backup deletion, retention cleanup or overwrite of backed-up file blobs.
- Expanding metadata snapshots to include secrets, credentials, session tokens, service-role keys, signed URLs, or personal auth data.
- Treating metadata snapshots as a replacement for Supabase database backup / restore controls.
- Authorizing live Supabase production migration, bucket creation, provider pointer switch, direct data repair, data deletion, production deploy, merge/PR, or release.
- Accepting any file class that cannot be migrated or verified before cutover.

## 2. Problem

Current code and metadata still preserve local repository and Google Drive-era assumptions:

- Runtime files are still written through a local default `FileStorageService`.
- `submission_files.local_path` and `file_assets.original_path` remain compatibility fields.
- Google Drive fields and UI imply Drive can participate in pending/released/master attachment workflows.
- Supabase Storage adapter exists but is fail-closed unless explicitly configured and enabled.
- Current local data inspection showed no `supabase_storage` file assets.

The product target is different: AI_PDM should treat Supabase Postgres + Supabase Storage as the single source of truth, while Google Drive is only a browsable backup mirror.

## 3. Goals

- Make Supabase Postgres the authoritative metadata, audit, lifecycle, permission and migration target.
- Make Supabase Storage the authoritative blob store for all PDM files.
- Migrate all existing eligible local / legacy Drive file objects before runtime cutover.
- Preserve business IDs, drawing numbers, revisions, submission IDs, attachment IDs, SHA-256 and audit traceability across migration.
- Reframe Google Drive as a non-authoritative one-way backup mirror.
- Prevent same-folder same-filename collisions in Drive backup by version/type folder isolation and deterministic collision fallback.
- Apply tiered Drive backup coverage so formal released evidence is durable while working files remain bounded and generated previews stay rebuildable.
- Write non-secret PDM metadata snapshots to Drive to support human recovery without making Drive a second PDM authority.
- Keep browser and SolidWorks Add-in away from storage secrets; all access goes through server APIs and audited signed/server-streamed flows.

## 4. Out Of Scope

- Production deploy, production migration, production smoke, rollback plan or release report.
- Direct data deletion, destructive repair or manual DB mutation.
- Google Drive reverse sync, user edits in Drive feeding back to PDM, or treating Drive as recovery truth without manifest/hash verification.
- Public Supabase buckets for confidential PDM originals.
- Browser-exposed Supabase service role, S3 access keys or Drive service-account secrets.
- Automated deletion or overwrite of existing Drive backup file blobs in the first backup version.
- Metadata snapshots containing service keys, Drive service account material, user passwords, session tokens, signed URLs or other secrets.
- Treating Drive metadata snapshots as a full production database backup or as the restore authority.
- External S3-compatible provider cutover. That remains a future cost-control option.

Deferred Scope Audit:

| Deferred signal | Classification | Tracking |
|---|---|---|
| Production deploy / release / rollback / smoke | Blocked Human Re-entry / Release Authorization Required | Future release gate only after explicit authorization. |
| Supabase live production migration and provider pointer switch | Blocked Human Re-entry | Same spec Phase 6; requires target, cost, backup and live migration authorization. |
| Direct data repair / deletion | Blocked Human Re-entry | Same spec Phase 2 stop condition; requires explicit repair package. |
| External S3-compatible provider | New DEV | Existing `DEV-STORAGE-COST-001` remains parked for cost-control / alternate provider work. |
| Google Drive reverse sync | No Tracking | Rejected by architecture; Drive is backup mirror only. |
| Background migration after cutover | No Tracking | Rejected by user choice `2A`; cutover blocked until verified migration or explicit exception decision. |
| Generated preview derivative backup | No Tracking for first version | Rejected by user choice `1C`; previews are rebuilt from Supabase source files unless a later exception is approved. |
| Automated Drive retention cleanup / deletion | Blocked Human Re-entry / New DEV | Rejected for first version by user choice `2A`; future retention/cost governance requires explicit authorization. |
| Secret-bearing metadata snapshot | No Tracking | Rejected by user choice `3B`; snapshots are non-secret recovery aids only. |

## 5. End-State Architecture

```text
Browser / SolidWorks Add-in
  -> AI_PDM Server APIs
  -> Permission / workflow / audit services
  -> Supabase Postgres
       - business metadata
       - storage object metadata
       - lifecycle / release / backup status
       - audit and access logs
  -> Supabase Storage private buckets
       - authoritative source blobs
       - preview derivatives
       - release packages
  -> Async Google Drive backup worker
       - reads from Supabase authority
       - writes version-isolated backup folders
       - writes manifest and hash evidence
       - never feeds data back into PDM automatically
```

Authoritative rules:

- Supabase object metadata and storage bytes are the only runtime truth after cutover.
- Google Drive object IDs are backup evidence only, not release lifecycle inputs.
- Drive backup failure may create `backup_failed` / `backup_pending` status, but does not invalidate a Supabase-backed PDM release under choice `3A`.
- Restoring from Drive requires manifest + SHA-256 verification before any Supabase object is recreated.
- Every download, preview, package creation and backup operation must be auditable from Supabase metadata.

## 6. Supabase Storage Contract

Bucket model:

| Bucket | Purpose | Access |
|---|---|---|
| `pdm-source` | Authoritative CAD/PDF/DWG/source file blobs | Private only |
| `pdm-preview` | Generated previews, thumbnails, PDF derivatives | Private only |
| `pdm-release` | Release packages and immutable release bundles | Private only |
| `pdm-quarantine` | Failed/unknown migrated objects pending review | Private only |

Object key model:

```text
objects/{sha256[0..1]}/{sha256[2..3]}/{sha256}
previews/{source_object_id}/{source_sha256}/{derivative_kind}.{ext}
release-packages/{submission_id}/{package_id}.zip
migration-quarantine/{migration_batch_id}/{legacy_source_id}
```

Business filenames stay in metadata, not in object keys. Download names come from controlled metadata such as `original_filename`, drawing number, revision and release package manifest.

Minimum metadata contract:

- `storage_object_id`
- `provider = supabase_storage`
- `bucket`
- `object_key`
- `content_hash_sha256`
- `file_size`
- `mime_type`
- `original_filename`
- `business_owner_type`
- `business_owner_id`
- `lifecycle_state`
- `source_kind`
- `created_by`
- `created_at`
- `verified_at`
- `migration_batch_id`

Security contract:

- Private buckets only for PDM originals.
- Server-side service role or server-side S3 credentials only; never in browser.
- RLS / storage policies must be deny-by-default and explicitly tested.
- Signed URLs must be short-lived and created only after PDM permission checks.
- Public buckets are not allowed for source CAD, formal drawings or release packages.
- Supabase S3 access keys bypass RLS and are therefore server-only.

Current Supabase docs alignment:

- Supabase Storage private buckets route downloads through RLS-protected download methods or limited-time signed URLs.
- Storage uploads require RLS policies on `storage.objects`; upsert requires `INSERT`, `SELECT` and `UPDATE`.
- Supabase Storage S3 protocol does not support S3 bucket versioning; PDM versioning must be modeled in Postgres metadata, not assumed from Storage.
- Supabase Data API access for new public tables increasingly requires explicit `GRANT` statements in addition to RLS; storage metadata tables must include explicit grants or remain server-only through direct Postgres access.

## 7. Google Drive Backup Contract

Drive role:

- One-way async backup mirror from Supabase authority.
- Human-readable fallback browsing and external backup copy.
- Not a runtime dependency for PDM read/write/release decisions.

Backup coverage policy:

| Class | Drive backup rule | Retention rule | Notes |
|---|---|---|---|
| Formal released files and release packages | Required mirror | Permanent in first version; no automated delete/overwrite | Includes released PDF/native/DWG/package evidence and manifests. |
| Draft / in-review / active working files | Selective mirror | No automated delete/overwrite in first version | Mirror only necessary or recent versions needed to resume active work, not every obsolete transient upload. |
| Master attachments | Selective mirror | No automated delete/overwrite in first version | Mirror current / relevant attachment versions used by PDM workflows. |
| Generated preview derivatives | Not backed up by default | No Tracking for first version | Rebuild from Supabase source when possible; record derivative metadata in PDM instead. |

Metadata snapshot policy:

- Drive backup includes non-secret metadata snapshots to help humans rebuild the PDM index after an incident.
- Snapshots may include business IDs, drawing numbers, revisions, lifecycle state, file IDs, Supabase object references, hashes, release package manifest indexes, backup job IDs and relation indexes.
- Snapshots must not include service-role keys, S3 access keys, Drive service-account material, passwords, session tokens, signed URLs, raw private auth payloads or secret configuration values.
- Snapshots are restore aids only. They cannot overwrite Supabase metadata without explicit repair authorization and verification.

Root structure:

```text
AI_PDM_Backup/
  {company_code}/
    Released/
      {drawing_number}/
        Rev-{revision}/
          pdf/
            {original_filename}
          native/
            {original_filename}
          dwg/
            {original_filename}
          package/
            {release_package_filename}
          manifest.json
    MasterAttachments/
      {entity_type}/
        {entity_code}/
          {attachment_id}/
            {original_filename}
            manifest.json
    Working/
      {workflow_type}/
        {workflow_id}/
          {file_role}/
            {original_filename}
          manifest.json
    MetadataSnapshots/
      {yyyy}/
        {mm}/
          {snapshot_id}/
            pdm-metadata-snapshot.json
            manifest.json
    Quarantine/
      {backup_job_id}/
```

Same-name collision rule:

1. Different revisions use different `Rev-{revision}` folders, so `D-000123.pdf` can exist in both `Rev-A/pdf/` and `Rev-B/pdf/`.
2. Same revision + same file role + same original filename is normally blocked at PDM package validation.
3. If legacy data contains collisions, backup must write a deterministic fallback filename:

```text
{basename}__PDM-{short_file_id}{ext}
```

4. `manifest.json` must record both `original_filename` and `drive_filename`.

Backup manifest minimum fields:

- `pdm_file_id`
- `storage_object_id`
- `submission_id` / `attachment_id`
- `drawing_number`
- `revision`
- `file_role`
- `original_filename`
- `drive_filename`
- `drive_file_id`
- `supabase_bucket`
- `supabase_object_key`
- `sha256`
- `file_size`
- `released_at` or source lifecycle timestamp
- `backup_job_id`
- `backup_status`
- `backup_tier`
- `retention_class`
- `metadata_snapshot_id` when applicable

Backup state machine:

```text
not_required -> queued -> uploading -> verified -> failed
                                  \-> retrying
```

Rules:

- `verified` requires Drive upload success and hash/size verification when available.
- `failed` is visible to Admin but does not revert Supabase release.
- Retry must be idempotent by `storage_object_id + backup_target_path + sha256`.
- Human deletion or rename in Drive must be detected by backup audit / verification job, not silently treated as source truth.
- First-version backup worker must not automatically delete or overwrite backed-up file blobs. New file versions get new version folders or deterministic fallback names.
- Manifest updates must preserve prior entries and must not hide historical file mappings.

## 8. Phase Roadmap

### Phase 0 - Documentation and Decision Capture

Authorization: Authorized by current request
Document status: Completed

Scope:

- Record user decisions `1B 2A 3A` and RD supervisor follow-up decisions `1C 2A 3B`.
- Create SPEC / ADR / QA plan.
- Register DEV in `.ai-doc/dev_task.md` and `.ai-doc/documentation_map.md`.

Acceptance:

- Human decisions are not left only in chat.
- All future phases have RD handoff contracts.
- No implementation, migration, provider switch or external write is performed.

### Phase 1 - Supabase Core Readiness Contract

Authorization: Authorized for local RD implementation only
Document status: Local RD Implementation Complete / Local QC Passed; live Supabase bucket/RLS evidence pending authorization

Purpose:

- Make Supabase Postgres + Storage ready to become the core authority in staging before any production cutover.

Scope:

- Define private buckets and storage metadata schema.
- Align `submission_files`, `file_assets`, `release_packages`, `preview_jobs`, `file_derivatives` with provider-neutral object metadata.
- Replace hard-coded local default where cutover mode should use configured provider.
- Add fail-closed env validation for `PDM_STORAGE_PROVIDER=supabase_storage`.
- Add Storage RLS / bucket policy verification gates.

Out of scope:

- Production migration.
- Existing file movement.
- Live Google Drive backup execution.

Implementation contract:

- `createFileStorageService()` must not permanently ignore configured provider in runtime cutover mode.
- Existing local provider remains available only as rollback/fallback under explicit mode.
- Storage service must support put, read, signed download, hash verify and metadata probe.
- Server-side env must include Supabase URL, server-only service role key or S3 server credential, bucket names, live-enabled flag and target name.
- Static QC must fail if `NEXT_PUBLIC_*` exposes service-role or S3 secret.

QA/QC gate:

- TypeScript, lint, build.
- File storage contract QC.
- Supabase storage config fail-closed QC.
- RLS/grants/advisor evidence for storage metadata tables and `storage.objects` policies.
- Local provider regression passes.

Stop conditions:

- Missing dedicated AI_PDM Supabase target.
- Service-role or S3 secret would enter browser bundle.
- Public bucket proposed for source files.
- Supabase docs/changelog reveal breaking Storage/RLS behavior not reflected in implementation.

### Phase 2 - One-Time Existing File Migration

Authorization: Authorized for migration dry-run and local contract only
Document status: Local dry-run tooling and metadata contract complete; migration execution not authorized

Purpose:

- Move all eligible current local / legacy Drive-backed file objects into Supabase Storage before runtime cutover.

Scope:

- Inventory all `submission_files`, `file_assets`, release packages and preview derivatives.
- Resolve current physical source: local repository, existing Drive object, generated derivative, or missing.
- Dry-run migration plan with object key, bucket, SHA-256, file size and owner metadata.
- Execute migration in controlled batches only after dry-run approval.
- Verify every migrated object by size and SHA-256.
- Produce exception report for missing, ambiguous or corrupt files.

Out of scope:

- Long-running dual-primary runtime after cutover.
- Silent skipping of missing files.
- Direct deletion of legacy files.

Implementation contract:

- Migration is idempotent by source business id + sha256.
- Migrated object metadata is written in the same transaction as business reference updates where possible.
- A file cannot be marked migrated until Supabase bytes verify.
- Cutover is blocked unless migration is 100% verified or the user explicitly approves an exception list.
- Legacy `local_path` / `gdrive_file_id` fields remain as historical evidence until a later cleanup phase.

QA/QC gate:

- Inventory count equals candidate source rows.
- Dry-run creates no writes.
- Execute on disposable/staging copy first.
- Hash verification report has zero unclassified mismatches.
- Exception report is empty or explicitly approved before cutover.
- Restore from pre-migration backup can return system to pre-migration metadata state in staging.

Stop conditions:

- Any file lacks retrievable bytes and no human-approved exception exists.
- Any migrated object hash mismatches.
- Any batch would overwrite an existing Supabase object with different hash.
- Direct production migration requested without release gate authorization.

### Phase 3 - Supabase Runtime Cutover

Authorization: Authorized for provider-aware code path only
Document status: Local provider-aware runtime contract complete; runtime provider switch/cutover not authorized

Purpose:

- Make all PDM runtime file reads/writes use Supabase as the only core storage source.

Scope:

- Set runtime provider to Supabase in staging.
- Upload new submission files, master attachments, preview derivatives and release packages to Supabase.
- Read previews/downloads/packages from Supabase only.
- Update UI labels from Google Drive sync to backup/mirror status.
- Retire Google Drive pending/released move as release lifecycle dependency.

Out of scope:

- Production cutover.
- Google Drive backup worker.
- Deleting legacy local repository.

Implementation contract:

- Release flow cannot depend on `gdrive_status`.
- `gdrive_file_id` cannot be required for preview/download/release.
- Existing `drive` preview fallback must be lower priority than Supabase source/derivative preview or explicitly shown as backup preview.
- File access audit must record Supabase object identity and download mode.
- Retry upload routes must retry Supabase storage writes, not Google Drive pending upload.

QA/QC gate:

- New submission upload writes Supabase object and metadata.
- Master attachment upload writes Supabase object and metadata.
- Preview/download works without Google Drive configured.
- Release package generation reads only Supabase authority.
- Google Drive service account missing does not block PDM submission/release in staging.
- Role-based access remains unchanged for Engineer, Manager, Manufacturing, Procurement and external specialist.

Stop conditions:

- Any active PDM workflow still requires Drive folder config.
- Supabase signed URL can be generated without PDM permission.
- Release state can become `Released` while Supabase file evidence is missing.

### Phase 4 - Google Drive Async Backup Mirror

Authorization: Authorized for local helper implementation and mock/plan QC only
Document status: Backup plan/execution helper, manifest template, metadata sidecar, restore index and drift template complete; live Drive worker not authorized

Purpose:

- Backup Supabase-authoritative files to Google Drive in a human-browsable, version-isolated folder layout.

Scope:

- Add backup job table or equivalent queue metadata.
- Implement Drive backup worker from Supabase bytes to Drive.
- Generate version/package/attachment group backup evidence through deterministic plan, metadata sidecars and future manifest wiring.
- Apply tiered backup coverage: formal release required, active working/master attachments selective, preview derivatives skipped by default.
- Generate non-secret PDM metadata snapshots as `.metadata.json` sidecars next to backed-up blobs.
- Verify backup status and expose admin-visible backup health.
- Convert settings UI wording from core Drive folders to backup mirror target.

Out of scope:

- Reverse sync from Drive to Supabase.
- Using Drive backup as release blocker.
- Manual Drive folder edits as authoritative metadata.
- Automated deletion or overwrite of existing Drive backup file blobs.
- Backing up generated preview derivatives by default.
- Secret-bearing metadata snapshots.

Implementation contract:

- Backup reads source bytes from Supabase Storage only.
- Drive path resolver must produce deterministic folder + filename.
- Same-folder filename collision must be prevented or deterministically suffixed with `__PDM-{short_file_id}`.
- Backup retries are idempotent.
- Backup status is separate from release/status lifecycle.
- Manifest is written after all group files are uploaded or updated with partial failure status.
- Backup queue selection must record why each file is `required`, `selective` or `not_required`.
- Metadata snapshots must be filtered through an explicit allowlist.
- First version must fail review if backup code includes automated delete/overwrite of prior Drive file blobs.

QA/QC gate:

- Two revisions with same original filename land in separate `Rev-*` folders.
- Same revision collision is blocked or suffixed and manifest records mapping.
- Released files are required backup candidates; working files are selective; preview derivatives are marked `not_required`.
- Metadata snapshot contains the allowlisted PDM index fields and no secrets.
- Backup failure does not revert Supabase release.
- Missing Drive service account shows backup setup warning, not PDM core failure.
- Manifest hash matches Supabase source object.
- Re-running backup does not overwrite prior Drive file blobs.

Stop conditions:

- Product requirement changes to make backup release-blocking.
- Product requirement changes to back up all files forever or released files only.
- Product requirement changes to auto-delete or overwrite Drive backup file blobs.
- Metadata snapshot would include secrets or auth/session data.
- Drive API cannot preserve deterministic path/metadata under shared-drive target.
- Service account lacks upload/list permissions on target folder.

### Phase 5 - Restore Drill and Operational Monitoring

Authorization: Authorized for local restore-index/drift-report contract only
Document status: Restore index and drift report template complete; live restore drill and admin monitoring not authorized

Purpose:

- Prove backup mirror can support controlled recovery without becoming a second authority.

Scope:

- Add backup verification / drift report.
- Add restore drill that downloads from Drive, verifies manifest/hash, and writes to quarantine/staging Supabase object.
- Use metadata snapshots to rebuild a human-readable file/release index in quarantine/staging only.
- Add admin dashboard or evidence report for backup freshness, failed jobs, missing manifests and Drive drift.

Out of scope:

- Automatic restore into production authority.
- Replacing Supabase backup strategy with Drive only.
- Treating Drive metadata snapshots as sufficient production DB backup.

Implementation contract:

- Restore always lands in quarantine or staging until verified.
- Restore cannot overwrite an existing Supabase object without explicit repair authorization.
- Drill evidence includes manifest, source Drive file ID, computed hash, restored object ID and approver.
- Metadata snapshot restore must be validated against file manifests and hashes before any repair proposal is generated.

QA/QC gate:

- Restore drill recovers a sample release package and source drawing bytes with matching SHA-256.
- Metadata snapshot can reconstruct a sample release/file index in quarantine without mutating authoritative metadata.
- Drift report detects deleted/renamed Drive backup files.
- Admin-visible backup SLA status is correct.

Stop conditions:

- Restore would overwrite authoritative Supabase data.
- Manifest missing or hash mismatch.
- Metadata snapshot conflicts with manifest/hash evidence.

### Phase 6 - Production Release Gate

Authorization: Blocked Human Re-entry / Release Authorization Required
Document status: RD Contract Ready / Not Authorized

Purpose:

- Execute production migration/cutover only when explicitly authorized.

Allowed in this spec:

- Record release risks, evidence required and authorization boundary.

Not allowed in this document:

- Merge plan, PR checklist, deploy plan, rollback plan, production smoke plan or release report.

Entry condition:

- User explicitly requests release/deploy/production cutover.
- Then route to deployment-release-gate.

## 9. Architecture Memory Capsule

Fixed product rules:

- Supabase Postgres + Storage is the single PDM authority.
- Existing files must be migrated and verified before runtime cutover.
- Google Drive is an async backup mirror only.
- Drive uses version/type folder isolation to handle repeated original filenames across revisions.
- Drive backup coverage is tiered: released evidence is required/permanent in first version, working/master files are selective, generated previews are not backed up by default.
- First-version Drive backup does not automatically delete or overwrite prior backed-up file blobs.
- Non-secret metadata snapshots are restore aids only and cannot become authority.
- Drive backup failure is visible but non-blocking for PDM release under current decision.
- PDM versioning is modeled in Postgres metadata; do not rely on Supabase Storage S3 versioning.

Compatibility memory:

- Existing code has `gdrive_file_id`, `gdrive_status`, `local_path`, `original_path` and `storage_provider` compatibility fields.
- Existing Drive folder settings are still in `/settings` and must be reworded/migrated rather than silently removed.
- Existing `DEV-STORAGE-COST-001` generated provider-neutral evidence; use it as support, not as current product authority.
- `DEV-SUPABASE-DB-001` already separated DB runtime migration from Storage follow-up; this spec supersedes the old "Storage follow-up later" product priority after user decision `1B`.

## 10. RD Acceptance

This development package is acceptable when:

- SPEC, ADR, QA plan, dev_task and documentation map all point to the same authority model.
- Every phase has scope, out of scope, implementation contract, acceptance, QA/QC gate and stop conditions.
- No release artifacts are generated before explicit release authorization.
- Supabase Storage security assumptions cite current official docs.
- Google Drive same-filename conflict strategy is explicit and testable.
- Drive backup coverage, no-delete/no-overwrite first-version rule and metadata snapshot boundary are explicit and testable.

Implementation evidence on 2026-07-08:

- Provider-aware storage pointers are implemented for submission files, release packages, master attachments, previews/downloads and release package reads.
- Supabase Storage remains fail-closed by default and requires explicit server-only env plus live enablement.
- Existing local provider remains the default rollback/local mode.
- Google Drive release movement is no longer a runtime release dependency when `PDM_STORAGE_PROVIDER` is Supabase.
- Drive backup planning supports required/selective/excluded coverage, version/type/hash folder isolation, deterministic same-folder filename suffixing, no delete/overwrite behavior, manifest template entries, metadata sidecar filenames, restore index and drift report template.
- No Supabase bucket creation, migration execution, provider pointer switch, live Google Drive write, production deploy, merge, PR, rollback or production smoke was performed.
- QC report: `.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`.

## 11. All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 - Documentation | Authorized | Completed | Capture decisions and docs | Code/migration | User answered `1B 2A 3A`; RD supervisor follow-up `1C 2A 3B` | Docs indexed | SPEC/ADR/QA/dev_task/map |
| Phase 1 - Supabase core readiness | Authorized locally | Local RD complete / QC passed | Buckets, metadata, provider config, security gates | Migration/cutover/live bucket creation | Development authorization | Storage contract and provider config pass local QC | `tsc`, lint, file-storage QC |
| Phase 2 - One-time migration | Dry-run authorized locally | Dry-run contract complete / execution not authorized | Inventory, dry-run, verify plan | Migration execution, long-term dual-primary | Phase 1 local contract passed | Dry-run creates no writes and blocks unsafe candidates | `qc:file-storage-migration-dry-run` |
| Phase 3 - Runtime cutover | Code path authorized locally | Provider-aware code complete / cutover not authorized | Supabase-aware runtime reads/writes | Production/runtime provider switch | Development authorization | Code can route by stored provider pointer | Storage contract/regression QC |
| Phase 4 - Drive backup mirror | Helper/mock authorized locally | Plan/helper complete / live Drive worker not authorized | Async Drive backup helper, tiered coverage, version folders, manifest template, metadata sidecars | Reverse sync, release blocking, auto delete/overwrite, default preview derivative backup, live external writes | Development authorization | Drive backup plan is deterministic and non-authoritative | `qc:pdm-file-storage-supabase-core-drive-backup` |
| Phase 5 - Restore/monitor | Contract authorized locally | Restore index/drift template complete / live drill not authorized | Drift report template, restore index, metadata snapshot rebuild contract | Auto production restore, Drive as DB backup, live restore drill | Phase 4 local evidence | Required missing evidence is detectable before live drill | `qc:pdm-file-storage-supabase-core-drive-backup` |
| Phase 6 - Production release gate | Requires explicit release authorization | Blocked Human Re-entry / Release Authorization Required | Future release gate placeholder | Merge/PR/deploy/rollback/smoke plan | User asks for release/cutover | Routed to release gate | Future release evidence |

## 12. References

- `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
- `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`
- `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`
- Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Storage Buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase Storage S3 Compatibility: https://supabase.com/docs/guides/storage/s3/compatibility
- Supabase Storage S3 Authentication: https://supabase.com/docs/guides/storage/s3/authentication
- Supabase Changelog - Data API explicit grants default: https://supabase.com/changelog
