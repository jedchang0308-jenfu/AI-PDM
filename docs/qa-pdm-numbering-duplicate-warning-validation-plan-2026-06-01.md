# QA Validation Plan - PDM Numbering Duplicate Warning

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: duplicate checks, high-similarity warning records, and warning-event persistence.

## Validation Scope

- Verify duplicate check storage exists for auditability.
- Verify warning-event storage exists for `!` hover/dialog UI use.
- Verify exact root, part number, and drawing number duplicates are treated as blockers.
- Verify high-similarity part/root names are warning-only and do not block RD.
- Verify duplicate-check API route is registered and calls repository logic.

## User Critical Flows

- RD enters a part/root description and receives high-similarity warnings without being blocked.
- RD checks an exact existing part or drawing number and receives a blocker before reuse.
- Admin can later review warning history and high-similarity records.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| High similarity blocks RD | Warning treated as hard error | RD flow becomes slow and defeats the efficiency goal | QC source/static test | High | `warningsOnly` result and warning event code |
| Exact duplicate only warns | Duplicate code not treated as blocker | Numbering conflict can enter records | DB unique constraints and duplicate checker | High | Exact code match uses blocker severity |
| Warning not persisted | No warning event table/write | Admin cannot inspect high-similarity records later | QC schema/write test | Medium | `warning_events` table and repository writer |
| Check history missing | No event log | Cannot audit ignored warnings | QC schema/write test | Medium | `duplicate_check_events` table |
| API not registered | Route missing | UI cannot call duplicate check | Build route list | Medium | `/api/numbering/duplicate-check` route |

## Test Cases

- `NUM-SCHEMA table exists duplicate_check_events`.
- `NUM-SCHEMA table exists warning_events`.
- `NUM-SCHEMA duplicate check event saved`.
- `NUM-SCHEMA warning event saved`.
- `NUM-REPO checks duplicate/high-similarity warnings`.
- `NUM-REPO keeps high similarity warning-only`.
- `NUM-API duplicate-check route calls checker`.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 50/50 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes `/api/numbering/duplicate-check`.

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
