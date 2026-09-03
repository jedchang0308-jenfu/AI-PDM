# QC Receipt — DEV-110 Local Implementation

- Date：2026-08-31
- Status：`RD Implemented Locally / Full QC Passed 60/60 / Production Release Gated`
- Scope：智慧辨識 common-first projection、料號例外與下游 Part Work handoff。
- Authority：`.ai-doc/specs/SPEC-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001-upstream-part-work-handoff.md`
- ADR：`.ai-doc/decisions/ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001-common-projection-and-atomic-draft-transfer.md`
- QA Plan：`.ai-doc/qa/qa-dev-110-recognition-common-value-part-work-handoff-validation-plan-2026-08-31.md`

## Implemented slice

- common value is the default projection; `effective(part, field) = override(part, field) ?? common(field)`。
- Drawing-wide／explicit overall evidence can form common; per-Part table evidence requires verified exact owner provenance or a unique full canonical Part-number token match。
- Missing evidence, suffix／abbreviated／ambiguous owner text and non-eligible matches fail closed and do not create a patch。
- Handoff reads the formal Drawing-Part relation, revalidates session/source/relation fingerprints, and expands the accepted draft into existing exact Part Works through one serializable command boundary。
- The read response carries a canonical workbench contract token when authority is canonical; the handoff POST verifies that token and fails closed while cutover is gated。
- The v2 event records `destinationKind=part_work`; formal Part master remains unchanged and DEV-108 remains the downstream edit／review authority。
- UI has a single common-first table, exception-only rows, manual per-Part override／restore controls and one handoff CTA。

## Executed evidence

| Evidence | Result |
|---|---|
| `npm.cmd run qc:dev-110:contract` | PASS — C01..C08 |
| `npm.cmd run qc:dev-110:repository` | PASS — R01..R16 disposable SQLite fixture |
| `npm run qc:dev-110:postgres` | PASS — P01..P08 disposable PostgreSQL provider／lock／rollback fixture |
| `npm run qc:dev-110:browser` | PASS — B01..B16 authenticated real Chromium、正常入口與四 viewport |
| `npm run qc:dev-110:integration` | PASS — I01..I08 DEV-108 destination／API readback |
| `npm run qc:dev-110:aggregate` | PASS — fixed 60/60 aggregate including G01..G04 |
| `npm.cmd run typecheck:app` | PASS |
| affected-file ESLint | PASS, 0 errors |
| `node scripts/qc-next-isolated-build.mjs` | PASS — build, primary SQLite invariants and cleanup |
| `git diff --check` | PASS (line-ending warnings only) |

Repository and provider fixtures covered exact formal relation scope／natural order、common value fan-out to all eligible Parts、existing-work merge／conflict、source／relation drift、sorted locking、fault rollback、v2 event creation and same idempotency-key replay without a duplicate effect. The real browser lane used the normal Drawing workspace entry, verified source evidence and common／exception controls at 1536／1440／1024／390 viewports, then navigated to the canonical DEV-108 Part workspace and read back SUS304／SUS301 values.

## Not executed / release boundary

The fixed 60-case denominator is complete. Aggregate evidence：`output/qa/dev-110/DEV110-aggregate-2026-08-31T13-51-48-003Z/aggregate.json`；C01..C08、R01..R16、P01..P08、B01..B16、I01..I08、G01..G04全部`PASS`。Primary SQLite snapshot remained unchanged, and all task-owned PostgreSQL／browser／build runtimes reported cleanup verified. No production migration、activation、deploy、release、staging pointer change or primary-data repair was performed。

This receipt supports local implementation and full engineering QC. It does not authorize runtime cutover or production release。
