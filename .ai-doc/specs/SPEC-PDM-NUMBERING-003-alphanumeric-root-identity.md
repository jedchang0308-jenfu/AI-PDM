# SPEC-PDM-NUMBERING-003 - Alphanumeric root identity

Status: Implemented / Verification passed locally for Phase 1-3; Phase 4 release-gated
Date: 2026-07-07
Owner: Dev PM
Related DEV: `DEV-PDM-NUMBERING-003`
Related ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-003-alphanumeric-root-identity.md`
Related QA: `.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`
Amends: `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`

## Human Decision Brief

Confirmed decisions:

- Main root must not be a pure numeric string, because spreadsheet and CSV tools can strip leading zeroes when users adjust formatting.
- Adopt the selected root range `A0001` to `Z9999`.
- The root remains a reusable PDM design-object root, not a customer project, order, equipment serial number or whole-machine project.
- The leading letter is only a serial capacity band. It must not represent product line, customer, project, department, plant, drawing type or lifecycle status.
- No UI, document, training material or export field may assign business meaning to `A`, `B`, `C` or any later root letter.
- Keep the compact identity suffix model:
  - `A0001-M01` = manufacturing drawing category.
  - `A0001-R01` = reference drawing category.
  - `A0001-P01` = part number.
- `M` means manufacturing drawing category only. It does not mean the drawing is approved, released or currently manufacturable.
- Actual manufacturing usability must be decided by drawing status, revision, release record and manufacturing-basis relationship.
- `R` means reference drawing. An `R` drawing must never be used as manufacturing basis under any lifecycle status.
- Keep visible number meaning limited to identity class and drawing category. Other subtypes stay in metadata.
- When allocating new v3 roots, v3 ordinal positions mapped from existing v1/v2 numeric roots are treated as occupied. Example: if `00007` exists, `A0007` must not be allocated to a new root.
- The same root may be reused only for the same design subject or a traceable design family. If geometry baseline, main function, BOM main structure or manufacturing basis cannot be shared, create a new root.
- A formal root must not be reused after it has been issued to a person, exported, printed, submitted for review, received by a supplier or entered audit/control records. Only test numbers that never entered formal control records may be released.

Rejected options:

- Keep pure numeric roots such as `00001` as the long-term normal root format.
- Depend on Excel column formatting, import templates or user discipline as the main protection against leading-zero loss.
- Use the root prefix letter to represent project, customer, product line, drawing type or lifecycle status.
- Let UI, export, training or documents describe root letters as business categories.
- Treat `M` as an approval/release/manufacturable signal.
- Allow any `R` drawing to become manufacturing basis.
- Allocate a v3 root whose ordinal is reserved by an existing v1/v2 numeric root.
- Reuse a formal root after issue, export, print, review submission, supplier receipt or audit entry.
- Return to long prefixes such as `D-` and `P-` for normal compact identities.
- Add more visible drawing-purpose codes beyond `M` and `R`.

AI assumptions:

- Current local/runtime master identities have been cut over from v2 numeric roots to v3 alphanumeric roots through the authorized Phase 3 scripted backup/apply/check path.
- Current v1/v2 records and historical evidence remain readable/searchable where retained as evidence. v3 implementation must keep compatibility and must not break existing evidence.
- Current selected decision uses the full `A-Z` band. Excluding ambiguous letters such as `I`, `O` or `Q` is recommended for manual readability, but remains a separate human decision before implementation changes the allowed-letter list.
- `A0000`, `B0000` and all `*0000` roots are reserved and must not be generated.
- `P00`, `M00` and `R00` remain reserved and must not be generated.

Re-entry triggers:

- User wants letters to encode customer, product line, project, plant, drawing type or lifecycle status.
- UI, documents, training or exports give `A/B/C` or any root letter business meaning.
- A workflow treats `M` alone as approval, release or manufacturability.
- A workflow lets an `R` drawing become manufacturing basis.
- User wants to exclude letters such as `I`, `O` or `Q` after parser, allocator or migration logic is already implemented.
- User wants to reuse a root that has entered formal issue/export/print/review/supplier/audit records.
- A migration dry-run finds collisions, capacity overflow, ambiguous historical references or unsupported numeric roots.
- Implementation requires live Supabase migration, production deployment, provider pointer change, direct data repair/deletion or release artifacts.

## Problem

`DEV-PDM-NUMBERING-002` made the identity shorter:

```text
00001-M01
00001-R01
00001-P01
```

That format is compact and semantically clean, but the root `00001` is still a pure numeric-looking value. When exported to Excel, CSV or other office tools, a standalone `root_code` can become `1` if the column is interpreted as a number. That creates identity corruption risk and depends too much on human formatting discipline.

The new requirement is to solve this through the code format itself, while keeping the code short and preserving the ability to distinguish manufacturing drawings from reference drawings.

## Goals

- Replace the normal root format for future v3 creation with:

```text
root:    A0001
part:    A0001-P01
drawing: A0001-M01 / A0001-R01
```

- Prevent leading-zero loss by making the root inherently alphanumeric.
- Keep the full identity length unchanged from v2 for part/drawing numbers: `A0001-M01` is the same length as `00001-M01`.
- Preserve `P/M/R` as the only visible identity-class and drawing-category signal.
- Keep manufacturing safety outside the code string: manufacturability is controlled by drawing status, revision, release record and manufacturing-basis relationship.
- Preserve gap-aware allocation from the sequence CAPA: allocate the lowest available uncontrolled root in the defined order.
- Reserve v3 ordinal positions that correspond to existing v1/v2 numeric roots to prevent future cutover collisions.
- Keep existing v1/v2 records readable and searchable until an explicit cutover is authorized.

## Out of Scope

- External production deployment, Supabase live migration/cutover or provider pointer change.
- Direct/manual rewriting of existing data outside the authorized scripted local v3 cutover boundary.
- Project/order/equipment numbering.
- BOM/ERP/equipment-history linkage.
- More visible category codes.
- Physical renaming of historical files, release packages, screenshots or protected evidence paths.
- Retiring v1/v2 read/search compatibility.

## End-State Architecture

Identity layers:

```text
Project / order number    -> Sales, project management, ERP order tracking
Equipment serial number   -> Delivered equipment, warranty, service history
PDM design root           -> Reusable design object root, e.g. A0001
Part number               -> BOM-usable part identity, e.g. A0001-P01
Drawing number            -> Controlled drawing identity, e.g. A0001-M01
```

PDM v3 owns only the PDM design root, part number and drawing number. Project/order/equipment identities must link through their own records later. They must not be embedded into the root string.

## Coding Rules

Root format:

```text
{letter}{seq4}
```

Full identity format:

```text
{root5}-{category}{seq2}
```

Rules:

- `letter`: `A` to `Z`, uppercase only, unless the optional ambiguous-letter exclusion is adopted.
- `seq4`: `0001` to `9999`.
- `category`:
  - `P`: part number.
  - `M`: manufacturing drawing category.
  - `R`: reference drawing category.
- `seq2`: `01` to `99`.
- `0000` and `00` are reserved.
- Letters are capacity bands only and carry no business meaning.
- Letters must not encode product line, customer, project, department, plant, drawing type or lifecycle status.
- `M` does not mean approved, released or currently manufacturable.
- `M` drawings may become manufacturing basis only when drawing status, revision, release record and manufacturing-basis relationship all pass the required gates.
- `R` drawings are reference-only and must not become manufacturing basis under any status.
- Reference subtype belongs in metadata, not the code.

Examples:

```text
A0001           root
A0001-P01       first part under root
A0001-M01       first manufacturing drawing category under root
A0001-M02       second manufacturing drawing under root
A0001-R01       first reference drawing category under root
Z9999-R99       last valid reference drawing identity in the current root range
```

Invalid examples:

```text
00001-M01       pure numeric v2 root; readable as legacy/current, not generated by v3
A0000-M01       root sequence 0000 is reserved
A0001-M00       drawing sequence 00 is reserved
a0001-M01       lowercase root letter is invalid
AA001-M01       not in the selected A0001-Z9999 format
A0001-Q01       unsupported visible category
JF001-M01       root letter/string overloaded with company meaning
A0007           unavailable for new allocation if legacy root 00007 exists
```

Capacity:

```text
26 letters * 9,999 roots per letter = 259,974 root identities
```

Optional ambiguous-letter exclusion:

```text
Allowed letters: A-H, J-N, P, R-Z
Excluded letters: I, O, Q
23 letters * 9,999 roots per letter = 229,977 root identities
```

Assessment:

- Excluding `I`, `O` and `Q` reduces visual confusion with `1`, `0` and `O/Q` in printed drawings, labels and supplier communication.
- The capacity loss is 29,997 roots, leaving 229,977 roots, which is still far above expected internal PDM root demand.
- If adopted, the allocator, parser, v2-to-v3 ordinal mapper, examples and QC fixtures must use the allowed-letter sequence `A, B, C, D, E, F, G, H, J, K, L, M, N, P, R, S, T, U, V, W, X, Y, Z`.
- Recommendation: adopt the exclusion before production or formal cutover if manual reading, labels, printouts or supplier exchange are common. Do not adopt it silently after numbers have already been issued.

Allocation order:

```text
A0001, A0002, ... A9999, B0001, ... Z9999
```

If ambiguous-letter exclusion is adopted, allocation order must skip `I`, `O` and `Q`:

```text
A0001, ... H9999, J0001, ... N9999, P0001, R0001, ... Z9999
```

`Z9999` exhaustion must stop with an explicit capacity error. The system must not silently roll over to `AA0001` without a new human decision.

## Governance Rules

### Root Letter Meaning Guard

- Root letters are serial capacity bands only.
- UI labels, reports, export headers, import templates, training materials, SOPs and help text must not describe root letters as product, customer, project, department, plant, drawing-type or lifecycle categories.
- The field label should remain neutral, such as `root_code`, `PDM root`, `root band` or equivalent. It must not be labeled as `project prefix`, `product series`, `customer code`, `plant code` or `lifecycle code`.

### Manufacturing Basis Guard

- `M` only identifies the drawing category.
- `M` alone is insufficient for manufacturing use.
- Manufacturing use requires at minimum:
  - drawing status allows manufacturing use.
  - revision is the active manufacturing revision.
  - release record exists and is valid.
  - the drawing is linked as the manufacturing basis for the relevant part/root.
  - no blocking invalidation, ECR, obsolescence or pending review condition exists.
- `R` drawings are reference-only. No approval status may turn an `R` drawing into manufacturing basis. A reference drawing that becomes intended manufacturing basis must be reissued as an `M` drawing through controlled workflow.

### Root Reuse Guard

- The same root means the same design subject or a traceable design family.
- Root reuse is allowed only when the design can share a traceable identity boundary.
- Create a new root when any of the following cannot be shared:
  - geometry baseline.
  - main function.
  - BOM main structure.
  - manufacturing basis.
  - controlled design lineage.
- Formal roots are non-reusable once issued outside transient test scope.
- A root is formal and non-reusable if it has been issued to a person, exported, printed, submitted for review, received by a supplier, referenced by a downstream record or written into audit/control records.
- Only test roots that never entered formal control records may be released for reuse, and the release action must itself be auditable.

## Data Contract

Existing table roles remain:

| Table | V3 role |
|---|---|
| `numbering_rule_versions` | Stores `numbering-rule-v3-alpha-root` and active rule JSON. |
| `numbering_sequences` | Allocates root/category sequences transactionally. |
| `part_roots` | Stores v3 root codes and existing v1/v2 root codes. |
| `part_numbers` | Stores v3 part numbers and existing v1/v2 part numbers. |
| `drawing_numbers` | Stores v3 drawing numbers and existing v1/v2 drawing numbers. |
| `drawing_part_links` | Keeps semantic link types such as `primary_manufacturing` and `reference`. |
| `audit_logs` | Records rule version, old/new code and migration/import decisions. |

Compatibility requirement:

- Normal v3 creation must generate only `A0001` style roots.
- Normal v3 creation must not allocate a root whose v3 ordinal is occupied by an existing v1/v2 numeric root. Example: existing `00007` reserves `A0007`.
- Read/search/import/migration paths must accept:
  - v1 examples: `D-0001-MA1`, `D-0001-OT1`, `P-0001-001`.
  - v2 examples: `00001`, `00001-M01`, `00001-R01`, `00001-P01`.
  - v3 examples: `A0001`, `A0001-M01`, `A0001-R01`, `A0001-P01`.
- Manufacturing semantics remain helper-based:
  - manufacturing: `MA`, `M`.
  - reference: `OT`, `R`.
- Manufacturing-basis eligibility must not be inferred from `M` alone.
- Reference drawings must be blocked from manufacturing-basis relationships even if their status is released.
- `root_code`, `part_number`, `drawing_number` and parsed identity fields must be treated as strings in APIs, import/export and UI state.
- Exports and UI metadata must not contain columns or labels that give root letters business meaning.

Recommended rule JSON:

```json
{
  "rootFormat": "alpha_numeric_1_letter_4_digits",
  "rootLetters": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "rootLetterMeaning": "capacity_band_only",
  "forbiddenRootLetterMeanings": [
    "product_line",
    "customer",
    "project",
    "department",
    "plant",
    "drawing_type",
    "lifecycle_status"
  ],
  "rootSequenceDigits": 4,
  "rootSequenceStart": 1,
  "rootSequenceEnd": 9999,
  "partCode": "P",
  "drawingPurposeCodes": ["M", "R"],
  "partSequenceDigits": 2,
  "drawingSequenceDigits": 2,
  "reservedRootSequences": ["0000"],
  "reservedCategorySequences": ["00"],
  "allocation": {
    "reserveLegacyNumericRootOrdinals": true,
    "gapReuseScope": "never_formal_control_records"
  },
  "manufacturingBasis": {
    "mCodeIsCategoryOnly": true,
    "requiresStatusRevisionReleaseAndLink": true,
    "referenceDrawingCanBeManufacturingBasis": false
  },
  "rootReuse": {
    "sameRootRequiresSharedDesignSubjectOrTraceableFamily": true,
    "newRootRequiredWhenCannotShare": [
      "geometry_baseline",
      "main_function",
      "bom_main_structure",
      "manufacturing_basis",
      "controlled_design_lineage"
    ],
    "formalRootReuseForbiddenAfter": [
      "issued_to_person",
      "exported",
      "printed",
      "submitted_for_review",
      "supplier_received",
      "audit_or_control_record"
    ]
  },
  "formats": {
    "root": "{letter}{rootSeq4}",
    "part": "{root}-P{seq2}",
    "drawing": "{root}-{purpose}{seq2}"
  },
  "compatibility": {
    "v1ManufacturingCodes": ["MA"],
    "v1ReferenceCodes": ["OT"],
    "v2RootPattern": "^[0-9]{5}$"
  }
}
```

## API And Service Contract

Required helpers:

```ts
isV3RootCode(value)
isV3PartNumber(value)
isV3DrawingNumber(value)
formatV3RootCode(ordinal)
rootOrdinalToV3(ordinal)
v3RootToOrdinal(rootCode)
compareRootCodesByPolicy(a, b)
parseNumberingIdentity(value)
isManufacturingDrawingPurpose(code)
isReferenceDrawingPurpose(code)
```

Allocation contract:

- Use the existing repository transaction boundary.
- Find the lowest available controlled-master root by v3 allocation order.
- A root is unavailable if it exists in controlled `part_roots`, regardless of lifecycle status.
- A v3 root is unavailable if its ordinal maps to any existing v1/v2 numeric root in the same company scope. Example: `00007` reserves `A0007`.
- A root absent from controlled master rows may be reused as a gap only if it has never entered formal control records.
- Formal-control records include issue to a person, export, print, review submission, supplier receipt, downstream reference and audit/control records.
- Test roots that never entered formal control may be released for reuse only through an auditable release action.
- Allocation must be company-scoped where current numbering policy is company-scoped.

Creation API:

- `POST /api/numbering/records` creates v3 identities once the v3 rule is active.
- Request payload should not accept user-supplied root text for normal creation unless the existing workflow already supports reserved/manual roots under an approval gate.
- Response payload must include `ruleVersionId` and a parsed identity object.

Search/read APIs:

- Must return v1, v2 and v3 records.
- Must expose semantic display fields:
  - `isManufacturingDrawing`.
  - `isReferenceDrawing`.
  - `isManufacturingBasis`.
  - `manufacturingBasisReason`.
  - `identityVersion`.
  - `displayPurposeLabel`.
- Must not display root letter business meaning.
- Must make clear that `M` is a category and not a release/manufacturing authorization.

Import/export APIs:

- CSV/XLSX export must write identity columns as text.
- Import must validate exact root strings and must not normalize `A0001` to `A1`.
- Import must reject lowercase or mixed-case roots unless an explicit normalization preview is shown before import.
- Export headers and import templates must not describe `A/B/C` root letters as project, customer, product, department, plant, drawing type or lifecycle fields.
- Imports must reject or flag rows that attempt to use root letters as business taxonomy fields.

## Migration Strategy

The safe migration mapping from v2 pure numeric roots to v3 alphanumeric roots uses ordinal order:

```text
00001 -> A0001
09999 -> A9999
10000 -> B0001
99999 -> K0009
```

If ambiguous-letter exclusion is adopted, the same ordinal mapping uses the allowed-letter list `A-H, J-N, P, R-Z`. Under that policy, `99999` maps to `L0009` instead of `K0009`.

Examples for current local/runtime evidence:

```text
00007 -> A0007
00014 -> A0014
00056 -> A0056
00059 -> A0059
00007-P01 -> A0007-P01
00014-M01 -> A0014-M01
```

Dry-run must detect:

- Any v1/v2 code that cannot be parsed.
- Any v2 numeric root outside `00001` to `99999`.
- Any mapping collision with existing v3 roots.
- Any proposed new v3 root whose ordinal is already occupied by an existing v1/v2 numeric root.
- Any formal root that a user or script attempts to release for reuse after issue/export/print/review/supplier/audit evidence exists.
- Any operational reference in submissions, snapshots, BOM/baseline/revision/change-control records, notifications, tasks, import/export jobs or JSON payloads that cannot be rewritten safely.
- Any protected historical evidence string that must be retained instead of rewritten.

Local/runtime migration is authorized and completed for this workspace only through the documented Phase 3 backup/apply/check path. Production/Supabase cutover still requires separate release authorization, target backup and rollback evidence.

## Phase Roadmap

| Phase | Status | Purpose | Authorization |
|---|---|---|---|
| Phase 0 - Development documents | Complete | SPEC, ADR, QA plan, dev_task and documentation_map entries. | Authorized by user request to write development documents. |
| Phase 1 - V3 creation and compatibility | Complete / Verification passed locally | Add v3 rule, parsers, formatters, allocation order, legacy ordinal reservation, governance copy, UI examples and v1/v2/v3 read compatibility. | Authorized by user development instruction. |
| Phase 2 - Migration dry-run and downstream compatibility | Complete / Verification passed locally | Produce v2-to-v3 dry-run reports, verify legacy ordinal reservation and verify downstream modules by semantic helpers. | Authorized by user `完成DEV-PDM-NUMBERING-003所有開發任務`. |
| Phase 3 - Local/runtime formal cutover | Complete / Verification passed locally | Convert local/runtime master identities from v2 to v3 through backup/apply/check scripts. | Authorized by user `完成DEV-PDM-NUMBERING-003所有開發任務`; limited to local runtime DB. |
| Phase 4 - External production/Supabase live cutover | Blocked Human Re-entry / Release Authorization Required | Target-environment migration, deploy, smoke and rollback gate. | Requires release authorization and live target approval. |

## RD Handoff Contract

### Phase 1 - V3 creation and compatibility

Scope:

- Add `numbering-rule-v3-alpha-root`.
- Update identity parser/formatter helpers for v3.
- Update normal creation to generate `A0001-P01`, `A0001-M01` and `A0001-R01`.
- Prevent allocator from issuing v3 roots whose ordinal maps to an existing v1/v2 numeric root.
- Enforce root reuse rules for formal versus never-controlled test roots.
- Preserve v1/v2 read/search/display compatibility.
- Update UI placeholders and examples from `00001-*` to `A0001-*` for normal v3 creation.
- Update UI, documents, import templates and export headers so root letters are never described as business categories.
- Ensure `M` displays as drawing category only, not approval/release/manufacturing authorization.
- Ensure `R` is always blocked from manufacturing-basis use.
- Update import/export validators and focused QC fixtures.

Out of scope:

- Existing-data rewrite.
- Production/Supabase migration.
- Project/order/equipment identity design.
- Removing v1/v2 compatibility.
- Assigning business meaning to root letters.
- Using `M` alone as a manufacturability signal.
- Reclassifying `R` drawings into manufacturing basis.
- Reusing formal roots that entered issue/export/print/review/supplier/audit records.

Acceptance:

- Creating a part without drawing returns `A0001-P01` when no controlled roots exist.
- Creating a part with manufacturing drawing returns `A0001-P01` and `A0001-M01`.
- Creating a reference drawing returns `A0001-R01`.
- Existing `00001-*` rows remain readable/searchable.
- If legacy root `00007` exists, new v3 allocation must not issue `A0007`.
- `M` drawing category does not pass manufacturing-basis gates without valid status, active revision, release record and manufacturing-basis link.
- `R` drawings fail manufacturing-basis gates under every status.
- UI, export headers, import templates and training copy do not assign business meaning to root letters.
- Formal roots cannot be released or reused after issue/export/print/review/supplier/audit evidence exists.
- Search and relation views sort v3 roots by allocation order.
- CSV/XLSX export preserves `A0001` as text without requiring a numeric formatting trick.

Evidence required:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- Focused v3 identity QC.
- Existing numbering core/API/data/concurrency/draft lifecycle/request/search/impact/DVT regressions.

### Phase 2 - Migration dry-run and downstream compatibility

Scope:

- Add v2-to-v3 dry-run mapper.
- Report safe mappings, collisions, unsupported records and protected evidence retention.
- Report legacy numeric roots that reserve v3 ordinal positions.
- Report attempted formal-root reuse as blocked when issue/export/print/review/supplier/audit evidence exists.
- Verify submission, revision, shared 3D baseline, master attachment, search, relation view, report and import/export paths with v1/v2/v3 samples.

Out of scope:

- Applying migration to real data.
- Rewriting protected evidence.

Acceptance:

- Dry-run produces JSON and Markdown reports.
- Report classifies each row as `safe_map`, `collision`, `manual_review`, `protected_evidence_retained` or `out_of_scope`.
- Report classifies ordinal reservations from v1/v2 numeric roots.
- Report classifies blocked formal-root reuse attempts.
- No data changes during dry-run.
- Downstream gates continue using manufacturing-basis semantics rather than `M` string assumptions.
- `R` remains reference-only in downstream gates.

### Phase 3 - Local/runtime formal cutover

Scope:

- Backup local runtime DB before mutation.
- Convert v2 master rows to v3 master identities through a scripted apply path.
- Update operational references that must stay searchable and functional.
- Retain historical audit/file/package evidence strings where they are evidence, not active references.
- Produce apply report, independent check report and focused QC evidence.

Out of scope:

- External production/Supabase live cutover.
- Physical file renaming.
- Any direct/manual DB update outside the approved script.

Acceptance:

- Backup path exists and is recorded.
- Apply report shows zero blocked mappings.
- Independent check shows no active v2 master identities remain if the cutover goal is full local v3 master identity.
- Existing historical evidence remains traceable.
- Focused and regression QC pass.

### Phase 4 - External production/Supabase live cutover

Scope:

- Release-gated target migration, deploy, smoke and rollback readiness.

Out of scope:

- Any ungated production/provider pointer change.

Acceptance:

- Release gate evidence is complete for the actual target.
- Rollback plan exists and is approved under the release gate.
- Post-release smoke proves v3 identity behavior and retained historical evidence behavior.

## RD Readiness Review

Phase 1 P0/P1 readiness gaps: none known for local implementation after this document.

Engineering decisions fixed by this document:

- Use `A0001-Z9999` as the v3 normal root range.
- Letter band has no business meaning.
- UI, documents, training and exports must not assign business meaning to root letters.
- Allocation order is ordinal and gap-aware.
- Existing v1/v2 numeric roots reserve their mapped v3 ordinal positions.
- Root reuse is limited to the same design subject or traceable design family.
- Formal roots are non-reusable after issue/export/print/review/supplier/audit evidence.
- `M` is a drawing category only, not approval/release/manufacturing authorization.
- `R` can never be manufacturing basis.
- v1/v2 remain readable.
- Ambiguous-letter exclusion is recommended but remains a human decision unless explicitly adopted.
- Migration is dry-run/check first and apply requires explicit authorization.
- Release artifacts remain deferred until explicit release authorization.

## QA/QC Gate Summary

Minimum Phase 1 gates:

- v3 parser/formatter positive and negative cases.
- allocation order and capacity-boundary tests.
- legacy v1/v2 numeric root ordinal reservation tests.
- root reuse and formal-root non-reuse tests.
- v1/v2/v3 read/search compatibility.
- manufacturing-basis gate tests proving `M` is not enough and `R` is always blocked.
- CSV/XLSX import/export text preservation checks.
- UI, document, training and export label scan for forbidden root-letter meanings.
- numbering regressions.

## Stop Conditions

Stop and return to PM/user if:

- A developer proposes giving `A/B/C` business meaning.
- UI, documents, training or export templates describe any root letter as product line, customer, project, department, plant, drawing type or lifecycle status.
- A workflow uses `M` alone to mean approved, released or manufacturable.
- A workflow allows `R` drawing to become manufacturing basis.
- A workflow attempts to allocate `A0007` or any v3 mapped root when legacy numeric root `00007` or equivalent exists.
- A workflow attempts to reuse a formal root that has been issued, exported, printed, submitted, supplier-received or audited.
- Implementation would invalidate v1/v2 records.
- Implementation requires production/Supabase live action.
- Implementation needs direct data mutation without a scripted backup/apply/check path.
- Root capacity reaches `Z9999`.
- More visible category codes or project/order/equipment identity is requested in the same scope.

## Deferred Scope Audit

| Deferred scope | Classification | Handling |
|---|---|---|
| Product implementation of v3 create paths | Same Spec Phase 1 / Complete locally | Implemented and verified under user authorization. |
| v2-to-v3 dry-run and downstream compatibility | Same Spec Phase 2 / Complete locally | Dry-run/report and compatibility verification completed. |
| Local/runtime formal cutover | Same Spec Phase 3 / Complete locally | Backup/apply/check conversion completed for local runtime DB. |
| External production/Supabase live cutover | Blocked Human Re-entry / Release Authorization Required | Requires release gate and target approval. |
| Excluding ambiguous letters `I/O/Q` | Blocked Human Re-entry | Recommended for readability. If adopted, allowed letters become `A-H, J-N, P, R-Z` with 229,977 roots; parser, allocator, mapping examples and QC must change before issue/cutover. |
| Project/order/equipment numbering | No Tracking for this DEV | Rejected as a root-code overload; future linkage belongs to a separate DEV. |
| More visible category codes | No Tracking for this DEV | Rejected to keep identifiers compact and metadata-driven. |
| Retiring v1/v2 read paths | No Tracking now | Rejected for safety; historical records remain readable. |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / `DEV-PDM-NUMBERING-003` docs | Authorized | Complete | SPEC, ADR, QA, dev_task and documentation_map | Product implementation | User requested development documents | Files created and indexed | Git diff for docs |
| Phase 1 / v3 creation | Authorized and implemented locally | Complete / Verification passed locally | v3 rule, helpers, legacy ordinal reservation, root reuse guard, create API/UI, import/export validators | production, project/order/equipment codes, letter business meanings, `M` as release signal, `R` as manufacturing basis | User development authorization | `A0001-P01/M01/R01` create works; v1/v2 readable; legacy ordinals reserved; `M/R` gates correct | tsc, lint, focused QC, numbering regressions |
| Phase 2 / dry-run and compatibility | Authorized and implemented locally | Complete / Verification passed locally | v2-to-v3 dry-run, ordinal-reservation report, formal-root reuse block, downstream compatibility | data mutation during dry-run | Phase 1 implemented/verified plus user authorization | dry-run report and downstream regressions pass | dry-run report, QC |
| Phase 3 / local cutover | Authorized and implemented locally | Complete / Verification passed locally | local backup/apply/check conversion | production, physical evidence rename, direct/manual DB update outside script | Phase 2 evidence and explicit local data authorization | zero blocked mappings and active references updated | backup, apply/check reports, QC |
| Phase 4 / production cutover | Not authorized | Blocked Human Re-entry / Release Authorization Required | live migration/deploy/smoke/rollback | ungated release | release gate authorization | target smoke passes and rollback ready | deployment-release-gate evidence |
