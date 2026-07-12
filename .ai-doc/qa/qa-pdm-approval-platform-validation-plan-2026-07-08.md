# QA Plan - PDM Approval Platform Validation

Status: Phase 1A-1B focused local QC executed; Phase 1C-A reviewer entrypoint consolidation implemented and locally verified; Phase 1C-B legacy redirect implemented and locally verified; Phase 1C-C drawing object pending-review projection implemented and locally verified; release/live migration not authorized
Date: 2026-07-08
Owner: QA / Dev PM
Related Spec: `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`
Related DEV: `DEV-PDM-APPROVAL-PLATFORM-001`

## Current Local Evidence - 2026-07-08

Executed:

- `npx.cmd tsc --noEmit --pretty false` passed.
- `npm.cmd run qc:pdm-approval-platform` passed 69/69.
- `npm.cmd run qc:pdm-approval-platform-migration-dry-run` passed and produced `output/qc-pdm-approval-platform-migration-dry-run/report.md`; QC also runs an in-memory guarded apply/parity self-test.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed after safely stopping and restarting the project-owned local dev server.
- `npm.cmd run qc:pdm-lifecycle-actions` passed 270/270.
- `npm.cmd run qc:pdm-lifecycle-obsolete` passed 111/111.
- Browser screenshots captured after demo manager login:
  - `output/playwright/pdm-approval-platform/approvals-desktop-auth.png`
  - `output/playwright/pdm-approval-platform/approvals-mobile-auth.png`
  - `output/playwright/pdm-approval-platform/numbering-approvals-desktop-auth.png`
  - `output/playwright/pdm-approval-platform/numbering-approvals-mobile-auth.png`
- Phase 1C-A focused evidence:
  - `npx tsc --noEmit` passed.
  - `npm run qc:pdm-approval-platform` passed 88/88.
  - `npm run lint` passed with 0 errors and 3 unrelated warnings in `src/components/master-attachment-panel.tsx`.
  - `npm run dev:local:check` reported AI_PDM healthy at `http://127.0.0.1:3000/`.
  - Playwright desktop 1440x960 and mobile 390x844 reviewer workbench checks passed with no horizontal overflow:
    - `output/playwright/approval-workbench-desktop.png`
    - `output/playwright/approval-workbench-mobile.png`
  - Playwright role-boundary smoke passed: manager can open the workbench; engineer does not see the reviewer pending badge and receives the forbidden state.
  - `npm run build` was not rerun for Phase 1C-A because the local-dev guard refused to clean `.next` while the healthy project-owned dev server was listening on port 3000; no bypass was used.
- Phase 1C-B focused evidence:
  - `npx.cmd tsc --noEmit --pretty false` passed.
  - `npm.cmd run qc:pdm-approval-platform` passed 106/106.
  - Source-scoped lint for touched approval files passed.
  - `npm.cmd run dev:local:check` reported AI_PDM healthy at `http://127.0.0.1:3000/`.
  - Legacy route smoke confirmed `/numbering/approvals`, `/bom/reviews` and `/numbering/change-reviews` return 307 redirects into equivalent `/approvals` filter query states.
  - `npm.cmd run build` was blocked by the intentional local-dev guard because the healthy project-owned dev server was listening on port 3000; no bypass was used.
- Phase 1C-C focused evidence:
  - `npx.cmd tsc --noEmit --pretty false` passed.
  - `npm.cmd run qc:pdm-approval-platform` passed 125/125.
  - `npm.cmd run qc:pdm-entity-detail-drawer` passed 14/14.
  - Source-scoped lint for touched drawing, search, attachment, API, repository and QC files passed.
  - `npm.cmd run dev:local:check` reported AI_PDM healthy at `http://127.0.0.1:3000/`.
  - Playwright manager-view smoke confirmed A0007-M01 object projection with no desktop/mobile horizontal overflow:
    - `output/playwright/pdm-approval-projection/drawings-pending-approval-desktop.png`
    - `output/playwright/pdm-approval-projection/drawings-pending-approval-mobile.png`
  - APP redline deletion smoke confirmed the drawing detail focus panel, preview-card file extension header labels and collapsed upload `建議版次` text are removed:
    - `output/playwright/pdm-approval-projection/drawings-redline-delete-desktop.png`
  - `npm.cmd run build` was blocked by the intentional local-dev guard because the healthy project-owned dev server was listening on port 3000; no bypass was used.

Covered:

- Platform schema/table/index presence in SQLite and Postgres planning files.
- Action registry seed for `platform.test.fake`.
- Unknown action fail-closed by FK.
- Native platform request lifecycle can reach applied state.
- Impact snapshot immutability and append-only decision/event triggers.
- Unified API route files exist.
- Legacy adapters exist for numbering, submission, BOM, part cost and drawing package supplement records.
- Friendly legacy decision routes delegate through platform adapters.
- Migration dry-run is read-only and inventories legacy approval-like tables.
- Guarded apply tooling exists but requires explicit apply flag, confirmation flag and environment approval.
- Phase 1C-A sidebar exposes one primary `審核工作台` approval reviewer entrypoint and removes BOM/release/drawing-revision-impact reviewer queues from primary navigation.
- Phase 1C-A workbench filters support status, domain and action URL query deep links.
- Phase 1C-A pending badge is sourced from the reviewer-role-gated, company-scoped inbox API.
- Phase 1C-B legacy reviewer routes redirect into workbench filters/details instead of rendering independent approval inboxes.
- Drawing revision FFF impact reviews are exposed through the unified inbox adapter and platform decision facade.
- Phase 1C-C pending drawing revision impact reviews are projected onto affected drawing objects and attachment revisions as compact, read-only cues.

Not yet covered:

- Physical migration execution on any live/runtime target.
- Release/deploy/smoke/rollback gates.

## Objective

Validate that system-wide approval platformization creates one consistent approval control layer while keeping domain side effects in explicit handlers.

The gate must prove:

- One unified inbox can list approval work across domains.
- One primary reviewer sidebar entry can lead reviewers to all pending actionable approvals.
- Pending-review badge counts only reviewer-actionable work within the user's company/workspace/permission scope.
- Formal lifecycle actions cannot bypass the platform once migrated.
- Domain handlers own validation, impact preview and apply-approved effects.
- Unknown actions, unauthorized reviewers, stale snapshots and duplicate decisions fail safely.
- Existing numbering approval behavior remains compatible during migration.
- The no-migration architecture spike produces a data-strategy ADR before schema/migration work.
- Submission and BOM formal lifecycle coverage is treated as a pre-launch blocker.
- Historical approval-like records are physically migrated before launch readiness, not only exposed through read adapters.

## Scope

Included after implementation is authorized:

- Approval platform core.
- Approval action registry.
- Unified inbox.
- Decision API.
- Handler dispatch.
- Numbering compatibility.
- Part/drawing/root obsolete integration.
- Submission and BOM integration when Phase 3 is authorized.
- Cost and drawing package supplement adapters when Phase 4 is authorized.
- Full physical migration validation for known historical approval-like records when Phase 5 is authorized.
- Permission, delegation, self-approval and company/workspace checks.
- Controlled history and audit.

Excluded:

- Production release.
- Supabase live migration.
- Direct data repair/deletion.
- Full historical rewrite unless separately authorized.
- ERP, supplier or customer approval portals.
- Notification delivery engine unless included in a later phase.

## Required Fixtures

QA should prepare deterministic local fixtures:

- Numbering root with `M01`, `R01` candidate and linked `P01`.
- Root with multiple drawings and parts for aggregate root obsolete.
- Part-only obsolete target with linked drawing/BOM references where available.
- Drawing-only obsolete target.
- Submission pending research exception.
- Technical-transfer package requiring approval.
- BOM draft requiring release approval.
- Part cost change request.
- Drawing revision package supplement request.
- Closed/historical approval-like records from numbering, submission lifecycle, BOM review, part cost change and drawing package supplement flows.
- Unauthorized user.
- Delegated reviewer.
- External specialist user with no default approval authority.
- Same request receiving duplicate decision attempts.
- Request with stale impact snapshot.
- Unknown action code.

## Gate Commands

Minimum common gates:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-approval-platform
npm.cmd run qc:pdm-approval-platform-migration-dry-run
```

Phase-specific gates:

```powershell
npm.cmd run qc:pdm-numbering-contextual-entrypoints
npm.cmd run qc:pdm-lifecycle-obsolete
npm.cmd run qc:pdm-lifecycle-controlled-history
```

When Phase 3 is implemented, add focused submission/BOM platform QC scripts. When Phase 4 is implemented, add cost/supplement adapter QC scripts.

If production release is requested, this QA plan is insufficient by itself. Deployment-release gate must be used.

## Validation Matrix

| ID | Area | Scenario | Expected result |
|---|---|---|---|
| AP-001 | Registry | Submit known action with registered handler | Request is accepted and linked to handler metadata |
| AP-002 | Registry | Submit unknown action | Request fails closed with no stored partial approval |
| AP-003 | Handler | Registered handler is missing at runtime | Submit/decision/apply fails closed with audit-safe error |
| AP-004 | Inbox | Numbering approval exists | Unified inbox shows it with correct domain, target, status and action label |
| AP-005 | Inbox | Submission/BOM/cost/supplement adapter records exist | Unified inbox shows authorized records once phase is enabled |
| AP-006 | Detail | Approval detail is opened | Impact, targets, requester, status, decision history and eligible actions are visible |
| AP-007 | Permission | Unauthorized user opens decision API | Decision is rejected server-side |
| AP-008 | Permission | External specialist attempts approval | Decision is rejected unless explicit policy grants approval authority |
| AP-009 | Delegation | Active delegated reviewer approves | Decision is accepted and delegation evidence is recorded |
| AP-010 | Self-approval | Requester attempts approval | Decision is rejected unless explicit policy allows it |
| AP-011 | Company scope | Cross-company/workspace request is read or decided | Access is rejected server-side |
| AP-012 | Duplicate decision | Same reviewer submits approval twice | Second decision is idempotent or rejected without double apply |
| AP-013 | Stale impact | Target changes after impact snapshot | Decision/apply is blocked or requires refreshed review |
| AP-014 | Apply idempotency | Approved request apply is retried | Domain state is not mutated twice |
| AP-015 | Apply failure | Handler throws controlled apply error | Request becomes `apply_failed` or equivalent with recovery evidence |
| AP-016 | Audit | Decision is completed | Append-only decision history and controlled Chinese summary are written |
| AP-017 | Bypass guard | Legacy route attempts direct formal mutation | Route calls platform or fails closed |
| AP-018 | Compatibility | Existing numbering approval decision is processed | Current numbering behavior remains correct |
| AP-019 | Root obsolete | Whole-root obsolete request submitted | Parent root reason and child target list are preserved |
| AP-020 | Root obsolete | Partial child approval would imply root obsolete | Root remains active or marked partial until policy conditions are satisfied |
| AP-021 | Submission release | Submission release approval applies | Master lifecycle effects remain in submission handler and are transactional |
| AP-022 | BOM release | BOM release approval applies | BOM domain state changes only after approval |
| AP-023 | Cost adapter | Cost change is approved | Platform and domain statuses stay consistent |
| AP-024 | Supplement adapter | Drawing package supplement is approved | Supplement tag/history appears in domain detail and platform history |
| AP-025 | UI copy | Approval statuses and actions are shown | Chinese wording distinguishes `申請作廢`, `刪除草稿`, `取消申請`, `退回補資料`, `拒絕` |
| AP-026 | Architecture spike | Phase 1A runs without schema or runtime data changes | ADR/decision record selects existing-table generalization or v2 platform tables, or stops with evidence |
| AP-027 | Launch blockers | Submission/BOM formal lifecycle remains outside platform | Launch readiness is blocked until migrated |
| AP-028 | Historical migration | Known closed/historical approval-like records are migrated | Platform canonical model contains migrated records with requester, approver, status, timestamps, decision history and domain links preserved |
| AP-029 | Transitional adapters | Cost/supplement adapters are used before full migration | Adapter records appear in inbox/history but are not marked final launch-ready until physical migration gate passes |
| AP-030 | Navigation | Sidebar is rendered for a reviewer | Only one primary approval reviewer entrypoint is visible for approval decisions: `審核工作台` or equivalent |
| AP-031 | Navigation | Legacy approval page links are removed from primary sidebar | Formal release, drawing revision impact review and BOM review decision queues are reachable from workbench filters/deep links, not competing sidebar entries |
| AP-032 | Badge | Reviewer has actionable pending approvals | Workbench sidebar badge shows the pending actionable count |
| AP-033 | Badge | Pending item belongs to another reviewer, company/workspace or submitter follow-up | Badge excludes that item |
| AP-034 | Workbench filters | Reviewer selects a domain/action/status filter replacing a legacy entry | The filtered queue shows the same class of work the legacy entry exposed |
| AP-035 | Legacy compatibility | Direct legacy reviewer URL or bookmark is opened before full convergence | User can still reach the relevant approval page or is bridged to the equivalent workbench state without losing context |
| AP-036 | Long-term redirect | Legacy reviewer route redirects after Phase 1C-B is authorized | Redirect lands on the equivalent workbench filter/detail and preserves approval identity |
| AP-037 | Object projection | Drawing revision impact review is pending for a drawing number | Drawing owner/detail and relation/search drawing-target surfaces show compact pending/revision cues without duplicating the approval inbox, adding a separate focus panel, or mutating lifecycle status |

Phase 1C-A execution result on 2026-07-08:

- AP-030 passed: reviewer sidebar shows one primary `審核工作台` approval decision entrypoint.
- AP-031 passed: primary sidebar no longer shows `BOM 審核`, `發行審核` or `圖面進版影響審核`; non-review creation/preparation entries remain visible.
- AP-032 passed structurally: sidebar pending badge reads `/api/approvals/inbox?status=pending&limit=100`; no pending fixture was present in the browser smoke, so visible nonzero badge rendering is covered by static QC and CSS, not by live fixture count.
- AP-033 passed for role boundary and company scope: inbox API requires `R&D Manager` or `Admin`, uses the authenticated user's `company_id` when no explicit company is supplied, and Playwright confirmed engineer badge hidden/forbidden.
- AP-034 passed: status/domain/action filters update inbox API query and URL; BOM action options scope after selecting BOM domain.
- AP-035 passed for short-term compatibility: legacy reviewer routes remain directly reachable and are not removed or redirected in Phase 1C-A.
- AP-036 not executed: Phase 1C-B redirect is a long-term not-authorized phase.

Phase 1C-B execution result on 2026-07-09:

- AP-034 extended: workbench action filter now includes `numbering.drawing_revision_impact_review`.
- AP-035 passed for long-term compatibility: bookmarked legacy reviewer routes bridge to equivalent workbench filter states with explanatory `legacyRedirect` messages.
- AP-036 passed: legacy reviewer routes return 307 redirects to `/approvals` query states preserving status/domain/action context; direct reviewer decision capability is no longer available only on hidden legacy pages.

Phase 1C-C execution result on 2026-07-09:

- AP-037 passed: `/numbering/drawings?query=A0007-M01&detail=A0007-M01` keeps compact drawing/list and attachment/history pending cues while the APP-redlined drawing detail focus panel is removed.
- Object projection remains read-only: `record_status` and release state are not used to represent pending approval.
- Browser smoke passed for desktop 1440x960 and mobile 390x844 without horizontal overflow or clipped visible pending badges.

## Browser / UI Validation

Required browser checks once UI implementation is authorized:

- Desktop unified inbox lists multiple domains without layout overflow.
- Mobile unified inbox remains readable and decision buttons do not overlap.
- Desktop and mobile sidebar show a single primary approval workbench entry with a readable pending badge.
- Hidden legacy reviewer entries are still reachable through workbench filter/deep-link paths where feature parity is incomplete.
- Approval detail shows impact preview before decision actions.
- Domain detail pages deep-link into the platform approval detail.
- Drawing object detail pages show pending approval context only as compact object/revision cues and keep the full decision workflow in `/approvals`.
- Root obsolete impact wizard preserves whole-root intent and child target list.
- Empty inbox, unauthorized access and apply-failed states give actionable next steps.

Screenshots should be retained under a phase-specific `output/playwright/pdm-approval-platform/` folder.

## Negative Cases

The QC script must explicitly assert:

- No direct mutation happens before approval.
- Unknown action codes do not create approval records.
- Missing handlers do not silently mark requests approved.
- Approval apply is not called for rejected or needs-info requests.
- Stale impact cannot be approved without policy-defined refresh.
- A user without company/workspace scope cannot read, decide or apply.
- Existing numbering approval routes do not fork into a separate active approval system after migration.
- Sidebar badge does not count approval items the current reviewer cannot decide.
- Removing a sidebar legacy entry does not remove the only route to an un-migrated reviewer decision capability.

## Data / Migration Validation

If RD generalizes existing `approval_requests` and `approval_batches`:

- Verify numbering approvals still list, decide and apply.
- Verify `request_type` supports non-numbering values.
- Verify indexes still support inbox filtering.
- Verify old numbering IDs remain readable.

If RD creates v2 platform tables:

- Verify numbering compatibility adapter behavior.
- Verify old and new records do not produce duplicate inbox items.
- Verify domain detail pages link to the correct platform work item.
- Verify migration dry-run report exists before any live migration.

For the user-selected full historical migration strategy:

- Verify every known approval-like source table is inventoried.
- Verify dry-run reports source count, target count, skipped count, collision count and manual-review count.
- Verify migrated historical decisions retain requester, reviewer, decision, reason, timestamp, target identifiers and domain detail links.
- Verify read adapters are not the final launch-readiness evidence for historical records.
- Verify live migration remains blocked until release/data authorization exists.

## Evidence Required

Implementation report must include:

- Phase 1A no-migration spike report and ADR/decision record.
- Chosen data strategy.
- Handler registry list.
- API route list.
- QC command output summary.
- Browser screenshot paths where UI changed.
- Sidebar before/after navigation inventory for reviewer approval entries.
- Pending-badge data source and permission-scope evidence.
- Legacy approval route compatibility or redirect mapping evidence.
- Compatibility result for existing numbering approvals.
- Historical migration dry-run and parity report when Phase 5 is reached.
- Bypass audit result.
- Known limitations and deferred phases.

## Stop Conditions

Stop validation and return to PM if:

- A migrated formal approval can still be applied through a direct mutation route.
- Root obsolete loses parent intent or child target list.
- Unknown actions or missing handlers do not fail closed.
- A request can be approved by an unauthorized reviewer.
- Duplicate decision can double-apply domain effects.
- A production migration or direct data repair is needed.
- Phase 1B schema/migration work starts before Phase 1A spike ADR exists.
- Submission/BOM platformization is removed from launch blocker scope.
- Historical migration cannot preserve approval decision evidence.
- Phase 3 or Phase 4 scope starts without explicit authorization.
- Phase 1C-A tries to include SLA/overdue/owner/escalation or external notifications despite the confirmed badge-only first-slice boundary.
- A reviewer can only access a decision capability from a hidden legacy route and not from the approval workbench.
