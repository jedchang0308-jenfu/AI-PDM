# QA Validation Plan - P2 Duplicate Geometry Search

Date: 2026-05-27

## Scope

Validate a low-cost duplicate geometry search that uses file fingerprints and CAD metadata signals before SolidWorks Document Manager or true geometric shape comparison is available.

## User Scenarios

1. Engineer opens a submission and sees likely duplicate geometry candidates in the visible scope.
2. Manager can see cross-owner duplicate candidates.
3. Engineer cannot see another engineer's hidden duplicate candidates.
4. Exact native file hash matches rank higher than filename/material-only matches.
5. The feature clearly reports fingerprint signals instead of claiming true CAD geometry comparison.

## RD FMEA

| Risk | Failure Mode | Validation |
| --- | --- | --- |
| Permission leak | Engineer sees other engineer's duplicate candidates | API regression checks Engineer scoping |
| False confidence | UI/API implies exact geometric equivalence without CAD geometry engine | API response uses `fingerprint_score`, `duplicate_level`, and signal text |
| Poor ranking | Exact same native file hash is buried below metadata-only matches | API test checks exact hash candidate ranks high |
| No useful evidence | Candidate has score but no reasons | API test checks fingerprint signals and matched files |
| Scope drift | Reuses old metadata-only endpoint | Build route and tests cover `/duplicate-geometry` separately |

## QC Cases

- `GEODUP-001` unauthenticated duplicate geometry search returns 401.
- `GEODUP-002` Engineer can list own duplicate geometry candidates.
- `GEODUP-003` exact native hash candidate is included.
- `GEODUP-004` exact native hash candidate has high confidence.
- `GEODUP-005` candidate exposes fingerprint signals and matched files.
- `GEODUP-006` Engineer scoped search excludes other Engineer candidate.
- `GEODUP-007` Manager can list duplicate geometry candidates.
- `GEODUP-008` Manager sees cross-owner duplicate candidate.
- `GEODUP-009` Engineer cannot search another Engineer submission.
- `GEODUP-010` metadata-only lookalike ranks below exact hash duplicate.

## Pass Criteria

- All listed QC cases pass.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes and includes `/api/submissions/[id]/duplicate-geometry`.
- Existing `qc:api`, `qc:ui`, and `qc:file-hashes` remain green.
