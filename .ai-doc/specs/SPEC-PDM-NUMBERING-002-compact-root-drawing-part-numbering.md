# SPEC-PDM-NUMBERING-002 - Compact root, drawing and part numbering v2

Status: Implemented / Verification passed locally for Phase 1-4 local/runtime formal cutover
Date: 2026-07-07
Owner: Dev PM
Related DEV: `DEV-PDM-NUMBERING-002`
Related ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
Related QA: `.ai-doc/qa/qa-pdm-numbering-v2-compact-identity-validation-plan-2026-07-07.md`
Amends: `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

## Human Decision Brief

Confirmed decisions:

- PDM v2 first manages only three controlled identities: main root, drawing number and part number.
- Main root is a reusable design-object root, not a customer project, order, equipment serial number or whole-machine project.
- Number strings should be compact and still show whether a drawing can be used for manufacturing.
- Adopt the target examples:
  - `00001-M01` = manufacturing-authorized drawing.
  - `00001-R01` = reference drawing, not manufacturing-authorized.
  - `00001-P01` = part number.
- Keep project/order/equipment tracking outside the numbering root and link it later through BOM, project records or equipment history.

Rejected options:

- Keep `D-0001-MA1`, `D-0001-OT1` and `P-0001-001` as the long-term format.
- Use `OT` as a broad "other" bucket.
- Remove all visible manufacturing/reference signal from the drawing number.
- Let a root represent an entire customer project or whole equipment order.
- Add more purpose codes for concept, installation, inspection, customer review or fixture drawings in the number string.

AI assumptions:

- Existing v1 records may already contain `MA`, `OT`, `P-0001-001` and `D-0001-MA1` style values; implementation must be backward compatible.
- `P00`, `M00` and `R00` are reserved and not generated in v2.
- A two-digit per-root sequence gives 99 part numbers, 99 manufacturing drawings and 99 reference drawings per design root. If a design root needs more, that is evidence the root is too broad or requires explicit PM review.
- Historical v1 universal part `P-xxxx-000` remains valid as historical data, but v2 does not create a new universal `P00` identity.

Re-entry triggers:

- User wants roots to represent customer projects, orders, equipment serial numbers or whole-machine projects.
- User wants more than `P/M/R` visible category codes.
- A real migration dry-run finds any root that would exceed `P01-P99`, `M01-M99` or `R01-R99`.
- RD needs external production/Supabase live cutover, direct DB repair/deletion outside the scripted cutover boundary or provider pointer change.

## Problem

The v1 numbering spec uses:

```text
root:    0001
part:    P-0001-001
drawing: D-0001-MA1 / D-0001-OT1
```

This worked for early PDM control, but it encodes too much ceremony into the string and keeps `OT` as an ambiguous bucket. In the AI/PDM direction, the number should be a stable identity and carry only the minimum human-safety signal needed outside the system.

The system must still protect manufacturing use: users, suppliers and printed/PDF drawings need a visible cue that separates manufacturing-authorized drawings from reference-only drawings.

## Goals

- Replace v1 visible format for new records with:

```text
root:    00001
part:    00001-P01
drawing: 00001-M01 / 00001-R01
```

- Preserve root/drawing/part as separate master-data entities.
- Keep manufacturing authority visible in drawing numbers using `M` versus `R`.
- Keep the PDM database as the rule source; number strings are identifiers, not project/BOM containers.
- Keep v1 historical data readable and searchable.
- Prepare a safe local implementation path before any production migration.

## Scope

Phase 1-4 local/runtime implementation scope completed after explicit RD and formal-cutover authorization:

- Add `numbering-rule-v2` as the active rule for new local numbering records.
- Generate five-digit root codes.
- Generate v2 part numbers as `{root}-P{seq2}`.
- Generate v2 drawing numbers as `{root}-M{seq2}` or `{root}-R{seq2}`.
- Replace new-record UI choices from `MA/OT` to `M/R` while displaying user-facing Chinese labels.
- Add semantic helpers so code checks manufacturing authority by meaning, not by literal `MA`.
- Keep v1 records searchable, displayable and release-gate compatible.
- Update import/export examples, regex validators and QC scripts for v1/v2 compatibility.
- Prepare dry-run migration reporting for existing v1 records.
- Apply the reviewed local/runtime v1-to-v2 master identity cutover through the scripted cutover path.
- Retire `numbering-rule-v1`, activate `numbering-rule-v2`, update operational references and preserve historical audit/export/file/package evidence strings.
- Produce backup, apply report, independent check report and formal cutover QC evidence.

## Out of Scope

- External production deployment, Supabase live migration/cutover or provider pointer changes.
- Direct/manual rewriting of existing user data outside the approved scripted cutover path.
- Project/order/equipment-number design.
- BOM redesign, ERP project linkage or equipment history implementation.
- Adding new visible number codes beyond `P`, `M` and `R`.
- Retiring v1 historical records from read paths.
- Making reference drawings usable for manufacturing by exception.

## End-State Architecture

Identity layers:

```text
Project / order number    -> Sales, project management, ERP order tracking
Equipment serial number   -> Delivered equipment, warranty, service history
PDM design root           -> Reusable design object root, e.g. 00001
Part number               -> BOM-usable part identity, e.g. 00001-P01
Drawing number            -> Controlled drawing identity, e.g. 00001-M01
```

PDM v2 owns only the PDM design root, part number and drawing number. Project and equipment identities must link to PDM through future BOM/project/equipment tables, not by overloading `root_code`.

## Vocabulary

| Term | V2 definition |
|---|---|
| Main root | Five-digit reusable design-object root such as `00001`. |
| Part number | BOM-usable part identity under a root, such as `00001-P01`. |
| Manufacturing drawing | Drawing number with category `M`; may become the manufacturing basis after release gates pass. |
| Reference drawing | Drawing number with category `R`; cannot be manufacturing basis. |
| Category code | The single-letter identity class/purpose segment: `P`, `M`, `R`. |
| Sequence | Two-digit sequence under root/category, from `01` to `99`. |

## V2 Coding Rules

Format:

```text
{root5}-{category}{seq2}
```

Rules:

- `root5`: `00001` to `99999`.
- `category`:
  - `P`: part number.
  - `M`: manufacturing-authorized drawing.
  - `R`: reference drawing.
- `seq2`: `01` to `99`.
- `00` is reserved and must not be generated.
- `M` drawings can be linked as `primary_manufacturing`.
- `R` drawings link only as `reference`.
- `R` drawings must not pass manufacturing baseline or release-as-manufacturing gates.
- Reference subtype belongs in metadata, not the number string.

Examples:

```text
00001           root
00001-P01       first part under root
00001-M01       first manufacturing drawing under root
00001-M02       second manufacturing drawing under root
00001-R01       first reference drawing under root
```

Invalid examples:

```text
00001-P00       reserved
00001-M00       reserved
00001-R00       reserved
00001-Q01       unsupported visible category
JF2026-001-P01  project/order identity incorrectly used as PDM root
```

## Data Contract

Existing tables remain authoritative:

| Table | V2 role |
|---|---|
| `numbering_rule_versions` | Stores `numbering-rule-v2` and active rule JSON. |
| `numbering_sequences` | Allocates root/category sequences transactionally. |
| `part_roots` | Stores five-digit v2 root codes and historical v1 root codes. |
| `part_numbers` | Stores v2 part number strings and historical v1 part strings. |
| `drawing_numbers` | Stores v2 `M/R` drawing numbers and historical v1 `MA/OT` drawing numbers. |
| `drawing_part_links` | Keeps semantic link types such as `primary_manufacturing` and `reference`. |
| `audit_logs` | Records rule version, old/new code and migration/import decisions. |

Compatibility requirement:

- Do not change `drawing_numbers.purpose_code` in a way that makes historical `MA/OT` rows invalid.
- During transition, the domain model must accept both v1 and v2 purpose codes:

```text
manufacturing: MA, M
reference:     OT, R
```

- New v2 creation APIs must create only `M` or `R`.
- Search, reports, impact analysis and release gates must treat `MA/M` as manufacturing by semantics.
- UI may label old `MA` as `M 製造圖` when the row is read-only historical, but must not silently rewrite the value without migration.

Recommended rule JSON:

```json
{
  "rootDigits": 5,
  "partCode": "P",
  "drawingPurposeCodes": ["M", "R"],
  "partSequenceDigits": 2,
  "drawingSequenceDigits": 2,
  "reservedSequences": ["00"],
  "formats": {
    "root": "{root}",
    "part": "{root}-P{seq}",
    "drawing": "{root}-{purpose}{seq}"
  },
  "compatibility": {
    "v1ManufacturingCodes": ["MA"],
    "v1ReferenceCodes": ["OT"]
  }
}
```

## API And Service Contract

Required service helpers:

```ts
isManufacturingDrawingPurpose(code) // true for MA, M
isReferenceDrawingPurpose(code)     // true for OT, R
isV2RootCode(value)
isV2PartNumber(value)
isV2DrawingNumber(value)
parseNumberingIdentity(value)
formatV2RootCode(sequence)
formatV2PartNumber(rootCode, sequence)
formatV2DrawingNumber(rootCode, purposeCode, sequence)
```

Creation API:

- `POST /api/numbering/records` accepts `drawingPurposeCode` only as `M` or `R` for v2 creation.
- It may accept legacy `MA/OT` only in explicit import/migration paths, not in normal user creation.
- Response payload must include `ruleVersionId`.

Search/read APIs:

- Must return v1 and v2 records.
- Must expose semantic display fields:
  - `isManufacturingDrawing`.
  - `isReferenceDrawing`.
  - `displayPurposeLabel`.

Impact/release APIs:

- Must use semantic helpers instead of hard-coded `purposeCode === "MA"`.
- `R/OT` must never be treated as manufacturing basis.

## UI Contract

User-facing labels:

| Code | Normal label | Meaning |
|---|---|---|
| `P` | 料號 | BOM-usable part number. |
| `M` | 製造圖 | May be used for manufacturing only after release gates. |
| `R` | 參考圖 | Reference-only, never manufacturing basis. |

UI changes:

- Creation forms show `製造圖 M` and `參考圖 R`.
- Placeholder examples use `00001-M01`, `00001-R01`, `00001-P01`.
- Replace headings like `MA 影響分析` with `製造圖影響分析`.
- Keep explanatory text for old rows if they show `MA/OT`.
- Do not use `其他圖`; use `參考圖` plus metadata subtype.

## Migration And Compatibility Strategy

Phase 1 did not rewrite existing data. Phase 4 local/runtime formal cutover rewrote master numbering identities only after dry-run evidence, backup and explicit user authorization.

Required dry-run mapping:

```text
0001       -> 00001
P-0001-001 -> 00001-P01
D-0001-MA1 -> 00001-M01
D-0001-OT1 -> 00001-R01
```

Dry-run must detect:

- Any root with more than 99 part numbers.
- Any root with more than 99 manufacturing drawings.
- Any root with more than 99 reference drawings.
- Any mapping collision.
- Any record whose root cannot be inferred safely.
- Any reference in `submissions`, `submission_snapshots`, `file_references`, BOM lines, attachment metadata or audit reports that would need update.

External production/Supabase live migration must not execute until cutover evidence is reviewed again against the target environment and explicitly approved.

## Phase Roadmap

| Phase | Status | Purpose | Authorization |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture human decisions, ADR, SPEC, QA and dev_task entry. | Authorized by user request to write development documents. |
| Phase 1 - Local v2 creation and compatibility | Implemented / Verification passed locally | New records use compact v2, while v1 remains readable and searchable. | Authorized and completed locally on 2026-07-07. |
| Phase 2 - Import/export and migration dry-run | Implemented / Verification passed locally | Report how existing v1 data maps to v2 and identify blockers. | Authorized and completed as dry-run only on 2026-07-07. |
| Phase 3 - Downstream module compatibility | Implemented / Verification passed locally | Ensure submissions, revisions, baselines, previews and reports handle v1/v2 semantics. | Authorized and completed locally on 2026-07-07. |
| Phase 4 - Local/runtime formal cutover | Implemented / Verification passed locally | Apply reviewed v1-to-v2 master identity rewrite to the local runtime DB with backup, check mode and smoke/regression evidence. | Authorized and completed locally on 2026-07-07. |
| Phase 5 - External production/Supabase live cutover | Release Gate Contract Ready / Not Authorized | Apply target-environment migration/cutover only with backup, rollback and smoke evidence. | Requires deployment-release gate and explicit target approval. |

## RD Handoff Contract

### Phase 1 - Local v2 creation and compatibility

Scope:

- Add v2 rule seed and set it active for local new records.
- Update sync and async numbering repositories.
- Add semantic helpers and replace hard-coded manufacturing/reference checks in numbering services.
- Update normal creation API, request UI, search UI, drawing list UI, impact labels and placeholders.
- Update regex validators and focused QC.
- Preserve v1 read/search/impact behavior.

Out of scope:

- Existing-data rewrite.
- Production migration or deployment.
- BOM/project/equipment identity implementation.
- Removing v1 code paths.

Implementation contract:

- Use transaction boundary already present in numbering repositories.
- Allocate sequences by company and root/category.
- Treat `M` as primary manufacturing eligible; `R` as reference only.
- Keep `link_type` values semantic (`primary_manufacturing`, `reference`) rather than renaming to v2 literals.
- Make errors domain-specific, e.g. `V2_SEQUENCE_OUT_OF_RANGE`, `INVALID_DRAWING_PURPOSE_CODE`, `REFERENCE_DRAWING_NOT_MANUFACTURING_BASIS`.
- Keep rule version on every created root/part/drawing row.

Acceptance:

- Creating a part without drawing returns `00001-P01`.
- Creating a part with manufacturing drawing returns `00001-P01` and `00001-M01`.
- Creating a reference drawing returns `00001-R01` and requires reference subtype/description metadata.
- v1 rows still appear in search and detail pages.
- Missing manufacturing drawing gates treat `M` and old `MA` as manufacturing.

Evidence required:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:pdm-numbering-v2-compact-identity`
- Existing numbering regressions: core, backend rules, request UI, search UI, impact UI, DVT promotion.

### Phase 2 - Import/export and migration dry-run

Scope:

- Add dry-run mapper from v1 to v2.
- Update import examples and staging validation.
- Update export report to include rule version and both raw/semantic purpose labels.
- Report collisions and capacity blockers.

Out of scope:

- Applying migration to real user data.
- Rewriting audit snapshots or release evidence.

Acceptance:

- Dry-run produces a JSON and Markdown report.
- Report classifies each row as `safe_map`, `capacity_blocked`, `collision`, `manual_review` or `out_of_scope`.
- No data is changed by dry-run.

Evidence required:

- Focused dry-run QC against seeded v1 data.
- No DB mutation outside temporary fixture DB.

### Phase 3 - Downstream module compatibility

Scope:

- Verify v1/v2 semantic compatibility in submission readiness, drawing revision package, shared 3D/MA baseline, master attachments, AI helper and reports.
- Rename visible `MA` UI concepts to `製造圖` where appropriate.
- Keep historical evidence filenames and screenshots unchanged unless they are regenerated by a focused QC.

Out of scope:

- Forcing all downstream modules to adopt new route names.
- Retiring historical v1 evidence files.

Acceptance:

- Release/approval gates work for both `MA` and `M`.
- `OT/R` remain blocked from manufacturing-basis use.
- No user-facing normal workflow requires knowing `MA/OT`.

### Phase 4 - Local/runtime formal cutover

Scope:

- Scripted local/runtime cutover with default dry-run/check behavior and explicit `--apply`.
- Backup local SQLite DB before mutation.
- Convert v1 master rows to v2 master identities.
- Update operational references in submissions, snapshots, BOM/baseline/revision/change-control records and supported JSON payloads.
- Retire `numbering-rule-v1` and activate `numbering-rule-v2`.
- Preserve historical evidence strings in audit logs, export jobs, file assets, release packages and submission files.
- Produce apply report, independent check report and formal QC report.

Out of scope:

- External production/Supabase live cutover before release gate approval.
- Physical file rename or historical evidence rewrite.

Acceptance:

- Backup path exists and is recorded.
- Apply report shows zero blocked mappings and zero remaining v1 master rows.
- Independent check report shows zero remaining v1 master rows.
- Formal cutover QC passes.
- Runtime API/UI and downstream regression suites pass after cutover.

### Phase 5 - External production/Supabase live cutover

Scope:

- Target-environment backup, migration/cutover, rollback rehearsal or accepted rollback plan, deployment and post-deploy smoke.

Out of scope:

- Any ungated production/provider pointer change.

Acceptance:

- Release gate evidence is complete for the actual target.
- Rollback plan exists and was rehearsed or explicitly accepted.
- Post-deploy smoke proves v2 master identity and retained historical evidence behavior.

## Local Implementation Evidence

Completed implementation:

- Added `src/lib/numbering-identity.ts` for v1/v2 formatting, parsing and semantic purpose helpers.
- Default normal creation now uses `numbering-rule-v2` and generates five-digit roots plus `{root}-P01`, `{root}-M01` and `{root}-R01`.
- Normal API/UI creation accepts `M/R` rather than `MA/OT`; historical import/read paths preserve v1 compatibility.
- Downstream manufacturing checks use `MA/M` semantics and keep `OT/R` reference-only.
- Added compact numbering runtime migration `db/postgres/004_numbering_v2_compact_identity.sql` and synchronized Supabase migration `supabase/migrations/20260707000000_numbering_v2_compact_identity.sql`.
- Added migration dry-run report generation under `output/qc-pdm-numbering-v2-migration-dry-run/`.
- Added formal cutover script `scripts/pdm-numbering-v2-cutover.mjs` and formal QC gate `scripts/qc-pdm-numbering-v2-formal-cutover.mjs`.
- Applied local/runtime cutover with backup `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite`.
- Converted local/runtime master identities: `0007/0014` to `00007/00014`, `P-0007-001/P-0014-001` to `00007-P01/00014-P01`, and `D-0007-MA1/D-0014-MA1` to `00007-M01/00014-M01`.
- Updated operational references and intentionally retained historical evidence strings in audit/export/file/package records.
- Updated focused QC scripts for v2 formats, downstream helper usage, mobile master identity layout and Supabase migration manifest coverage.

Verification passed:

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

Build gate:

- `npm.cmd run build` passed after stopping the project-owned local server.

## RD Readiness Review

Phase 1-4 P0/P1 readiness gaps: none known for local/runtime implementation after the evidence above.

Required engineering decisions are already specified:

- Schema compatibility must allow v1 and v2 purpose codes during transition.
- Semantics must be helper-based, not literal-string scattered.
- Migration is dry-run/check first and apply requires explicit authorization.
- External production/Supabase live cutover is gated.

## QA/QC Gate Summary

Minimum Phase 1 QC:

- New v2 creation positive paths.
- Invalid code and sequence negative paths.
- v1 compatibility read/search paths.
- Manufacturing/reference semantic gate tests.
- UI placeholder/label scan.
- Import/export regex compatibility scan.
- TypeScript, lint and focused numbering regressions.

## Stop Conditions

Stop and return to PM/user if:

- Any v2 implementation would invalidate existing v1 rows.
- A root requires more than 99 sequence values in a category.
- External production/Supabase live migration, provider pointer change or direct/manual data rewrite is needed.
- Project/order/equipment identity must be designed in the same scope.
- A downstream module requires changing business semantics beyond number parsing/display.
- A reference drawing is requested to become manufacturing-authorized without becoming an `M` drawing.

## Deferred Scope Audit

| Deferred scope | Classification | Handling |
|---|---|---|
| Applying existing-data rewrite from v1 to v2 in local/runtime DB | Same Spec Phase 4 / Completed locally | Completed through scripted cutover after dry-run evidence, backup and explicit approval. |
| Downstream submission/revision/baseline/report compatibility | Same Spec Phase 3 / Completed locally | Semantic compatibility implemented and verified; external production evidence belongs to Phase 5 if deployed. |
| External production/Supabase live deployment/migration | Same Spec Phase 5 / Not Authorized | Requires deployment-release gate and explicit target approval. |
| Project/order/equipment numbering | Blocked Human Re-entry | Must be separately decided because it changes product scope. |
| More visible category codes | Blocked Human Re-entry | User currently wants only manufacturing/reference/part signal. |
| Retiring v1 read paths | No Tracking for now | Rejected for safety; historical records must remain readable. |
| BOM/ERP/equipment history linkage | New DEV later | Not part of numbering core v2; should be separate DEV when needed. |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / `DEV-PDM-NUMBERING-002` docs | Authorized | Complete | SPEC, ADR, QA, dev_task and documentation_map | Product implementation | User requested development documents | Files created and indexed | Git diff for docs |
| Phase 1 / local v2 creation | Authorized | Implemented / Verification passed locally | v2 rule, repositories, API, UI, semantic helpers, QC | Migration, production, downstream rewrite | User RD authorization | v2 create/search/gate tests pass | tsc, lint, focused QC, numbering regressions |
| Phase 2 / migration dry-run | Authorized for dry-run only | Implemented / Verification passed locally | v1 to v2 dry-run report | Applying migration | Phase 1 local implementation | collision/capacity report generated; no mutation | dry-run QC |
| Phase 3 / downstream compatibility | Authorized | Implemented / Verification passed locally | submissions, revisions, baselines, previews, reports | New business semantics | Phase 1-2 local evidence | v1/v2 both work in downstream gates | regression QC |
| Phase 4 / local-runtime formal cutover | Authorized | Implemented / Verification passed locally | scripted local DB cutover, backup, operational reference update, formal QC | external production/Supabase live cutover, physical evidence rename | Phase 1-3 verified evidence and explicit cutover authorization | zero blocked mappings, zero v1 master rows, regression QC pass | backup, apply/check reports, formal QC, build |
| Phase 5 / external production-Supabase live cutover | Not authorized | Release Gate Contract Ready / Not Authorized | production migration/deploy/smoke/rollback | Any ungated production/provider pointer change | release gate approval for actual target | production smoke pass and rollback ready | deployment-release-gate evidence |
