# QA Validation Plan - PDM Numbering Export and Monthly Reports

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: numbering master export jobs and monthly audit report metadata generation.

## Validation Scope

- Verify `numbering_export_jobs` exists and stores generated export payloads.
- Verify export supports `no_audit`, `last_change_summary`, and `full_change_summary`.
- Verify export payload includes root, part, and drawing master data.
- Verify audit summary is excluded for `no_audit` and included for the two audit summary modes.
- Verify `monthly_audit_reports` stores numbering report metadata with report month, generation mode, scheduled day, counts, and generator.
- Verify manual report regeneration requires Admin.
- Verify API routes are registered:
  - `/api/numbering/export-jobs`
  - `/api/numbering/export-jobs/[jobId]`
  - `/api/numbering/monthly-audit-reports`
  - `/api/numbering/monthly-audit-reports/[reportId]`

## User Critical Flows

- R&D Manager or Admin creates a numbering master export.
- System returns an export job record with selected audit scope and generated payload.
- R&D Manager or Admin opens a previous export job by job ID.
- Admin manually regenerates a monthly numbering audit report for a selected month.
- R&D Manager or Admin opens monthly report metadata for audit review.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Export leaks full audit when user asks no-audit | Mode handling ignores export mode | External/shared master table contains unnecessary audit detail | QC source/static check | High | `no_audit` skips `auditSummary` |
| Last-change and full-change exports are indistinguishable | No different audit limits | User cannot choose lightweight vs complete evidence | QC source/static check | Medium | `last_change_summary` uses smaller limit; `full_change_summary` uses larger limit |
| Unauthorized user creates exports or reports | Missing route role checks | Sensitive numbering and audit data exposed | Route source check | High | Export route requires `R&D Manager` or `Admin`; report generation requires `Admin` |
| Monthly report lacks scheduling intent | Metadata omits monthly schedule marker | Future scheduler cannot reliably identify expected cadence | QC source/static check | Medium | Report query metadata includes `scheduledDay: 1` |
| Report cannot be traced to generator | Missing generated_by/audit record | Manual regeneration has weak accountability | QC source/static check | Medium | Report metadata stores `generated_by` and writes audit event |

## Test Cases

- `NUM-SCHEMA table exists numbering_export_jobs`.
- `NUM-SCHEMA table exists monthly_audit_reports`.
- `NUM-SCHEMA numbering export job saved`.
- `NUM-SCHEMA monthly numbering audit report saved`.
- `NUM-REPO creates numbering export jobs`.
- `NUM-REPO supports no/last/full audit export modes`.
- `NUM-REPO generates monthly numbering audit metadata`.
- `NUM-REPO db.ts re-exports export/report workflow`.
- `NUM-API export job route creates exports`.
- `NUM-API export job detail route reads exports`.
- `NUM-API monthly report route generates metadata`.
- `NUM-API monthly report detail route reads metadata`.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 116/116 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes all export/report routes.

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for mode handling, role checks, generated metadata, and audit events.
