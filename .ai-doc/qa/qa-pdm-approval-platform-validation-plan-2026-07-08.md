# QA Plan - PDM Approval Platform Validation

Status: Phase 1A-1B focused local QC executed; Phase 1C-A reviewer entrypoint consolidation implemented and locally verified; Phase 1C-B legacy redirect implemented and locally verified; Phase 1C-C drawing object pending-review projection implemented and locally verified; DEV-070 workbench reuse is `Local RD Implemented / Focused Contract + Query + Browser QC Passed / Full APW Matrix Pending`; release/live migration not authorized
Date: 2026-07-08
Owner: QA / Dev PM
Related Spec: `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`; `.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`
Related DEV: `DEV-PDM-APPROVAL-PLATFORM-001`; `DEV-PDM-APPROVAL-INBOX-WORKBENCH-001` / `DEV-070`

> **DEV-087 exception boundary**：DEV-087只沿用`/approvals`inbox mechanics與reviewer security，storage改為transient request adapter＋minimal trace，不寫platform request/decision tables。其驗收由QA-087-112..117負責；本計畫只回歸其他approval domain不變，不得要求DEV-087雙寫或保留舊decision欄位。

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

## DEV-070 Approval Workbench Contract Validation

Status: `Local RD Implemented / Focused Contract + Query + Browser QC Passed / Full APW Matrix Pending / Production Release Gated`.

This section is the focused QA contract for DEV-070. It supplements historical `AP-001..037`; historical results remain evidence for their original implementation date, while DEV-067/DEV-070 supersede the old assumption that covered Drawing/Part/Relation review details are composed inside `/approvals`.

Required fixtures:

- Authorized reviewer and non-reviewer in the same company; authorized reviewer in another company.
- 0, 1, 20, 60 and at least 101 eligible inbox rows.
- Rows from all six sources: native, numbering, submission, BOM, drawing package and drawing revision review.
- At least six rows sharing the same `requestedAt`, with distinct globally stable `rowKey` values.
- Covered Drawing, Part and Relation owner targets; one legacy domain without a canonical owner surface; one stale/deleted owner target.

| ID | Area | Procedure | Expected evidence |
|---|---|---|---|
| APW-001 | Architecture | Inspect approval page and shared workbench imports/render path | Approval uses shared shell/controller/list/pagination mechanics; no second page-local equivalent remains on the enabled path |
| APW-002 | Domain boundary | Inspect approval UI controls and core branches | `/approvals` has no relation tree/matrix switch; shared core contains no approval status/action/domain conditional |
| APW-003 | Row projection | Render native and all legacy-source rows | Target code/name, review type, requester, time and compact status are readable; no raw identifier is shown when a human label exists |
| APW-004 | Search | Search target code/label/title, request title, requester and package code | Server returns all authorized matches across sources before page slicing; whitespace/case normalization is deterministic |
| APW-005 | Filters | Change status/domain/action/query from a non-first page with a selected row | URL is canonical; cursor resets; an out-of-result selection clears; no stale row remains |
| APW-006 | Global order | Load equal-time six-source fixture | Order is exactly `requestedAt DESC, rowKey ASC` on repeated reads |
| APW-007 | Next cursor | Traverse a 101+ fixture to the final page | Every authorized row is reachable; first-100 truncation does not occur |
| APW-008 | Previous cursor | Navigate forward twice and then backward | Previous page is exact and URL-backed; reload on that page preserves it |
| APW-009 | Cursor integrity | Record all row keys while paging next/previous | No duplicate or missing row occurs, including equal timestamps |
| APW-010 | Cursor tamper | Alter cursor bytes/signature | API returns 400 without data; UI clears cursor, returns to page one and shows concise recovery notice |
| APW-011 | Cursor context | Reuse a cursor after changing query/filter | API rejects mismatch; no rows from the old context appear |
| APW-012 | Isolation | Reuse cursor/request ID across actor and company contexts | 403/400 reveals no row, count, target or owner URL; assignment/company scope remains authoritative |
| APW-013 | Count | Compare sidebar/workbench summary against full authorized fixture while changing search/filter/page | Global reviewer/company-scoped status counts are exact and independent of current filter/page length; list says `本頁 N 筆` |
| APW-014 | Query budget | Capture DB/read counters for 1, 20 and 60-row pages across six sources | List read path stays `<=16` reads and does not grow with returned row count |
| APW-015 | Race guard | Delay an old request, then rapidly change query/filter/page | Old request is aborted or ignored; only the latest rows, selection and URL render |
| APW-016 | Reload/share | Open a URL containing filters/query/cursor/requestId in a fresh tab | Same page and selected row restore without first selecting another row |
| APW-017 | Browser history | Change filters/pages/selection, then use Back and Forward | Each historical list state and selection restores exactly |
| APW-018 | Selection | Select a row, reload and copy the URL | `requestId` is canonical and shareable; inaccessible IDs do not disclose or auto-select data |
| APW-019 | Owner link authority | Inspect covered PDM row links | Server emits normalized owner href with exact signed/validated `returnTo`; client does not reconstruct route ownership |
| APW-020 | Unified detail | Open Drawing, Part and Relation covered rows | Canonical owner module opens exactly one `UnifiedPdmEntityDetailDrawer`; `/approvals` does not mount duplicate PDM detail |
| APW-021 | Close return | Close each owner drawer | Returns to exact filter/query/cursor/request selection and focus returns to the originating row |
| APW-022 | Decision return | Complete an allowed decision in owner drawer | Returns to exact list context; only affected row and exact pending count refresh; unrelated rows do not jump |
| APW-023 | Legacy fallback | Open a domain without canonical owner surface | Existing authorized fallback remains reachable without changing the shared inbox shell or fabricating a PDM drawer |
| APW-024 | Keyboard | Exercise ArrowUp/Down, Home/End, PageUp/Down, Enter, Escape and copy-current-identifier | Behavior matches PDM workbench; selection/focus/pagination remain visible and deterministic |
| APW-025 | Native input | Repeat shortcuts while focus is in input, textarea and select | Native editing/select behavior is not intercepted; focus indicators remain visible |
| APW-026 | States/failure | Exercise loading, 0-row empty, 401, 403, invalid cursor, required-source failure and retry | Shared states are concise/actionable; required-source failure is fail-closed and never presented as a complete partial inbox |
| APW-027 | Responsive | Execute primary flow at 1440x900, 1024x768, 768x1024 and 390x844 | No horizontal overflow, overlap, clipping or ambiguous nested scroll owner; target/type/requester/time/status remain usable |
| APW-028 | Runtime sweep | Run full flow with browser console and network capture | Visible errors, console errors and unexpected 4xx/5xx are zero; expected 400/401/403 cases are asserted and recoverable |

Required evidence package after implementation:

- Focused API/contract test output for search, all-source order, signed next/previous cursor, tamper, filter hash and actor/company isolation.
- Query-count report for 1/20/60 rows and the 101+ collision fixture manifest.
- Static architecture report proving shared mechanics reuse, no approval branch in core and no duplicate covered-PDM detail body.
- Four-viewport screenshots plus browser trace covering reload, Back/Forward, close/decision return, keyboard/focus, state recovery and console/network sweep.
- Implementation report mapping every changed product file and every `APW` case; no PASS claim without retained evidence.

### DEV-070 executable QA map

| Phase | Planned verifier | APW ownership | Required regression |
|---|---|---|---|
| 1A server contract | expanded `scripts/qc-approval-inbox-query-budget.mjs` plus new `scripts/qc-dev-070-postgres.mjs` | APW-004～014, APW-026 source-failure branch and provider timestamp parity | Existing approval policy/detail/decision behavior remains unchanged |
| 1B shared client | new `scripts/qc-dev-070-approval-workbench.mjs` | APW-001～003, 005, 015～018, 024～027 static/contract | `npm run qc:dev-062:core` |
| 1C owner return | same contract verifier plus owner-navigation fixture | APW-019～023 | `npm run qc:dev-067:navigation` |
| 1D browser/QC | new `scripts/qc-dev-070-browser.mjs` | APW-001～028 real interaction as applicable | approval platform regression, app typecheck and isolated build |

Required command sequence:

```text
npm run qc:dev-070:contract
npm run qc:dev-070:query
npm run qc:dev-070:postgres
npm run qc:dev-062:core
npm run qc:dev-067:navigation
npm run qc:pdm-approval-platform
npm run typecheck:app
npm run build:isolated
npm run qc:dev-070:browser
```

`package.json` adds `qc:dev-070:contract`, `qc:dev-070:query`, `qc:dev-070:postgres`, `qc:dev-070:browser` and aggregate `qc:dev-070` without a new dependency. The query verifier retains the existing native target-batching assertion while adding six-source fixtures. The PostgreSQL verifier uses a disposable isolated target and proves TIMESTAMPTZ/SQLite ordering parity; absence of that target is reported as an evidence blocker, not PASS. The browser verifier uses disposable local SQLite and fixed localhost entrypoint, never staging/production data.

Evidence roots:

- `output/qa/dev-070-approval-workbench/<run-id>/`: manifest, source fixtures, row-key traversal, query counts, expected/actual summaries and static contract report.
- `output/playwright/dev-070-approval-workbench/<run-id>/`: four-viewport screenshots, interaction manifest, focus/history trace and console/network summary.

QA does not mark DEV-070 PASS from visual similarity, one page of rows, `items.length`, a client-side merge, unretained manual inspection or historical AP results. Any APW P0/P1 failure returns the same DEV to RD; no partial-source result is accepted as degraded success.

DEV-070 focused execution evidence (2026-08-12): `qc:dev-070:contract` PASS; `qc:dev-070:query` PASS; `qc:dev-070:postgres` static guard PASS with runtime parity pending because no external PostgreSQL target is configured; `qc:dev-070:navigation` PASS; `qc:dev-062:core` PASS (6/6); `qc:pdm-approval-platform` PASS (123/123); `typecheck:app` PASS; `build:isolated` PASS; `qc:dev-070:browser` PASS for shared list/filter/pagination envelope, no auto-open, owner navigation and console/network smoke. Screenshot: `output/playwright/dev-070-approval-workbench/approval-workbench.png`. These results are focused implementation evidence, not a claim that the full APW-001..028 matrix is closed.

## Browser / UI Validation

Required browser checks once UI implementation is authorized:

- Desktop unified inbox lists multiple domains without layout overflow.
- Mobile unified inbox remains readable and decision buttons do not overlap.
- Desktop and mobile sidebar show a single primary approval workbench entry with a readable pending badge.
- Hidden legacy reviewer entries are still reachable through workbench filter/deep-link paths where feature parity is incomplete.
- Covered PDM review opens the canonical Drawing/Part/Relation owner drawer, where the same submitter-visible projection plus authorized review context shows impact before decision actions.
- Domain detail pages deep-link into the platform approval detail.
- Drawing object/list surfaces keep compact pending cues; covered PDM decision detail stays in the canonical owner-module drawer reached from `/approvals`, not in a duplicated approval-only detail body.
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
