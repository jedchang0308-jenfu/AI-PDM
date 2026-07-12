# QC Report - PDM Numbering Sequence CAPA

Status: Verification passed for `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` Phase 1-2
Date: 2026-07-07
Scope: local non-production CAPA controls only

## 1. Scope Verified

- Phase 1: allocating numbering QC scripts are guarded from using the protected runtime DB `data/ai-pdm.sqlite`.
- Phase 1: sequence/master/audit divergence is detectable by a read-only integrity gate.
- Phase 2: SQLite numbering create now uses a transaction boundary covering root sequence allocation, part creation and optional drawing creation.
- Regression: compact v2 numbering core behavior remains compatible.

Out of scope:

- No reset, reuse, backfill, voiding, deletion or repair was applied to `data/ai-pdm.sqlite`.
- No production/Supabase check, migration, deploy, rollback or production smoke was run.
- No numbering identity policy change was made.

## 2. Evidence Summary

| Gate | Command | Result |
|---|---|---|
| QC isolation guard | `npm run qc:pdm-numbering-qc-isolation` | Passed 46/46 |
| Sequence integrity fixture and runtime report-only | `npm run qc:pdm-numbering-sequence-integrity` | Passed 3/3 |
| SQLite transaction rollback | `npm run qc:pdm-numbering-sequence-transaction` | Passed 4/4 |
| TypeScript | `npx.cmd tsc --noEmit --pretty false` | Passed |
| Lint | `npm.cmd run lint -- --quiet` | Passed |
| Numbering core regression | `npm run qc:pdm-numbering-core` | Passed 241/241 |
| Whitespace check | `git diff --check` | Passed with line-ending warnings only |
| Build | `npm run build` | Blocked by intentional local-dev guard because AI_PDM was already listening on `http://127.0.0.1:3000/` with PID 35812; no bypass used |

## 3. Runtime Integrity Report

The runtime integrity check was run in explicit report-only mode. It did not mutate `data/ai-pdm.sqlite`.

Observed report:

- `clean=false`
- `sequenceKey=company-jenfu:part_root:v2`
- `nextValue=57`
- `retainedRoots=3`
- `auditCreatedRoots=56`
- `missingAuditRootsFromMaster=53`
- report files: `output/qc-pdm-numbering-sequence-integrity/report.json` and `output/qc-pdm-numbering-sequence-integrity/report.md`

Interpretation:

- The CAPA cause is confirmed: the runtime sequence and audit evidence show 56 allocated roots, while only 3 corresponding root master rows remain.
- Phase 1/2 prevent recurrence and detect the condition.
- The existing local runtime data is still divergent until a separate Phase 3 human data-policy decision authorizes repair, non-reuse handling, reset/reuse, or leave-as-is.

## 4. Conclusion

Phase 1 and Phase 2 are locally implemented and verified. Phase 3 data repair and Phase 4 production/Supabase rollout remain blocked human re-entry gates.
