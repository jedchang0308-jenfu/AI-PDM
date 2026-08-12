# QA-DEV-067：PDM 統一實體明細、審核全景與送審鎖定驗證計畫

Status: `Ready for RD execution / QA plan approved by contract / Implementation evidence not yet captured / Production release gated`
Date: 2026-08-12
Owner: QA
Related DEV: `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`
Authority: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`（DEV-067 RD Implementation Contract）
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`

## 1. Objective and quality boundary

This plan verifies that Drawing, Part and Relation use one visible detail composer and the same domain projections across candidate/formal/history/review contexts, while preserving domain data/command authority. It also verifies that an assigned reviewer receives a server-scoped full aggregate over the same locked owner data and returns to the original approval inbox state.

This is not a visual-similarity test. PASS requires all four evidence classes:

1. source/DOM evidence proves one composer and one projection implementation per domain;
2. network/API evidence proves restricted payload is omitted, not hidden;
3. DB/HTTP concurrency evidence proves active-review writes fail closed inside the mutation transaction;
4. authenticated real-browser evidence proves preview, action, return, scroll, keyboard and responsive behavior.

No test in this plan authorizes production/staging access, live migration/data repair, merge, PR, deploy or release.

## 2. Roles and handoff

- **RD** implements Phase 1A -> 1D and records self-check evidence after each exit gate. RD fixes implementation defects and does not mark a blocked browser case as PASS.
- **QA** owns this plan, fixtures, risk coverage, expected outcomes and evidence completeness. QA does not lower server-security acceptance to DOM checks.
- **QC** independently executes the agreed cases after RD handoff, records facts and defects, and does not modify product code during fact validation.
- Any P0/P1 failure returns to RD. DEV-067 is not locally complete until re-test evidence passes.

## 3. Test surfaces and actors

Routes:

- `/numbering/drawings`
- `/parts`
- `/numbering/search`
- `/approvals`
- `GET /api/pdm/entity-details/[entityKey]`
- covered owner media routes and mutation routes
- existing approval decision/withdraw/retry routes

Actors:

- candidate/draft owner with normal edit permissions;
- Drawing-only reader;
- Part/Relation reader;
- exact assigned reviewer;
- reviewer-role user who is not assigned/eligible for this request;
- request submitter attempting self-approval where existing policy disallows it;
- PDM Admin recovery actor;
- same-role user from another company fixture;
- expired/unauthenticated session.

Providers:

- local SQLite real-operation fixture is mandatory for RD/QA local completion;
- provider-neutral counting/fault client must exercise PostgreSQL `REPEATABLE READ READ ONLY` and transaction contracts;
- disposable non-production PostgreSQL semantic/concurrency evidence is required before release, but lack of external PostgreSQL credentials does not authorize weakening local tests or production release.

## 4. Required fixture inventory

| Fixture | Required facts |
|---|---|
| `F-DRAW-CANDIDATE` | one active `candidate:{workspaceId}`, one 3D source, one 2D source, queued preview, linked Parts |
| `F-DRAW-FORMAL` | one `drawing:{id}`, ready non-fake 3D derivative, ready 2D, revision/attachment history, linked Parts |
| `F-DRAW-MISSING` | latest canonical revision has no previewable 3D while an older revision does; must remain missing |
| `F-PART-FORMAL` | one `part:{id}`, attributes/documents/shared-model summary and multiple linked Drawings |
| `F-ROOT-FORMAL` | one `root:{id}`, multiple Drawings/Parts/links, relation blocker and active change |
| `F-BUNDLE-REVIEW` | active `numbering.candidate_bundle_review`, exact workspace primary target, 1/20/50 target variants, locked owner rows |
| `F-REV-REVIEW` | active `numbering.drawing_revision_lifecycle_review`, exact reviewer assignment and locked package/revision/files |
| `F-LEGACY-NUMBERING` | each covered formal numbering action resolves to Drawing/Part/Relation owner route |
| `F-TERMINAL` | approved, rejected/returned, cancelled and apply-failed requests |
| `F-DRIFT` | snapshot hash or reviewed row version intentionally differs from current aggregate |
| `F-CROSS-COMPANY` | same-looking entity/request codes in another company |
| `F-AMBIGUOUS` | multi-target request spans two roots and has no canonical aggregate |
| `F-FAILURE` | injected Drawing, Part, Relation, preview, request-detail and decision failures |

All fixtures record canonical IDs, typed entity key, company, request targets, row versions, file hashes and expected owner href. Credentials, session cookies, storage keys and file bytes must not be copied into evidence.

## 5. FMEA and preventive controls

Severity/Occurrence/Detection use 1-5; RPN = S x O x D. RPN >= 30 is P0/P1 gate coverage.

| ID | Failure mode / cause | Effect | S/O/D | RPN | Mandatory detection / prevention |
|---|---|---|---:|---:|---|
| FMEA-01 | candidate/formal/review continue mounting separate bodies | fixes drift; reviewer misses preview/data | 5/4/4 | 80 | source scanner + one DOM marker + same component identity across contexts |
| FMEA-02 | API returns full payload then client hides it | unauthorized files/fields leak | 5/3/5 | 75 | network field allowlist/negative tests; no object spread from full to summary |
| FMEA-03 | `reviewRequestId` or role label grants review full view | cross-request/company privilege escalation | 5/3/5 | 75 | exact assignment/company/active/target negative matrix |
| FMEA-04 | snapshot body remains visible object truth | submitter/reviewer display diverges | 5/4/4 | 80 | approval body removal scanner; no raw snapshot JSON; hash/evidence-only projection |
| FMEA-05 | lock is checked before, not inside, mutation transaction | reviewed content changes after snapshot | 5/3/5 | 75 | barrier-based concurrency tests for submit/write interleavings |
| FMEA-06 | one mutation route misses the common guard | direct HTTP bypass succeeds | 5/4/4 | 80 | route/command inventory + direct tests per mutation family |
| FMEA-07 | projection components fetch independently | mixed-time partial truth or N+1 | 5/4/4 | 80 | one-snapshot spy, request count, 1/20/50 constant query counts |
| FMEA-08 | file existence is projected as preview ready | false preview state and permanent placeholder | 4/4/4 | 64 | queued/running/delayed/failed/missing resolver parity cases |
| FMEA-09 | review media keeps approval-only route | preview differs from owner flow | 4/4/4 | 64 | network route assertion and identical preview state/wording screenshots |
| FMEA-10 | first target is guessed as aggregate | incomplete/wrong decision scope | 5/3/4 | 60 | canonical resolver table; ambiguous two-root fixture must fail closed |
| FMEA-11 | several projections render primary CTA/footer | contradictory next step | 4/4/3 | 48 | exactly one primary descriptor/DOM action bar |
| FMEA-12 | unsafe `returnTo` accepted | open redirect or wrong-context navigation | 5/3/4 | 60 | external/protocol-relative/control-char/path negative tests |
| FMEA-13 | partial projection error appears as complete detail | reviewer decides without evidence | 5/3/5 | 75 | injected dependency failures return aggregate 503 and disabled decision |
| FMEA-14 | nested scroll/focus/Escape ownership | drawer unusable, modal closes incorrectly | 4/4/3 | 48 | four viewport + keyboard + nested confirmation evidence |
| FMEA-15 | stale async response replaces new selection | wrong entity shown under selected row | 5/3/4 | 60 | delayed response race test with entity key + sequence token |
| FMEA-16 | flag-on error silently falls back to legacy body | dual truth hidden by rollback logic | 5/3/4 | 60 | injected error shows unified recovery only; no second body marker |
| FMEA-17 | submit and write lock owners in different order | deadlock or race bypass under concurrency | 5/3/5 | 75 | shared canonical scope lock, fixed owner/ID order, timeout/deadlock concurrency tests |

## 6. Phase 1A — contract, policy, read facade

Planned scripts:

- `scripts/qc-dev-067-unified-entity-contract.mjs`
- `scripts/qc-dev-067-projection-policy.mjs`
- `scripts/qc-dev-067-query-budget.mjs`
- package scripts `qc:dev-067:contract`, `qc:dev-067:policy`, `qc:dev-067:query`

| Case | Priority | Procedure | PASS result / evidence |
|---|---:|---|---|
| `UDD-001` | P0 | compile discriminated envelope and invalid key fixtures | only four key prefixes accepted; omitted projection has no data variant |
| `UDD-002` | P0 | Drawing surface policy with candidate/formal/history | Drawing full, Part/Relation summary, Review absent |
| `UDD-003` | P0 | Part surface policy | Part full; Drawing summary has no file/revision/source asset fields; Relation summary |
| `UDD-004` | P0 | Relation surface policy | Drawing/Part/Relation full; Review absent |
| `UDD-005` | P0 | verified active review policy | four full projections, exact target anchors, one atomic decision boundary |
| `UDD-006` | P0 | tamper surface/review ID/target/company | no elevation; 403/404/409 per contract; no hidden identity leak |
| `UDD-007` | P0 | inspect summary response recursively | prohibited full fields and storage identifiers are absent from JSON and transfer size |
| `UDD-008` | P0 | spy snapshot client across projection readers | one outer snapshot; no nested transaction/HTTP self-call/component fetch |
| `UDD-009` | P1 | 1/20/50 linked items/targets | Drawing <=16, Part <=16, Relation <=24, Review <=28; counts constant |
| `UDD-010` | P1 | delay old detail response then select another row | stale response ignored; entity/header/body remain same key |
| `UDD-011` | P0 | inject required projection read failure | aggregate 503, no partial success, decision unavailable |
| `UDD-012` | P1 | zero-write hash/count around all detail GETs | no DB/file/event/outbox writes except an explicit preview enqueue request |

Phase 1A exit: `UDD-001..012` PASS, typecheck PASS, no unresolved P0/P1 payload/authority/query gap.

## 7. Phase 1B — composer, projections and preview parity

Planned scripts:

- `scripts/qc-dev-067-unified-drawer-ui.mjs`
- `scripts/qc-dev-067-preview-parity.mjs`
- package scripts `qc:dev-067:ui`, `qc:dev-067:preview`

| Case | Priority | Procedure | PASS result / evidence |
|---|---:|---|---|
| `UDD-013` | P0 | open every candidate/formal/history target from three workbenches | exactly one unified drawer marker; no parallel body/footer |
| `UDD-014` | P0 | scan composer source | no action-code/domain lifecycle giant conditional; fixed registry order only |
| `UDD-015` | P0 | compare Drawing projection in Drawing/Relation/review | same component marker/section IDs/preview resolver; only policy/capability differs |
| `UDD-016` | P0 | compare Part and Relation projections across routes | one domain-owned implementation each; no duplicated owner field/body |
| `UDD-017` | P1 | transition candidate from building -> ready -> review | drawer instance/key/selected row remain; projection and action model refresh in place |
| `UDD-018` | P0 | queued -> running -> ready preview | visible progress, 2.5s one-in-flight refresh, media auto-appears without manual reload |
| `UDD-019` | P0 | delayed/failed/unavailable/missing preview | exact state/Now What/retry wording; no file-exists-to-ready shortcut |
| `UDD-020` | P0 | latest revision missing but older revision ready | latest remains missing; no fallback to stale older preview |
| `UDD-021` | P0 | fake/stale/hash-mismatch derivative | never ready; original remains governed/downloadable when authorized |
| `UDD-022` | P1 | all projections present and secondary sections collapsed | fixed relative order; anchors list only present sections; full content remains reachable |
| `UDD-023` | P1 | inspect action contributions | one primary CTA/action bar; projection local links do not compete |
| `UDD-024` | P1 | flag-on projection failure | unified recovery remains mounted; no legacy drawer fallback/dual render |

Phase 1B exit: `UDD-013..024` PASS plus existing entity drawer, Drawing workbench, Part/Relation and master-attachment focused regressions.

## 8. Phase 1C — review owner route, scoped capability, lock and return

Planned scripts:

- `scripts/qc-dev-067-review-scope.mjs`
- `scripts/qc-dev-067-review-lock.mjs`
- `scripts/qc-dev-067-navigation.mjs`
- package scripts `qc:dev-067:review`, `qc:dev-067:lock`, `qc:dev-067:navigation`

| Case | Priority | Procedure | PASS result / evidence |
|---|---:|---|---|
| `UDD-025` | P0 | run every covered action through owner resolver | exact path + typed key from stored target/aggregate; no first-target/title guess |
| `UDD-026` | P0 | exact assigned reviewer opens active request | full aggregate + review context; same owner rows/hashes as submitter view |
| `UDD-027` | P0 | unassigned reviewer, terminal request, wrong target, cross-company | no full payload/media/decision; generic safe recovery |
| `UDD-028` | P0 | requester self-approval/delegation/project scope variants | matches existing decision authority exactly; read receipt does not weaken it |
| `UDD-029` | P0 | drift row version/file hash/target membership | evidence shows mismatch; decision disabled and direct decision returns 409 |
| `UDD-030` | P0 | ambiguous two-root targets | resolver returns `PDM_REVIEW_AGGREGATE_AMBIGUOUS`; no owner guess or decision |
| `UDD-031` | P0 | inspect review UI/network | no Approval drawing body, evidence preview body, raw snapshot JSON or approval-only file route |
| `UDD-032` | P0 | direct active-review write per matrix family | every reviewed field/file/relation route returns 409; no row/file/event side effect |
| `UDD-033` | P0 | coordinate submit and write with DB barriers in both orders | at most one legal result; snapshot never fixes while an unaccounted write commits |
| `UDD-034` | P0 | preview enqueue/read/download during lock | unchanged source allowed and scoped; mutation remains blocked; unauthorized media denied |
| `UDD-035` | P0 | withdraw/return then edit/resubmit | unlock is atomic with lifecycle transition; fresh snapshot/hash/request created as existing flow requires |
| `UDD-036` | P0 | approve/apply-failed/retry/cleanup | existing idempotency and lock semantics retained; no duplicate decision/publication |
| `UDD-037` | P0 | malicious return targets (`https:`, `//`, control chars, non-approvals path) | rejected/fallback `/approvals`; no open redirect |
| `UDD-038` | P1 | close, Back, approve, return/reject from filtered inbox | original status/domain/action/query/selection returns and affected row refreshes |
| `UDD-039` | P1 | 401/403/404/stale owner target | action-first Traditional Chinese state and safe return; no raw error/identity leak |

`UDD-033` must also run two concurrent multi-target submits and a relation-write versus bundle-submit case with reversed arrival order. Both commands must acquire `workspace -> root -> drawing -> part -> revision -> attachment/relation`, lexical ID order; there is no deadlock/timeout, and at most one semantically conflicting mutation succeeds.

Phase 1C exit: `UDD-025..039` PASS and approval/lifecycle/number-state existing decision regressions PASS.

## 9. Phase 1D — real-browser UX, accessibility and regression

Planned script/package:

- `scripts/qc-dev-067-browser.mjs`
- `qc:dev-067:browser`
- aggregate `qc:dev-067`

Required authenticated Chromium viewports:

- `1440 x 900`
- `1024 x 768`
- `768 x 1024`
- `390 x 844`

| Case | Priority | Procedure | PASS result / evidence |
|---|---:|---|---|
| `UDD-040` | P0 | Drawing/Part/Relation/review screenshot matrix | same header/order/geometry/action grammar; correct domain reduction/full view |
| `UDD-041` | P1 | resize, long labels, 1/20/50 targets, sticky action bar | no crop/overlap/horizontal overflow/double scrollbar; one body scroll owner |
| `UDD-042` | P1 | Tab/Shift+Tab/Enter/Space/arrow list navigation | logical focus order, visible focus, operable controls, no keyboard trap |
| `UDD-043` | P1 | Escape with drawer and nested confirmation | Escape closes topmost confirmation first, then drawer; focus restores to source row |
| `UDD-044` | P1 | screen-reader semantics | complementary/dialog semantics as designed, labelled header/sections, live progress/error, disabled reason exposed |
| `UDD-045` | P1 | 5-second identity test | actor identifies object, status, review responsibility/lock and next action without scrolling |
| `UDD-046` | P1 | Visible Text Noise sweep in normal usable states | no redundant tutorial, internal IDs/raw states/JSON/transport errors; blocked states retain Now What |
| `UDD-047` | P0 | browser console/network/visible-error sweep | no React/runtime/network loop error, failed header encoding, raw English error or stale media leak |
| `UDD-048` | P1 | rapid row switching, browser Back/Forward, refresh | URL, selected row, drawer entity and history stay synchronized |
| `UDD-049` | P1 | flag off/on isolated sessions | off restores current path; on never dual-renders; no schema/data rollback required |
| `UDD-050` | P0 | full focused regression and isolated build | all required suites/typecheck/affected lint/build pass; no P0/P1 open defect |

## 10. Critical workflow inventory

QA/QC must record one full evidence chain for each workflow:

1. Owner creates/edits candidate -> uploads Drawing files -> preview queues and appears -> submits -> owner data locks.
2. Assigned reviewer enters `/approvals` -> owner module -> full aggregate -> target anchor -> preview -> decision -> returns to exact inbox state.
3. Reviewer returns/rejects -> owner sees correction reason -> edits after atomic unlock -> resubmits -> reviewer sees fresh request/hash.
4. Approval apply fails -> same reviewed scope remains locked -> authorized retry succeeds idempotently.
5. Formal Drawing/Part/Relation opens from its own module and relation module with the same domain projections and different allowed depth only.
6. Unassigned/cross-company/terminal/tampered review context cannot read full fields, media or decisions.
7. Projection/provider/preview failures show one recovery state and never a second drawer or partial decision view.

## 11. Visible Text Noise and Now What gate

Normal usable screens should show identity, status, relevant content and action without repeated explanatory paragraphs. Technical keys, source labels, raw lifecycle/status codes, snapshot JSON, storage/provider details and transport text are forbidden in the visible primary path.

Blocked/error/terminal screens must answer:

- what happened in human language;
- whether data/file is preserved;
- who is responsible next;
- exactly one safe next action.

Every screenshot is reviewed for these rules. Hiding text with CSS does not satisfy security or noise acceptance if it remains in the response/DOM.

## 12. Required commands and regressions

RD adds these package scripts during implementation:

```text
qc:dev-067:contract
qc:dev-067:policy
qc:dev-067:query
qc:dev-067:ui
qc:dev-067:preview
qc:dev-067:review
qc:dev-067:lock
qc:dev-067:navigation
qc:dev-067:browser
qc:dev-067
```

The aggregate must include the above plus:

```powershell
npm.cmd run typecheck
npm.cmd run qc:pdm-entity-detail-drawer
npm.cmd run qc:dev-053
npm.cmd run qc:dev-062
npm.cmd run qc:dev-064-unified-drawing-aggregate
npm.cmd run qc:dev-061
npm.cmd run qc:pdm-approval-platform
npm.cmd run qc:pdm-number-state-flow-request-equivalence
npm.cmd run build:isolated
```

Run affected lint against actual modified product/scripts rather than accepting unrelated repository-wide dirty failures. Any known unrelated failure is captured separately with command, timestamp and scope proof; it does not convert an unrun DEV-067 case to PASS.

## 13. Evidence package

Write artifacts under:

```text
output/qc-dev-067-unified-pdm-entity-detail/{run-id}/
├─ manifest.json
├─ environment.json
├─ commands/
├─ contract-policy/
├─ network/
├─ db-lock-concurrency/
├─ query-budget/
├─ browser/
│  ├─ 1440x900/
│  ├─ 1024x768/
│  ├─ 768x1024/
│  └─ 390x844/
├─ accessibility/
├─ console-network/
└─ result.json
```

`manifest.json` records commit/worktree fingerprint, branch, feature flags, DB provider, fixture IDs, actor IDs as non-secret aliases, command versions and artifact hashes. `result.json` records every `UDD-*` case as PASS/FAIL/BLOCKED with direct evidence paths. BLOCKED requires the exact missing external condition and remains incomplete.

## 14. Pass/fail and stop rules

PASS requires:

- `UDD-001..050` all PASS;
- no open P0/P1 defect or unresolved security/transaction/query/preview/navigation gap;
- one composer/projection path in every covered enabled flow;
- server payload/permission/lock evidence, not UI assertions alone;
- all four viewport and keyboard/accessibility evidence;
- focused regressions and isolated build PASS.

Stop and return to Dev PM if implementation needs schema/RLS/global reviewer permission changes, a new cross-domain data owner, snapshot-derived visible object truth, an approval-only preview/detail body, more than one canonical aggregate for one decision, relaxed review lock, production/staging/data repair/deploy/release, or cannot meet the hard query/one-snapshot contract.

## 15. Current result

`PLANNED`. The specification and case matrix are ready for RD execution. No product implementation or `UDD-*` runtime/browser evidence has been claimed in this documentation turn.
