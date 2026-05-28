# Restore Drill SOP

Date: 2026-05-20
Scope: AI PDM offline backup restore drill

## Purpose

Verify that an offline backup snapshot can restore the SQLite database and repository files without depending on the original source directory.

## Standard Drill

Run:

```powershell
npm.cmd run backup
npm.cmd run backup:verify
npm.cmd run backup:drill
npm.cmd run backup:retention-drill
npm.cmd run backup:handoff
```

Passing criteria:

- Backup snapshot is created under `data/backups`.
- `backup:verify` returns `valid: true`.
- `backup:drill` restores the latest snapshot under `data/restore-drills`.
- Restored SQLite `PRAGMA integrity_check` returns `ok`.
- Every restored `submission_files.local_path` points to the restored repository.
- Every restored file exists and matches the DB SHA256.
- `backup:retention-drill` confirms a snapshot still contains a file after the source file is deleted in an isolated test source.
- `backup:handoff` produces a handoff folder under `data/restore-handoffs` with a JSON summary, README, and a PowerShell script for the separate test machine.

## Test Machine Restore

First create a handoff package on the source machine:

```powershell
npm.cmd run backup:handoff
```

Copy the backup snapshot and generated handoff folder to the separate Windows test machine. The handoff folder contains `restore-on-test-machine.ps1`.

For a separate test machine or restore directory, run:

```powershell
npm.cmd run backup:restore -- --snapshot <snapshot-directory> --target data/restore-targets/manual-restore --force
```

Or run the generated handoff script:

```powershell
.\restore-on-test-machine.ps1 -SnapshotPath <snapshot-directory> -TargetDir data\restore-targets\manual-restore
```

Then start the app with restored paths:

```powershell
$env:PDM_DATA_DIR="data/restore-targets/manual-restore/data"
$env:PDM_REPOSITORY_DIR="data/restore-targets/manual-restore/data/repository"
npm.cmd run build
npm.cmd run smoke
npm.cmd run qc:api
```

## Production Restore Guardrail

In-place restore is intentionally blocked unless `--in-place --force` is provided:

```powershell
npm.cmd run backup:restore -- --snapshot <snapshot-directory> --in-place --force
```

Only use in-place restore during a controlled maintenance window after stopping the app.
