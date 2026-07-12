# ADR-PDM-PRODUCTION-SLICE-001: Official Numbering and Draft Production Slice

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

- Include `/numbering/part-drafts` in the first production slice.
- Allow delete/recycle for provisional part-number drafts before controlled boundary.
- Use smoke company / tenant as the default production smoke isolation strategy.

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
12. `/numbering/part-drafts` is part of the first slice as a provisional draft workbench.
13. Provisional `part_number_drafts` may be deleted/voided and recycled before they cross a controlled boundary.
14. Official root, drawing, or part numbers remain controlled records and cannot be hard-deleted or recycled through the draft workbench.
15. Smoke company / tenant is the default release-gate smoke isolation model; any leakage into normal Jenfu surfaces blocks production write smoke.
16. Existing part-number draft actions that start or resume broader lifecycle behavior, including `submit-review`, `reconfirm`, and `restore`, are closed in the production slice unless a later DEV explicitly opens them.
17. The production slice must reuse or faithfully wrap the existing part-number draft controlled-boundary predicate for delete/recycle decisions; it must not introduce a weaker parallel predicate.

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
- Amends current first-version readiness triage: `DEV-IND-007` is complete for the disposable local Postgres/Supabase-shadow boundary; `DEV-FIELD-001` remains the first-version field-test blocker; `DEV-CAD-001`, `DEV-SW-001`, and `DEV-BACKUP-001` remain deferred full-PDM scopes and are not required before the Web official numbering / draft production slice.
- Does not change numbering identity ADRs or formal number reuse policy.
