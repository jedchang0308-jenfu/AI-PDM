# SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001 QC Isolation and Sequence Integrity

Status: Implemented / Verification passed for Phase 1-3; Phase 4 Blocked Human Re-entry
Current authorized phase: Phase 1-3 local implementation and local runtime repair completed after the user's 2026-07-07 `完成此開發任務` and `測試資料先刪掉` instructions. Phase 4 production/Supabase remains not authorized.
Parent DEV: `DEV-PDM-NUMBERING-002`
CAPA ID: `CAPA-PDM-NUMBERING-SEQUENCE-20260707`
Date: 2026-07-07

## 1. Human Decision Brief

Confirmed decisions:

- The user reported that new drawing-number creation is not receiving numbers in expected serial order.
- The issue must be handled as CAPA, then optimized with `#效用理論`, then written as a development document.
- The initial documentation request did not authorize direct sequence reset, backfill, reuse or DB repair.
- The later `完成此開發任務` instruction authorized local Phase 1 QC isolation/integrity and Phase 2 SQLite transaction hardening only.
- The later `只有目前在圖號模組UI上看到的是正式資料, 其他都是測試資料, 請執行` instruction authorized local Phase 3 repair using the current drawing-module UI records as the formal data set.
- The later critical-review instruction corrected the allocation policy: earlier empty roots should be reused unless the number exists in controlled master rows or has explicit void/obsolete evidence. Therefore V2 create must allocate the lowest root absent from controlled `part_roots`, not `max + 1`.
- The existing compact numbering identity decision remains unchanged: root `00001`, part `00001-P01`, manufacturing drawing `00001-M01`, reference drawing `00001-R01`.

Rejected options:

- Do not directly reset `numbering_sequences` as the first action.
- Do not make QC scripts consume the shared runtime DB and then clean only master rows.
- Do not treat the UI part-name suffix suggestion such as `A` as the official root/drawing allocator.
- Do not reuse missing numbers unless a later human decision confirms the data is test-only and reuse is acceptable.

AI assumptions:

- `data/ai-pdm.sqlite` is a local runtime DB that may contain user-visible records, so any destructive repair must be treated as a high-risk data operation.
- The observed `00056-M01` means the first manufacturing drawing under root `00056`; the suspicious sequence jump is the root code `00056`, not the per-root drawing suffix `M01`.
- Existing numbering identity policy is governed by `ADR-PDM-NUMBERING-002`; this CAPA controls test isolation, sequence integrity, and allocation transaction safety.

Re-entry triggers:

- Any direct mutation, deletion, sequence reset, backfill, void-record creation or number reuse in `data/ai-pdm.sqlite`.
- Any production or Supabase live target change.
- Any change to the formal non-reuse policy for allocated root/drawing/part numbers.
- Any schema migration or RLS/grant change not already covered by the active numbering specs.
- Any request to turn project/order/equipment serials or extra category codes into visible numbering identity.

Decision lens:

- Use `#效用理論` to maximize controlled-data risk reduction, recurrence reduction, verifiability and user trust while minimizing repair risk, implementation cost and formal-data mutation risk.
- Use `#多層次分析` and first-principles root-cause separation to distinguish UI wording, allocator design, QC data contamination, transaction safety and data-repair governance.

## 2. Problem Statement

The user-visible symptom is that a new numbering request returned a high root serial, `00056`, after the formal v2 compact cutover. The generated drawing number `00056-M01` is consistent with the current design because drawing numbers are allocated per root and purpose, so the first manufacturing drawing for a new root is `M01`.

The confirmed risk is that the root sequence was consumed by local QC/regression flows against the shared runtime SQLite DB. Those QC flows deleted created master rows during cleanup but did not roll back or isolate `numbering_sequences` and audit evidence. This allowed the sequence allocator to keep advancing even when most created root records disappeared from `part_roots`.

## 3. Evidence Summary

Observed local evidence from read-only analysis:

- Runtime provider is SQLite with `PDM_DATA_DIR=./data`.
- `numbering_sequences` contains `company-jenfu:part_root:v2` with `next_value=57`.
- Current `part_roots` retained only a small subset of created v2 roots, including `00007`, `00014` and `00056`.
- Audit history contained 56 v2 `numbering.create` events, while most corresponding master rows were no longer present.
- QC cleanup scripts deleted rows from `drawing_numbers`, `part_numbers` and `part_roots` without resetting or isolating `numbering_sequences`.

Relevant implementation surfaces:

- `src/app/numbering/request/page.tsx`: the visible "system suggested serial" suffix is part-name wording, not the official root allocator.
- `src/app/api/numbering/records/route.ts`: record creation calls `createNumberingRecordAsync`.
- `src/lib/repositories/numbering-async-repository.ts`: `allocateSequence` advances `numbering_sequences`; root allocation uses `companyId:part_root:v2`; part allocation uses `companyId:part:{rootCode}`; drawing allocation uses `companyId:drawing:{rootCode}:{purposeCode}`.
- SQLite `createNumberingRecord` currently does not have the same explicit transaction boundary as the Postgres path.
- Candidate QC scripts requiring containment include `scripts/qc-pdm-numbering-request-ui.mjs`, `scripts/qc-pdm-numbering-api-regression.mjs`, `scripts/qc-pdm-numbering-draft-lifecycle.mjs` and `scripts/qc-pdm-numbering-concurrency-reuse.mjs`.

Implemented verification evidence:

- `.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`
- `.ai-doc/qc/qc-pdm-numbering-sequence-repair-report-2026-07-07.md`
- `npm run qc:pdm-numbering-qc-isolation`: passed 46/46.
- `npm run qc:pdm-numbering-sequence-integrity`: passed 3/3, including contaminated fixture detection and explicit runtime report-only evidence.
- `npm run qc:pdm-numbering-sequence-transaction`: passed 4/4.
- `npm run qc:pdm-numbering-duplicate-submit-guard`: passed 10/10.
- `node scripts/pdm-numbering-sequence-repair-runtime.mjs --apply --i-understand-local-runtime-data-repair`: applied local repair with backup.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm run qc:pdm-numbering-core`: passed 241/241.
- `npm run build`: blocked by the intentional local-dev guard because AI_PDM was already listening on `http://127.0.0.1:3000/` with PID 35812; no bypass was used.

## 4. CAPA Classification

Problem type: systemic control gap / test data contamination / sequence-control failure.

Direct cause:

- QC flows allocated formal v2 root numbers from the runtime DB, then removed master rows while leaving sequence and audit state advanced.

Contributing factors:

- Cleanup logic focused on table rows, not on controlled allocator state.
- The runtime DB was usable as a QC target without an isolation guard.
- Sequence integrity had no QC gate comparing allocated roots, retained master rows, sequence cursor and audit evidence.
- SQLite create path has a weaker transaction boundary than Postgres for multi-step root/part/drawing creation.
- UI wording can make part-name suffixes look like official sequence allocation even though they are separate.

Systemic root cause:

- The numbering domain treats formal allocator state as controlled master data, but the test/QC boundary did not enforce the same control. The system allowed test automation to consume controlled numbers and later hide the evidence from master tables through partial cleanup.

## 5. Utility-Optimized CAPA

Utility function:

`U = controlled-data risk reduction + recurrence reduction + verifiability + user trust recovery - implementation cost - data-repair risk - formal-data mutation risk`

Priority order:

| Priority | Action | Utility judgment |
|---|---|---|
| P0 | Preserve current DB as evidence and avoid direct reset | Highest risk reduction because it prevents unreviewed formal-data mutation |
| P0 | Block numbering QC from using shared runtime `data/ai-pdm.sqlite` for allocating tests | Highest recurrence reduction with low implementation cost |
| P0 | Add a read-only sequence integrity QC gate | High verifiability and early detection |
| P1 | Harden SQLite transaction boundary for root/part/drawing allocation | High integrity gain, moderate engineering cost |
| P1 | Add dry-run-only data-repair analysis | Useful for decision support, but apply must remain human gated |
| P2 | Clarify UI wording for part-name suffix suggestion if APP feedback confirms confusion | Lower risk than allocator containment; useful but not the root cause |

Use `#效用理論`: do the low-risk, high-control actions first. Direct data repair has high downside if the DB is formal, so it is deferred behind backup, dry-run and human decision.

## 6. Scope

In scope for the implementation phases:

- Prevent QC/regression scripts from consuming formal runtime numbering sequences.
- Provide an isolated DB/runtime pattern for numbering QC scripts that allocate roots, parts or drawings.
- Add read-only sequence integrity detection for runtime and fixture DBs.
- Harden SQLite allocation transaction boundaries for root, part and optional initial drawing creation.
- Add focused QA/QC acceptance gates for sequence integrity, isolation and failure rollback.
- Provide a dry-run-only data-repair report contract for later human decision.

Out of scope for this CAPA:

- Direct mutation, deletion, reset, reuse or backfill of `data/ai-pdm.sqlite`.
- Production deploy, Supabase live cutover, provider pointer switch or release artifacts.
- Project/order/equipment numbering.
- Additional visible category codes beyond `P/M/R`.
- Retiring v1 read/search compatibility.
- Changing the compact v2 identity policy.

## 7. End-State Architecture

The end state has four separated control layers:

1. Formal allocator state: `numbering_sequences`, `part_roots`, `part_numbers`, `drawing_numbers` and audit logs are treated as controlled master-data evidence.
2. QC isolation boundary: any test that creates numbers runs against an isolated DB or explicitly disposable runtime, not `data/ai-pdm.sqlite`.
3. Integrity gate: a read-only verifier detects sequence/master/audit divergence before it becomes APP-visible.
4. Repair boundary: existing local data repair is dry-run and decision-gated; production repair is release-gated.

Critical rule:

- Numbers allocated by the formal runtime are not silently reused or hidden. Missing or deleted master rows must be visible as integrity evidence until a human-approved repair policy decides whether the environment is test-only or formal.

## 8. Architecture Memory Capsule

Fixed decisions:

- `00056-M01` is valid as the first manufacturing drawing under root `00056`.
- The root allocator is the controlled sequence requiring CAPA.
- The official root sequence must not be inferred from the current maximum retained `part_roots` alone.
- Audit evidence is part of the decision record; it must not be cleaned to make the sequence look continuous.
- QC scripts must not "clean up" controlled master data in a way that leaves allocator state advanced.

Rejected directions:

- Reset sequence first and explain later.
- Make UI search or part-name suffix logic responsible for official allocation.
- Treat missing numbers as harmless because they were created by tests.
- Add broader numbering identities to solve this symptom.

Deferred decisions:

- Whether the current local DB is test-only and can be repaired by reset/reuse.
- Whether formal policy should keep consumed-but-deleted roots as voided/non-reusable evidence.
- Whether production/Supabase needs an equivalent historical scan.

## 9. Phase Roadmap

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - CAPA development document | Complete | Capture root cause, utility-ranked CAPA, RD contract and QA plan | Authorized documentation only |
| Phase 1 - QC isolation and sequence integrity gate | Implemented / Verification passed locally | Block allocating QC against shared runtime DB and add read-only integrity checks | Authorized by `完成此開發任務`; completed without runtime DB mutation |
| Phase 2 - SQLite allocation transaction hardening | Implemented / Verification passed locally | Make root/part/drawing creation atomic and failure-safe in SQLite | Authorized by `完成此開發任務`; completed without sequence reset or data repair |
| Phase 3 - Local data repair, gap-aware reuse and duplicate-submit PA | Implemented / Verification passed locally | Purge local test sequence/audit/workflow rows while retaining current drawing-module UI records as formal data; allocate lowest uncontrolled root gap; block same-form duplicate submit | Authorized by `測試資料先刪掉`; gap policy corrected by later user review; backup and repair audit completed |
| Phase 4 - Production/Supabase rollout | RD Contract Ready / Release Authorization Required | Evaluate and apply equivalent controls to live target if needed | Requires deployment-release gate |

## 10. RD Handoff Contract

### Phase 1 - QC isolation and sequence integrity gate

Scope:

- Add an isolation guard shared by numbering QC scripts that allocate formal numbers.
- Refactor allocating numbering QC scripts to use a temp DB or isolated `PDM_DATA_DIR`.
- Add `qc:pdm-numbering-sequence-integrity` as a read-only verifier.
- Add package script entries and document protected-runtime behavior.

Out of scope:

- Any direct repair of `data/ai-pdm.sqlite`.
- Production/Supabase execution.
- Numbering identity policy changes.

Implementation contract:

- A QC script that creates roots, parts or drawings must refuse to run against a resolved DB path equal to the project runtime DB `data/ai-pdm.sqlite`, unless it is explicitly in read-only integrity mode.
- Allocating QC scripts must run with a disposable `PDM_DATA_DIR`, a temp DB copy, or a server launched against an isolated DB.
- Cleanup must remove the disposable DB/runtime directory, not delete formal rows from the shared runtime DB.
- The integrity verifier must read `numbering_sequences`, `part_roots`, `part_numbers`, `drawing_numbers` and `audit_logs`, then report sequence cursor, retained max root, created audit count and missing created roots.
- The verifier must fail on protected-runtime contamination unless invoked in explicit report-only mode.

Acceptance:

- Allocating QC scripts cannot consume `company-jenfu:part_root:v2` from `data/ai-pdm.sqlite`.
- Integrity gate fails on a contaminated fixture with advanced sequence and missing master rows.
- Integrity gate passes on a clean isolated fixture.
- The verifier is read-only.

Evidence required:

- `npm run qc:pdm-numbering-sequence-integrity`
- Focused isolation QC or static scan proving allocating scripts use the isolation guard.
- Before/after report files under `output/qc-pdm-numbering-sequence-integrity/`.

Stop conditions:

- Script requires mutation of `data/ai-pdm.sqlite`.
- Test requires number reuse or sequence reset.
- Isolation cannot be achieved without changing application runtime assumptions.

### Phase 2 - SQLite allocation transaction hardening

Scope:

- Align SQLite `createNumberingRecord` transaction behavior with the existing Postgres transaction boundary.
- Keep `allocateSequence`, `insertPartRoot`, `insertPartNumber` and optional `insertDrawingNumber` inside the same atomic SQLite operation.
- Add failure injection coverage so partial root/part/drawing creation and sequence advancement cannot be silently committed after an error.

Out of scope:

- Schema migration unless a focused RD review proves it is necessary.
- Changing per-root drawing sequence semantics.
- Changing `M01`/`R01` first drawing behavior.

Implementation contract:

- Use a SQLite transaction boundary that covers sequence allocation and all created master rows.
- If SQLite locking is required for safe sequence allocation, use a deterministic write transaction such as `BEGIN IMMEDIATE` through the existing DB abstraction pattern.
- Preserve Postgres behavior and add parity tests where possible.
- Any duplicate/unique failure must produce a controlled domain error and must not leave a partial create visible.

Acceptance:

- Failure after root allocation rolls back root, part, drawing and sequence cursor.
- Failure after part insert rolls back root, part, drawing and sequence cursor.
- Failure after drawing insert rolls back all created records if the create operation fails.
- Normal create still returns compact v2 root/part/drawing format.

Evidence required:

- Unit or script-level failure-injection QC.
- Existing numbering core/API regression gates.
- TypeScript and lint gates if code changes are made.

Stop conditions:

- Transaction hardening requires destructive migration.
- Behavior change would reuse previously allocated formal numbers without policy approval.

### Phase 3 - Local data repair decision and dry-run/apply split

Scope:

- Add or run a dry-run-only report that explains current local sequence/master/audit divergence.
- Present repair policy choices before any apply:
  - test-only reset/reuse,
  - formal non-reuse with void markers or retained sequence,
  - leave as-is and continue from next sequence.

Out of scope:

- Applying repair in this documentation task.
- Deleting audit evidence.
- Reusing missing roots without human decision.

Implementation contract:

- Dry-run must require no mutation and must produce a report with current sequence, retained roots, audit-created roots, missing roots and proposed policy impact.
- Apply mode, if later authorized, must require backup path, explicit policy flag, expected DB fingerprint and before/after report.
- Apply mode must not be callable by normal QC scripts.

Acceptance:

- Dry-run report is understandable by PM/RD/QC.
- Apply is blocked without explicit data-repair authorization.

Stop conditions:

- User-visible records would be deleted or renumbered.
- Policy requires formal number reuse, voiding or audit rewrite.

### Phase 4 - Production/Supabase rollout

Scope:

- Only after explicit release authorization, evaluate equivalent sequence isolation and integrity controls for the live target.
- Run production-like dry-run checks before any mutation.

Out of scope:

- This document does not contain merge, PR, deploy, rollback or production smoke steps.

Implementation contract:

- Hand off to deployment-release gate.
- Require target identity, credential boundary, backup/restore evidence, dry-run and rollback owner.

Stop conditions:

- Any production/Supabase live mutation without release authorization.

## 11. API, Data and Permission Impact

API:

- No public API contract change is required for Phase 1.
- Phase 2 should preserve `/api/numbering/records` response shape.
- Any visible error added for transaction failure must use controlled Chinese domain wording and avoid raw DB errors.

Data:

- Phase 1 adds no schema requirement.
- Phase 2 should not require schema change unless RD finds a proven transaction/locking limitation.
- Phase 3 dry-run reads `numbering_sequences`, master tables and audit logs only.

Permission:

- QC scripts and local developer tooling are the primary boundary.
- Production or Supabase permission/RLS changes are Phase 4 release-gated.

State machine:

- Root, part and drawing lifecycle states are unchanged.
- The CAPA adds data-integrity states for reporting only: clean, contaminated, blocked, dry-run-only and apply-authorized.

## 12. QA/QC Gate

Required QA plan:

- `.ai-doc/qa/qa-pdm-numbering-sequence-capa-validation-plan-2026-07-07.md`
- `.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`
- `.ai-doc/qc/qc-pdm-numbering-sequence-repair-report-2026-07-07.md`

Required focused gates after RD implementation:

- Read-only contaminated-fixture detection.
- Clean isolated-fixture pass.
- Runtime DB guard blocks allocating QC against `data/ai-pdm.sqlite`.
- Failure injection proves SQLite transaction rollback.
- Regression confirms normal create still returns compact v2 identities.
- Dry-run repair report cannot apply without explicit authorization.

Executed verification evidence:

- `npm run qc:pdm-numbering-qc-isolation`: passed 46/46.
- `npm run qc:pdm-numbering-sequence-integrity`: passed 3/3 and produced read-only runtime evidence under `output/qc-pdm-numbering-sequence-integrity/`.
- `npm run qc:pdm-numbering-sequence-transaction`: passed 4/4.
- `npm run qc:pdm-numbering-duplicate-submit-guard`: passed 10/10.
- `npm run qc:pdm-numbering-gap-reuse`: passed 8/8; runtime occupied roots `00007`, `00014`, `00056`, `00057`, `00058`, `00059`; computed lowest available root `00001`.
- Local repair apply: backup `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`; retained roots `00007`, `00014`, `00056`, `00057`, `00058`; purged test roots 53. Initial repair set the cursor to 59, but create policy was later corrected to gap-aware lowest-available allocation.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm run qc:pdm-numbering-core`: passed 241/241.
- `git diff --check`: passed with line-ending warnings only.
- `npm run build`: blocked by the intentional local-dev guard while local server PID 35812 owned port 3000; no bypass was used.

## 13. Deferred Scope Audit

| Scope | Classification | Reason |
|---|---|---|
| QC isolation for allocating numbering scripts | Same Spec Phase 1 / Implemented locally | Required PA completed by guarded allocating QC scripts |
| Sequence integrity verifier | Same Spec Phase 1 / Implemented locally | Required validation gate implemented as read-only detector with report-only runtime mode |
| SQLite transaction hardening | Same Spec Phase 2 / Implemented locally | Required CA completed for SQLite `createNumberingRecord` transaction boundary |
| Local test data repair/purge | Same Spec Phase 3 / Implemented locally | User classified current drawing-module UI records as formal and all other local sequence contamination as test data |
| Production/Supabase live check or repair | Blocked Human Re-entry / Release Authorization Required | Requires deployment-release gate |
| UI wording clarification for part-name suffix | Same Spec Phase 1 or later P2 polish | Lower risk; can be included if RD touches request UI or APP feedback repeats confusion |
| Project/order/equipment numbering | No Tracking / rejected for this CAPA | Separate product scope, not root cause |
| Extra visible category codes | No Tracking / rejected for this CAPA | Existing identity decision remains `P/M/R` |
| Retiring v1 read/search paths | No Tracking / rejected for safety | Historical compatibility remains required |

## 14. All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` | Authorized documentation only | Complete | CAPA spec, QA plan, dev_task and documentation_map | RD implementation, DB repair, production | User requested development document | Files created/updated with phase gates | Spec, QA plan, dev_task row, documentation_map entry |
| Phase 1 / QC isolation and integrity | Authorized by `完成此開發任務` | Implemented / Verification passed locally | Guard allocating QC, isolated DB, sequence integrity verifier | Data repair, production | User authorized development completion | Allocating QC cannot consume runtime DB; integrity gate detects divergence | QC report and npm scripts |
| Phase 2 / SQLite transaction hardening | Authorized by `完成此開發任務` | Implemented / Verification passed locally | Atomic SQLite numbering create and failure rollback | Schema/destructive migration unless re-authorized | User authorized development completion | Failure injection proves no partial create or silent cursor drift | Transaction QC, regression gates |
| Phase 3 / Local data repair and gap-aware allocation | Authorized by `測試資料先刪掉`; gap policy corrected by later user critical review | Implemented / Verification passed locally | Purge test roots/sequence keys/workflow rows, retain current drawing-module UI formal set, write repair audit, allocate lowest uncontrolled root gap | Production repair, visible formal renumbering/deletion | User confirmed local DB classification and later corrected empty-number reuse rule | Runtime sequence integrity is clean; current lowest available root is `00001` | Backup, repair report, integrity QC, gap reuse QC |
| Phase 4 / Production/Supabase rollout | Release Authorization Required | RD Contract Ready | Live-target equivalent checks and release gate | Any release artifact in this documentation task | Explicit release/deploy request | Deployment-release gate passes | Future release evidence only |

## 15. RD Readiness Review

Phase 1 is implemented and locally verified. No known P0/P1 engineering contract gap remains for QC isolation and read-only sequence integrity detection.

Phase 2 is implemented and locally verified. SQLite create allocation now uses the repository transaction boundary and `BEGIN IMMEDIATE` through the async DB provider.

Phase 3 is implemented locally. The user classified the current drawing-module UI records as formal and other local sequence contamination as test data; repair was applied with backup and audit evidence.

Phase 4 is blocked by release authorization and live-target details.

## 16. Release Artifact Boundary

This document intentionally does not include merge plan, PR checklist, deployment plan, rollback plan, production smoke plan or release report. Any production/Supabase action must be requested separately and routed through the deployment-release gate.
