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

## Planned Storage Cost-Control Package

`DEV-STORAGE-COST-001` is the Storage follow-up package. It is tracked as a Backlog delivery point and must not be treated as part of `DEV-SUPABASE-DB-001` completion.

Read in this order:

1. `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`
2. `.ai-doc/dev_task.md`
3. `src/lib/file-store.ts`
4. `src/lib/file-response.ts`
5. `db/postgres/001_initial_schema.sql`

## Implemented SW License / PDM Company Package

`DEV-SW-LICENSE-PDM-001` is the SW license / PDM company separation package. RD/QC implementation is complete, but the Git boundary is deferred because the current index already contains unrelated Supabase staged files and the worktree contains broad unrelated changes. It must not be treated as part of `DEV-SUPABASE-DB-001` completion.

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
