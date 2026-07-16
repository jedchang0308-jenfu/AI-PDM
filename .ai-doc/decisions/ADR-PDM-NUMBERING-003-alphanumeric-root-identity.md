# ADR-PDM-NUMBERING-003 - Alphanumeric root identity

Status: Accepted / Implemented locally through Phase 3
Date: 2026-07-07
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`
Related DEV: `DEV-PDM-NUMBERING-003`
Amends: `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`

## Context

`ADR-PDM-NUMBERING-002` adopted compact identities:

```text
00001-M01
00001-R01
00001-P01
```

The format is short and keeps the only visible safety signal needed outside PDM: manufacturing drawing versus reference drawing. The remaining weakness is that the root `00001` is a pure numeric-looking value. When exported, copied or imported through Excel/CSV tools, a standalone root can lose leading zeroes if the column is treated as a number.

The user explicitly does not want to rely on spreadsheet formatting as the primary control, because people can change format settings. The format itself should reduce the error path.

## Decision

Adopt an alphanumeric v3 root identity for future normal creation:

```text
A0001-M01 = manufacturing drawing
A0001-R01 = reference drawing
A0001-P01 = part number
```

Rules:

1. Valid roots range from `A0001` to `Z9999`.
2. The letter is only a capacity band and has no business meaning.
3. `A0001` remains a reusable PDM design-object root.
4. `A0001` must not represent a customer project, order, equipment serial number or whole-machine project.
5. `P` identifies a part number.
6. `M` identifies a manufacturing drawing category.
7. `R` identifies a reference-only drawing category.
8. `01-99` are generated per root/category.
9. `0000` and `00` are reserved.
10. Existing v1/v2 records remain readable and searchable.

Capacity:

```text
26 * 9,999 = 259,974 roots
```

Allocation order:

```text
A0001 ... A9999, B0001 ... Z9999
```

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Keep v2 pure numeric root `00001` | Rejected for future normal creation | Too dependent on spreadsheet/text-format controls. |
| Use `A0001-Z9999` | Accepted | Solves leading-zero loss by format, keeps same part/drawing code length as v2, and provides about 260k roots. |
| Use `A00001` | Rejected for now | More capacity than needed and adds one character. |
| Use `AA001` | Rejected for now | Higher capacity, but harder for humans to parse and explain. |
| Exclude `I/O/Q` | Deferred human decision | Reduces confusion but changes the selected `A-Z` scheme and capacity. |
| Give `A/B/C` business meaning | Rejected | Recreates smart-number complexity and conflicts with reusable root policy. |

## Consequences

Positive:

- Root is no longer numeric-looking, reducing spreadsheet leading-zero corruption risk.
- `A0001-M01` remains compact and the same length as `00001-M01`.
- Letter band expands root capacity without adding more digits.
- Existing `P/M/R` safety semantics remain unchanged.
- Root stays metadata-light and does not become a project taxonomy.

Costs and tradeoffs:

- v3 requires parser, formatter, validator, import/export and QC updates.
- Existing v2 records must remain supported during transition.
- A formal cutover from v2 to v3 requires dry-run, backup and explicit authorization.
- Users may infer meaning from `A/B/C` unless UI and documentation consistently say it is only a capacity band.
- If ambiguous letters become unacceptable later, the allowed-letter list must be decided before implementation.

## Compatibility Impact

Local implementation now:

- Adds `numbering-rule-v3-alpha-root`.
- Generates v3 roots for normal creation after activation.
- Treats root strings as text in import/export APIs.
- Keeps v1/v2 read/search/display compatibility.
- Preserves manufacturing/reference semantics through helpers, not raw string assumptions.
- Keeps `R/OT` blocked from manufacturing-basis use.
- Provides v2-to-v3 dry-run before data rewrite.
- Completed local runtime v2-to-v3 cutover through dry-run, backup, apply and independent check.

Suggested v2-to-v3 ordinal mapping:

```text
00001 -> A0001
09999 -> A9999
10000 -> B0001
99999 -> K0009
```

Still blocked without explicit approval:

- External production/Supabase live migration.
- Direct/manual DB update outside the scripted local cutover boundary.
- Data deletion.
- Merge, PR, deploy, rollback or production smoke artifacts.

## Superseded / Amended Documents

This ADR amends future numbering identity direction from:

- `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
- `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`

It does not invalidate completed `DEV-PDM-NUMBERING-002` evidence. V1/v2 compatibility remains required for historical records and retained evidence. Local runtime master identities have been converted to v3 under `DEV-PDM-NUMBERING-003`; production/Supabase targets remain gated separately.

## Enforcement

RD must not mark v3 implementation complete until:

- Normal create paths generate `A0001-P01`, `A0001-M01` and `A0001-R01`.
- Existing `00001-*` records remain readable/searchable.
- Import/export treats all identity values as strings.
- Search, relation, submission, revision and baseline gates use semantic helpers.
- `A/B/C` is not exposed as a business category.
- `A0000`, `P00`, `M00` and `R00` are not generated.
- Data cutover, if executed, uses dry-run, backup, apply, independent check and QC evidence.

Local completion evidence:

- `npm.cmd run pdm:numbering-v3:cutover-dry-run`: passed with 24 `safe_map`, 0 `collision`, 0 `manual_review` and 0 blockers.
- `npm.cmd run pdm:numbering-v3:cutover-apply -- --allow-running-local-server`: passed with backup `data/backups/pdm-numbering-v3-cutover-20260707-131614/ai-pdm.sqlite`.
- `npm.cmd run qc:pdm-numbering-v3-formal-cutover`: passed 8/8.
- `npm.cmd run qc:pdm-numbering-v3-alpha-root`: passed 14/14.
