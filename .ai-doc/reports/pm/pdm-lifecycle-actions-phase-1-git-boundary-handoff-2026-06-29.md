# PDM Lifecycle Actions Phase 1-6 Git Boundary Handoff

Date: 2026-06-29
Updated: 2026-06-30

Related DEV: `DEV-PDM-LIFECYCLE-ACTIONS-001`

## Boundary Status

Phase 1-6 local/staging implementation and QC evidence are captured. User authorized scoped Git/index cleanup on 2026-06-30 so the lifecycle-only commit boundary can be rebuilt from a clean index.

Reason: the real Git index and worktree are already mixed with unrelated staged and unstaged changes from other lanes. A lifecycle-only commit would require either index cleanup or careful partial staging for files that contain both lifecycle and non-lifecycle changes.

This handoff defines the scoped lifecycle candidate group and the files that block a safe direct commit. The filename is kept for continuity with the original Phase 1 handoff, but the content now covers the user-approved Phase 1-6 local/staging delivery objective.

## Lifecycle Phase 1-6 Candidate Group

Functional scope captured:

- Phase 1: lifecycle foundation, policy API, master-attachment deleted-data list, restore routes, restore audit, and attachment-panel deleted-data UI.
- Phase 2: part-number drafts, import batches, and BOM workbench drafts support deleted-data surfaces plus restore behavior.
- Phase 3: daily UI vocabulary and stage consistency remain limited to `刪除` / `還原` / `申請作廢`, with daily status filters limited to active work.
- Phase 4: formal obsolete approval slices for formal part numbers, drawings, released BOM, and released submissions.
- Phase 5: unified controlled-history API/UI with immutable `已作廢` / `歷史` entries for released submissions, formal part numbers, formal drawing numbers, and released BOM history.
- Phase 6: local/staging release-readiness gate, regression evidence, production exclusion, rollback notes, and Git-boundary proof.

Source and contract files:

- `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
- `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
- `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md`
- `.ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md`
- `.ai-doc/dev_task.md`
- `.ai-doc/documentation_map.md`
- `.ai-doc/reports/pm/pdm-lifecycle-actions-phase-1-git-boundary-handoff-2026-06-29.md`
- `package.json`
- `src/lib/pdm-lifecycle-policy.ts`
- `src/lib/repositories/master-attachment-async-repository.ts`
- `src/lib/master-attachments-async.ts`
- `src/lib/master-attachment-response.ts`
- `src/lib/numbering-async.ts`
- `src/lib/repositories/numbering-async-repository.ts`
- `src/lib/repositories/numbering-repository.ts`
- `src/lib/bom-workbench-async.ts`
- `src/lib/repositories/bom-workbench-async-repository.ts`
- `src/lib/submission-lifecycle-async.ts`
- `src/lib/repositories/submission-lifecycle-async-repository.ts`
- `src/lib/repositories/submission-list-async-repository.ts`
- `src/lib/types.ts`
- `src/app/api/lifecycle/policy/route.ts`
- `src/app/api/lifecycle/obsolete-requests/route.ts`
- `src/app/api/lifecycle/controlled-history/route.ts`
- `src/app/api/parts/[partNumber]/attachments/route.ts`
- `src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts`
- `src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts`
- `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore/route.ts`
- `src/app/api/numbering/part-number-drafts/route.ts`
- `src/app/api/numbering/part-number-drafts/[draftId]/restore/route.ts`
- `src/app/api/numbering/import-batches/route.ts`
- `src/app/api/numbering/import-batches/[batchId]/delete/route.ts`
- `src/app/api/numbering/import-batches/[batchId]/restore/route.ts`
- `src/app/api/numbering/approval-requests/route.ts`
- `src/app/api/numbering/approval-batches/route.ts`
- `src/app/api/bom/workbench/route.ts`
- `src/app/api/bom/drafts/[draftId]/delete/route.ts`
- `src/app/api/bom/drafts/[draftId]/restore/route.ts`
- `src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts`
- `src/app/api/bom/reviews/pending/route.ts`
- `src/app/api/bom/reviews/[reviewId]/approve/route.ts`
- `src/app/api/bom/reviews/[reviewId]/reject/route.ts`
- `src/app/api/submissions/route.ts`
- `src/app/api/search/route.ts`
- `src/app/api/submissions/[id]/obsolete-request/route.ts`
- `src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts`
- `src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts`
- `src/components/master-attachment-panel.tsx`
- `src/components/dashboard.tsx`
- `src/app/numbering/part-drafts/page.tsx`
- `src/app/numbering/imports/page.tsx`
- `src/app/numbering/approvals/page.tsx`
- `src/app/bom/workbench/page.tsx`
- `src/app/bom/reviews/page.tsx`
- `src/app/globals.css`
- `src/app/styles/responsive.css`
- `scripts/qc-pdm-lifecycle-actions.mjs`
- `scripts/qc-pdm-lifecycle-actions-ui.mjs`
- `scripts/qc-pdm-lifecycle-actions-git-boundary.mjs`
- `scripts/qc-pdm-lifecycle-draft-ui.mjs`
- `scripts/qc-pdm-lifecycle-import-ui.mjs`
- `scripts/qc-pdm-lifecycle-bom-draft-ui.mjs`
- `scripts/qc-pdm-lifecycle-obsolete.mjs`
- `scripts/qc-pdm-lifecycle-bom-obsolete.mjs`
- `scripts/qc-pdm-lifecycle-submission-obsolete.mjs`
- `scripts/qc-pdm-lifecycle-controlled-history.mjs`
- `scripts/qc-pdm-lifecycle-controlled-history-ui.mjs`
- `scripts/qc-pdm-lifecycle-release-readiness.mjs`

Local evidence artifacts:

- `output/playwright/pdm-lifecycle-attachments-desktop-final.png`
- `output/playwright/pdm-lifecycle-attachments-laptop-final.png`
- `output/playwright/pdm-lifecycle-attachments-mobile-final.png`
- `output/playwright/pdm-lifecycle-attachments-deleted-fixture.png`
- `output/playwright/pdm-lifecycle-part-drafts-deleted-fixture.png`
- `output/playwright/pdm-lifecycle-import-batches-deleted-fixture.png`
- `output/playwright/pdm-lifecycle-bom-drafts-deleted-fixture.png`
- `output/playwright/pdm-lifecycle-controlled-history-desktop.png`
- `output/playwright/pdm-lifecycle-controlled-history-mobile.png`

## Mixed-File Caution

The following lifecycle candidate files also show non-lifecycle or previously existing changes when compared with `HEAD`; they require partial staging or a clean-index patch workflow before a lifecycle-only commit:

- `package.json`
- `src/components/master-attachment-panel.tsx`
- `src/lib/repositories/master-attachment-async-repository.ts`
- `src/lib/repositories/numbering-async-repository.ts`
- `src/lib/repositories/numbering-repository.ts`
- `src/lib/repositories/bom-workbench-async-repository.ts`
- `src/app/api/bom/workbench/route.ts`
- `src/app/api/numbering/approval-batches/route.ts`
- `src/app/api/numbering/approval-requests/route.ts`
- `src/app/api/numbering/import-batches/route.ts`
- `src/app/api/numbering/part-number-drafts/route.ts`
- `src/app/bom/reviews/page.tsx`
- `src/app/bom/workbench/page.tsx`
- `src/app/numbering/approvals/page.tsx`
- `src/app/numbering/imports/page.tsx`
- `src/app/numbering/part-drafts/page.tsx`
- `src/app/globals.css`
- `src/app/styles/responsive.css`
- `src/components/dashboard.tsx`
- `.ai-doc/dev_task.md`
- `.ai-doc/documentation_map.md`

## Current Real-Index Blockers

At handoff creation and the first 2026-06-30 amendment, staged files included lifecycle docs plus unrelated files from other lanes. The user later authorized scoped Git/index cleanup; direct commit from the original mixed index remains unsafe, but a clean lifecycle-only index may now be rebuilt.

Known unrelated staged files observed:

- `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`
- `.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md`
- `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`
- `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`
- `.ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`

## Boundary Rule

Do not commit the real index as-is.

Allowed closure paths:

1. Rebuild a clean index and stage only the lifecycle candidate group, using partial staging for mixed files.
2. Commit unrelated staged groups first if PM confirms they are ready, then stage the lifecycle group.
3. Keep Phase 1-6 local/staging evidence as the delivery boundary and leave production/deployment to a separate approval gate.
4. Unified cross-entity controlled-history beyond submission records is no longer optional; it was implemented after user authorization on 2026-06-30 and belongs to this lifecycle candidate group.

## Verification Evidence

Required commands for this boundary:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run qc:pdm-lifecycle-actions`
- `npm.cmd run qc:pdm-lifecycle-actions-ui`
- `npm.cmd run qc:pdm-lifecycle-draft-ui`
- `npm.cmd run qc:pdm-lifecycle-import-ui`
- `npm.cmd run qc:pdm-lifecycle-bom-draft-ui`
- `npm.cmd run qc:pdm-lifecycle-obsolete`
- `npm.cmd run qc:pdm-lifecycle-bom-obsolete`
- `npm.cmd run qc:pdm-lifecycle-submission-obsolete`
- `npm.cmd run qc:pdm-lifecycle-controlled-history`
- `npm.cmd run qc:pdm-lifecycle-controlled-history-ui`
- `npm.cmd run qc:pdm-lifecycle-release-readiness`
- `npm.cmd run qc:pdm-lifecycle-actions-git-boundary`

Latest captured Phase 1-6 evidence:

- `npx.cmd tsc --noEmit --pretty false` passed.
- `npm.cmd run qc:pdm-lifecycle-actions` passed 270/270.
- `npm.cmd run qc:pdm-lifecycle-actions-ui` passed 14/14.
- `npm.cmd run qc:pdm-lifecycle-draft-ui` passed 16/16.
- `npm.cmd run qc:pdm-lifecycle-import-ui` passed 15/15.
- `npm.cmd run qc:pdm-lifecycle-bom-draft-ui` passed 15/15.
- `npm.cmd run qc:pdm-lifecycle-obsolete` passed 111/111.
- `npm.cmd run qc:pdm-lifecycle-bom-obsolete` passed 15/15 with `PDM_BASE_URL=http://127.0.0.1:3000`.
- `npm.cmd run qc:pdm-lifecycle-submission-obsolete` passed 20/20 with `PDM_BASE_URL=http://127.0.0.1:3000`.
- `npm.cmd run qc:pdm-lifecycle-controlled-history` passed 56/56 after unified cross-entity history aggregation.
- `npm.cmd run qc:pdm-lifecycle-controlled-history-ui` passed 30/30 after desktop/mobile cross-entity fixture update.
- `npm.cmd run qc:pdm-lifecycle-release-readiness` passed 47/47.
- `npm.cmd run qc:pdm-lifecycle-actions-git-boundary` passed and reported the real index unsafe for direct lifecycle commit because unrelated staged files remain present.
- `npm.cmd run qc:dev-task-evidence-sync` passed 13/13.
- `git diff --check` on touched lifecycle files reported no whitespace errors, only CRLF warnings.
