# QA-DEV-083 - 料號／圖料唯讀抽屜與完整 URL 工作區驗證計畫

Status: `QA Plan Ready / RD Implemented Locally / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition / Production Release Gated`
Date: 2026-08-20
Owner: QA
Related DEV: `DEV-PDM-PART-RELATION-READONLY-DRAWER-FULLPAGE-EDITOR-001` / `DEV-083`
Authority: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md` § `2026-08-20 DEV-083 RD Implementation Contract`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md` § `2026-08-20 DEV-083 Amendment`

## 1. Purpose、risk 與 evidence boundary

驗證 Part／Relation 的 candidate、formal、legacy、unified 與 approval drawer 全面zero-write，所有mutation只存在於canonical full-page owner，且導覽、permission、資料authority與返回脈絡沒有因UI分流而退化。

Risk lane：`Medium`。本DEV不改schema／permission／lifecycle／write API，但跨Part、Relation、Approval、共享drawer、action resolver與list navigation；主要風險是雙寫入口、錯誤owner route、reviewer scope誤放寬、返回頁次遺失與responsive action ownership。

本文件已封口direct-edit inventory、runner名稱、baseline、fixture/evidence規則與stop gate。DEV-083 focused contract、API、isolated build、disposable authenticated Chromium與disposable mutation runner均已取得證據；最新browser run通過22個runner checks、三viewport、zero-write network與reviewer projection，最新mutation run則在隔離SQLite＋Chromium中完成candidate lifecycle、Part variant、Part／Drawing／Relation 的 Engineer owner/non-owner、Manager／Admin 同公司正向 mutation 與 audit/readback、Manufacturing fail-closed、cross-company denial、Relation operations，以及reviewer `needs_info`／reject／approve、unassigned／terminal／cross-company／錯配target scope、snapshot drift、isolated retry fault與retry formalization的exactly-once、readback、audit，`browserErrors=0`、`failedResponses=0`且cleanup=`removed`。本輪已完成focused reconciliation：DEV-067 candidate drawer、DEV-070 server-bidirectional cursor、DEV-081 shared non-owner role policy與entity-detail pending projection均已有對應回歸證據；並補上Part／Drawing API的same-company resource guard，修正跨公司 route intent 可寫入的安全缺口。最新已完成aggregate為30個child中29 PASS、1個DEV-072 parent baseline FAIL（`accepted-superseded`，由既有QC disposition正式接受，不吞錯也不報舊runner PASS）；DEV-067已以最新parent runner 18/18 PASS收斂，DEV-072 runner則改為有界5秒 obsolete-marker wait並保留歷史expected。`typecheck:app`、affected lint與isolated build均通過。QA-083-19已由三domain Engineer owner/non-owner、Manager／Admin、non-editor、company partition與audit actor readback直接關閉；QA-083-24已依 DEV-072 QC disposition 關閉；QA-083-01～24 coverage ledger 全部具備證據，Production Release 仍另受 release gate。

## 2. In scope／Out of scope

In scope：

- `/parts`、`/numbering/search`、`/approvals` list→drawer→workspace→return。
- `/numbering/workspaces/[workspaceId]`、`/parts/[partId]/workspace`、`/numbering/relations/[rootId]/workspace`、`/approvals/[requestId]`。
- Part／Relation candidate、formal、review、history／terminal與legacy／unified flag branches。
- drawer DOM／keyboard／accessibility／network zero-write、canonical route、safe return、unsaved guard、action ownership、failure recovery與三viewport。
- existing workspace、Part variant／attachments、Relation maintenance、Approval decision與parent regression parity。

Out of scope：

- 重構或重畫Drawing workspace；DEV-083只做DEV-079回歸。
- schema／migration／permission／lifecycle／new write API、production data、deploy、release與正式traffic。
- legacy compatibility code的物理刪除；本phase只要求unmount／fail closed與無mutation。

## 3. Required actor／state／surface matrix

Actors：candidate owner、non-owner Engineer、R&D Manager、Admin、exact assigned reviewer、unassigned reviewer、cross-company actor、readonly／permission-missing actor。

States：candidate building／drawing preparation／correction／bundle ready／in review／recovery／controlled／history；formal active／RD-controlled／released／active review／terminal；approval pending／needs-info／decided／apply-failed／drift。

Surfaces：Part list drawer、Relation list drawer、Approval drawer、candidate workspace、Part workspace、Relation workspace、reviewer workspace；每個drawer另覆蓋legacy／unified renderer可到達的branch。

完整matrix不要求每個actor×state都建立獨立fixture；QA可用等價partition，但必須直接覆蓋所有write capability、lock、review scope與cross-company negative path，並在manifest記錄合併理由。

Disposable fixture contract固定使用`company-jenfu`與隔離的`company-dev083-other`；actor IDs為`dev083-owner`、`dev083-non-owner`、`dev083-manager`、`dev083-admin`、`dev083-reviewer`、`dev083-unassigned-reviewer`、`dev083-readonly`、`dev083-cross-company`。若既有seed helper要求對應demo actor，可在manifest記錄alias，但不得改變role/company/assignment partition。

| Fixture key | Stable IDs／state | Minimum purpose |
|---|---|---|
| `083-FX-CANDIDATE` | `dev083-workspace-building`、`dev083-workspace-ready`、`dev083-workspace-review`、`dev083-workspace-recovery` | single URL/editor、edit/file/submit/withdraw/cancel/recovery與drawer zero-write |
| `083-FX-PART` | `dev083-part-active`、`dev083-part-review-locked`、至少3頁signed identities | variant/attachment/contextual authority、before/after cursor與stale row recovery |
| `083-FX-RELATION` | `dev083-root-active`、`dev083-root-review-locked`、至少3頁signed identities | tree/matrix/link/primary/reference/remove、lock與before/after cursor |
| `083-FX-REVIEW` | `dev083-request-drawing-pending`、`dev083-request-part-pending`、`dev083-request-relation-pending`、`dev083-request-decided`、`dev083-request-drift`、`dev083-request-apply-failed` | three-domain projection、exact reviewer、terminal/drift/retry與drawer navigation-only |

所有ID只存在於每次runner建立的disposable資料目錄；fixture setup／cleanup不得連到protected runtime DB。before/after hash至少涵蓋workspace rowVersion/lifecycle、Part variant/attachments、Relation links、approval request/apply/audit receipt；UI runner不得用直接DB mutation代替被驗收的使用者action。

## 4. Acceptance cases

### Route、identity 與 safe return

| ID | Acceptance | Required evidence |
|---|---|---|
| QA-083-01 | candidate Part／Relation入口都canonicalize到同一`/numbering/workspaces/[workspaceId]`，沒有第二candidate editor／URL | route contract＋browser address／DOM |
| QA-083-02 | formal Part使用stable `partId`，formal Relation使用stable `rootId`；display code只顯示、不作route authority | route/API negative cases |
| QA-083-03 | unknown／inapplicable intent fail closed為view／locked，不掛載form或放寬capability | contract＋direct URL browser |
| QA-083-04 | Part／Relation／Approval `returnTo`只接受各自allowlisted pathname；absolute、scheme-relative、backslash、control character、cross-origin與錯誤pathname被拒絕 | security contract／browser |
| QA-083-05 | query、filter、sort、layout、history、cursor、page、detail、selected row與focus在完成／取消／back／forward後恢復；stale cursor／missing row有一次性notice與安全fallback | browser＋URL／focus evidence |

### Drawer zero-write 與 action ownership

| ID | Acceptance | Required evidence |
|---|---|---|
| QA-083-06 | Part／Relation candidate、formal、legacy、unified與approval drawer均無form、file input、dropzone、save、submit、withdraw、cancel、relation mutation、approve／reject／retry或contextual write control | DOM／a11y inventory |
| QA-083-07 | 開啟、切換、scroll、preview、copy、download、refresh與關閉drawer期間沒有POST／PUT／PATCH／DELETE | network method allowlist |
| QA-083-08 | 每個drawer最多一個primary navigation CTA；locked reason可由hover／focus／touch取得，不適用action省略 | DOM＋keyboard／touch |
| QA-083-09 | List／Drawer／Full-page Form／Confirmation Modal只有最上層action owner可點擊、Tab與被AT辨識；關閉後focus回合理觸發點 | focus／a11y tree＋錄影或step log |
| QA-083-10 | source scan證明`UnifiedPdmEntityDetailDrawer`沒有maintenance state、pending command runner或write callback，`PdmEditPageFrame`沒有domain import／switch／API route | static architecture gate |

### Full-page domain behavior

| ID | Acceptance | Required evidence |
|---|---|---|
| QA-083-11 | candidate workspace可完成既有edit／file／submit／withdraw／cancel／recovery能力，且同一mutation exactly once | isolated API＋browser＋before/after hash |
| QA-083-12 | Part workspace復用既有variant、attachment與contextual authority；owner／Manager／Admin正向，readonly／cross-company負向 | permission matrix＋audit/readback |
| QA-083-13 | Relation workspace復用既有tree／matrix／relation operations與locks；link／primary／reference／remove不建立第二write route | API route audit＋browser/readback |
| QA-083-14 | unsaved guard只攔未送出input；已完成upload／command不被宣稱為unsaved，partial upload保留成功項 | browser state／network evidence |
| QA-083-15 | domain editor各自擁有內容與action；共用frame只治理mechanics，同一active scope一個primary且最後控制項可捲到dock上方 | DOM／geometry／manual UX review |

### Reviewer、permission 與 authority parity

| ID | Acceptance | Required evidence |
|---|---|---|
| QA-083-16 | `/approvals/[requestId]`依server owner context呈現Drawing／Part／Relation受審projection；drawer只導覽 | contract＋三domain browser |
| QA-083-17 | exact assigned reviewer可決策；unassigned、terminal、cross-company、drift或缺target receipt fail closed且不hydrate未授權full projection | API／browser negative matrix |
| QA-083-18 | approve／needs-info／reject／retry apply只在reviewer workspace發出，exactly once，existing idempotency／audit／return-to-inbox不變 | mutation log＋audit／readback |
| QA-083-19 | DEV-081 Manager／Admin non-owner capability維持；actor、owner identity、company與audit actor沒有被route／intent取代 | contract＋readback |

### Failure、RWD 與 visible quality

| ID | Acceptance | Required evidence |
|---|---|---|
| QA-083-20 | 401／403／404／409／5xx／network failure各有可理解影響與恢復；保留未送出input且不露raw JSON、stack、HTTP或API route | injected failure＋screenshot／DOM |
| QA-083-21 | 1440×900、1024×768、390×844的list→drawer→workspace→return均無非預期水平overflow、重疊、裁切或action dock遮擋 | screenshot＋geometry manifest |
| QA-083-22 | Drawer body、page body、domain panel、modal body各自scroll owner清楚；無非預期scroll chaining，mobile keyboard／safe area不遮primary | scroll／mobile interaction |
| QA-083-23 | visible-error、information-noise與red-pen sweep通過；無DEV ID、raw status、重複identity／status、逐項教學CTA或無決策價值小字 | DOM text inventory＋manual review |
| QA-083-24 | Drawing owner/reviewer routes與DEV-079 contract等價；Part／Relation list、projection、action、approval與attachment父回歸無未歸因P0/P1 | regression manifest |

## 5. Executable runner contract、baseline 與 evidence

RD必須建立下列exact commands與scripts：

- `qc:dev-083:contract` -> `scripts/qc-dev-083-contract.mjs`：28-file boundary、route/stable identity、intent、closed safe return、single candidate editor、drawer/frame zero-write source scan、schema/migration/new-write-route negative diff。
- `qc:dev-083:api` -> `scripts/qc-dev-083-api.mjs`：bidirectional cursor、capability、state/action destination、existing payload parity、owner/non-owner/company/reviewer negative scope與mutation exactly-once。
- `qc:dev-083:browser` -> `scripts/qc-dev-083-browser.mjs`：disposable SQLite＋task-owned isolated Next server，Part／Relation／candidate／reviewer owner routes、drawer DOM／network zero-write、unknown intent、safe return、URL back/forward、focus、single primary、unsaved guard、401／403／404／409／5xx／network redaction、visible-noise、三viewport與review projection；最新run明確保存22個runner checks與screenshots/manifest。尚未把完整actor×state mutation exactly-once或permission負向冒充為browser PASS。
- `qc:dev-083:mutation` -> `scripts/qc-dev-083-mutation.mjs`：disposable SQLite＋task-owned Chromium，實際執行candidate edit/file/submit/withdraw/cancel、Part variant、Part／Drawing／Relation Engineer owner/non-owner 與 Manager／Admin 同公司正向、Manufacturing fail-closed、cross-company與route-intent denial、Relation link/reference/primary/remove/relink，以及reviewer `needs_info`／reject／approve、unassigned／terminal／cross-company／錯配target scope、snapshot drift、isolated retry fault與retry formalization；以request計數、row readback、audit／event readback與cleanup manifest證明exactly-once。QA-083-19已由三domain owner/non-owner、Manager／Admin、non-editor、company partition與audit actor readback直接關閉。
- `qc:dev-083` -> `scripts/qc-dev-083-aggregate.mjs`：focused gates＋parent regressions＋`typecheck:app`＋affected lint＋`build:isolated`，逐child保存PASS／FAIL／BLOCKED，不吞錯。

這些command已存在於`package.json`；目前狀態為`Created / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck PASS / Affected Lint PASS / Isolated Build PASS / Parent Baseline Disposition Accepted-Superseded / QA-083-24 Closed`。名稱已封口，RD不得另造近義command造成證據分流。

Required parent regressions至少包含：DEV-062 core／Part／Relation／compat、DEV-067 contract／UI／review／navigation／browser、DEV-070 contract／legacy-owner／browser、DEV-072 contract／API／browser、DEV-079 contract、PDM entity detail drawer、number-state Phase 1B、numbering approval review UI、approval platform、Part attachment／relation view、typecheck與isolated build。Intentional replacement可修改的exact test inventory見主SPEC；只能改canonical route、zero-write與cursor直接衝突的expected，其他assertion必須保留。

Evidence reconciliation（2026-08-20，branch `持續優化2`，HEAD `050eedd4fe963d0f225820facec8d221a1df76ce`）：

- PASS：`typecheck:app`、DEV-062 core／Part／Relation／compat、DEV-067 contract／navigation、DEV-072 contract／API、DEV-079 contract、numbering approval review UI、master attachments、isolated `build:isolated`；`lint`為0 errors（保留14個既有warnings）。
- PASS（focused）：`qc:dev-083:contract`、`:api`、`:browser`與`:mutation`；最新authenticated browser run `output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`，22/22 runner checks、browserErrors=0、failedResponses=0、mutationRequests=0，且包含1440×900／1024×768／390×844 screenshots。最新mutation run `output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`為PASS、31/31 result rows passed、cleanup=removed；已直接關閉QA-083-11、QA-083-12、QA-083-13、QA-083-17、QA-083-18與QA-083-19，後者包含Part／Drawing／Relation Engineer owner/non-owner、Manager／Admin同公司正向、Manufacturing fail-closed、cross-company denial與audit/readback。QA-083-24已由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`的2026-08-20 accepted-superseded disposition關閉。
- Focused reconciliation：前一個完整aggregate的兩個非baseline FAIL（DEV-083 authenticated browser、DEV-070 legacy owner）已在同一工作樹以 focused gate 重跑PASS；DEV-070 browser亦獨立重跑PASS。前者是hydration-safe-return等待競態，後者是Windows disposable cleanup EPERM；兩者均未改產品資料或放寬expected。
- Parent baseline reconciliation：DEV-067 browser已由parent owner runner修正並重跑PASS；最新manifest `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`為18/18 cases、browserErrors=0、failedResponses=0，涵蓋Drawing／Part／Relation四viewport drawer、candidate readonly marker、single scroll owner、focus／keyboard與canonical reviewer route。DEV-072 browser最新manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留fixture與cleanup（8項移除、temp root removed），並以5秒有界等待重現legacy `unified-pdm-entity-detail-drawer` obsolete marker；現行DEV-079 candidate route明確使用readonly drawer與canonical full-page action owner，因此列為`accepted-superseded`而非PASS。最新完整aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`已完成30個child：29 PASS、DEV-072 browser 1個parent baseline FAIL；不吞錯、不將baseline failure報成aggregate PASS。DEV-079 focused contract 22/22、layout browser 3/3與recognition layout browser 3/3證明現行replacement contract；原始failure與不相容expected均保留，不改shared／protected DB。
- PASS（gate）：`typecheck:app`、affected `lint`與isolated `build:isolated`；最新完整aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL（`accepted-superseded`）。DEV-067 review/UI/navigation、DEV-070 contract／legacy-owner／browser、DEV-081 contract、PDM entity-detail drawer、number-state、approval platform、master attachments與relation isolated均重跑PASS；`qc-next-app-runner` readiness probe已改為每次2秒可取消，DEV-072 legacy marker wait已限縮為5秒，避免過時基準無界掛住聚合。
- Closed：`QA-083-19`已完成三domain owner/non-owner與authority parity；`QA-083-24`已由DEV-072 QC evidence-level disposition接受「舊action runner由DEV-079取代、不得誤報PASS」，並保留原始failure、fixture／cleanup與expected。`QA-083-11/12/13/17/18/19`已有disposable mutation PASS，且QA-083-19已取得Engineer owner/non-owner、Manager／Admin、non-editor、company partition的request、response、row與audit readback；`qc:dev-083`仍保留aggregate child failure與baseline metadata，不把accepted-superseded改寫為舊runner PASS。

### 5.1 Latest evidence coverage ledger

| Coverage group | Latest evidence | Boundary／未宣稱內容 |
|---|---|---|
| Direct browser PASS | `QA-083-01/02/03/04/05/06/07/08/09/14/15/16/17/20/21/22/23` 的22個runner checks；manifest `output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json` | 只代表runner明確執行的route／DOM／geometry／failure／navigation partition；reviewer decision mutation不在此run |
| Disposable mutation PASS | `QA-083-11/12/13/17/18/19`；manifest `output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json` | candidate lifecycle、Part variant、三domain Engineer owner/non-owner與Manager／Admin正向、Manufacturing fail-closed、cross-company denial、Relation write/readback、reviewer decision／drift／retry均exactly-once；QA-083-24 parent regression未覆蓋 |
| Authority parity PASS | `QA-083-19` | Part／Drawing／Relation Engineer owner/non-owner、Manager／Admin同公司正向、Manufacturing同公司負向、cross-company與route-intent denial均有request／response／row／audit actor readback；owner identity與server authority已對帳 |
| Aggregate gate | latest completed `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`（30 child／29 PASS／1 DEV-072 parent baseline FAIL，`accepted-superseded`） | aggregate保留各child狀態；DEV-067已由最新parent runner PASS收斂，DEV-072保留歷史obsolete marker與replacement evidence，並以2026-08-20 QC disposition接受；QA-083-24已達§6全矩陣PASS；baseline failure不可改寫為舊runner PASS |

Evidence root規劃：`output/qa/dev-083-part-relation-fullpage-workspaces/<run-id>/`，至少保存manifest、route/action matrix、DOM/network inventory、permission／state results、before-after hashes、console／visible-error、screenshots、accessibility／focus與verdict。

Fixture manifest必須記錄fixture來源、company、actor、stable object/request ID、state、expected capability、before hash、cleanup owner與資料目錄；禁止shared／protected DB。Browser runner啟動runtime前依`AGENTS.md`記錄project、purpose、port、owner process tree與cleanup condition，完成或失敗都只停止task-owned tree並確認port釋放。

## 5.2 Closure handoff：只剩一條DEV-083開放驗證線

本節是目前QA可直接派工的最小closure contract；它不新增scope、不放寬expected，也不把parent baseline改名成DEV-083 failure。

| Open lane | Current status | 必須補的證據 | 關閉條件／不得宣稱 |
|---|---|---|---|
| `QA-083-19` DEV-081完整跨domain parity | `PASS`：最新disposable fixture已對Part／Drawing／Relation完成 Engineer owner、Engineer non-owner、Manager、Admin、Manufacturing、cross-company與route-intent authority partition，並有request／response／row／audit actor readback | 無新增證據；保留本輪Part／Drawing same-company guard修正的cross-company negative evidence，並在後續父回歸中維持同一server policy | 三domain authority與audit actor一致、cross-company不hydrate、不因route／intent升權，且owner/non-owner evidence可追溯；已滿足，正式關閉QA-083-19 |
| `QA-083-24` parent regression closure | `Closed`：DEV-067 browser由parent owner更新runner並18/18 PASS；DEV-072 legacy action-discoverability runner已修正FK fixture，並在bounded 5s wait下重現obsolete marker timeout，現行行為由DEV-079 replacement contract承接，標記`accepted-superseded` | DEV-067保留最新18/18 manifest；DEV-072保留歷史FK／cleanup manifest、最新bounded-run manifest與obsolete marker觀測，並附DEV-079 contract 22/22、layout 3/3、recognition layout 3/3 evidence；QC disposition保留於`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md` | 舊action runner仍不得改判為PASS；本項已由可追溯QC disposition接受replacement、確認aggregate非baseline failure=0與P0/P1=0後關閉；不得刪assertion、改expected、換到shared DB或把受保護資料拒絕誤報為PASS |

### Parent baseline disposition ledger（DEV-067已解決；DEV-072 accepted-superseded 已由 QC 記錄）

| Finding | Owner／source | 已驗證事實 | 下一步／不應在DEV-083內做的事 |
|---|---|---|---|
| `DEV-067 browser` | DEV-067 parent browser runner；latest manifest `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json` | 18/18 cases PASS；Drawing／Part／Relation四viewport drawer、candidate readonly marker、single scroll owner、focus／keyboard、canonical reviewer route與flag-off boundary通過；browserErrors=0、failedResponses=0 | 已由DEV-067 parent owner更新runner並關閉本項baseline；DEV-083不新增formal marker、不把candidate改回可寫drawer |
| `DEV-072 browser` | DEV-072 parent browser fixture；historical manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T102540Z-e66f6a56/run-manifest.json`；latest bounded manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`；completed aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json` | 原始run的`user-admin-demo`不存在造成FK failure，cleanup另記錄EPERM；fixture已改為以`admin@example.com`解析真實admin並可啟動runtime。bounded rerun保留8項cleanup removed／temp root removed，並在5秒內重現`unified-pdm-entity-detail-drawer` obsolete marker timeout；現行DEV-079 candidate route明確使用readonly drawer與canonical full-page action owner，無產品資料寫入，未指向DEV-083 source | 已由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`記錄`accepted-superseded` disposition：保留舊assertion與觀測failure，採DEV-079 contract 22/22、layout 3/3、recognition layout 3/3為現行action-placement replacement evidence；DEV-083不改expected、不使用shared／protected DB、不修補父任務資料 |

### Closure sequence

1. QA先從最新 aggregate manifest建立2項 finding ledger；每項保留原始child manifest與失敗訊息，指定 parent owner，不在 DEV-083 runner 內修補 parent fixture。
2. QA／parent owner 在 disposable target 重跑可重現項；若屬 protected runtime、fixture缺資料、FK／cleanup或responsive parent expectation，記錄為 baseline disposition，並附上不影響 DEV-083 的理由與下一個 owner task。DEV-072本輪已完成fixture FK修正與obsolete marker重現，下一步是獨立QC記錄replacement acceptance，不得把舊runner改寫成PASS。
3. QA-083-19 owner/non-owner identity evidence已完成並同步至本文件、主SPEC、ADR、Workbench Core、`.ai-doc/dev_task.md`與documentation map；QA-083-24已由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`的可追溯QC disposition關閉。
4. `qc:dev-083`、`typecheck:app`、affected lint 與 `build:isolated` 已完成重跑；aggregate manifest保留`accepted-superseded` metadata與原始failure，QA-083-01～24已達closure，但不得把舊runner輸出改寫成PASS。

目前交接結論：DEV-083 的產品實作、focused evidence、parent baseline disposition與QA-083-01～24 closure均已達成；local QA/QC 可交付，Production Release 仍保持 gated。任何新的 schema、permission、lifecycle、cross-domain command bus或第二個candidate editor需求，必須停止並回 Dev PM 做 Spec Impact，而非在 closure lane 內擴張。

## 6. PASS／stop gate

PASS：QA-083-01～24全部通過；drawer unexpected mutation=0、duplicate command owner=0、cross-company／unassigned reviewer data leak=0、open redirect=0、P0/P1=0、unexpected visible／console／network error=0，三viewport皆可操作，parent regressions無未歸因退化。目前focused/22-check browser、disposable mutation、DEV-079 replacement evidence與build gate已證實；QA-083-19完整DEV-081跨domain parity已PASS，QA-083-24已由accepted-superseded QC disposition關閉。Production Release 仍另受 release gate。

Stop並回RD：任何drawer仍可寫、同一candidate有兩個URL／editor、full-page繞過server capability、reviewer scope放寬、return cursor只能靠client猜測、frame出現domain switch／command bus、Drawing行為被改寫，或需要schema／permission／lifecycle／production才能取得PASS。

本QA plan不授權建立fixture到shared/staging/production資料，也不授權deploy、release、live migration、direct data repair、stage、commit、merge或PR。產品direct-edit與test inventory只限主SPEC列出的28 source、19 scripts與`package.json`；必要hunk無法與pre-existing dirty變更隔離時，QA狀態為BLOCKED並回Dev PM，不得整檔覆寫。
