# AI_PDM Documentation Map

This project uses `.ai-doc` as the single project documentation center.

## Authoritative Entry Points

- PM task control: `.ai-doc/dev_task.md`
- Archived task history: `.ai-doc/dev_task_archive_2026-05.md`
- Requirements and design specs: `.ai-doc/specs/`
- Architecture decisions: `.ai-doc/decisions/`

## PM-dev Evidence Areas

- PM and release evidence: `.ai-doc/reports/pm/`
- RD reports: `.ai-doc/reports/rd/`
- QA validation plans: `.ai-doc/qa/`
- QA process reports: `.ai-doc/reports/qa/`
- QC fact-check and validation reports: `.ai-doc/qc/`
- Industrialization records: `.ai-doc/reports/industrialization/`
- Runbooks and operating checklists: `.ai-doc/runbooks/`
- Reference policy and architecture documents: `.ai-doc/reference/`
- Source-controlled external asset manifests: `.ai-doc/assets/`

## Current Development Package

2026-06-29 PM consistency note: `.ai-doc/dev_task.md` is the authoritative current-state board. Older PM/QA/QC documents remain evidence unless this map or the document itself marks them as superseded/amended.

Current Supabase state: `AI_PDM_STAGING` GATE-B is passed; production/cutover and full data parity remain deferred until PM explicitly approves those scopes.

`DEV-SUPABASE-DB-001` should be read in this order:

1. `.ai-doc/reports/pm/supabase-db-async-provider-batch-control-2026-06-15.md`
2. `.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md`
3. `.ai-doc/reports/pm/pm-dev-continuation-audit-2026-06-25.md`
4. `.ai-doc/dev_task.md`
5. `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
6. `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`
7. `.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md`
8. `.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md`
9. `.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md`
10. `.ai-doc/reports/qc/qc-supabase-pdm-change-control-schema-mirror-report-2026-06-25.md`
11. `.ai-doc/runbooks/runbook-supabase-local-env-live-smoke-2026-06-26.md`

## PDM Change-Control Package

`DEV-PDM-CHANGE-CONTROL-001` covers drawing revision, replacement part number draft, and BOM impact control. Phase 1-5 local implementation is captured: local schema/domain service, part-number draft module, drawing revision FFF flow, review queue/action APIs, confirmed-impact release transaction, and BOM replacement reconfirmation gates. Production/Supabase cutover remains unimplemented unless separately approved.

2026-06-29 consistency pass: the source spec and QA plan are amended to reflect captured local implementation/QC evidence. Treat any older "Draft" or "before RD implementation" wording in supporting documents as historical context, not current task state.

Read in this order:

1. `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`
2. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
3. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`
4. `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`
5. `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
6. `db/schema.sql`
7. `src/lib/pdm-change-control-domain.ts`
8. `src/lib/pdm-change-control.ts`
9. `src/lib/pdm-change-control-api.ts`
10. `src/app/api/numbering/part-number-drafts/route.ts`
11. `src/app/api/numbering/part-number-drafts/[draftId]/route.ts`
12. `src/app/numbering/part-drafts/page.tsx`
13. `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`
14. `src/app/numbering/revisions/page.tsx`
15. `src/app/api/numbering/reviews/pending/route.ts`
16. `src/app/api/numbering/reviews/_review-action-handler.ts`
17. `src/app/api/numbering/reviews/[reviewId]/confirm-bom-no-revision/route.ts`
18. `src/app/api/numbering/reviews/[reviewId]/confirm-original-part-reuse/route.ts`
19. `src/app/api/numbering/reviews/[reviewId]/return-for-replacement-part/route.ts`
20. `src/app/api/numbering/reviews/[reviewId]/approve-confirmed-impact-release/route.ts`
21. `src/app/numbering/change-reviews/page.tsx`
22. `src/lib/repositories/bom-workbench-async-repository.ts`
23. `src/app/api/bom/drafts/[draftId]/reconfirm-replacements/route.ts`
24. `src/app/bom/workbench/page.tsx`
25. `scripts/qc-pdm-change-control.mjs`
26. `.ai-doc/reports/qc/qc-pdm-change-control-phase-1-report-2026-06-24.md`
27. `.ai-doc/reports/qc/qc-pdm-change-control-phase-2-report-2026-06-24.md`
28. `.ai-doc/reports/qc/qc-pdm-change-control-phase-3-report-2026-06-24.md`
29. `.ai-doc/reports/qc/qc-pdm-change-control-phase-4-5-report-2026-06-24.md`
30. `.ai-doc/dev_task.md`

## Planned PDM Lifecycle Actions Package

`DEV-PDM-LIFECYCLE-ACTIONS-001` covers the cross-system delete, restore, obsolete, and lifecycle UI information architecture. The prepared design separates the daily work list from `已刪除資料` and `受控歷史`; uncontrolled deleted drafts/temp/attachments are restore-oriented, while obsolete/version/release/approval records remain controlled traceability. User decisions `1A / 2A / 3A` authorize Phase 1-6 as one local/staging delivery objective with internal phase/QC gates, production and Supabase production cutover excluded, and formal obsolete using the existing review/approval queue pattern with a lifecycle obsolete request type. The controlling roadmap is now: Phase 1 lifecycle foundation plus attachments, Phase 2 draft/temp/not-submitted restore, Phase 3 daily UI stage/IA consistency, Phase 4 formal obsolete approval, Phase 5 controlled-history UI, and Phase 6 local/staging release readiness. RD Phase 1 backend/API plus attachment-panel deleted-data UI slice has focused QC evidence for lifecycle policy output, master attachment deleted-data list API, generic policy endpoint, restore routes, restore conflict checks, restore audit, empty-state/viewport UI, mocked deleted-row plus restore-operation UI fixture, and Git-boundary handoff evidence. Phase 2 part-number draft, import-batch temp/staging, and BOM workbench draft slices have deleted-data API surfaces, restore routes, lifecycle policy output, simplified `刪除` / `還原` UI, and QC evidence. Phase 4 formal obsolete slices are implemented for formal 料號, 圖號, released BOM, and released submission: numbering obsolete request API creates approval requests plus batches; numbering approval apply moves formal records to `Obsolete`; MA drawing obsolete invalidates impacted parts; BOM review requests carry `lifecycle_action`; `/api/bom/drafts/[draftId]/obsolete-request` creates pending obsolete review for released BOM; manager approval marks the released BOM draft and release snapshot obsolete; `submission_lifecycle_requests` stores released-submission obsolete request/decision traceability; `/api/submissions/[id]/obsolete-request` and `/api/submission-lifecycle-requests/[requestId]/approve|reject` implement released-submission 作廢審核; Dashboard uses concise formal-obsolete vocabulary `申請作廢` / `核准作廢` / `退回申請` / `已作廢`. Phase 5 unified controlled-history UI/API slice is implemented: daily submission list/search hides `Obsolete` by default, explicit `status=Obsolete` remains available, `/api/lifecycle/controlled-history` aggregates immutable responsibility-chain history entries for released submissions, formal 料號, formal 圖號, and released BOM, and Dashboard exposes a separate `受控歷史` entry with simple PDM type labels, `查看追溯` only for submission detail, and responsibility-chain-only display for non-submission history plus desktop/mobile UI evidence. Phase 6 local/staging release-readiness gate is also implemented and passed for the current lifecycle package: regression commands, screenshots, production/Supabase production exclusion, and Git-boundary risk are recorded. User has authorized scoped Git/index cleanup for the lifecycle-only commit boundary; production remains unapproved and separate.

Read in this order:

1. `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
2. `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
3. `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md`
4. `.ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md`
5. `.ai-doc/dev_task.md`
6. `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
7. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
8. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`
9. `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`
10. `db/schema.sql`
11. `db/postgres/001_initial_schema.sql`
12. `src/lib/pdm-lifecycle-policy.ts`
13. `src/lib/pdm-change-control-domain.ts`
14. `src/lib/pdm-change-control.ts`
15. `src/lib/pdm-change-control-api.ts`
16. `src/app/api/numbering/part-number-drafts/route.ts`
17. `src/app/api/numbering/part-number-drafts/[draftId]/restore/route.ts`
18. `src/app/numbering/part-drafts/page.tsx`
19. `src/lib/numbering-async.ts`
20. `src/lib/repositories/numbering-async-repository.ts`
21. `src/lib/repositories/numbering-repository.ts`
22. `src/app/api/numbering/import-batches/route.ts`
23. `src/app/api/numbering/import-batches/[batchId]/delete/route.ts`
24. `src/app/api/numbering/import-batches/[batchId]/restore/route.ts`
25. `src/app/numbering/imports/page.tsx`
26. `src/lib/bom-workbench-async.ts`
27. `src/lib/repositories/bom-workbench-async-repository.ts`
28. `src/app/api/bom/workbench/route.ts`
29. `src/app/api/bom/drafts/[draftId]/delete/route.ts`
30. `src/app/api/bom/drafts/[draftId]/restore/route.ts`
31. `src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts`
32. `src/app/api/bom/reviews/[reviewId]/approve/route.ts`
33. `src/app/api/bom/reviews/[reviewId]/reject/route.ts`
34. `src/app/api/bom/reviews/pending/route.ts`
35. `src/app/bom/workbench/page.tsx`
36. `src/app/bom/reviews/page.tsx`
37. `src/lib/repositories/master-attachment-async-repository.ts`
38. `src/lib/master-attachments-async.ts`
39. `src/lib/master-attachment-response.ts`
40. `src/components/master-attachment-panel.tsx`
41. `src/app/globals.css`
42. `src/app/styles/responsive.css`
43. `src/app/api/lifecycle/policy/route.ts`
44. `src/app/api/lifecycle/obsolete-requests/route.ts`
45. `src/app/api/numbering/approval-requests/route.ts`
46. `src/app/api/numbering/approval-batches/route.ts`
47. `src/app/numbering/approvals/page.tsx`
48. `src/app/api/parts/[partNumber]/attachments/route.ts`
49. `src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts`
50. `src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts`
51. `src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts`
52. `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts`
53. `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore/route.ts`
54. `scripts/qc-pdm-lifecycle-actions.mjs`
55. `scripts/qc-pdm-lifecycle-obsolete.mjs`
56. `scripts/qc-pdm-lifecycle-bom-obsolete.mjs`
57. `scripts/qc-pdm-lifecycle-submission-obsolete.mjs`
58. `src/lib/submission-lifecycle-async.ts`
59. `src/lib/repositories/submission-lifecycle-async-repository.ts`
60. `src/lib/repositories/submission-list-async-repository.ts`
61. `src/app/api/submissions/route.ts`
62. `src/app/api/search/route.ts`
63. `src/app/api/submissions/[id]/obsolete-request/route.ts`
64. `src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts`
65. `src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts`
66. `src/app/api/lifecycle/controlled-history/route.ts`
67. `src/components/dashboard.tsx`
68. `src/app/globals.css`
69. `src/app/styles/responsive.css`
70. `scripts/qc-pdm-lifecycle-controlled-history.mjs`
71. `scripts/qc-pdm-lifecycle-controlled-history-ui.mjs`
72. `scripts/qc-pdm-lifecycle-release-readiness.mjs`
73. `scripts/qc-pdm-lifecycle-actions-ui.mjs`
74. `scripts/qc-pdm-lifecycle-draft-ui.mjs`
75. `scripts/qc-pdm-lifecycle-import-ui.mjs`
76. `scripts/qc-pdm-lifecycle-bom-draft-ui.mjs`
77. `scripts/qc-pdm-numbering-core-test.mjs`
78. `scripts/qc-pdm-numbering-approval-review-ui.mjs`
79. `scripts/qc-bom-workbench-review-ui.mjs`
80. `scripts/qc-pdm-lifecycle-actions-git-boundary.mjs`
81. `scripts/qc-pdm-change-control.mjs`
82. `scripts/qc-pdm-numbering-import-center-ui.mjs`
83. `scripts/qc-bom-workbench-foundation.mjs`
84. `scripts/qc-bom-workbench-ui.mjs`
85. `.ai-doc/reports/pm/pdm-lifecycle-actions-phase-1-git-boundary-handoff-2026-06-29.md`
86. `output/playwright/pdm-lifecycle-attachments-desktop-final.png`
87. `output/playwright/pdm-lifecycle-attachments-laptop-final.png`
88. `output/playwright/pdm-lifecycle-attachments-mobile-final.png`
89. `output/playwright/pdm-lifecycle-attachments-deleted-fixture.png`
90. `output/playwright/pdm-lifecycle-part-drafts-deleted-fixture.png`
91. `output/playwright/pdm-lifecycle-import-batches-deleted-fixture.png`
92. `output/playwright/pdm-lifecycle-bom-drafts-deleted-fixture.png`
93. `output/playwright/pdm-lifecycle-controlled-history-desktop.png`
94. `output/playwright/pdm-lifecycle-controlled-history-mobile.png`

## Planned Storage Cost-Control Package

`DEV-STORAGE-COST-001` is the Storage follow-up package. Current PM state is `Evidence captured / product rollout Backlog`: the long PM plan contains historical phase evidence and gates, but the product rollout remains parked until real storage inventory, target, cost, and production timing are approved. It must not be treated as part of `DEV-SUPABASE-DB-001` completion.

Read in this order:

1. `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`
2. `.ai-doc/dev_task.md`
3. `src/lib/file-store.ts`
4. `src/lib/file-response.ts`
5. `db/postgres/001_initial_schema.sql`

## Implemented SW License / PDM Company Package

`DEV-SW-LICENSE-PDM-001` is the SW license / PDM company separation package. RD/QC implementation is complete and the scoped local Git boundary was closed after user-authorized index handling: Supabase staging evidence was committed separately as `be333eb`, then SW/PDM company boundary was committed as `6f4dbab`. Older Git-boundary-deferred handoff text is superseded by this state. It must not be treated as part of `DEV-SUPABASE-DB-001` completion.

Read in this order:

1. `.ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md`
2. `.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md`
3. `.ai-doc/decisions/ADR-SW-LICENSE-PDM-001-operational-shared.md`
4. `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`
5. `.ai-doc/dev_task.md`
6. `src/lib/company-context.ts`
7. `src/lib/numbering-company-context.ts`
8. `src/lib/metadata-adapter-profile.ts`
9. `src/app/api/submissions/route.ts`
10. `sw-addin/Views/SubmissionWindow.xaml.cs`

## Legacy Path Policy

The former `docs/` project-documentation tree was migrated into `.ai-doc` on 2026-06-09.
Do not create new PM-dev project files under `docs/`.

The old compatibility map is preserved for audit history at `.ai-doc/archived/report-path-index.md`.
