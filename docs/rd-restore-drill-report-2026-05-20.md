# RD Report: Restore drill automation

Date: 2026-05-20
Role: RD
Scope: P0 offline backup restore drill

## Completed

- Added `scripts/restore-backup.mjs`.
- Added `scripts/restore-drill.mjs`.
- Added `npm run backup:restore`.
- Added `npm run backup:drill`.
- Added `npm run backup:retention-drill`.
- Added restore drill SOP at `docs/restore-drill-sop.md`.

## Restore behavior

- Default restore requires `--target <directory>`.
- In-place restore requires explicit `--in-place --force`.
- Before restore, snapshot checksums are verified from `manifest.json`.
- SQLite DB is copied from `database/ai-pdm.sqlite`.
- Repository files are copied from `repository`.
- Config and logs are copied when present.
- Restored `submission_files.local_path` values are rewritten to the restored repository path.

## Validation

Executed:

- `npm.cmd run backup:drill`
- `npm.cmd run backup:retention-drill`

Result:

- Restored latest snapshot to `data/restore-drills/20260520-170720`.
- Rewritten local file paths: 146.
- Restored submissions: 146.
- Restored files checked: 146.
- SQLite integrity check: passed.
- Restored file existence and SHA256 check: passed.
- Isolated retention drill after deleting the source file: passed.

## Remaining production validation

The automated local restore drill is complete. Final production readiness still requires one restore drill on a separate Windows test machine with the restored app started against the restored `PDM_DATA_DIR` and `PDM_REPOSITORY_DIR`.
