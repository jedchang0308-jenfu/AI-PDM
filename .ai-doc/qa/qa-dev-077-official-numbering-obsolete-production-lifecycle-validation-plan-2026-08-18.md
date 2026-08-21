# QA Plan：DEV-077 正式編號草稿作廢與 production lifecycle 收斂

日期：2026-08-18
狀態：`QA Plan Ready / RD Implementation Complete / Focused Local + PostgreSQL + Browser QC Passed / Existing Regression Passed / Production Release Gated`
關聯 DEV：`.ai-doc/dev_task.md`（`DEV-077`）
決策：`HD-077-01..03 / Human Confirmed`
關聯 ADR：`.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
關聯 SPEC：

- `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
- `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
- `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`

## 1. Objective

驗證已配置 official 圖料根號／圖號／料號的 Draft／NeedInfo bundle 能在不 hard delete、不回收號碼且保留完整追溯的前提下終止為 `Obsolete`；Active／Released資料維持申請、審核、核准後才作廢。同時證明UI、server policy、permission與production capability使用一致truth，未開放控制不會先送出request才失敗。

本計畫已對齊`RD Implementation Ready` contract。RD implementation、focused local QC、隔離 PostgreSQL concurrency、authenticated rendered browser與既有 numbering／lifecycle／approval regression 已完成；production deployment／traffic／write smoke／rollback仍屬`DEV-032` release gate，本文件不授權 production。

## 1A. RD Implementation Result（2026-08-18）

- `npm run typecheck:app -- --pretty false`：PASS。
- `npm run qc:dev-077:contract`：12/12 PASS。
- `npm run qc:dev-077:gate`：5/5 PASS。
- isolated API QC：14/14 PASS；涵蓋 root policy、direct draft obsolete、Idempotency-Key replay、root／children rows／relations preservation、audit 與 approval targets。
- PostgreSQL concurrency：`npm run qc:dev-077:postgres` 17/17 PASS；兩個同時 obsolete request 在 SERIALIZABLE retry／recheck 下只允許一個合法結果，另一個受控拒絕；root／part／drawing 狀態、exactly-one audit、controlled-reference impact與direct obsolete block均完成 readback。
- authenticated rendered browser：`npm run qc:dev-077:browser` 27/27 PASS；`/numbering/search` A0001 root drawer 在 1440×900、1024×768、390×844 驗證 `作廢草稿編號`、reason／ack danger dialog、無水平溢位、console error=0、page error=0、HTTP 5xx=0；screenshots：`output/qa/dev-077-browser/dev-077-desktop.png`、`output/qa/dev-077-browser/dev-077-tablet.png`、`output/qa/dev-077-browser/dev-077-mobile.png`。
- 既有 regression：`qc:pdm-approval-platform` 123/123 PASS、`qc:pdm-production-slice-numbering-draft` 34/34 PASS、`qc:pdm-numbering-api-regression` 23/23 PASS、`qc:pdm-numbering-concurrency-reuse` 32/32 PASS；另已修正兩個disposable regression fixture的unified `drawings` FK清理順序。typecheck PASS、isolated build PASS、lint 0 errors（15 warnings）。
- isolated runtime port 3100、PostgreSQL disposable runtime與browser task-owned runtime均已停止／清理；未執行 production mutation、deploy或release。

## 2. Scope

### In Scope

- `/numbering/search` root detail drawer的`作廢草稿編號`與`申請圖料根號作廢`互斥規則。
- server-owned root action policy：domain、permission、company與environment capability。
- Draft／NeedInfo official bundle direct-obsolete transaction、controlled-reference gate、no-reuse、audit與history projection。
- Active／Released aggregate impact、obsolete request、approval decision與controlled-history結果。
- production Slice A UI止血、Slice B draft obsolete、Slice C formal obsolete／approval的method＋action-code default-deny。
- SQLite／PostgreSQL相關repository行為一致性、concurrency與zero partial mutation。
- 1440×900、1024×768、390×844 rendered UI、keyboard、touch、focus、visible error、network、console與overflow。

### Out of Scope

- candidate workspace、`part_number_drafts`的cancel／void／recycle policy。
- official root／drawing／part hard delete、sequence reset／reuse、physical purge、retention job或formal obsolete restore。
- production資料修復、schema migration、部署、traffic、production write smoke、rollback execution或release report。
- release、submission、BOM、CAD、file provider、import/export及其他仍未開放mutation。

## 3. Entry Criteria

- DEV-077 已達 `RD Implementation Ready`；實際 module／file、error code、transaction／lock、rollout與可重現commands已固定。
- authoritative ADR／SPEC與實作完成spec convergence check，沒有`Unresolved drift`。
- 測試使用隔離local fixture與受控staging資料；不得使用production business data。
- 能分別模擬production Slice A／B／C，且測試不會修改primary development environment。
- 有權限角色、無權限角色、cross-company角色與reviewer角色fixture。

## 4. Required Fixtures

| Fixture | Root／children state | References | Purpose |
|---|---|---|---|
| `DRAFT-CLEAN` | root＋all children Draft／NeedInfo | none | positive draft obsolete |
| `DRAFT-FILES` | root＋all children Draft／NeedInfo | ordinary attachments only | files preserved, not a blocker |
| `DRAFT-CONTROLLED-*` | root＋all children Draft／NeedInfo | one fixture per approval、revision package、shared CAD、baseline、replacement、BOM reconfirmation | direct path negative＋root approval positive matrix |
| `MIXED-STATUS` | at least one child PendingReview／Active／Released／Obsolete | any | direct path blocked |
| `FORMAL-ROOT` | root or children Active／Released，or root `MainDrawingInvalid` formal-responsibility projection | linked parts／drawings／relations | formal impact and approval |
| `FORMAL-PENDING` | Active／Released | existing pending obsolete request | duplicate request blocked |
| `CROSS-COMPANY` | eligible state | different company | scope denial |

fixture建立、使用與cleanup都要有manifest；不得以direct DB repair製造「通過」結果。若QA需要資料準備，可使用正式fixture builder／seed，但business mutation驗收仍必須走受測API／UI。

## 5. Phase Gate Matrix

| Gate | Entry | Required pass | Forbidden interpretation |
|---|---|---|---|
| A UI containment | implementation ready | `A-*`全PASS、P0/P1=0 | 不代表任何obsolete mutation已開放 |
| B Draft obsolete | Gate A PASS＋draft predicate／transaction ready | `B-*`、`P-*`、`D-*`全PASS、P0/P1=0 | 不代表formal approval已開放 |
| C Formal obsolete | Gate B PASS＋approval action isolation ready | `C-*`、`P-*`、`U-*`全PASS、P0/P1=0 | 不代表其他approval／release action已開放 |
| Production release | local＋staging gates pass | deployment-release-gate evidence | local simulated mode不等於production PASS |

第一個P0失敗、scope漂移或unexpected mutation時停止該gate，不跨到下一gate。

## 6. Acceptance Matrix

### A. UI Containment and Capability Truth

| ID | Priority | Scenario | Acceptance | Evidence |
|---|---:|---|---|---|
| `A-001` | P0 | Slice A，eligible Draft root | 顯示`作廢草稿編號`但inert／未開放；click、Enter、Space、touch均write count=0 | DOM＋network＋screenshot |
| `A-002` | P0 | Slice A，formal root | `申請圖料根號作廢`inert；不載入write form、不建立request | DOM＋network |
| `A-003` | P0 | UI與server policy比較 | hidden／inert／enabled、requiresApproval與blocked reason一致；client不自行把blocked action變enabled | policy payload＋DOM |
| `A-004` | P1 | blocked／permission／environment reason | keyboard與touch可讀人類原因；不顯示raw machine code、route、HTTP或stack | accessibility＋visible-error sweep |
| `A-005` | P1 | 1440／1024／390 | drawer、dialog、button、reason無重疊、裁切或非預期horizontal overflow | screenshots＋geometry |
| `A-006` | P1 | cancel／Escape／close | focus恢復到觸發控制，zero mutation | DOM＋network |

### B. Draft Official-Number Obsolete

| ID | Priority | Scenario | Acceptance | Evidence |
|---|---:|---|---|---|
| `B-001` | P0 | `DRAFT-CLEAN` positive | reason＋confirmation後exactly one POST；root＋children全為`Obsolete` | network＋DB before/after |
| `B-002` | P0 | identity preservation | root／part／drawing IDs與codes、relations、rows皆存在；sequence值不回退，後續allocation不重用 | DB readback＋sequence allocation |
| `B-003` | P0 | ordinary attachments | attachments仍linked且未被soft-delete；受控歷史可讀 | DB/API/history |
| `B-004` | P0 | audit | exactly one append-only event含actor、company、reason、before／after、counts、timestamp | audit readback |
| `B-005` | P0 | default list／history | default active list排除；include-history／受控歷史可查；不出現在已刪除資料 | API＋rendered UI |
| `B-006` | P0 | no reason／no confirmation | request 4xx且zero mutation／zero transition audit | API＋DB hash |
| `B-007` | P0 | repeated already-obsolete request | 同Idempotency-Key／同payload replay原result；新key回`LIFE_OBSOLETE_ALREADY_APPROVED`；均不得第二次transition或audit | API＋receipt＋audit count |
| `B-008` | P0 | `MIXED-STATUS` | direct obsolete blocked；formal eligible資料不得被draft path改寫 | API＋DB hash |
| `B-009` | P0 | each `DRAFT-CONTROLLED-*` | 每種受控引用獨立blocked，zero partial mutation | matrix＋DB hash |
| `B-010` | P0 | concurrent obsolete vs new controlled reference／status transition | PostgreSQL SERIALIZABLE＋row lock下exactly one合法結果；另一方回retryable conflict或controlled block，沒有partial state | PostgreSQL timeline＋DB hash |
| `B-011` | P0 | direct DELETE in Slice B | `DELETE .../draft`仍unopened／denied，zero mutation | API＋DB hash |
| `B-012` | P1 | success UX | 成功後drawer／list更新且低干擾回饋，不要求重開頁面才能理解結果 | rendered flow |

### C. Formal Obsolete and Approval

| ID | Priority | Scenario | Acceptance | Evidence |
|---|---:|---|---|---|
| `C-001` | P0 | formal impact preview | 顯示root、Active／Released與受控Draft／NeedInfo targets、dependency counts、relations、warnings與pending request；read zero mutation | UI/API＋DB hash |
| `C-002` | P0 | create obsolete request | reason＋ack後建立one request／batch；targets status維持Active／Released | API＋DB before/after |
| `C-003` | P0 | duplicate pending request | stable conflict；不建立第二request／batch | API＋count |
| `C-004` | P0 | approved | permitted reviewer核准後eligible formal targets轉`Obsolete`並有requester／reviewer／reason／decision audit | UI/API/DB/audit |
| `C-005` | P0 | rejected | request resolved／rejected，formal target status不變 | API＋DB hash |
| `C-006` | P0 | needs_info | request進needs_info，formal target status不變且可追溯 | UI/API/DB |
| `C-007` | P0 | no reviewer permission／cross-company | decision denied before mutation | API＋DB hash |
| `C-008` | P0 | already terminal／stale targets | approval application fail closed；不可重新開啟或partial apply | API＋DB hash |
| `C-009` | P1 | approval UX | `/approvals`只顯示使用者可讀obsolete responsibility與impact，不暴露raw status／route | rendered UI |
| `C-010` | P0 | each `DRAFT-CONTROLLED-*` | direct path blocked後可建立root-scoped obsolete request；snapshot含受控原因／targets，approved後核定Draft／NeedInfo targets轉`Obsolete`，rejected／needs_info維持原狀態 | UI/API/DB/audit |

### P. Production Method and Action Isolation

| ID | Priority | Scenario | Acceptance | Evidence |
|---|---:|---|---|---|
| `P-001` | P0 | missing／unknown slice mode | unlisted writes default deny | unit／API |
| `P-002` | P0 | Slice A | draft／formal obsolete writes與generic decisions全部denied | API matrix |
| `P-003` | P0 | Slice B | 只允許eligible draft POST；formal request／decision與DELETE denied | API matrix |
| `P-004` | P0 | Slice C obsolete request types | 只允許root／part／drawing obsolete action；unsupported entity denied | API matrix |
| `P-005` | P0 | generic decision with obsolete action | request lookup後role／company／status重驗並可合法decision | API＋audit |
| `P-006` | P0 | generic decision with release／submission／other approval action | 即使path已允許仍回unopened denial，zero mutation | API＋DB hash |
| `P-007` | P0 | malformed／missing request ID or action | fail closed；不得fallback到generic apply | API＋DB hash |
| `P-008` | P0 | direct non-UI bypass | 與UI同一domain／permission／environment結果 | policy/API comparison |
| `P-009` | P0 | obsolete apply-failed retry vs other action apply | Gate C只允許三個obsolete action retry；其他action即使同path仍unopened且zero mutation | API＋DB hash |

### D. Data, Permission and Regression

| ID | Priority | Scenario | Acceptance | Evidence |
|---|---:|---|---|---|
| `D-001` | P0 | no auth／no permission | 401／403或既有denial，zero mutation | API＋DB hash |
| `D-002` | P0 | company mismatch | target not disclosed or mutation denied，zero mutation | API＋DB hash |
| `D-003` | P0 | SQLite／PostgreSQL parity | eligibility、transition、audit與blocked reasons等價 | repository tests |
| `D-004` | P0 | numbering allocation regression | obsolete official codes never become next allocatable value | allocation test |
| `D-005` | P1 | candidate／`part_number_drafts` regression | original cancel／void／recycle authority unchanged | existing regression suites |
| `D-006` | P1 | formal lifecycle regression | existing impact／approval／history flows outsideproduction simulation remain valid | existing focused suites |

### U. UX / Accessibility / Visible Error

| ID | Priority | Scenario | Acceptance | Evidence |
|---|---:|---|---|---|
| `U-001` | P1 | 5-second understanding | 人工可辨識root、不可回收與是否需approval | manual walkthrough |
| `U-002` | P1 | action vocabulary | allocated draft只顯示`作廢草稿編號`，formal只顯示`申請圖料根號作廢`；不得同時enabled | DOM inventory |
| `U-003` | P1 | risk dialog | root、counts、reason、acknowledgement、cancel與danger action可辨識 | screenshot＋DOM |
| `U-004` | P1 | keyboard／touch | focus visible、Escape close、touch reason可讀、no hover-only | interaction evidence |
| `U-005` | P0 | runtime-visible error gate | 無`.inline-error` raw failure、visible 4xx／5xx、Not Found、Internal Server Error或API route text | DOM＋screenshot＋network |
| `U-006` | P1 | console／layout | no unexpected console error、no critical clipping／overlap／overflow | console＋geometry |

## 7. Evidence Requirements

- exact revision／branch、environment、DB kind、slice mode與fixture manifest。
- policy、permission、API status／payload、DB before／after hash、row／relation／file／sequence readback與audit count。
- concurrency timeline與結果，不只最終status。
- 1440／1024／390 route screenshots或等效DOM evidence、focus／touch結果、visible-error、network與console manifest。
- targeted typecheck、lint、build、DEV-077 focused suite與既有numbering／lifecycle／production-slice regressions；使用第10節固定commands。
- 明確聲明未執行production mutation、deploy、traffic、rollback、direct repair或release。

## 8. No-Go / Stop Conditions

- 任何official identifier row被hard delete、sequence回退或號碼可重用。
- draft direct-obsolete只靠UI status；mutation admission未重驗auth／permission／company，或transaction未鎖定並重檢status／controlled reference。
- ordinary file／relation／row在作廢後遺失，或Obsolete出現在已刪除資料而非受控歷史。
- enabled CTA收到unopened denial，或inert CTA發write。
- generic approval path可處理非obsolete action。
- approval approved前正式status已變更，或rejected／needs_info造成正式mutation。
- visible raw machine／HTTP／route／stack error、unexpected 4xx／5xx、console error或主要viewport不可操作。
- 需要production資料修復、schema migration、hard delete、reuse或改變已確認三段gate。
- 任一P0/P1 open、evidence來源不明或local simulated mode被當成production acceptance。

## 9. Completion Rule

QA計畫建立不計產品完成。只有RD實作完成、Gate A／B／C在其適用範圍P0/P1=0、targeted QC通過，且production slice另由`DEV-032`／deployment-release-gate完成exact release evidence後，DEV-077才可依實際交付邊界更新完成率。

## 10. Fixed Verification Commands and Evidence

DEV-077 focused implementation 已在`package.json`建立下列入口；以下 commands 均已在隔離環境執行並保留結果。production deployment／traffic／write smoke／rollback仍須由`DEV-032` release gate另行完成：

```text
npm run typecheck:app -- --pretty false
npm run qc:dev-077:contract
npm run qc:dev-077:gate
PDM_BASE_URL=http://127.0.0.1:3100 PDM_DATA_DIR=tmp/dev-077-qc npm run qc:dev-077:api
npm run qc:dev-077:postgres
npm run qc:dev-077:browser

# 既有回歸與 release 前的必要 gate
npm run lint
npm run qc:pdm-numbering-api-regression
npm run qc:pdm-numbering-concurrency-reuse
npm run qc:pdm-approval-platform
npm run qc:pdm-production-slice-numbering-draft
npm run build:isolated
```

固定script mapping：

- `qc:dev-077:contract` → `node scripts/qc-dev-077-contract.mjs`：repo contract、route、policy與UI vocabulary static convergence，12/12 PASS。
- `qc:dev-077:gate` → production lifecycle gate parser／allowlist pure checks，5/5 PASS；missing／unknown gate fail closed。
- `qc:dev-077:api` → `node scripts/qc-dev-077-api.mjs`：隔離SQLite authenticated API flow，14/14 PASS；使用隔離暫時runtime並在完成後釋放port。
- `qc:dev-077:postgres` → `node scripts/qc-dev-077-postgres-concurrency.mjs`：隔離PostgreSQL 17 concurrency／snapshot／idempotency與controlled-reference suite，17/17 PASS；需提供`PDM_TEST_POSTGRES_URL`，script只接受loopback非預設port並在完成後釋放task-owned runtime。
- `qc:dev-077:browser` → `node scripts/qc-dev-077-browser.mjs`：隔離SQLite authenticated Chromium gate，27/27 PASS；涵蓋desktop／tablet／mobile、CTA／dialog／reason／ack、geometry、overflow、console／page／5xx sweep，screenshots保存於`output/qa/dev-077-browser/`。
- `qc:pdm-approval-platform`：123/123 PASS；`qc:pdm-production-slice-numbering-draft`：34/34 PASS；`qc:pdm-numbering-api-regression`：23/23 PASS；`qc:pdm-numbering-concurrency-reuse`：32/32 PASS。兩個disposable fixture均已修正unified `drawings` FK cleanup順序。
- `lint`：0 errors、15 warnings；`build:isolated`：PASS。warnings為既有window navigation／a11y／hook/img提示，非DEV-077新增error。

Evidence root固定為`output/qa/dev-077-official-numbering-lifecycle/<runId>/`。`run-manifest.json`至少記錄revision／branch、environment、DB kind、lifecycle gate、fixture、commands、P0/P1 totals、cleanup與verdict；同目錄保存API matrix、DB hashes、audit／command receipt／outbox、concurrency timeline、screenshots、DOM、network及console。

## 11. Stable Error Acceptance

| API code | Expected HTTP | UI acceptance |
|---|---:|---|
| `feature_not_open_in_production_slice` | 403 | CTA在送出前inert，主畫面只顯示「尚未開放」；network write=0 |
| `idempotency_key_required`／`idempotency_payload_mismatch` | 400／409 | 保留輸入並要求刷新／修正；不得換key重送不同payload規避 |
| `OBSOLETE_REASON_REQUIRED`／`NUMBERING_DRAFT_OBSOLETE_CONFIRMATION_REQUIRED` | 400 | focus回到reason／ack；zero mutation |
| `NUMBERING_DRAFT_OBSOLETE_HAS_CONTROLLED_REFERENCES` | 409 | 刷新policy並顯示root-level申請作廢，不重試direct path |
| `LIFE_OBSOLETE_ALREADY_REQUESTED`／`LIFE_OBSOLETE_ALREADY_APPROVED` | 409 | 導向既有request或受控歷史，不產生duplicate audit |
| `ROOT_OBSOLETE_SNAPSHOT_STALE`／`ROOT_OBSOLETE_TARGET_MISMATCH` | 409 | apply failed且zero partial；重新impact／request或同scope retry |
| `NUMBERING_LIFECYCLE_CONFLICT_RETRY` | 409 | `retryable:true`；刷新policy後人工重送，不自動重播danger action |
