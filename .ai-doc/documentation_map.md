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
3. `.ai-doc/dev_task.md`
4. `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
5. `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`
6. `.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md`
7. `.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md`
8. `.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md`

## PDM Change-Control Package

`DEV-PDM-CHANGE-CONTROL-001` covers drawing revision, replacement part number draft, and BOM impact control. Phase 1 local schema/domain service and Phase 2 part-number draft module are implemented; Phase 3-5 drawing revision/review/BOM release flows and production/Supabase cutover remain unimplemented unless separately approved.

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
13. `scripts/qc-pdm-change-control.mjs`
14. `.ai-doc/reports/qc/qc-pdm-change-control-phase-1-report-2026-06-24.md`
15. `.ai-doc/reports/qc/qc-pdm-change-control-phase-2-report-2026-06-24.md`
16. `.ai-doc/dev_task.md`

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
