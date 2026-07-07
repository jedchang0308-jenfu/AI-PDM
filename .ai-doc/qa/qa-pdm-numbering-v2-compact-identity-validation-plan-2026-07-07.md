# QA-PDM-NUMBERING-V2-COMPACT-IDENTITY - Validation Plan

Date: 2026-07-07
Related DEV: `DEV-PDM-NUMBERING-002`
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
Status: QA executed / Verification passed locally for Phase 1-4 local/runtime formal cutover

## Validation Objective

Verify that Numbering Core V2 creates compact root/drawing/part identities while preserving v1 compatibility and manufacturing safety.

Target identities:

```text
00001
00001-P01
00001-M01
00001-R01
```

## Scope

Phase 1-4 validation completed after RD and formal-cutover authorization:

- Rule seed and active v2 creation behavior.
- Five-digit root allocation.
- Two-digit part and drawing sequence allocation.
- `P/M/R` format validation.
- v1 compatibility for search, display and gate semantics.
- Manufacturing/reference helper usage.
- UI labels/placeholders for creation, search, drawings and impact pages.
- Import/export sample and regex compatibility.
- Scripted local/runtime cutover backup, apply/check reporting and zero remaining v1 master rows.
- Downstream compatibility after actual local/runtime master identity conversion.

Still not authorized:

- External production deploy or Supabase live migration/cutover.
- Direct/manual DB repair or deletion outside the approved scripted cutover boundary.
- Project/order/equipment identity linkage.
- BOM/ERP/equipment history implementation.

## Critical User Flows

- RD creates a part-only record and receives `00001-P01`.
- RD creates a part plus manufacturing drawing and receives `00001-P01` and `00001-M01`.
- RD creates a reference drawing and receives `00001-R01`.
- Supervisor sees manufacturing impact using `製造圖`, not legacy-only `MA` wording.
- Search finds both old `D-0001-MA1` and new `00001-M01` records.
- Release/DVT gates accept old `MA` and new `M` as manufacturing semantics.
- Reference drawings `OT/R` are blocked from manufacturing-basis use.

## FMEA

| Failure mode | Effect | Priority | Detection | Countermeasure |
|---|---|---|---|---|
| V2 schema rejects old `MA/OT` rows | Existing data becomes unreadable | P0 | Migration/bootstrap QC | Purpose code compatibility allows v1 and v2 during transition |
| Code checks only `purposeCode === "M"` | Old MA rows fail gates | P0 | Semantic helper static scan and regression QC | Use `isManufacturingDrawingPurpose` |
| Code checks only `purposeCode === "MA"` | New M rows fail gates | P0 | Semantic helper regression QC | Replace literal checks in gate paths |
| `R` drawing becomes manufacturing basis | Reference document used for manufacturing | P0 | Negative release/gate tests | `R/OT` always reference-only |
| `P00/M00/R00` generated | Reserved sequence ambiguity | P1 | Creation sequence negative test | Sequence starts at 1 and formatter rejects 0 |
| Root used as project/order identity | Reuse and capacity fail later | P1 | UI copy and import validation | Root help text says design-object root only |
| Migration dry-run silently collides | Wrong records linked after conversion | P0 | Dry-run collision fixture | Block apply and report manual review |
| UI still says `OT 其他圖` | Users keep using reference as a garbage bucket | P2 | UI vocabulary scan | Label as `R 參考圖` and require subtype metadata |

## Test Cases

### Static and schema checks

| ID | Priority | Case | Expected |
|---|---|---|---|
| QA-V2-SCHEMA-001 | P0 | `numbering-rule-v2` seed exists | Rule JSON has root 5 digits, `P/M/R`, two-digit sequences and `00` reserved |
| QA-V2-SCHEMA-002 | P0 | `drawing_numbers.purpose_code` compatibility | Historical `MA/OT` and new `M/R` are accepted in local schema/bootstrap |
| QA-V2-SCHEMA-003 | P1 | Formatter rejects out-of-range root/sequence | `00000`, `100000`, `P00`, `M00`, `R00`, `P100` are rejected |
| QA-V2-STATIC-001 | P0 | Manufacturing checks use helper | No gate-critical path relies only on raw `=== "MA"` or `=== "M"` |
| QA-V2-STATIC-002 | P1 | UI creation path accepts only v2 for normal create | `/api/numbering/records` normal path allows `M/R`, not `MA/OT` |

### Service and API checks

| ID | Priority | Case | Expected |
|---|---|---|---|
| QA-V2-CREATE-001 | P0 | Create part-only record | Root is five digits; part is `{root}-P01`; no drawing created |
| QA-V2-CREATE-002 | P0 | Create manufacturing drawing | Drawing is `{root}-M01`; link is `primary_manufacturing` |
| QA-V2-CREATE-003 | P0 | Create reference drawing | Drawing is `{root}-R01`; link is `reference`; subtype/description is captured |
| QA-V2-CREATE-004 | P1 | Second records under same root/category | Sequences increment to `P02`, `M02`, `R02` |
| QA-V2-CREATE-005 | P0 | Duplicate/concurrent allocation | Unique constraints and transaction prevent collisions |
| QA-V2-GATE-001 | P0 | DVT/Release gate with old `MA` | Existing v1 manufacturing row still passes manufacturing presence check |
| QA-V2-GATE-002 | P0 | DVT/Release gate with new `M` | New v2 manufacturing row passes manufacturing presence check |
| QA-V2-GATE-003 | P0 | Gate with `OT/R` only | Missing manufacturing drawing remains blocked |
| QA-V2-SEARCH-001 | P1 | Search mixed v1/v2 records | Search returns both and labels them semantically |

### UI checks

| ID | Priority | Case | Expected |
|---|---|---|---|
| QA-V2-UI-001 | P1 | Request page labels | User sees `製造圖 M` and `參考圖 R`; no normal `OT 其他圖` creation wording |
| QA-V2-UI-002 | P1 | Placeholder examples | Examples use `00001-M01`, `00001-R01`, `00001-P01` |
| QA-V2-UI-003 | P1 | Impact page | Page says `製造圖影響分析`; v1 MA row still accepted |
| QA-V2-UI-004 | P2 | Search/detail display | Historical `MA/OT` rows show clear manufacturing/reference meaning |

### Migration dry-run checks

| ID | Priority | Case | Expected |
|---|---|---|---|
| QA-V2-DRYRUN-001 | P0 | Safe v1 mapping | `P-0001-001` maps to `00001-P01`, `D-0001-MA1` maps to `00001-M01` |
| QA-V2-DRYRUN-002 | P0 | Capacity overflow | Root with 100 parts is `capacity_blocked` |
| QA-V2-DRYRUN-003 | P0 | Collision | Two old rows mapping to same v2 code are `collision` |
| QA-V2-DRYRUN-004 | P0 | No mutation | Dry-run leaves source DB unchanged |

### Formal local/runtime cutover checks

| ID | Priority | Case | Expected |
|---|---|---|---|
| QA-V2-CUTOVER-001 | P0 | Apply requires explicit apply mode | Default command runs dry-run/check behavior and does not mutate |
| QA-V2-CUTOVER-002 | P0 | Backup before mutation | Backup file is created and path is recorded |
| QA-V2-CUTOVER-003 | P0 | Master rows converted | No `D-`, `P-` or four-digit v1 master identities remain in root/part/drawing master tables |
| QA-V2-CUTOVER-004 | P0 | Rule state switched | `numbering-rule-v1` is retired and `numbering-rule-v2` is active |
| QA-V2-CUTOVER-005 | P0 | Operational references updated | Submissions, snapshots and supported operational references point to v2 identities |
| QA-V2-CUTOVER-006 | P1 | Historical evidence retained | Audit/export/file/package evidence strings are not physically renamed or rewritten |
| QA-V2-CUTOVER-007 | P0 | Post-cutover regression | API/UI/downstream regression suites pass after cutover |

## Required Evidence

Executed evidence:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:pdm-numbering-v2-compact-identity` 13/13
- `npm.cmd run qc:pdm-numbering-v2-migration-dry-run`
- `npm.cmd run pdm:numbering-v2:cutover-apply`
- `npm.cmd run qc:pdm-numbering-v2-formal-cutover` 11/11
- `npm.cmd run qc:pdm-numbering-core` 241/241
- `npm.cmd run qc:pdm-change-control` 62/62
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-api-regression` 27/27
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-data-consistency` 16/16
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-concurrency-reuse` 32/32
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-draft-lifecycle` 29/29
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-request-ui` 66/66
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-search-ui` 28/28
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-impact-ui` 24/24
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-dvt-ui` 24/24
- `npm.cmd run qc:master-attachments` 101/101
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-master-workbench-layout` 224/224
- `npm.cmd run qc:supabase-runtime-migrations` 25/25
- `npm.cmd run build`
- Migration dry-run JSON report: `output/qc-pdm-numbering-v2-migration-dry-run/report.json`
- Migration dry-run Markdown summary: `output/qc-pdm-numbering-v2-migration-dry-run/report.md`
- Formal cutover apply JSON report: `output/qc-pdm-numbering-v2-cutover/report.json`
- Formal cutover apply Markdown summary: `output/qc-pdm-numbering-v2-cutover/report.md`
- Formal cutover check JSON report: `output/qc-pdm-numbering-v2-cutover-check/report.json`
- Formal cutover check Markdown summary: `output/qc-pdm-numbering-v2-cutover-check/report.md`
- Local/runtime cutover backup: `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite`
- Fixture dry-run before/after hash proved no mutation.

## Pass Criteria

- All P0 cases pass.
- No v1 row becomes unreadable in local compatibility tests.
- No normal creation path emits `D-...`, `P-...`, `MA` or `OT` for new v2 records.
- No v1 master identity remains in the local/runtime root, part or drawing master tables after formal cutover.
- Reference drawings remain blocked from manufacturing basis.
- Any capacity/collision issue is reported as blocker, not silently mapped.

## Stop Conditions

- V2 requires deleting or rewriting existing rows before local tests can pass.
- `drawing_numbers.purpose_code` compatibility cannot be maintained.
- Existing release/submission/baseline gates cannot support both `MA` and `M`.
- External production/Supabase live migration, provider pointer change, direct/manual data repair or data deletion is requested.
- More category codes or project/order/equipment roots are needed.
