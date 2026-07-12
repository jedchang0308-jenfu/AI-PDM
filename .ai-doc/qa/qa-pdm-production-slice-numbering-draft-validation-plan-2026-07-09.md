# QA-PDM-PRODUCTION-SLICE-001 - Official numbering and draft production slice validation plan

Date: 2026-07-10
Related DEV: `DEV-PDM-PRODUCTION-SLICE-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`
Related QC: `.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`
Status: Local Phase 1 executed and passed; production release validation not executed

## Validation Objective

Verify that AI_PDM can safely open only the official numbering and draft production slice to 3-5 internal users while keeping future roadmap functions visible but unopened, and while preventing direct API execution of unopened production workflows.

This QA plan is for development and pre-release validation. It does not authorize production deployment or production smoke execution.

Local execution evidence is recorded in `.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`. Production deployment, production smoke, live Supabase target validation, provider pointer switch, rollback and release report remain outside this QA execution and require `DEV-032` release gate.

## Scope

In scope:

- Production-slice feature gate.
- Web UI roadmap visibility with disabled/unopened states.
- Official numbering creation and draft creation flows.
- `/numbering/part-drafts` draft workbench.
- Provisional part-number draft delete/void and number recycle before controlled boundary.
- Search/list/detail confirmation for created records.
- API denial for unopened write actions.
- Permission boundary for Admin, RD Manager and 2-3 engineers.
- Smoke company / tenant isolation.
- Supabase production target readiness requirements for the slice.

Out of scope:

- Full PDM production readiness.
- Formal submission, approval and release production workflows.
- CAD source parsing, Document Manager production readiness and SolidWorks Add-in.
- BOM release, manufacturing baseline and procurement handoff.
- Supabase Storage production file cutover.
- Production deploy, rollback, provider pointer switch, production smoke execution or release report.

## Required Fixtures

Use disposable local or controlled staging fixtures before release gate confirmation. Do not mutate production until release gate approval exists.

| Fixture | Required data |
|---|---|
| `SLICE-ADMIN` | Admin user with setup and diagnostic access |
| `SLICE-RD-MANAGER` | RD Manager user with visibility into numbering/draft records |
| `SLICE-ENGINEER-1` | Engineer allowed to create official numbering/drafts |
| `SLICE-NO-CREATE` | Authenticated user without numbering create permission |
| `SLICE-SMOKE-COMPANY` | Smoke company / tenant isolated from normal Jenfu lists |
| `SLICE-ROOT` | Existing root eligible for append flow |
| `SLICE-DRAFT` | Draft record used for draft state checks |
| `SLICE-PART-DRAFT` | Provisional part-number draft that has not crossed controlled boundary |
| `SLICE-CONTROLLED-DRAFT` | Part-number draft that is submitted, released, referenced, or otherwise controlled |

## Acceptance Matrix

### Slice Feature Gate

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-GATE-001 | P0 | Production slice mode is active | Allowed numbering/draft actions are enabled for permitted users |
| SLICE-GATE-002 | P0 | Slice mode is missing or unknown in production | System fails closed for writes outside a safe default |
| SLICE-GATE-003 | P0 | Direct API call to unopened write route | API returns 403/409 with `feature_not_open_in_production_slice` and no mutation |
| SLICE-GATE-004 | P0 | Unopened UI button is clicked | No write API is called; user sees an unopened reason |
| SLICE-GATE-005 | P1 | Route refresh or stale frontend bundle | Server-side gate still denies unopened action |

### Route / API Boundary

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-API-001 | P0 | Allowed read APIs are called by permitted user | `GET /api/numbering/search`, `/drawings`, `/drawings/resolve`, `/roots/[rootCode]`, `/roots/[rootCode]/append-policy` and `/permissions` work without exposing smoke data |
| SLICE-API-002 | P0 | Allowed create API `POST /api/numbering/records` is called by engineer | Exactly one official controlled record is created and audited |
| SLICE-API-003 | P0 | Existing-root append APIs are called from approved UI | Drawing/part append works only for permitted user and existing root |
| SLICE-API-004 | P0 | Approval/review/release/submission mutation route is called directly | Route returns `feature_not_open_in_production_slice` or stricter existing denial; no mutation |
| SLICE-API-005 | P0 | Obsolete, import/export, BOM, storage/provider or file-migration mutation route is called directly | Route is denied and no side effect occurs |
| SLICE-API-006 | P0 | Unlisted route/method is called in production-slice mode | Default is closed; route is denied or unavailable |
| SLICE-API-007 | P0 | Part-number draft APIs are called from approved draft workbench | GET/POST/PATCH and allowed void/recycle routes work only for provisional drafts |
| SLICE-API-008 | P0 | Official numbering draft delete route is called | Route is denied; official root/drawing/part number is not deleted or recycled |
| SLICE-API-009 | P0 | Existing part-number draft `submit-review`, `reconfirm`, or `restore` route is called in production-slice mode | Route returns `feature_not_open_in_production_slice` or stricter denial before mutation |

### Open Numbering / Draft Workflows

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-NUM-001 | P0 | Engineer creates a new official numbering record | Record is created once, audited, and visible in search/list/detail |
| SLICE-NUM-002 | P0 | Engineer appends drawing under existing root | New drawing belongs to the selected root; no duplicate root is created |
| SLICE-NUM-003 | P0 | Engineer appends part under existing root | New part belongs to the selected root and follows existing naming policy |
| SLICE-NUM-004 | P0 | Duplicate submit / double click | Only one intended record is allocated |
| SLICE-NUM-005 | P0 | User lacks create permission | UI blocks action and API denies without sequence allocation |
| SLICE-DRAFT-001 | P0 | Engineer creates or maintains an allowed draft | Draft is saved and visible only within approved slice surfaces |
| SLICE-DRAFT-002 | P1 | Draft-only action is cancelled | Cancel does not allocate numbers or mutate records |
| SLICE-DRAFT-003 | P0 | Draft metadata edit is submitted for `Draft` / `NeedInfo` | Edit succeeds with audit/version guard and remains outside formal workflow |
| SLICE-DRAFT-004 | P0 | Draft metadata edit is submitted for non-draft record | API returns conflict and does not mutate |
| SLICE-DRAFT-005 | P0 | `/numbering/part-drafts` creates a provisional reservation | Draft appears in draft workbench and is not an official root/drawing/part record |
| SLICE-DRAFT-006 | P0 | Provisional part-number draft delete/void is confirmed | Draft leaves active draft workbench and delete event remains auditable |
| SLICE-DRAFT-007 | P0 | Deleted/voided provisional draft is recycled | Reserved draft number becomes reusable only if not controlled or already reused |
| SLICE-DRAFT-008 | P0 | Delete/recycle is attempted for official, referenced, submitted, released or controlled draft | API returns conflict and no official number is recycled |
| SLICE-DRAFT-009 | P0 | Official numbering record delete/recycle is attempted through draft route | Route is denied; official root/drawing/part number remains controlled |
| SLICE-DRAFT-010 | P0 | Restore/reconfirm/submit-review route is called from draft workbench | Route is denied as outside this slice |
| SLICE-DRAFT-011 | P0 | Draft submit-review / release conversion route is called | Route is denied as unopened production workflow |
| SLICE-DRAFT-012 | P0 | Existing `/numbering/part-drafts` UI would normally expose submit-review, reconfirm, or restore actions | Production-slice UI does not expose them as active actions; if visible, they are `未開放`, accessible and inert |
| SLICE-DRAFT-013 | P0 | Delete/recycle checks a provisional part-number draft boundary | Check uses or faithfully wraps the existing controlled-boundary predicate and records the boundary reason evidence |

### Roadmap UI / Now What States

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-UI-001 | P0 | User sees future function button | Button or control is visibly marked `未開放` |
| SLICE-UI-002 | P0 | User hovers, focuses, or taps unopened control | One-sentence reason is available without relying on hover only |
| SLICE-UI-003 | P0 | Keyboard user navigates unopened control | Focus behavior exposes the reason and does not trigger mutation |
| SLICE-UI-004 | P0 | Unopened formal release action is present | It is disabled/inert and API-gated |
| SLICE-UI-005 | P1 | Narrow viewport | Badges, buttons and reasons do not overlap, clip critical text or cause horizontal overflow |

### Direct URL / Roadmap Pages

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-ROUTE-001 | P0 | User opens an unopened roadmap route directly by URL | App shell renders a blocked `未開放` state; no working form or write CTA appears |
| SLICE-ROUTE-002 | P0 | User refreshes an unopened route or uses stale frontend navigation | Server-side API gate still blocks mutation |
| SLICE-ROUTE-003 | P1 | Read-only detail surface is opened from an approved route | Facts may render read-only; formal workflow controls are inert or absent |
| SLICE-ROUTE-004 | P0 | Unknown or unlisted production-slice route is opened | Route is blocked, permission-denied or 404; it must not expose a write workflow |

### Smoke Isolation

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-SMOKE-001 | P0 | Smoke company / tenant creates a record in a non-production-equivalent test | Smoke record cannot appear in normal Jenfu lists without explicit admin/test filter |
| SLICE-SMOKE-002 | P0 | Normal Jenfu sequence is checked after smoke-company activity | Normal official sequence is unchanged by smoke company activity |
| SLICE-SMOKE-003 | P0 | Search/list/report without smoke filter | Smoke records are excluded |
| SLICE-SMOKE-004 | P0 | Export/counter/dashboard without smoke filter | Smoke records are excluded |
| SLICE-SMOKE-005 | P0 | Company/tenant isolation is not implemented or not provable | Production smoke-company approach is blocked |

### Supabase / Security Boundary

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-SEC-001 | P0 | Frontend bundle/config is inspected | No database URL, service role key, secret key, or admin credential is exposed |
| SLICE-SEC-002 | P0 | Direct base table access is attempted through public Data API path | Not approved; access remains denied by default |
| SLICE-SEC-003 | P0 | Public tables in exposed schema are reviewed | RLS remains enabled and forced where applicable |
| SLICE-SEC-004 | P0 | Target identity evidence is required | Target must be `AI_PDM_PROD`, not `ProJED`, `ProJED_TEST`, or unrelated schema |

### Admin Setup Boundary

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| SLICE-ADMIN-001 | P0 | Admin activates pre-approved first users | Only Admin, RD Manager and 2-3 engineers are enabled for the slice |
| SLICE-ADMIN-002 | P0 | Admin assigns roles | Existing roles are used; no new role semantics or permission expansion is introduced |
| SLICE-ADMIN-003 | P0 | Unapproved user self-registers or appears through domain login | User cannot access create flow until explicitly activated/assigned |
| SLICE-ADMIN-004 | P0 | External specialist, manufacturing, procurement or broad viewer account attempts create | Create is denied unless a later scope opens it |

## Now What State Matrix

| State | User likely question | First visible answer | Next action |
|---|---|---|---|
| Open numbering | 我可以領號嗎？ | `可以，請建立正式圖料號。` | Use numbering form |
| Open draft | 我可以先建草稿嗎？ | `可以，草稿會保留在本次開放範圍內。` | Save draft |
| Delete provisional draft | 這個草稿可以不要了嗎？ | `可以刪除這筆暫用草稿，號碼可回收再用。` | Confirm draft delete/recycle |
| Controlled draft | 為什麼不能刪草稿？ | `這筆草稿已進入受控邊界，不能刪除或回收號碼。` | Continue controlled workflow or contact RD Manager |
| Unopened formal release | 為什麼不能發行？ | `發行未納入本次正式領號 / 草稿 production slice。` | Continue numbering/draft work |
| Unopened CAD parsing | 為什麼不能解析原檔？ | `CAD 原檔解析未納入本次開放。` | Use numbering/draft only |
| No permission | 為什麼不能領號？ | `目前角色沒有新增圖料號權限。` | Contact Admin or RD Manager |
| Smoke data | 為什麼看不到測試資料？ | `測試資料已隔離，不會出現在一般鉦富清單。` | Switch to admin/test filter if permitted |

## Required Development Commands

Minimum commands after Phase 1 implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-core
npm.cmd run qc:pdm-numbering-api-regression
npm.cmd run qc:pdm-numbering-request-ui
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-numbering-contextual-entrypoints
npm.cmd run qc:pdm-numbering-duplicate-submit-guard
npm.cmd run qc:pdm-numbering-sequence-integrity
npm.cmd run qc:pdm-numbering-gap-reuse
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-access-control-governance
```

Focused QC to add:

```powershell
npm.cmd run qc:pdm-production-slice-numbering-draft
```

Focused QC must verify:

- allowed numbering/draft flows are enabled only for permitted users;
- `/numbering/part-drafts` is open as first-slice draft workbench;
- provisional part-number drafts can be deleted/voided and recycled before controlled boundary;
- provisional draft delete/recycle uses or faithfully wraps the existing controlled-boundary predicate, including formal-part, BOM reference, replacement-link, PDM drawing upload, submitted and released boundary reasons;
- official root/drawing/part numbers cannot be deleted or recycled through draft controls;
- existing part-number draft `submit-review`, `reconfirm` and `restore` actions are not active in the production-slice UI and their APIs fail closed;
- only method-level allowed APIs from the spec matrix can mutate;
- draft operations stay within draft state and cannot enter review/release;
- direct URL entry into unopened routes renders blocked states without write controls;
- admin setup is limited to pre-approved users and existing roles;
- unopened UI controls are visible, marked `未開放`, accessible, and inert;
- unopened APIs return `feature_not_open_in_production_slice`;
- no unopened action mutates data through direct API calls;
- duplicate submit and sequence integrity protections still pass;
- smoke company / tenant cannot pollute normal Jenfu lists, reports, exports, counters, dashboards or official sequence;
- no frontend secret exposure;
- no raw backend errors are visible in blocked states.

## No-Go Criteria

QC must fail the slice if any of these occur:

- A frontend-disabled unopened action can mutate data through direct API call.
- A UI button is only disabled visually without an accessible reason.
- An unopened direct URL exposes a working form or write CTA.
- Any mutation route outside the method-level allowlist succeeds.
- A draft can be submitted to review, release, approval or formal workflow inside the slice.
- Existing part-number draft `submit-review`, `reconfirm`, or `restore` succeeds as an active production-slice workflow.
- A controlled, submitted, released, referenced or official numbering record can be deleted or recycled.
- A provisional draft number can be recycled without first proving it has not crossed a controlled boundary.
- Draft delete/recycle uses a new shortcut predicate that omits existing controlled-boundary reasons.
- Admin setup creates new role semantics, enables self-registration, or broadens the user group beyond the approved first users.
- Smoke-company records appear in normal Jenfu lists, search, reports, exports, counters, dashboards or consume normal official sequence.
- A user outside the first approved role set can create official numbers.
- Formal release, approval, CAD parsing, provider switch, file migration or BOM release executes inside the slice.
- Any secret or server-only credential appears in frontend code or committed env files.
- Raw SQL, stack trace, `Internal Server Error` or route text appears in normal UI blocked states.
- Production deploy, rollback, provider pointer switch, production smoke execution, direct production data repair or deletion is performed without release gate confirmation.

## Evidence Handoff

RD/QC report should include:

- Implemented capability allowlist and denylist.
- UI screenshots or Playwright evidence for opened and unopened states.
- API evidence for allowed create and denied unopened writes.
- Permission matrix evidence for Admin, RD Manager, Engineer and no-create user.
- Smoke isolation evidence.
- Secret exposure scan result.
- Explicit statement that no merge, PR, deployment, rollback, production smoke execution, direct data repair or data deletion was performed unless handled by a separate release gate.
