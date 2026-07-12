# QC Report - PDM Approval Platform

Date: 2026-07-08
DEV: `DEV-PDM-APPROVAL-PLATFORM-001`
Scope: Phase 1A-1B local platform foundation, transitional adapters, friendly-route hardening and guarded migration dry-run/apply tooling.

## Result

Status: Passed for focused local platform gates.

Executed:

- `npx.cmd tsc --noEmit --pretty false` - passed.
- `npm.cmd run qc:pdm-approval-platform` - passed 69/69.
- `npm.cmd run qc:pdm-approval-platform-migration-dry-run` - passed; output report at `output/qc-pdm-approval-platform-migration-dry-run/report.md`; includes in-memory guarded apply/parity self-test.
- `npm.cmd run lint -- --quiet` - passed.
- `npm.cmd run build` - passed after safely stopping and restarting the project-owned local dev server.
- `npm.cmd run qc:pdm-lifecycle-actions` - passed 270/270.
- `npm.cmd run qc:pdm-lifecycle-obsolete` - passed 111/111.
- Browser screenshot check after demo manager login:
  - `output/playwright/pdm-approval-platform/approvals-desktop-auth.png`
  - `output/playwright/pdm-approval-platform/approvals-mobile-auth.png`
  - `output/playwright/pdm-approval-platform/numbering-approvals-desktop-auth.png`
  - `output/playwright/pdm-approval-platform/numbering-approvals-mobile-auth.png`

## Covered

- Additive `approval_platform_*` schema exists in SQLite and Postgres planning files.
- Platform actions include `platform.test.fake`.
- Unknown action fails closed by foreign key.
- Native fake request lifecycle can reach `applied`.
- Impact snapshots are immutable in SQLite.
- Platform decisions and events are append-only in SQLite.
- Platform API route files exist.
- Legacy read/decision adapters exist for numbering, submission lifecycle, BOM review, part cost change and drawing package supplement records.
- Friendly legacy decision routes delegate to platform adapters and no longer directly import domain decision facades.
- Migration dry-run inventories legacy approval-like records without mutation.
- Guarded migration apply path is registered and requires explicit environment approval.

## Remaining

- Physical migration execution for historical approval-like records on a live/runtime target remains not authorized.
- Production/Supabase live migration, deploy, smoke and rollback gates.

## Non-Scope Observations

- `npm.cmd run qc:access-control-async-repository` still fails in its semantic fixture setup with `no such column: resolved_by_submission_id`; this is outside the approval-platform change and was not mixed into this delivery.
- `npm.cmd run qc:pdm-status-ui-vocabulary` currently fails on an unrelated `src/app/numbering/search/page.tsx` status-help assertion.
- `npm.cmd run qc:pdm-numbering-approval-review-ui` is blocked by the protected runtime DB guard and requires an isolated `PDM_DATA_DIR`.
