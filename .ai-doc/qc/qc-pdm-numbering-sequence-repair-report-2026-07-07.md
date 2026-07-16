# QC Report - PDM Numbering Sequence Repair and Duplicate Submit Guard

Status: Verification passed for `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` Phase 3 local repair plus duplicate-submit PA
Date: 2026-07-07
Scope: local runtime `data/ai-pdm.sqlite` only

## 1. Human Decision Applied

The user confirmed that only the records currently visible in the drawing-number module UI are formal data. All other local numbering sequence pollution is treated as test data for this local runtime repair.

Formal root set retained:

- `00007`
- `00014`
- `00056`
- `00057`
- `00058`

## 2. Repair Applied

Script:

- `node scripts/pdm-numbering-sequence-repair-runtime.mjs --apply --i-understand-local-runtime-data-repair`

Backup:

- `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`

Applied changes:

- Kept 5 formal root/part/drawing records.
- Purged 53 test root create-audit rows for roots outside the formal set.
- Deleted 125 obsolete/test sequence keys.
- Cleared numbering workflow/test rows from duplicate-check, warning, task, notification, approval, export and monthly report tables.
- Inserted one `numbering.sequence_repair` audit entry carrying the formal root set, purged test root set, backup path and next root value.
- Set `company-jenfu:part_root:v2.next_value` to `59` under the initial conservative `max retained + 1` repair policy. This was later superseded for create behavior by gap-aware allocation.

## 3. Post-Repair Evidence

| Gate | Command | Result |
|---|---|---|
| Sequence integrity | `npm run qc:pdm-numbering-sequence-integrity` | Passed 3/3; runtime `clean=true` |
| Duplicate submit guard | `npm run qc:pdm-numbering-duplicate-submit-guard` | Passed 10/10 |
| Gap reuse guard | `npm run qc:pdm-numbering-gap-reuse` | Passed 8/8 |
| TypeScript | `npx.cmd tsc --noEmit --pretty false` | Passed |

Runtime integrity after repair:

- retained roots: 5
- audit-created roots: 5
- purged test roots: 53
- missing audit roots from master: 0
- retained roots missing audit: 0
- expected codes missing master and audit: 0
- initial repair root cursor value: 59
- current create policy: allocate the lowest root absent from controlled master rows
- current lowest available root after user critical review: `00001`

## 4. Duplicate Submit Prevention

Server-side prevention:

- `createNumberingRecord` now checks for the same company/user/payload within a 60-second replay window before allocating a new root sequence.
- If a same-payload replay is found, the existing root/part/drawing bundle is returned and no new root number is consumed.

UI prevention:

- The request page now blocks re-entry while submit is in flight.
- After successful create, the primary button becomes `已建立` and is disabled until the user clicks `新申請`.

## 5. Remaining Boundary

- Production/Supabase repair, migration, deploy, rollback and production smoke remain not authorized.
- Existing visible formal numbers were not renumbered.
- After the later gap-aware policy correction, the next new root number should be the lowest root absent from controlled master rows. Current runtime evidence computes this as `00001`.
