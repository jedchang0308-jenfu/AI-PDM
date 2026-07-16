# QA Plan - PDM Numbering Sequence CAPA

Status: Implemented / Verification passed for Phase 1-3; Phase 4 Blocked
Parent DEV: `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`
Spec: `.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`
Date: 2026-07-07

## 1. Objective

Validate that numbering QC cannot consume shared runtime sequences, sequence/master/audit divergence is detected early, SQLite allocation is atomic, and data repair remains human-gated.

The later user instruction `完成此開發任務` authorized local Phase 1/2 implementation and verification. The later instruction `測試資料先刪掉` authorized local Phase 3 repair against `data/ai-pdm.sqlite` with the current drawing-module UI records as the formal set. A later critical review corrected the allocation rule: earlier empty roots should be reused unless the number exists in controlled master rows or explicit void/obsolete evidence. This QA plan still does not authorize production/Supabase checks.

## 2. Risk Model

Primary risk:

- Allocating tests advance `numbering_sequences` in the shared runtime DB, then hide created records by deleting master rows.

Secondary risks:

- SQLite partial create advances sequence or leaves root/part/drawing fragments after a failure.
- UI wording makes a part-name suffix look like the official allocator.
- Data repair is applied before classifying the DB as test-only or formal evidence.

## 3. Test Matrix

| Case ID | Type | Setup | Expected result | Evidence |
|---|---|---|---|---|
| QA-SEQ-CAPA-001 | Read-only integrity detector | Contaminated fixture with advanced `part_root:v2` sequence and missing master roots | `qc:pdm-numbering-sequence-integrity` fails and reports missing roots, sequence cursor and audit-created count | JSON/Markdown report under `output/qc-pdm-numbering-sequence-integrity/` |
| QA-SEQ-CAPA-002 | Clean fixture pass | Isolated fixture where sequence, master rows and audit are consistent | Integrity verifier passes | QC output and report |
| QA-SEQ-CAPA-003 | Runtime DB guard | Run an allocating numbering QC script with DB path resolving to `data/ai-pdm.sqlite` | Script refuses before allocation and explains protected-runtime guard | Command output and unchanged DB fingerprint |
| QA-SEQ-CAPA-004 | Isolated QC create | Run request/API/draft/concurrency numbering QC against temp `PDM_DATA_DIR` | Records can be created; cleanup removes temp runtime; shared runtime sequence remains unchanged | Before/after sequence report |
| QA-SEQ-CAPA-005 | Static cleanup guard | Scan allocating numbering QC scripts | No script deletes `part_roots`, `part_numbers` or `drawing_numbers` from protected runtime without isolation guard | Static QC report |
| QA-SEQ-CAPA-006 | SQLite failure after sequence allocation | Inject failure immediately after root sequence allocation | Transaction rolls back sequence cursor and all master rows | Failure-injection QC |
| QA-SEQ-CAPA-007 | SQLite failure after part insert | Inject failure after part creation before drawing creation | Transaction rolls back root, part, drawing and sequence cursor | Failure-injection QC |
| QA-SEQ-CAPA-008 | Normal create regression | Create root/part/drawing in isolated DB | Returns compact v2 values such as `00001`, `00001-P01`, `00001-M01` | Existing numbering core/API regression output |
| QA-SEQ-CAPA-009 | Dry-run repair gate | Invoke repair/report command without apply authorization | Produces read-only report only; no DB mutation | Report and before/after DB fingerprint |
| QA-SEQ-CAPA-010 | Apply authorization block | Try apply mode without explicit policy, backup and DB fingerprint flags | Command exits blocked before mutation | Command output |
| QA-SEQ-CAPA-011 | UI wording sanity | Inspect request UI wording if Phase 1 touches request page | Part-name suffix guidance is not presented as the official root/drawing allocator | Static/browser evidence if UI changed |

## 4. Required Commands After RD Implementation

Expected commands:

- `npm run qc:pdm-numbering-sequence-integrity`
- focused isolation guard QC added by RD, for example `npm run qc:pdm-numbering-qc-isolation`
- existing numbering regressions affected by the RD changes:
  - `npm run qc:pdm-numbering-core`
  - `npm run qc:pdm-numbering-api-regression`
  - `npm run qc:pdm-numbering-draft-lifecycle`
  - `npm run qc:pdm-numbering-concurrency-reuse`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`

Build requirement:

- Run `npm run build` if RD changes application code and the local-dev guard permits it. If build is blocked by the intentional local server guard, record the guard output and do not bypass unless separately authorized.

Executed evidence:

- `npm run qc:pdm-numbering-qc-isolation`: passed 46/46.
- `npm run qc:pdm-numbering-sequence-integrity`: passed 3/3 and generated runtime report-only evidence.
- `npm run qc:pdm-numbering-sequence-transaction`: passed 4/4.
- `npm run qc:pdm-numbering-duplicate-submit-guard`: passed 10/10.
- `npm run qc:pdm-numbering-gap-reuse`: passed 8/8.
- `node scripts/pdm-numbering-sequence-repair-runtime.mjs --apply --i-understand-local-runtime-data-repair`: applied local repair after backup.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm run qc:pdm-numbering-core`: passed 241/241.
- `git diff --check`: passed with line-ending warnings only.
- `npm run build`: blocked by the intentional local-dev guard because AI_PDM was already listening on `http://127.0.0.1:3000/` with PID 35812; no bypass was used.
- QC report: `.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`.

## 5. Data Safety Checks

Before any allocating QC:

- Capture `company-jenfu:part_root:v2` sequence value from the protected runtime DB, or run the read-only integrity verifier.
- Confirm the allocating QC target is not `data/ai-pdm.sqlite`.

After allocating QC:

- Confirm protected runtime sequence and retained master rows are unchanged.
- Confirm temporary DB or temp runtime directory was removed.

For any future data repair:

- Require backup path.
- Require dry-run report.
- Require explicit human policy choice.
- Require before/after report if apply is later authorized.

## 6. Stop Conditions

Stop QA and return to PM/user decision if:

- A test needs to reset or reuse formal numbers.
- A script mutates `data/ai-pdm.sqlite` outside an explicitly authorized repair apply.
- Production/Supabase credentials, migration, provider pointer change or release smoke is required.
- Existing audit evidence must be deleted or rewritten.
- RD discovers schema migration is required.

## 7. Acceptance

The CAPA implementation is QA-acceptable only when:

- Allocating QC cannot consume the shared runtime sequence.
- Sequence integrity drift is detectable by a read-only gate.
- SQLite allocation rollback prevents partial create and silent cursor drift.
- Existing compact v2 numbering creation still passes regression.
- Data repair remains dry-run and human-gated.

Phase 1/2 acceptance status:

- Accepted locally for Phase 1/2 based on the executed evidence above.
- Phase 3 data repair acceptance passed locally: runtime integrity is `clean=true`, purged test roots are 53, and gap-aware QC computes the current lowest available root as `00001` while retaining existing controlled roots.
- Phase 4 production/Supabase acceptance is not evaluated because release authorization is not present.
