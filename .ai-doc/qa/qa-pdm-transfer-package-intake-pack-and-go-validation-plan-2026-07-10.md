# QA Plan - PDM 技轉包工作台與 Pack-and-Go 組合分類

Spec: `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
DEV: `DEV-041` / `DEV-PDM-TRANSFER-PACKAGE-INTAKE-001`
Parent DEV: `DEV-005` / `DEV-PDM-SUBMISSION-GATE-001`
Status: Phase 3A-0 QA Implementation Ready / Not Requested This Turn; Phase 3A-1 QA Contract Ready / Not Requested This Turn; Phase 3A-2 to 3C QA contract pending design-change configuration decisions
Created: 2026-07-10
Updated: 2026-07-10

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
| RD re-review `3/4` | design-change delta/effective-configuration and multi-top approval semantics remain pending and block final Phase 3A-2 to 3C QA contract |

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
- optimistic concurrency and duplicate scope item check
- workbench-context and readiness-summary response schema
- adapter status/deep-link allowlist contract
- return-context query preservation
- route inventory: no standalone normal upload/classification/BOM/sign-off pages
- regression: direct single-item technical-transfer submit remains fail-closed

Browser checks:

- drawing and part entry land on the same unsaved workbench pattern
- no record is created before `建立技轉包`
- create shows stable code/URL and prefilled scope
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

Browser checks:

- resolve controlled identity conflict through owner module and return
- convert/complete BOM through BOM workbench and return
- preview exact files, independent revisions, hashes and BOM before confirmation
- confirm one baseline; view prior baseline as immutable history

### Phase 3B - Readiness Integration

Automated checks:

- current-baseline requirement and rule-set version capture
- blocker aggregation by item/module/owner role
- item/readiness dependency hashes
- stale owner-data and active-rule behavior
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
| 3A-0 | no-write GET, create idempotency, company scope, adapters/return context, required viewport screenshots |
| 3A-1 | archive safety matrix, storage compensation, parser generation, manifest/classification browser evidence |
| 3A-2 | mapping/BOM source, baseline concurrency/immutability, item non-mutation, preview/confirm screenshots |
| 3B | readiness/hash/stale tests and blocker dashboard screenshots |
| 3C | access-control/action registry, sign-off/stale/approval-release separation and `/approvals` evidence |

## 12. Residual Risk And Deferred Evidence

Even after DEV-041 local phases pass, these remain outside that local completion statement:

- native SolidWorks reference extraction through Document Manager or equivalent
- real-machine SolidWorks open validation and Add-in evidence
- production Supabase migration/grants/RLS/advisor evidence
- formal production deploy/release/smoke/rollback evidence
- ERP or supplier integration

These residuals must not be restated as local Phase 3A-0 blockers unless its implementation actually depends on them.
