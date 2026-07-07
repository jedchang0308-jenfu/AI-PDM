# ADR-PDM-NUMBERING-002 - Compact root, drawing and part identity

Status: Accepted / Implemented locally for new records and local/runtime formal cutover; external production/Supabase live cutover not authorized
Date: 2026-07-07
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
Related DEV: `DEV-PDM-NUMBERING-002`
Amends: `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

## Context

The v1 PDM numbering format is:

```text
D-0001-MA1
D-0001-OT1
P-0001-001
```

The user wants the PDM to first manage only main roots, drawing numbers and part numbers, while keeping one visible safety signal: whether a drawing can be used for manufacturing. The user also wants fewer characters and does not want roots to represent entire projects.

AI-era PDM direction favors stable identifiers plus metadata. The number should not become a large encoded taxonomy, but manufacturing/reference distinction still matters when files leave the system as PDF, printout, shared filename or supplier package.

## Decision

Adopt a compact v2 identity scheme for new records:

```text
00001-M01 = manufacturing drawing
00001-R01 = reference drawing
00001-P01 = part number
```

Rules:

1. `00001` is a reusable PDM design-object root.
2. `00001` must not represent customer project, order, equipment serial number or whole-machine project.
3. `P` identifies a part number.
4. `M` identifies a manufacturing-authorized drawing category.
5. `R` identifies a reference-only drawing category.
6. `01-99` are generated per root and category.
7. `00` is reserved and not generated.
8. Reference subtype is metadata, not a number-code expansion.
9. Existing v1 records remain readable and searchable.
10. Local/runtime existing-master rewrite was approved and executed through the scripted formal cutover path; external production/Supabase live migration still requires separate approval.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Keep v1 `D-0001-MA1 / D-0001-OT1 / P-0001-001` | Rejected for new records | Too long and keeps `OT` as an ambiguous bucket. |
| Remove all visible drawing purpose codes | Rejected now | Unsafe for paper/PDF/supplier contexts while PDM maturity is still growing. |
| Use `00001-M01 / R01 / P01` | Accepted | Short, consistent and preserves the only required visible safety signal. |
| Add more category codes like install, concept, QC or fixture | Rejected | Metadata should carry subtype; visible code expansion will recreate smart-number complexity. |
| Let root represent a project or equipment order | Rejected | Blocks reuse and quickly exhausts per-root sequence capacity. |
| Convert all old records immediately without dry-run/check | Rejected | Requires dry-run/check, backup, approval and cutover gate evidence. |

## Consequences

Positive:

- Shorter and easier to read.
- Keeps manufacturing/reference distinction visible outside PDM.
- Aligns number strings with AI/PDM metadata strategy.
- Reduces pressure to encode project/customer/material/purpose in the number.
- Keeps roots reusable across projects and equipment.

Costs and tradeoffs:

- Code and UI must move from literal `MA/OT` checks to semantic helper functions.
- Schema and validators must support both v1 and v2 during transition.
- Some old documentation, QA screenshots and retained evidence strings will still contain v1 examples.
- Two-digit sequences require PM review if a root exceeds 99 per category.
- External production/Supabase live data cannot be rewritten without target-specific migration and release-gate approval.

## Migration / Compatibility Impact

Implementation must:

- Add `numbering-rule-v2`.
- Keep historical `numbering-rule-v1` interpretation.
- Treat `MA` and `M` as manufacturing semantics.
- Treat `OT` and `R` as reference semantics.
- Update normal creation flows to generate only v2 codes.
- Keep import/migration paths able to read v1 rows.
- Provide dry-run mapping before any existing-data rewrite.
- Apply local/runtime master rewrite only through the approved cutover script with backup, check mode, retained-evidence policy and formal QC.

Required dry-run examples:

```text
0001 -> 00001
P-0001-001 -> 00001-P01
D-0001-MA1 -> 00001-M01
D-0001-OT1 -> 00001-R01
```

Implemented local/runtime cutover mapping:

```text
0007 -> 00007
0014 -> 00014
P-0007-001 -> 00007-P01
P-0014-001 -> 00014-P01
D-0007-MA1 -> 00007-M01
D-0014-MA1 -> 00014-M01
```

Historical audit/export/file/package evidence strings are intentionally retained as evidence, not rewritten.

Blocked without explicit approval:

- External production/Supabase live migration.
- Direct/manual DB update of old numbers outside the approved scripted cutover boundary.
- Data deletion.
- Root reinterpretation as project/order/equipment.
- More visible category codes.

## Superseded / Amended Documents

This ADR amends:

- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

It does not invalidate historical v1 QA evidence or retained audit/export/file evidence. `numbering-rule-v1` is retired in the local/runtime DB after formal cutover; `numbering-rule-v2` is active for normal records. External production/Supabase live cutover remains separately gated.

## Enforcement

RD must not mark implementation complete until:

- v2 create paths generate `00001-P01`, `00001-M01` and `00001-R01`.
- normal creation paths no longer create `MA/OT`.
- v1 rows remain readable/searchable.
- gate logic uses manufacturing/reference semantics rather than raw string literals.
- `R/OT` cannot be used as manufacturing basis.
- `P00/M00/R00` are not generated.
- local/runtime cutover uses the approved scripted backup/apply/check/QC path.
