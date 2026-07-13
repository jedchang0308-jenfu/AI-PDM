# QA Plan - PDM 技轉包工作台與 Pack-and-Go 組合分類

Spec: `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
DEV: `DEV-041` / `DEV-PDM-TRANSFER-PACKAGE-INTAKE-001`
Parent DEV: `DEV-005` / `DEV-PDM-SUBMISSION-GATE-001`
Status: Phase 3A-0 QA Passed 2026-07-13; Phase 3A-1 to 3C QA Contract Ready / Not Requested This Turn
Created: 2026-07-10
Updated: 2026-07-13

## 1. Objective And Verification Boundary

Validate a package-centric technical-transfer flow that:

- creates no data merely by opening `/transfer-packages/new`
- creates one persistent Draft and stable package ID only after explicit `建立技轉包`
- reuses existing drawing, part, BOM, attachment and approval modules through adapters
- preserves original Pack-and-Go bytes and relative paths without overclaiming SolidWorks openability
- treats system classification as a suggestion and human decisions as authoritative
- creates immutable integer package baselines while keeping every controlled item's revision independent
- blocks baseline, readiness and review when required identities, mapping or BOM are incomplete
- preserves company scope, permission, audit, idempotency and stale-state controls
- requires real-machine SolidWorks open evidence for the exact materialized candidate configuration before formal submit
- supports multiple explicitly governed top assemblies in one package without confusing package scope with a single root

This plan does not authorize product implementation, schema migration, live Supabase changes, production deployment or release.

## 2. Human Decisions Under Test

| Decision | Required observable behavior |
|---|---|
| Intake `1B` | upload creates Transfer Intake only; no integer baseline or release |
| Intake `2A` | original ZIP and relative paths are preserved; no Add-in dependency or false openability claim |
| Intake `3A` | every classification can be changed by a permitted human and survives re-parse |
| UX `1B` | one transfer-package workbench; no standalone subtask page sprawl |
| UX `2B` | adapter summaries and deep links; heavy edit remains in owner modules |
| UX `3B` | first slice delivers persistent workbench shell and blockers without parser |
| RD `1A` | baseline major belongs to package; child item revisions are not synchronized or mutated |
| RD `2A` | GET/open is read-only; explicit create produces the stable Draft ID |
| RD `3A` | work is tracked under child delivery `DEV-041`; Phase 1 evidence remains under `DEV-005` |
| RD re-review `1A` | exact materialized candidate configuration must pass real SolidWorks open/missing-reference verification before formal submit; no Add-in is required |
| RD re-review `2B` | one package may contain multiple top assemblies; every governed root has explicit scope and complete evidence |
| Design-change `1A` | later change uses a new delta package, inherits immutable prior evidence and creates complete candidates; approved package remains terminal |
| Multi-top `2A` | all governed roots approve atomically; staged roots require separate packages |
| Assembly-impact annotation | system suggests; human decides `no_change`, `defer` or `update`; impact status does not overwrite master lifecycle |
| Lane isolation | development decimal changes affect only development configurations; formal integer changes affect only formal configurations |
| Formal defer `1C` | only compatible, non-critical, sufficiently evidenced impacts with R&D Manager reason, owner, due date and follow-up may defer; all others block |
| Visible-state simplification | verified `no_change` shows `不需進版`; internal defer/update states both show only `已非最新版 / 待更新` |
| Suggestion authority `1A` | deterministic versioned resolver only; stable rule IDs/reasons/input hash; no AI/LLM/network call |
| Formal no-change `2B` | every formal no-change requires R&D Manager approval after exact candidate/SolidWorks evidence |
| Follow-up integration `3A` | canonical transfer follow-up owns due time and projects into existing task center; no standalone page/global task due-date change |

## 3. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| Opening create page writes an empty package | GET side effect or eager client mutation | empty Draft clutter and misleading audit | record-count/API spy before/after open/refresh | P0 | no-write GET test and browser refresh test |
| Duplicate create produces two packages | missing idempotency/concurrent submit guard | split scope and duplicate review | parallel same-key API test | P0 | unique action key and transaction test |
| Package baseline forces every child revision | version ownership misunderstood | unnecessary revisions and broken where-used history | compare item revisions before/after baseline | P0 | baseline immutability/item non-mutation test |
| Incomplete manual BOM passes baseline | file preview treated as BOM | manufacturing/procurement receives false structure | attempt baseline with preview only | P0 | hard blocker and canonical-source assertion |
| Formal subassembly has no controlled identity | candidate flag mistaken for identity | BOM/release cannot trace the assembly | baseline attempt with unresolved formal assembly | P0 | controlled identity gate |
| Cross-company package is readable/writable | missing server/RLS company predicate | confidential CAD leakage | second-company API/DB policy test | P0 | 404/403 and no data mutation |
| Unsafe ZIP reaches parser/storage truth | traversal, symlink or decompression bomb not blocked | host/storage compromise or outage | malicious fixture matrix | P0 | streaming safety limits and fail-closed test |
| Storage object remains after DB failure | missing compensation | orphaned confidential file | inject commit and delete failures | P1 | orphan audit/retry evidence |
| Re-parse overwrites human decision | suggestion/effective state conflated | engineer's classification silently lost | override then re-parse | P0 | generation and human-authority test |
| Flat ZIP is accepted as path-preserved | weak path evidence | SolidWorks references may break | flat fixture without trusted sidecar | P1 | `unverified_flat` hard blocker |
| UI claims SolidWorks can open | wording overstates evidence | false confidence at transfer | visible text sweep | P0 | forbidden-copy assertion |
| Workbench duplicates BOM/approval logic | adapter boundary ignored | divergent behavior and maintenance cost | route/source/API ownership audit | P1 | canonical owner contract check |
| Deep edit loses package context | no stable ID/return contract | user cannot resume blocker | BOM/drawing/part return flow | P1 | return-context browser test |
| Adapter shows zero/ready when unavailable | placeholder coerced to success | user believes transfer is complete | capability fixture and counter sanity | P1 | explicit `unavailable` state test |
| Required sign-off role exists only in UI text | auth/access model not extended | unauthorized or impossible approval | role/API/assignment test | P0 for 3C | access-control entry gate |
| Development upload marks formal assembly stale | impact lookup crosses revision lanes | released configuration appears invalid without formal change | dev-child revision fixture with formal where-used | P0 | strict same-lane query and no-formal-write assertion |
| System automatically revisions every parent assembly | suggestion treated as command | revision noise and RD rework | impact candidate fixture | P0 | human-decision and canonical allocator gate |
| `no_change` silently ignores new child revision | assembly-file decision conflated with configuration content | candidate does not represent intended design | no-change rebuild fixture | P0 | complete candidate/hash/open-verification assertion |
| `已非最新版` overwrites Released/Obsolete status | impact and lifecycle state conflated | broken release/workflow reporting | lifecycle before/after assertion | P0 | separate alignment-status storage |
| One root commits in failed multi-top package | non-atomic configuration transaction | partial technical-transfer truth | injected second-root failure | P0 | all-or-none transaction test |
| Formal defer passes without compatibility/manager/follow-up | defer treated as unrestricted exception | incompatible part may be released while assembly remains unsafe | negative eligibility matrix | P0 | fail-closed defer gate |
| UI exposes internal defer/in-progress state vocabulary | implementation state leaks into task UI | RD sees unnecessary status complexity | DOM/text sweep | P1 | one visible stale badge contract |
| Failed/replaced upload becomes ambiguous current intake | no atomic current pointer/supersession | baseline uses wrong package bytes | upload failure and re-upload fixture | P0 | same-package current-pointer transaction test |
| Cancellation deletes evidence or reopens approved package | cancel implemented as hard delete/reset | audit history and approved truth are lost | lifecycle/API negative test | P0 | terminal soft cancellation and preserved-evidence assertion |
| Suggestion changes between identical runs | non-pure resolver, unordered rules or hidden AI dependency | engineers receive inconsistent impact advice | repeat/snapshot/network-spy test | P0 | deterministic byte-equivalent output and zero external calls |
| Formal no-change finalized by assembly owner | formal manager gate missing | high-impact parent revision avoidance lacks accountability | permission matrix test | P0 | R&D Manager-only approval endpoint |
| Follow-up exists but task projection is missing/duplicated | non-idempotent cross-domain sync | deferred work becomes invisible or noisy | outbox failure/retry fixture | P0 | canonical follow-up plus one projection and visible pending state |

## 4. Test Data And Fixtures

### 4.1 Workbench Fixtures

- source drawing with valid company scope
- source part with valid company scope
- same source ID in another company or an inaccessible company fixture
- package header with title, case type, reason and owner
- package header with no external source reference plus explicit not-available reason
- existing BOM submission/draft that can be deep-linked
- existing attachment owner and approval-platform item for adapter summaries
- fixtures where adapter domain is unavailable, empty, blocked and ready

### 4.2 Archive Fixtures

- `packgo-valid-simple.zip`: one top `.sldasm`, two `.sldprt`, one drawing/export, relative folders preserved
- `packgo-valid-subassembly.zip`: top, formal candidate and transient candidate
- `packgo-flat-unverified.zip`: all files root-level, no trusted proof
- `packgo-duplicate-case-conflict.zip`: paths differ only by case/normalization
- `packgo-traversal.zip`: `../`, absolute, drive or UNC entry
- `packgo-symlink.zip`: link/reparse entry
- `packgo-encrypted.zip`: encrypted entry
- `packgo-ratio-bomb.zip`: exceeds compression-ratio or uncompressed-size limit
- `packgo-entry-limit.zip`: exceeds entry-count limit
- `packgo-multiple-top-candidates.zip`: multiple root assembly candidates
- `packgo-with-solidworks-bom-xls.zip`: trusted BOM export
- `packgo-with-file-preview-only.zip`: no canonical BOM source
- existing controlled item fixtures: same number/same hash, same number/different hash, obsolete item and unmatched new item

### 4.3 Concurrency And Failure Injection

- two concurrent Draft creates using the same idempotency key
- two concurrent next-baseline confirms
- stale `rowVersion` package update
- stale parser generation commit
- storage success followed by DB commit failure
- storage compensation delete failure
- owner data changed after readiness/sign-off

## 5. Acceptance Criteria Traceability

| ID | Acceptance criteria | Automated evidence | Manual/browser evidence |
|---|---|---|---|
| TP-001 | Open/refresh `/transfer-packages/new` creates zero records | GET/no-write test | unsaved page screenshot |
| TP-002 | Explicit create returns one stable Draft/package ID | API/idempotency test | redirect to `/transfer-packages/[id]` |
| TP-003 | source drawing/part is pre-added in the create transaction | transaction/repository test | scope card screenshot |
| TP-004 | package cards summarize existing domains without duplicate editors | route/source ownership audit | adapter and deep-link walkthrough |
| TP-005 | return from owner module restores package/section/blocker | URL/allowlist test | BOM and drawing/part round trip |
| TP-006 | parser capability is honest in Phase 3A-0 | capability contract test | unavailable state screenshot |
| TP-101 | safe ZIP creates Transfer Intake, not baseline | API/state test | upload state screenshot |
| TP-102 | unsafe ZIP is rejected before valid manifest commit | malicious fixture tests | action-oriented error screenshot |
| TP-103 | original ZIP SHA and manifest paths are reproducible | hash/path roundtrip test | manifest inspection |
| TP-104 | human override survives re-parse | generation/override test | before/after classification evidence |
| TP-201 | formal/top assemblies require controlled identity | baseline negative test | mapping blocker screenshot |
| TP-202 | file-composition preview cannot pass as canonical BOM | BOM source test | manual-completion blocker |
| TP-203 | next baseline is one positive integer and immutable | concurrency/snapshot test | baseline preview/confirmation |
| TP-204 | item revisions and master lifecycle do not change during baseline | before/after DB assertion | impact summary screenshot |
| TP-205 | one-part delta inherits unchanged evidence and produces complete candidates for every governed root | overlay/closure/hash test | inherited/direct diff and candidate preview |
| TP-206 | system suggestion never auto-promotes an assembly; human disposition and final allocator decision are required | authorization/domain test | impact decision walkthrough |
| TP-207 | development decimal change creates no formal impact/stale/revision/pointer mutation | cross-lane negative test | formal configuration remains unchanged |
| TP-208 | `no_change` keeps assembly file revision but verifies the complete candidate with the new child revision | candidate/hash/open-evidence test | no-change impact and verification view |
| TP-209 | multi-top candidate/baseline confirmation is all-or-none | failure-injection transaction test | all roots remain unconfirmed after one failure |
| TP-210 | formal defer passes only with compatible/non-critical evidence plus manager, owner, due date and follow-up | defer eligibility matrix | approved/blocked defer states |
| TP-211 | UI collapses internal deferred/in-progress states to one `已非最新版 / 待更新` badge; verified no-change shows `不需進版` | DOM/text assertion | impact-state screenshots |
| TP-212 | identical normalized input/rule version produces identical ordered suggestion with zero AI/network calls | resolver snapshot/network-spy test | rule IDs/reasons view |
| TP-213 | formal no-change cannot finalize without R&D Manager approval and exact candidate/SolidWorks evidence | permission/state test | manager approval walkthrough |
| TP-214 | formal defer atomically creates one canonical follow-up and one idempotent task projection; retry cannot duplicate | transaction/outbox/retry test | package and `/numbering/tasks` evidence |
| TP-215 | formal download/materialization resolves the exact configuration manifest, revisions and hashes instead of filename-based `latest` | retrieval contract/hash fixture | downloaded manifest and audit evidence |
| TP-216 | re-upload, cleanup and cancellation cannot mutate canonical confirmed/approved evidence; released Drive evidence is required/permanent, pre-release backup is selective and no mirrored blob is overwritten/deleted | retention/lifecycle/storage test | immutable evidence and backup history |
| TP-301 | readiness references current baseline and rule version | resolver/hash test | readiness dashboard |
| TP-302 | stale owner data invalidates readiness/affected sign-offs | stale-dependency test | stale Now What state |
| TP-401 | formal submit uses shared approval platform | action registry/handler test | `/approvals` deep link |
| TP-402 | applicable role sign-offs and one-item confirmation gate approval | role/state tests | review/sign-off walkthrough |
| TP-403 | ApprovedForTransfer does not release masters | lifecycle before/after assertion | approved package + unreleased master evidence |
| SEC-001 | no anon/cross-company access; grants and RLS are explicit | policy/grant/company-scope tests | forbidden state where applicable |
| UX-001 | user knows page purpose/state/next action in five seconds | heading/CTA/state DOM checks | manual 5-second review |
| UX-002 | required viewports have no overlap/cutoff/overflow | Playwright/layout checks | screenshots at 1440/1024/390 |
| UX-003 | visible errors/raw API/enums/false openability are absent | text/alert sweep | hard-refresh screenshot evidence |

## 6. Negative And Security Tests

- open and refresh the unsaved create route repeatedly
- send create without title, case type, reason, owner or source-reference resolution
- replay same create key sequentially and concurrently
- access/update package from another company or unauthenticated context
- mutate Draft with stale `expectedRowVersion`
- add the same scope item twice
- upload non-ZIP, encrypted, traversal, link, duplicate-normalized-path, reserved-name, over-limit and executable/script payload archives
- attempt baseline immediately after upload or while parser is running
- attempt baseline with `unknown` assembly, unresolved formal/top identity, mapping conflict, obsolete child, no canonical BOM or non-positive quantity
- attempt to use `file_composition_preview` as `file_manifest` BOM source
- attempt two concurrent baseline confirms
- verify no item revision, item status or master lifecycle mutation during baseline
- upload a development decimal child revision and assert zero formal impact rows, stale states, revision suggestions or current-effective pointer changes
- attempt automatic assembly revision allocation without human decision
- select `no_change` but omit the changed child from the candidate configuration
- select `update` and verify same-lane `已非最新版` remains until assembly upload/rebuild/verification succeeds
- overwrite canonical `Released`/`Obsolete` master status with `已非最新版`
- fail candidate construction for the second root and assert no root candidate/baseline commits
- reopen or mutate an `ApprovedForTransfer` package instead of creating a linked delta package
- approve formal defer with incompatible/critical/low-confidence impact, missing exact old revision, or missing manager/reason/owner/due date/follow-up
- display separate human-facing `更新中` and `延後更新` badges instead of the single simplified stale badge
- invoke AI/LLM/network or return different rule ordering for identical impact inputs
- finalize formal no-change as Engineer/assembly owner/Admin path that bypasses configured R&D Manager approval evidence
- approve formal defer without canonical follow-up, create duplicate projections, or close impact by directly handling the generic task
- retrieve a formal configuration through filename-only or ambiguous `latest` resolution and substitute a newer child revision
- mutate/delete canonical confirmed or approved evidence during re-upload, cancellation or cleanup; overwrite/delete an existing Drive mirror; or incorrectly require every pre-release transient file to be mirrored forever
- re-parse after human classification and mapping decisions
- submit readiness against a non-current baseline
- sign against a stale readiness snapshot
- approve a one-item package without declaration/reviewer confirmation
- mark sign-off not applicable without rule or authorized reason
- create release work items before ApprovedForTransfer
- display `已確認 SolidWorks 可開啟` without native/real-machine evidence

## 7. Phase QA Gates

### Phase 3A-0 - Persistent Workbench Shell

Automated checks:

- route/source check that `/new` GET has no mutation
- POST create validation, transaction, idempotency and package-code uniqueness
- prefilled source item and company-scope check
- `drawing`/`part` boundary alias normalization to canonical owner entity types; unknown aliases fail closed
- optimistic concurrency and duplicate scope item check
- terminal cancel idempotency/permission/reason/evidence-preservation and no-approved-reopen tests
- workbench-context and readiness-summary response schema
- adapter status/deep-link allowlist contract
- return-context query preservation
- route inventory: no standalone normal upload/classification/BOM/sign-off pages
- regression: direct single-item technical-transfer submit remains fail-closed

Browser checks:

- drawing and part entry land on the same unsaved workbench pattern
- no record is created before `建立技轉包`
- create shows stable code/URL and prefilled scope
- cancel shows terminal outcome and safe next action without deleting history
- adapter cards show status, owner and one next action
- parser card says unavailable without looking complete
- BOM and owner deep links return to package/section/blocker
- blocked, empty, unavailable, forbidden and stale states pass Now What test
- 1440x900, 1024x768 and 390x844 have no horizontal overflow, overlap or cutoff
- visible error/counter sanity sweep passes

Phase result can be `Pass` only with API/repository evidence and real browser evidence.

### Phase 3A-1 - Streaming Intake And Classification

Automated checks:

- streaming parser safety and configured-limit matrix
- private storage/original SHA and normalized manifest uniqueness
- storage-to-DB compensation and orphan-audit retry path
- parser generation and stale-result discard
- classification confidence/reasons and human effective decision
- re-parse preservation and audit append-only behavior
- upload/parse idempotency and company scope
- current-intake pointer/supersession transaction; failed upload never becomes current and old intake remains immutable

Browser checks:

- valid upload, parsing progress, manifest tree and path status
- unsafe archive actionable rejection
- flat archive `unverified_flat` blocker
- promote/demote classification with reason
- re-parse retains human decision
- wording preserves paths but does not promise openability

### Phase 3A-2 - Mapping, BOM And Baseline

Automated checks:

- mapping priority, same-number/hash conflicts and obsolete/new identity paths
- formal/top controlled identity gate
- canonical BOM sources remain exactly `manual`, `solidworks_xls`, `cad_reference`
- file composition preview remains manual-completion blocker
- deterministic snapshot hashes and current intake generation check
- next-major transaction, duplicate concurrency and immutable historical baseline
- item revision/master lifecycle non-mutation
- same-lane where-used and strict development/formal isolation
- suggestion/confidence/reasons plus audited human `no_change`/`defer`/`update`
- deterministic resolver repeatability, rule-version/input-hash capture and zero AI/network dependency
- formal no-change R&D Manager-only approval after exact configuration/SolidWorks evidence
- formal defer compatibility/criticality/confidence/manager/owner/due-date/follow-up eligibility matrix
- canonical follow-up/outbox/task-projection idempotency, pending/retry/overdue and domain-validated resolution
- exact configuration-manifest retrieval with revision/hash/path checks and no ambiguous `latest` substitution
- immutable canonical confirmed/approved evidence plus tiered released/pre-release Drive coverage under re-upload/cancel/cleanup attempts
- delta overlay with inherited unchanged evidence and complete per-root closure
- atomic multi-top candidate/baseline commit and approved-package terminal lineage

Browser checks:

- resolve controlled identity conflict through owner module and return
- convert/complete BOM through BOM workbench and return
- preview exact files, independent revisions, hashes and BOM before confirmation
- confirm one baseline; view prior baseline as immutable history
- compare direct-change, impacted-context and inherited-unchanged evidence per top assembly
- verify development impact UI cannot display or mutate formal staleness
- verify only `不需進版` and `已非最新版 / 待更新` are normal human-facing impact badges; internal defer/update differences remain audit/workflow-only
- verify rule IDs/reasons are explainable without AI language or model metadata
- verify follow-up is visible in the package and existing task center with one return-context link and no standalone page

### Phase 3B - Readiness Integration

Automated checks:

- current-baseline requirement and rule-set version capture
- blocker aggregation by item/module/owner role
- item/readiness dependency hashes
- stale owner-data and active-rule behavior
- exact per-root SolidWorks open/missing-reference evidence and hash binding
- one failed/unverified root blocks atomic package readiness
- approved formal defer satisfies eligibility evidence and unresolved/overdue impact remains visible/actionable
- projection failure shows saved-follow-up/pending-sync state and retry does not duplicate work
- formal submit remains unavailable until Phase 3C capability exists

Browser checks:

- readiness dashboard shows complete and blocked packages
- each blocker has owner, destination and blocking/warning meaning
- stale state shows next action instead of silent warning

### Phase 3C - Shared Review And Sign-Off

Entry-gate checks:

- access-control engine/auth/API recognize Manufacturing, Procurement and quality sign-off capabilities
- shared approval action and domain handler are registered
- no isolated reviewer page/table is introduced

Automated checks:

- submit transaction captures package/baseline/readiness snapshot and approval work item atomically
- all governed roots approve/reject atomically; no partial root approval state
- ApprovedForTransfer is terminal and later design change starts a linked package
- one-item declaration and reviewer confirmation
- applicability, sign-off, not-applicable reason and duplicate/stale decision guards
- changed package/readiness data invalidates affected evidence
- ApprovedForTransfer and release-work-item idempotency
- no direct master release

Browser checks:

- reviewer works from `/approvals`
- applicable sign-offs, not-applicable reason and stale invalidation are visible
- approved package leaves masters unreleased
- release-work-item action routes to existing release workflow

## 8. Now What State Matrix

| State | User likely question | Required first sentence | Required next action |
|---|---|---|---|
| unsaved | 我的資料保存了嗎？ | `尚未建立技轉包；先確認案件資料。` | `建立技轉包` |
| created/no intake | 接下來做什麼？ | `技轉包已建立；下一步上傳 Pack and Go。` | upload or scope completion |
| capability unavailable | 為什麼不能上傳？ | `技轉包已保存；解析功能尚未開放。` | complete scope or return to source |
| unsafe archive | 怎麼修正？ | `這個封包不能解析；請重新建立安全且保留路徑的 Pack and Go。` | re-upload |
| classification blocked | 誰要處理？ | `目前不能建立 baseline；先確認組合件分類。` | classification section |
| mapping blocked | 缺什麼？ | `正式組合件尚未有受控編號或版次。` | owner numbering/detail route |
| BOM blocked | 能先鎖版嗎？ | `BOM 尚未完成，現在不能建立 baseline。` | BOM workbench |
| baseline ready | 會鎖什麼？ | `資料已完整；先預覽將鎖定的檔案、版次與 BOM。` | baseline preview |
| stale | 舊結果還有效嗎？ | `資料已變更，舊檢查或簽核不可再用。` | new baseline/re-resolve |
| approved | 零件已發行嗎？ | `技轉包已核准，但零件與圖面尚未自動發行。` | create/view release work items |

## 9. Supabase/Postgres Evidence Gate

When schema implementation is requested, QC must collect:

- generated local migration diff and migration list, without live apply
- table/constraint/FK-index inventory
- explicit Data API grants or evidence that tables remain server-only/unexposed
- RLS enabled/policy inventory with no anon access
- cross-company SELECT/INSERT/UPDATE/DELETE denial
- UPDATE policy evidence for both `USING` and `WITH CHECK`
- indexes on company/user keys used by policies
- transaction/idempotency/concurrency evidence
- no service-role/secret exposure in browser bundle

Live migration, provider pointer change and production advisor evidence remain release-gated.

## 10. Stop Conditions

Stop and return to PM/user if:

- implementation changes confirmed baseline/item revision semantics
- GET/open must create package data
- owner logic must be copied into transfer workbench
- a new normal subtask page is required
- package/company/RLS boundary cannot be enforced
- parser cannot stream or reject unsafe archives
- original ZIP/path evidence cannot be preserved
- human overrides cannot survive re-parse
- incomplete manual BOM or unmapped formal assembly would pass baseline
- development/formal revision lanes cannot be isolated
- assembly revision suggestion would auto-promote without human decision
- `已非最新版` must overwrite a canonical master lifecycle state
- a multi-root candidate/package can commit or approve partially
- an approved package must be reopened for a later design change
- assembly-impact resolver requires AI/LLM/network access or cannot reproduce stable ordered rules/reasons
- formal no-change can finalize without R&D Manager approval
- formal defer follow-up cannot be canonical while projecting idempotently into the existing task center
- formal download/materialization depends on filename-only or ambiguous `latest` resolution
- canonical confirmed/approved evidence can be mutated/deleted, an existing mirror can be overwritten/deleted, or tiered backup coverage cannot be preserved
- quality/applicable sign-off capability does not exist before Phase 3C
- transfer approval would directly release master records
- work requires production migration, direct repair/deletion, provider change, deploy or release

## 11. Evidence Required By Phase

Common:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:pdm-submission-gate-phase1`
- drawing-submission review-only regression
- focused phase QC script(s)
- route/viewport/timestamp screenshots and visible-error sweep

Phase-specific evidence:

| Phase | Required evidence |
|---|---|
| 3A-0 | no-write GET, source alias normalization, create/cancel idempotency, terminal evidence preservation, company scope, adapters/return context, required viewport screenshots |
| 3A-1 | archive safety matrix, storage compensation, current-intake supersession, parser generation, manifest/classification browser evidence |
| 3A-2 | deterministic no-AI resolver, formal no-change manager gate, canonical follow-up/task projection, mapping/BOM, lane isolation, delta inheritance, atomic multi-root baseline, immutability and preview screenshots |
| 3B | configuration readiness/hash/stale, follow-up pending/overdue/projection retry, exact SolidWorks evidence binding, formal-lane defer policy and blocker dashboard screenshots |
| 3C | atomic multi-root approval, terminal/new-package lineage, access-control/action registry, sign-off/stale/approval-release separation and `/approvals` evidence |

## 12. Residual Risk And Deferred Evidence

Even after DEV-041 local phases pass, these remain outside that local completion statement:

- native SolidWorks reference extraction through Document Manager or equivalent
- real-machine SolidWorks open validation and Add-in evidence
- production Supabase migration/grants/RLS/advisor evidence
- formal production deploy/release/smoke/rollback evidence
- ERP or supplier integration

These residuals must not be restated as local Phase 3A-0 blockers unless its implementation actually depends on them.

## 13. Phase 3A-0 Execution Evidence

Phase 3A-0 passed on 2026-07-13. The controlled evidence report is `.ai-doc/qc/qc-pdm-transfer-package-phase3a0-report-2026-07-13.md`.

- Focused transfer-package QC: 18/18.
- Parent submission-gate regression: 15/15.
- Account-lifecycle regression after compatibility migration repair: 26/26.
- Typecheck, full lint and isolated production build: passed.
- Runtime API contract and browser checks at 1440/1024/390: passed.
- Live Supabase migration, native SolidWorks validation, Phase 3A-1 to 3C and production release remain unexecuted.
