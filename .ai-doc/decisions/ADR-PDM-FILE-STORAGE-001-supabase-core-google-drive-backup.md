# ADR-PDM-FILE-STORAGE-001: Supabase Core and Google Drive Backup Mirror

Date: 2026-07-08
Status: Historical local adapter decision; target architecture superseded on 2026-07-13
Related DEV: `DEV-PDM-FILE-STORAGE-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`

## 2026-07-13 Supersession

`ADR-PDM-ERP-PLATFORM-002` replaces the unexecuted production target in this ADR: Google Cloud Storage in Taiwan is now the authoritative PDM binary store, Cloud SQL PostgreSQL in Taiwan is the metadata/transaction authority, and Google Shared Drive is limited to approved delivery/collaboration exports rather than an authoritative or disaster-recovery mirror. The completed provider-pointer, hash, manifest, migration-safety, fail-closed and local fallback evidence remains reusable. Supabase Storage and Drive backup behavior below is retained as historical implementation evidence, not as the current production target. GCS migration is a separate Phase 3B file-workflow release and does not block the official-numbering/draft slice. No file migration, provider switch, GCS resource creation or production release occurred in this amendment.

## Context

AI_PDM carried local repository and Google Drive-era file assumptions. The code already had a Supabase Storage adapter and provider-neutral storage work, but runtime reads/writes and release/download paths needed a stronger provider pointer contract before Supabase Storage could become the core. Google Drive settings still require follow-up wording changes so users understand Drive is a backup mirror, not PDM authority.

The user confirmed the target direction on 2026-07-08:

- Supabase Postgres and Supabase Storage should be the core authority.
- Existing files should be migrated and verified before cutover.
- Google Drive should remain as an async backup location, not as the PDM authority.
- Drive backup must behave like Windows/File Explorer folder storage, where same-folder same filenames are not acceptable.
- RD supervisor follow-up decisions on 2026-07-08 further constrained Drive backup: use tiered coverage, avoid automated delete/overwrite in the first version, and include only non-secret metadata snapshots as recovery aids.

## Decision

1. Supabase Postgres + Supabase Storage is the single authoritative PDM persistence boundary.
2. Google Drive is demoted to a one-way backup mirror.
3. Existing local / legacy Drive file objects must be migrated to Supabase Storage before runtime cutover.
4. Runtime cutover is blocked until migration is fully verified or the user explicitly approves an exception list.
5. Google Drive backup uses version/type folder isolation:

```text
AI_PDM_Backup/{company_code}/Released/{drawing_number}/Rev-{revision}/{file_role}/{original_filename}
```

6. If same-folder filename collision exists in legacy data, backup uses deterministic fallback:

```text
{basename}__PDM-{short_file_id}{ext}
```

7. A Drive `manifest.json` records original filename, Drive filename, Supabase object identity, SHA-256 and business metadata.
8. Drive backup failure is visible and retryable, but not release-blocking under the current decision.
9. Drive reverse sync is rejected. Human edits in Drive cannot update PDM automatically.
10. Drive backup coverage is tiered: formal released files and release packages are required/permanent in the first version; draft/in-review/master attachment files are selective; generated preview derivatives are not backed up by default.
11. First-version Drive backup does not automatically delete or overwrite existing backed-up file blobs. Manifest updates must preserve prior entries.
12. Drive receives non-secret PDM metadata snapshots to help humans rebuild the index, but snapshots are restore aids only and never authoritative metadata.
13. The local RD implementation stores explicit provider/bucket/key pointers, routes downloads/package reads through the stored provider pointer, keeps local storage as the default fallback mode, and keeps Supabase live writes fail-closed until server-only env and live enablement are configured.
14. The local Drive backup implementation produces deterministic plans, optional upload helper behavior, manifest templates, `.metadata.json` sidecar snapshots, restore index and drift report templates. Live Drive backup execution remains separately authorized.

## Alternatives Considered

### A. Supabase Storage only, DB metadata elsewhere

Rejected. PDM file authority needs lifecycle, permission, audit and file bytes to agree. Splitting blob and metadata authority would make release/backup/restore ambiguous.

### B. Rolling migration with legacy files left in old storage indefinitely

Rejected by user choice `2A`. It lowers short-term migration cost but creates long-term dual-primary risk.

### C. Google Drive release-blocking backup

Rejected by user choice `3A`. A backup dependency should not turn into the PDM release authority unless explicitly re-decided.

### D. Flat Drive filenames with revision/hash encoded

Rejected as primary structure. It solves filename uniqueness but is harder for humans to browse. It remains a fallback only when legacy collisions exist inside the same version/type folder.

### E. Back up every file and generated derivative forever

Rejected by RD supervisor follow-up `1C`. Formal release evidence needs durability, but generated previews should be rebuilt from source and working files should be selective to control Drive noise and cost.

### F. First-version automated retention cleanup

Rejected by RD supervisor follow-up `2A`. Automated deletion/overwrite increases evidence-loss risk before backup governance and restore drills are proven.

### G. Drive as full disaster-recovery authority

Rejected by RD supervisor follow-up `3B`. Drive may carry non-secret metadata snapshots, but Supabase backup/restore controls remain responsible for authoritative database recovery.

## Consequences

Positive:

- One authoritative PDM source reduces lifecycle and version ambiguity.
- Supabase access can be audited consistently through server APIs.
- Google Drive remains useful for human browsing and backup without contaminating PDM state.
- Same original filenames across revisions are naturally handled by revision folders.
- Tiered coverage keeps formal evidence durable while avoiding uncontrolled backup growth for rebuildable previews.
- Non-secret metadata snapshots improve human recovery without granting Drive authority.

Costs and risks:

- One-time migration is stricter and slower than rolling migration.
- Cutover cannot happen until all eligible files verify or exceptions are approved.
- Existing Google Drive UI/status language must be revised to avoid misleading users.
- Supabase private bucket/RLS/S3 credential details require careful security gates.
- Backup mirror requires its own retry, manifest and drift verification jobs.
- Working-file backup selection needs a clear implementation policy and QC evidence.
- Metadata snapshots need an allowlist and secret-redaction gate.
- Future retention cleanup remains unimplemented until explicitly authorized.

## Implementation Outcome

Completed locally on 2026-07-08:

- `submission_files` and `release_packages` now carry `storage_provider`, `storage_bucket` and `storage_key` metadata.
- Upload/write paths persist the storage pointer; read/download/package paths resolve by stored provider pointer.
- Supabase Storage is selectable through server-only env and remains disabled/fail-closed by default.
- Legacy Google Drive release movement is limited to `local_repository` mode and no longer blocks Supabase-provider releases.
- Drive backup planning classifies required/selective/excluded candidates, isolates repeated filenames by source/entity/revision/role/hash folder paths, suffixes same-folder collisions, never deletes/overwrites first-version blobs, records manifest template entries, writes non-secret metadata sidecars, and exposes restore/drift helpers.
- Local QC passed; production/live bucket creation, migration execution, provider pointer switch, live Drive backup writes, merge/PR/deploy/rollback and production smoke were not performed.

## Compatibility Impact

- Existing `gdrive_file_id` / `gdrive_status` become backup mirror fields or historical evidence, not core release prerequisites.
- Existing `local_path` / `original_path` remain compatibility evidence until cleanup is separately authorized.
- Existing preview priority must prefer Supabase source/derivative data over Drive iframe fallback.
- Existing release path must stop depending on Drive movement once Supabase cutover is complete.
- Existing settings language must distinguish backup target health from core PDM readiness.
- Restore tooling must import Drive files/snapshots into quarantine or staging first, not overwrite authoritative Supabase metadata.

## Authorization Boundary

This ADR authorizes the completed local/non-production implementation boundary above. It still does not authorize:

- Supabase live production migration.
- Bucket creation or provider pointer switch.
- File migration execution.
- Google Drive live backup worker execution.
- Automated Drive retention cleanup, deletion or overwrite of existing backed-up file blobs.
- Metadata snapshots containing secrets, credentials, signed URLs or auth/session data.
- Direct DB mutation, data deletion or production release.
- Merge, PR, deploy, rollback or production smoke artifacts.

## Supersedes / Amends

- Amends `ADR-SUPABASE-DB-001` by changing the storage follow-up priority after user decision `1B`.
- Does not supersede `DEV-STORAGE-COST-001`; cost-control and external provider strategy remain separate.
