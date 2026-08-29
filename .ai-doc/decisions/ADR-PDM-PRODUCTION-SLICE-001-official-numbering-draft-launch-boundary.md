# ADR-PDM-PRODUCTION-SLICE-001: Official Numbering and Draft Production Slice

> 2026-08-29 Release Governance Amendment：具名3–5人Wave 0驗收與waiver流程已永久退役。Release仍保留exact artifact、0% candidate、DB safety、basic smoke、candidate-bound authenticated Level 4、zero open P0/P1、rollback readiness、Product Owner GO、exact promotion token、traffic-only promote與canonical smoke。Production allowlist維持fail-closed安全控制，但不再作為user acceptance evidence；本文件較舊canary必要性敘述僅供歷史追溯。

> 2026-07-13 Amendment：本文件既有 narrow production-slice、server-side feature gate、smoke-company isolation 與 QC evidence 保留；新 create flow 不再於 form create 時直接產生永久 official master。`ADR-PDM-NUMBER-STATE-FLOW-001` 改以獨立 candidate reservation + explicit publication transaction 作正式化邊界。Production clean seed 只含 published/obsolete official numbers 與 recovery non-reuse reservations，不 seed candidates/local drafts。
>
> 2026-07-14 Amendment (`HD-9-1`)：使用者取消 `DEV-FIELD-001` 固定五個工作日現場驗證。任務以 `Cancelled by Human Decision` 關閉，不視為通過；DEV-046 Phase 2B live staging、DEV-032、named 3-5-user canary、零 open P0/P1、continuity/rollback 與 production post-deploy smoke 仍為必要 gate。任何 allowlist 擴大必須明確 release 決策，不因時間或 local evidence 自動發生。
>
> 2026-07-17 DEV-048 convergence amendment：本文件的 narrow production-slice、API fail-closed、未開放標示與正式號不可重用邊界維持有效；獨立 `/numbering/part-drafts` 功能頁已由較新的 DEV-048 取代。草稿與領號申請的唯一可操作 UI 為 `/parts?tab=drafts` owner workspace，建立入口位於圖料／圖號／料號 owner surfaces；`/numbering/part-drafts`與`/numbering/request`只保留轉址相容，不得重新掛載舊 mutation page。Production slice 的送審、撤回與正式發布仍須在 owner workspace 顯示`未開放`並由API拒絕。

Date: 2026-07-10
Status: Accepted / Development document prepared; product implementation not requested this turn; production release gate required
Owner: Dev PM
Related DEV: `DEV-PDM-PRODUCTION-SLICE-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`

## Context

The user wants to let a small internal group start using AI_PDM for real work before the whole PDM system is production ready. The immediate value is official number allocation and draft creation. Full formal release, CAD source-file parsing, SolidWorks Add-in readiness, and complete PDM production readiness remain too broad for the first launch slice.

Prior repo evidence shows the core numbering, contextual add entrypoints, access-control baseline, sequence isolation, and unified drawer behavior have local verification evidence. The full production readiness gate still reports external blockers for Supabase/Postgres shadow evidence, CAD reader evidence, SolidWorks machine evidence, restore-drill evidence, and field-test evidence.

The user confirmed the launch direction through guided decisions:

- Use Web only for the first usable surface.
- Go directly to a narrow production slice, not a staging-only pilot, and do not claim full PDM production readiness.
- Real user-created numbers are official controlled records and must not be silently reused.
- Keep future roadmap UI visible, but disabled and marked unopened.
- Production smoke must not consume the normal Jenfu official sequence; the first release-gate default is a smoke company / tenant.
- First users are 3-5 internal users: Admin, RD Manager, and 2-3 engineers.

The user later confirmed RD supervisor follow-up decisions on 2026-07-10:

- Include draft management in the first production slice through `/parts?tab=drafts`; keep `/numbering/part-drafts` as redirect-only compatibility.
- Allow delete/recycle for provisional part-number drafts before controlled boundary.
- Use smoke company / tenant as the default production smoke isolation strategy.

The 2026-07-13 fourth completeness review continued without explicit option overrides, so HCS default `1B` is adopted: after technical release gates pass, deploy a named-user production canary for the 3-5 pilot users. `DEV-FIELD-001` is collected on the canary and blocks wider internal opening and pilot acceptance; it does not create a circular prerequisite for the first controlled deployment.

## Decision

1. AI_PDM may prepare a narrow production slice named `official numbering / draft production slice`.
2. The slice only opens Web-based official numbering and draft creation flows.
3. The slice must not be described as full PDM production ready.
4. Roadmap UI remains visible so users can see the future system shape.
5. Unopened actions must be visibly marked `未開放`, disabled or inert in UI, and blocked server-side.
6. Frontend-only disabled buttons are not an acceptable control. Every unopened write API must fail closed.
7. The first production users are limited to 3-5 internal users.
8. For this first release-gate path, smoke data must use a separate smoke company / tenant and must not pollute normal Jenfu official numbering lists or sequences.
9. If company/tenant isolation for smoke data cannot be proven, the smoke-company approach is blocked; production execution must use non-mutating production checks plus staging write smoke until a safe smoke namespace exists.
10. Direct browser access to Supabase Data API remains rejected. Application access stays through server-side AI_PDM APIs.
11. Production release, deployment, provider pointer switch, live migration, rollback, and production smoke artifacts remain blocked until a release-type command and high-risk confirmation.
12. `/parts?tab=drafts` is the canonical first-slice draft workbench; `/numbering/part-drafts` is redirect-only compatibility.
13. Provisional `part_number_drafts` may be deleted/voided and recycled before they cross a controlled boundary.
14. Official root, drawing, or part numbers remain controlled records and cannot be hard-deleted or recycled through the draft workbench.
15. Smoke company / tenant is the default release-gate smoke isolation model; any leakage into normal Jenfu surfaces blocks production write smoke.
16. Owner-workspace actions that start broader lifecycle behavior, including submit, withdraw and publish, are closed in the production slice unless a later DEV explicitly opens them.
17. Candidate cancel/recycle decisions must use DEV-048 number-state-flow domain predicates and transaction authority; the retired part-draft page must not introduce a parallel predicate.

## Alternatives Considered

### A. Hide all unopened functions

Rejected. It reduces misuse risk, but it also prevents internal users from seeing the product roadmap and creates a misleading impression that AI_PDM is only a numbering tool.

### B. Show unopened UI but rely only on disabled buttons

Rejected. Users, stale browser bundles, direct URLs, and API clients can bypass frontend state. This is not a production-grade safety boundary.

### C. Show unopened UI with server-side production-slice feature gate

Accepted. It preserves roadmap visibility while creating an enforceable boundary.

### D. Use official Jenfu sequence for smoke testing

Rejected for routine smoke. It gives the strongest end-to-end proof, but it consumes real numbers. The selected first default is smoke company / tenant; a dedicated smoke sequence namespace remains a future fallback design. A one-time controlled real-number cutover test remains a separate release decision if the release owner accepts that cost.

### E. Wait until full PDM production readiness

Rejected for this launch objective. It delays usable feedback from the highest-value slice and couples official numbering to CAD/Add-in readiness unnecessarily.

### F. Recycle official numbering records created through formal numbering flows

Rejected. The user-selected recycle policy applies only to provisional part-number draft reservations before controlled boundary. Official root, drawing, and part numbers remain controlled records.

## Consequences

Positive:

- Internal users can start real official numbering work earlier.
- Roadmap visibility supports adoption and expectation management.
- Server-side gates prevent hidden production expansion.
- Smoke isolation protects official Jenfu sequence integrity.
- Full PDM production blockers remain visible without blocking the narrow slice by default.

Costs and risks:

- The team must implement and verify a production-slice feature gate.
- Disabled roadmap UI needs accessible hover/focus/click explanations, not hover-only hints.
- Draft deletion/recycle needs a clear provisional-vs-official boundary; otherwise RD must stop before implementation.
- Existing draft lifecycle routes must be actively gated because the current application already has `submit-review`, `reconfirm`, and `restore` handlers outside this slice.
- Reusing the existing controlled-boundary predicate reduces the risk of official or referenced records being recycled through a production-slice shortcut.
- Smoke-company data isolation becomes a P0 release precondition for the selected `Smoke 3A` path.
- Production slice readiness still depends on Supabase production target, server-only credential boundary, RLS/direct-access denial, backup/restore evidence, and release gate confirmation.
- A smoke company validates mechanics but does not prove the normal Jenfu official sequence was consumed unless a separate controlled real-number test is confirmed through release gate.

## Execution Boundary

This ADR fixes the product decision and development-document boundary only. It does not request or execute:

- Product implementation.
- Supabase production migration or provider pointer switch.
- Production deployment.
- Production smoke execution.
- Direct data repair, deletion, or sequence mutation.
- Merge, PR, rollback, release report, or any release artifact.

## Supersedes / Amends

- Amends the launch interpretation of `DEV-SUPABASE-DB-001-PROD-GATE` by defining a narrower production slice that is not equivalent to full PDM production readiness.
- Historical first-version triage had `DEV-FIELD-001` as the pilot-acceptance/wider-opening blocker; `HD-9-1` supersedes that requirement and closes it as cancelled without evidence pass. `DEV-IND-007` remains complete for the disposable local Postgres/Supabase-shadow boundary; `DEV-CAD-001`, `DEV-SW-001`, and `DEV-BACKUP-001` remain deferred full-PDM scopes.
- The current first-version blockers are DEV-046 Phase 2B live platform readiness and DEV-032 production release evidence. The initial canary remains named and fail-closed; later allowlist changes remain explicit release decisions.
- DEV-046 later narrows that deferral: `DEV-BACKUP-001` still owns the full PDM file/offline restore drill, while Phase 3A production release separately requires database PITR, an independent logical backup, the hourly control ledger, and isolated restore evidence.
- Does not change numbering identity ADRs or formal number reuse policy.
