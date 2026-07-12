# QC Report - PDM Submission Gate Phase 1

Date: 2026-07-10
DEV: `DEV-PDM-SUBMISSION-GATE-001` / `DEV-005`
Scope: local Phase 1 only

## Result

Passed.

Phase 1 now has:

- visible `研發送審` / `技術移轉送審` selector on the drawing submission workbench
- versioned local submission-gate resolver with `required`, `warning`, `optional`, `not_applicable`
- protected active-rule and readiness resolver APIs
- direct single-drawing `technical_transfer` formal submit fail-closed guard
- `/transfer-packages/new` context placeholder that carries item-origin transfer context without mutating DB

## Verification

| Check | Result |
|---|---|
| `npm.cmd run qc:pdm-submission-gate-phase1` | PASS 15/15 |
| `npx.cmd tsc --noEmit --pretty false` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd run qc:pdm-drawing-submission-review-only` | PASS 14/14 |
| `npm.cmd run build` | PASS |
| `npm.cmd run dev:local -- -NoBrowser` | PASS, server healthy |
| `npm.cmd run dev:local:check` | PASS, `http://127.0.0.1:3000/` healthy |
| Playwright UI smoke | PASS 5/5 |

Build warnings observed:

- Next.js middleware convention deprecation warning.
- Existing Turbopack NFT trace warning through `src/app/api/chat/route.ts`.

These warnings are outside DEV-005 Phase 1 and did not block build output.

## Browser Evidence

- `output/playwright/pdm-submission-gate-mode-selector.png`
- `output/playwright/pdm-submission-gate-transfer-package-placeholder.png`

UI smoke covered:

- transfer package placeholder renders
- item-origin source context is visible
- submission mode selector is visible
- selecting technical transfer shows transfer package CTA
- direct `送出審核` button is hidden in technical-transfer mode

## Guard Evidence

Focused QC verifies:

- active rule set is versioned as `submission-gate-v1.2026-07-10.phase1`
- mode values are explicit: `research`, `technical_transfer`
- all four readiness field states are present
- technical transfer requires package context
- direct technical-transfer submit checks run before `createDrawingSourceSubmission`
- response includes stable `technical_transfer_requires_package`, recovery href and blocker payload
- blocker payload includes field, owner role, blocker code and remediation route
- research missing standard cost is warning with `research_exception_review`
- technical transfer missing standard cost is hard blocker
- workbench selector and package CTA are present
- transfer package placeholder is non-mutating

## Exclusions

Not included in Phase 1:

- live schema migration
- Supabase production/live cutover
- production deploy
- direct data repair or deletion
- full transfer package builder
- one-item package declaration and reviewer scope confirmation
- research exception decision workflow
- Manufacturing / Procurement / QA/QC sign-off matrix
- stale readiness snapshot and sign-off invalidation
- rule matrix admin UI
- `ApprovedForTransfer` and release-work-item creation
