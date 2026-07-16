# QC Report: DEV-PDM-CHANGE-CONTROL-001 Phase 4-5

Date: 2026-06-24
Scope: Local review flow and BOM impact controls.

## Result

Passed.

## Verified Scope

- Pending drawing revision review queue lists unconfirmed FFF assessments.
- Review action APIs enforce FFF-compatible reviewer decisions.
- Confirmed-impact approval performs release as one transaction.
- Failed release rolls back review event and draft status.
- Replacement release creates formal part number and replacement link.
- Unreleased BOM drafts using the replaced part receive unresolved reconfirmation flags.
- Released BOM rows keep the old part and are not auto-modified.
- BOM workbench blocks direct submit while open replacement reconfirmation flags exist.
- BOM owner reconfirm action resolves replacement flags with audit evidence.

## Evidence

- `npm.cmd run qc:pdm-change-control` passed 50/50.
- `npx.cmd tsc --noEmit --pretty false` passed.
- Focused ESLint passed for touched review, BOM, domain, and QC files.
- Local smoke:
  - `http://127.0.0.1:3000/numbering/change-reviews` returned HTTP 200.
  - `http://127.0.0.1:3000/bom/workbench` returned HTTP 200.

## Boundaries

- No production deployment was performed.
- No Supabase migration/cutover was performed.
- Supabase/Postgres schema mirror remains approval-gated.
