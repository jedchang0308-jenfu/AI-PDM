# QA Validation Plan - PDM Numbering Backend Rules

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: same-drawing variants, DVT/Release MA gate evaluation, main drawing obsolescence impact analysis, and first API route coverage.

## Validation Scope

- Verify one MA drawing can be the primary manufacturing drawing for multiple part numbers when variant metadata is recorded.
- Verify one part number still cannot have more than one primary MA drawing.
- Verify DVT/Release gate evaluation blocks manufactured/outsource/custom parts without a valid primary MA drawing.
- Verify DVT missing-MA override is explicit and Release missing-MA remains blocked.
- Verify MA drawing obsolescence analysis returns impacted part numbers and required affected documents.
- Verify applying MA drawing invalidation marks affected part numbers as `MainDrawingInvalid`.
- Verify API routes exist for variants, rule simulation, and impact analysis.

## User Critical Flows

- RD links a second part number to an existing MA drawing and records material/process variant metadata.
- RD simulates whether a part can enter DVT or Release before sending review.
- RD or manager checks affected documents before obsoleting a main MA drawing.
- Manager/Admin applies invalidation only after impact scope is visible.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Same drawing links without variant reason | UI/API accepts ambiguous link | RD cannot explain why one drawing maps to multiple parts | QC repository/static test | High | Repository requires variant metadata when MA drawing already has a primary linked part |
| Part gets two primary MA drawings | Missing unique rule | Manufacturing drawing ambiguity | DB constraint test | High | Partial unique index on primary link per part |
| DVT/Release passes without MA drawing | Rule evaluator misses MA requirement | Incomplete controlled data enters review/release | QC source and route test | High | `PRIMARY_MA_REQUIRED` issue and explicit override semantics |
| Release uses DVT override | Override scope too broad | Released part lacks required MA document | QC source review | High | Override only allows DVT, Release remains blocked |
| MA obsolete does not flag affected parts | Impact query misses links | RD misses required rework documents | QC source and static route test | High | Impact analyzer lists linked primary parts and sets `MainDrawingInvalid` when applied |
| Engineer applies invalidation directly | Route lacks role guard | Control bypass | Route source test | Medium | API blocks Engineer for `applyInvalidation` |

## Test Cases

- `NUM-CONSTRAINT same MA drawing may link multiple part numbers`.
- `NUM-SCHEMA same drawing variant metadata saved`.
- `NUM-CONSTRAINT one primary manufacturing link per part`.
- `NUM-REPO requires same-drawing variant details`.
- `NUM-REPO evaluates DVT/Release MA gate`.
- `NUM-REPO blocks missing primary MA at gate`.
- `NUM-REPO analyzes MA drawing obsolescence impact`.
- `NUM-API variant route calls linker`.
- `NUM-API rule simulator route calls gate evaluator`.
- `NUM-API impact analysis route protects invalidation`.
- TypeScript compile, lint, and production build.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 42/42 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0.
- Existing Turbopack broad-tracing warnings may remain only if build succeeds and warnings are unrelated to numbering changes.

## Evidence Collection

- Command output from targeted QC script.
- TypeScript/lint/build exit status.
- Route list in production build must include:
  - `/api/numbering/variants`
  - `/api/numbering/rule-simulator`
  - `/api/numbering/impact-analysis`
