# RD Report: Offline backup foundation

Date: 2026-05-20
Role: RD
Scope: P0 offline one-way backup

## Completed

- Added `scripts/backup.mjs`.
- Added `scripts/verify-backup.mjs`.
- Added `scripts/install-backup-task.ps1`.
- Added `npm run backup` and `npm run backup:verify`.
- Added `.env.example` backup settings:
  - `PDM_BACKUP_DIR`
  - `PDM_BACKUP_EXTRA_PATHS`

## Backup contents

Each backup creates a dated snapshot folder under `PDM_BACKUP_DIR`.

The snapshot contains:

- SQLite database exported with `VACUUM INTO`
- `data/repository`
- `.env`, `.env.local`, and `.env.example` when present
- `data/logs` when present
- optional semicolon-separated paths from `PDM_BACKUP_EXTRA_PATHS`
- `manifest.json` with file size and SHA256 for every copied file

## Validation

Executed:

- `npm.cmd run backup`
- `npm.cmd run backup:verify`

Result:

- Snapshot created under `data/backups`
- Checksum verification passed

## Remaining work

This implements backup creation and integrity verification. The P0 item remains partial until a restore drill is executed on a separate test machine:

1. Restore `database/ai-pdm.sqlite` to `data/ai-pdm.sqlite`.
2. Restore `repository` to `data/repository`.
3. Start the app.
4. Run smoke and QC API tests against the restored snapshot.
