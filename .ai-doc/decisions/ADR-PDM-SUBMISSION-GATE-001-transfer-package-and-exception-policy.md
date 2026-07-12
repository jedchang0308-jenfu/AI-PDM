# ADR-PDM-SUBMISSION-GATE-001 - 技術移轉包與例外政策

Status: Accepted
Date: 2026-07-07; amended 2026-07-10
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
Related DEV: `DEV-005` / `DEV-PDM-SUBMISSION-GATE-001`; child `DEV-041` / `DEV-PDM-TRANSFER-PACKAGE-INTAKE-001`

## Context

The submission gate originally risked treating drawing, part and technical-transfer submission as variants of one single-item workflow. The user challenged that model: technical transfer should review the whole development case or design-change case, not an isolated drawing or part.

This decision matters because a single part can look complete while the package is not ready for manufacturing, procurement, QA/QC, cost control or field use. The system must prevent false transfer readiness without making small one-item design changes impossible to process.

## Decision

Adopt the following rules:

1. `研發送審` and `技術移轉送審` are separate submission modes.
2. `技術移轉送審` uses a transfer package as the review unit, not a direct single drawing or single part submission.
3. A transfer package must have package context, case type and development-case or design-change reason.
4. If a real case has only one affected controlled item, the package may contain one item only when the submitter declares `no other affected items`.
5. A one-item transfer package still cannot be approved until the reviewer confirms the package scope.
6. Technical-transfer required blockers cannot be bypassed through a missing-required-data exception.
7. After technical-transfer readiness passes, Manufacturing, Procurement and `QA/QC` sign off according to the applicable rule matrix and package content.
8. Research submission may carry an allowed exception reason into review, but the exception is not approved by the submitter reason alone.
9. A research exception must be approved or rejected by the reviewer or supervisor during review before final approval.
10. The versioned submission rule matrix remains the authority for whether a field is `required`, `warning`, `optional` or `not_applicable`.
11. `ApprovedForTransfer` creates a controlled transfer package and does not directly release drawing, part or root master records.
12. Formal release after transfer approval is a separate RD Manager/Admin action through the existing release workflow, item-by-item or by package batch.
13. The rule matrix determines which sign-off roles apply. Applicable roles must sign; not-applicable sign-off must be rule-derived or recorded by RD Manager/Admin with reason and audit.
14. Package item or readiness-driving data changes invalidate the current readiness snapshot and affected sign-offs. The package must return to correction/data-collection state and be re-resolved before approval.
15. Existing system role name `QA/QC` is used for quality sign-off in data/API contracts; UI may show `品保`.
16. Integer major version belongs to the immutable transfer-package baseline. Controlled parts, formal subassemblies and top assembly keep independent revisions; the baseline stores exact revisions and file hashes without promoting all items together.
17. Opening the transfer-package create route does not create data. A persistent Draft and stable package ID are created only after the user supplies the required package header and explicitly selects `建立技轉包`.
18. Technical-transfer workbench, intake, mapping, BOM and baseline delivery is tracked as child delivery `DEV-041`; `DEV-005` remains complete for Phase 1 and parent submission-gate governance.
19. Path preservation is not openability evidence. Before formal submit, a designated RD/CAD verifier must open the exact materialized candidate configuration on a real SolidWorks workstation and record the baseline/configuration hash, SolidWorks version, result, missing-file/reference result, actor and time. This gate does not require an Add-in.
20. One transfer package may govern multiple top assemblies. Every governed top assembly is explicitly selected and must have complete configuration/readiness evidence.

Pending amendment decisions:

- How a design-change package with a smaller scope derives a new complete effective configuration from an earlier approved baseline.
- Whether a multi-top package is approved atomically or may be partially approved per top assembly.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Direct single drawing/part technical transfer | Rejected | Creates false readiness and misses package-level BOM, cost, manufacturing, procurement and QA/QC effects. |
| Require at least two affected items for every technical-transfer package | Rejected | Too rigid for real small design changes that affect only one controlled item. |
| Allow one-item transfer package with declaration and reviewer confirmation | Accepted | Preserves package governance while allowing real one-item cases. |
| Allow missing-required transfer exception | Rejected | Conflicts with the user's selected hard-block transfer policy. |
| Complete all required data first, then collect applicable sign-offs | Accepted | Separates readiness completeness from cross-department accountability. |
| Research exception approved by submitter reason alone | Rejected | Too weak for audit and accountability. |
| Research exception requested by submitter and approved during review | Accepted | Preserves RD speed while keeping reviewer/supervisor accountability. |
| `ApprovedForTransfer` automatically releases master records | Rejected | Conflates transfer readiness with formal lifecycle release and bypasses existing release transaction rules. |
| `ApprovedForTransfer` creates release-ready controlled package; RD Manager/Admin triggers existing release workflow separately | Accepted | Keeps handoff and formal release auditable while supporting package-based release work. |
| All packages always require Manufacturing, Procurement and QA/QC sign-off | Rejected | Overblocks cases where a role is irrelevant. |
| Rule matrix decides sign-off applicability with reasoned not-applicable state | Accepted | Balances speed and accountability. |
| Any package change cancels the whole package | Rejected | Too expensive for normal correction. |
| Package change invalidates readiness and affected sign-offs | Accepted | Preserves correction ability while preventing stale approval reuse. |
| Force every package item to the same integer revision | Rejected | Breaks independent item lifecycle and creates unnecessary revisions when only one part changes. |
| Integer package baseline with exact independent item revision/hash snapshots | Accepted | Preserves a reproducible assembly configuration without rewriting child masters. |
| Auto-create Draft when `/transfer-packages/new` opens | Rejected | Produces empty packages and audit noise from navigation or refresh. |
| Explicit create after required case header, then stable package ID | Accepted | Supports return context and resumable work without accidental records. |
| Keep all unfinished Phase 3 work hidden below completed `DEV-005` | Rejected | Makes PM/RD dispatch and product-completion status misleading. |
| Track Phase 3 delivery as child `DEV-041` | Accepted | Preserves Phase 1 completion evidence while making future product delivery visible. |
| Treat path preservation as sufficient SolidWorks evidence | Rejected | Relative paths and hashes do not prove native references resolve on a real workstation. |
| Require real-machine open verification of the exact candidate configuration before submit, without requiring an Add-in | Accepted | Preserves a web-first intake while making CAD usability verifiable. |
| Restrict every package to exactly one top assembly | Rejected | Does not fit cases where one transfer decision governs several related top assemblies. |
| Allow multiple explicitly governed top assemblies in one package | Accepted | Supports project-level transfer while retaining root-level evidence. |

## Consequences

Positive:

- Technical transfer no longer creates false readiness from an isolated part or drawing.
- Small one-item changes remain possible through a controlled package and scope confirmation.
- Required-data policy is easier to test because technical transfer has no missing-required exception branch.
- Research can stay fast without making exceptions invisible or unaudited.
- Manufacturing, Procurement and `QA/QC` sign-off becomes explicit after readiness, not a hidden blocker override.
- Transfer approval no longer risks silently changing master lifecycle state.
- Package corrections can be handled without creating a new package, while stale evidence is blocked.
- A single part can revise independently; the package creates a new baseline only when the captured configuration changes.
- Opening or refreshing the creation surface does not create empty records.
- DEV status separates completed Phase 1 evidence from future transfer-package delivery.
- Formal submit now requires evidence that the exact resulting configuration, not merely the uploaded ZIP, opens in SolidWorks without missing references.
- Multi-top packages require root-level completeness/readiness evidence and a pending decision on atomic versus partial approval.

Costs / tradeoffs:

- The first transfer-package implementation needs scope declaration and reviewer confirmation state.
- QA must test both direct single-item denial and one-item package approval.
- Research submission needs explicit exception request and decision records.
- Transfer package approval needs applicable-role sign-off records or equivalent auditable state.
- Implementation must compute package item-set/readiness hashes and sign-off dependency hashes.
- Implementation must create release work items without directly mutating master lifecycle records.
- Baseline confirmation needs a concurrency-safe next-major allocator and immutable baseline item/file snapshots.
- The first workbench slice must add explicit create persistence and stable return context; a purely query-string placeholder no longer satisfies Phase 3A-0.

## Migration / Compatibility Impact

- Existing research and drawing-source review records remain valid.
- Existing item-origin entry points may still launch technical transfer, but they must route into package context and cannot create direct technical-transfer submissions.
- Additive schema is expected for transfer package scope declaration, exception review decisions and applicable sign-offs.
- Additive schema is expected for idempotency keys, item-set/readiness hashes, sign-off dependency hashes and stale invalidation metadata.
- Additive schema is expected for transfer-package baselines and baseline item/file snapshots. Baseline major is unique within a package and does not replace item revision fields.
- Existing item revisions and master lifecycle values are not migrated, renumbered or synchronized by this amendment.
- `ApprovedForTransfer` is compatible with existing release-master-status synchronization because formal release still goes through the existing release workflow.
- Production migration, production deploy, direct data repair, historical backfill and release artifacts are not authorized by this ADR.

## Superseded / Amended Documents

This ADR amends:

- `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
- `.ai-doc/qa/qa-pdm-submission-gate-research-transfer-package-validation-plan-2026-07-07.md`
- `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
- `.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`
- `.ai-doc/dev_task.md`
- `.ai-doc/documentation_map.md`

This ADR is compatible with:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

## Enforcement

RD must not mark implementation complete until:

- Direct technical-transfer submission from a drawing or part is blocked.
- Item-origin technical transfer creates or opens a transfer package and pre-adds the selected item.
- One-item transfer package submit requires `no other affected items` declaration.
- One-item transfer package approval requires reviewer scope confirmation.
- Technical-transfer missing-required blocker override attempts are denied and audited.
- Research exception reason can be requested by submitter but cannot final-approve without reviewer or supervisor decision.
- Applicable Manufacturing, Procurement and `QA/QC` sign-offs are captured before `ApprovedForTransfer`.
- `ApprovedForTransfer` does not set any drawing, part or root record to `Released / Release`.
- RD Manager/Admin can create formal release work items from an approved transfer package, and those work items use existing release workflow rules.
- Package item changes and readiness-driving master-data changes invalidate stale readiness snapshots and affected sign-offs.
- Readiness snapshots capture rule-set version and package scope.
- Opening `/transfer-packages/new` performs no write; explicit create produces one idempotent persistent Draft and stable package ID.
- Each confirmed baseline has a positive package-scoped integer and immutable exact item revision/file-hash snapshot.
- Baseline confirmation does not mutate or synchronize controlled item revisions or lifecycle states.
- QA covers direct single-item denial, one-item package declaration, missing-required transfer override denial, research exception pending/approved/rejected paths, applicable sign-offs, stale invalidation and transfer-approval-vs-release separation.

This ADR does not authorize product implementation, schema migration, production deploy, direct DB mutation, data repair, merge, PR, rollback or release.
