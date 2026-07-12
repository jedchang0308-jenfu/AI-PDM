# QA Plan - PDM numbering 003 alphanumeric root

Status: Executed / Verification passed locally for Phase 1-3
Date: 2026-07-07
Owner: QA
Related DEV: `DEV-PDM-NUMBERING-003`
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-003-alphanumeric-root-identity.md`

## Objective

Validate that v3 numbering changes the normal root from pure numeric `00001` to alphanumeric `A0001`, while preserving compact `P/M/R` semantics, v1/v2 compatibility, and spreadsheet/import/export safety.

## Scope

In scope:

- v3 parser, formatter and validator.
- v3 allocation order from `A0001` to `Z9999`.
- normal create output for root, part and drawing numbers.
- v1/v2/v3 read/search compatibility.
- manufacturing/reference semantic gates.
- CSV/XLSX import/export text preservation.
- UI examples and labels.
- migration dry-run and downstream compatibility.
- local/runtime formal cutover with backup, apply and independent check.

Out of scope:

- Production/Supabase migration or deployment.
- Direct data repair/deletion outside the scripted local cutover boundary.
- Project/order/equipment numbering.
- More visible category codes.
- Retiring v1/v2 compatibility.

## Test Matrix

| Area | Case | Expected result |
|---|---|---|
| Parser positive | `A0001`, `Z9999`, `A0001-M01`, `A0001-R01`, `A0001-P01` | Parsed as v3 identities with correct class and sequence. |
| Parser negative | `A0000`, `A0001-M00`, `a0001-M01`, `AA001-M01`, `A0001-Q01` | Rejected with domain-specific errors. |
| Allocation order | empty controlled master rows | first root is `A0001`. |
| Allocation order | `A0001` exists | next available root is `A0002`. |
| Allocation boundary | `A9999` exists and `B0001` absent | next available root is `B0001`. |
| Capacity boundary | `Z9999` exists and all prior roots exist | allocation stops with capacity-exhausted error. |
| Create part | normal part-only request | returns `A0001-P01`. |
| Create manufacturing drawing | normal part + manufacturing drawing request | returns `A0001-P01` and `A0001-M01`. |
| Create reference drawing | normal reference drawing request | returns `A0001-R01` and cannot become manufacturing basis. |
| Compatibility | existing `00001-M01` and `D-0001-MA1` rows | remain readable/searchable and display correct manufacturing semantics. |
| Semantic gate | `MA/M` | treated as manufacturing. |
| Semantic gate | `OT/R` | treated as reference and blocked from manufacturing-basis gates. |
| Import | CSV root column contains `A0001` | imported as exact string, not normalized to `A1`. |
| Export | CSV/XLSX includes root `A0001` | exported with text preservation and no leading-zero dependency. |
| UI copy | request/search/detail pages | examples use `A0001-M01`, `A0001-R01`, `A0001-P01` for v3 normal creation. |
| Governance copy | docs/UI help | letter band is described as capacity only, not project/customer/product category. |

## Phase Gates

### Phase 1 - V3 creation and compatibility

Required evidence:

- TypeScript passes.
- Lint passes.
- focused v3 identity QC passes.
- numbering core regression passes.
- numbering API regression passes.
- numbering data consistency regression passes.
- numbering concurrency/reuse regression passes.
- numbering draft lifecycle regression passes.
- request/search/impact/DVT UI regressions pass.

Minimum commands after implementation:

```text
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run qc:pdm-numbering-core
npm.cmd run qc:pdm-numbering-api-regression
npm.cmd run qc:pdm-numbering-data-consistency
npm.cmd run qc:pdm-numbering-concurrency-reuse
npm.cmd run qc:pdm-numbering-draft-lifecycle
npm.cmd run qc:pdm-numbering-request-ui
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-numbering-impact-ui
npm.cmd run qc:pdm-numbering-dvt-ui
```

Add a new focused script during RD, recommended name:

```text
npm.cmd run qc:pdm-numbering-v3-alpha-root
```

### Phase 2 - Dry-run and downstream compatibility

Required evidence:

- v2-to-v3 dry-run JSON and Markdown report.
- downstream compatibility checks for submissions, revisions, shared 3D baseline, master attachments, reports and relation view.
- report classifies each mapping as `safe_map`, `collision`, `manual_review`, `protected_evidence_retained` or `out_of_scope`.
- no mutation during dry-run.

Executed evidence:

- `npm.cmd run pdm:numbering-v3:cutover-dry-run`: passed.
- Report: `output/qc-pdm-numbering-v3-cutover/report.json` and `output/qc-pdm-numbering-v3-cutover/report.md`.
- Result: 8 root mappings, 8 part mappings, 8 drawing mappings, 24 `safe_map`, 0 `collision`, 0 `manual_review`, 0 blockers and 39 exact operational references to rewrite.
- Historical evidence retention was classified separately from operational references.

### Phase 3 - Local/runtime formal cutover

Required evidence:

- local backup path.
- apply report.
- independent check report.
- focused v3 cutover QC.
- existing numbering and downstream regressions after cutover.

Executed evidence:

- `npm.cmd run pdm:numbering-v3:cutover-apply -- --allow-running-local-server`: passed.
- Backup: `data/backups/pdm-numbering-v3-cutover-20260707-131614/ai-pdm.sqlite`.
- Apply report: `output/qc-pdm-numbering-v3-cutover/report.json`.
- Independent check report: `output/qc-pdm-numbering-v3-cutover-check/report.json`.
- `npm.cmd run qc:pdm-numbering-v3-formal-cutover`: passed 8/8.
- Runtime result: v3 active; v1/v2 retired; no legacy master identities; no legacy operational references; retained legacy strings only in protected historical evidence classes such as audit/file/release paths.
- Regression result after cutover: `npm.cmd run qc:pdm-numbering-v3-alpha-root` 14/14, `npm.cmd run qc:pdm-numbering-core` 241/241, `npm.cmd run qc:pdm-change-control` 62/62, `npm.cmd run qc:pdm-numbering-gap-reuse` 8/8, `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run build` and `npm.cmd run dev:local:check` all passed.

### Phase 4 - Production/Supabase live cutover

Required evidence:

- release-gate authorization.
- target backup and rollback readiness.
- target smoke evidence.
- production stop-condition handling.

This QA plan intentionally does not include executable release steps. Release artifacts are deferred until explicit release authorization.

## Stop Conditions

Stop QA and return to PM/RD if:

- v3 implementation breaks existing v1/v2 read/search paths.
- root letter is interpreted as a business category.
- import/export normalizes `A0001` to a different value.
- reference drawings pass manufacturing-basis gates.
- data mutation is attempted without explicit local data-repair or release authorization.
- production/Supabase credentials, deploy, rollback or smoke are needed without release-gate approval.

## Residual Risk

- Users may still infer that `A`, `B` and `C` mean business categories. Mitigation: UI/help/docs must consistently state that the letter is only a capacity band.
- Excel can still alter other fields if users manually edit data. Mitigation: identity columns remain string-typed in import/export and validation rejects malformed codes.
- Existing v2 protected evidence remains valid and must not be silently rewritten as if the historical event originally used v3.
