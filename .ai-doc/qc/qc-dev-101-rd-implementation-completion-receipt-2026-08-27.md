# DEV-101 Local RD Corrective Implementation Completion Receipt

Status：`RD_IMPLEMENTATION_READY / Local RD Corrective Implementation Complete / Independent QA-QC Required / Production Release Gated`

Date：2026-08-27

DEV：`DEV-101`

Evidence class：`RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC`

## 1. Outcome

DEV-101兩份CAPA所屬local RD corrective scope已完成：

1. `pdm_work_review_requests`已進canonical approval inbox；same company、exact reviewer、actionable status、search與cursor均在source query邊界處理，v1／v2使用同一row projection與server-owned full-page href。
2. 正常使用者路徑已閉合：owner建立／送審 → reviewer在`/approvals`找到案件 → 點列進full-page review → 切Drawing／Part target → return或request-level approve → 返回原清單狀態。
3. review page沿用Drawing／Part各自canonical renderer；上方同根Drawing × Part矩陣是唯一target切換入口，下方一次mount一個完整workspace，relation cell保持唯讀，decision dock維持request-level atomic。
4. Drawing recognition由摘要升級為`pdm-recognition-review-projection-v1`完整immutable projection，保存exact revision session、sources、candidate decisions、observations、canonical fields/scopes、owner resolution、effective owner、blocking reason與inner hash。
5. owner editor API與review package builder共用同一recognition projector；reviewer使用同一panel的snapshot mode，不poll、不呼latest／session API補主畫面。較新的不同revision／lineage session不會改變已送審package。
6. legacy meta-only recognition與unresolved／ambiguous Part owner在approve前fail closed，return仍可用；v1不backfill、不改hash、不假裝成完整v2。

## 2. Final Aggregate

- Manifest：`output/qa/dev-101-aggregate/DEV101-AGGREGATE-RD-2026-08-27T10-55-37-882Z/manifest.json`
- Run ID：`DEV101-AGGREGATE-RD-2026-08-27T10-55-37-882Z`
- Result：`RD_IMPLEMENTATION_READY`
- Lanes：11/11 PASS
- Source hash：before=`0d117fe72bf4efc06f8b97ce017b23ee728f120c01edbc2b8101324fb700db59`；after相同。
- Primary logical fingerprint：before=`81f42d36dd12661c74cdd716ed017936cc15909c561c044d37b3464b6a68372d`；after相同；foreign-key violations=0。
- Cleanup：aggregate temp removed=true；browser ports 60071／52679與PostgreSQL port 56979已釋放；兩個task-owned runtime projects已移除；既有localhost:3000未碰觸。

| Lane | RD supporting result |
|---|---|
| Contract | 22/22 PASS |
| Package／recognition integrity | 15/15 PASS |
| Canonical inbox adapter／mutant | 7/7 PASS |
| Repository／transaction regressions | 5/5 PASS |
| v2 normal-path owner／reviewer browser | 28/28 PASS |
| API permission／strict body／terminal | 5/5 PASS |
| v1 normal-entry browser | 16/16 PASS |
| Disposable PostgreSQL | 10/10 PASS |
| DEV-090 relation-retirement regression | contract 25/25、repository 5/5、mutation PASS |
| Typecheck／affected lint | PASS／PASS |
| Isolated production build | PASS，122 static pages；artifact／primary invariant／cleanup=true |

## 3. Corrective Evidence of the Recognition Gap

- Inner recognition hash mutant在即使重算target與outer package hash後仍被拒絕。
- submitted Drawing若owner resolution為unresolved，approve fail closed且zero formal effect。
- submit後建立更新的different-lineage recognition session，package／reviewer仍讀exact submitted revision。
- v2 rendered reviewer顯示immutable recognition projection與projection hash，network ledger對recognition latest/session endpoint為0。
- PostgreSQL首次rehearsal揭露driver timestamp `Date`與JSONB round-trip字串會造成hash漂移；reader已在canonicalization boundary統一為ISO字串，重跑後concurrent approve與JSONB package為10/10 PASS。失敗證據未刪除，不能以最終綠燈掩蓋修正過程。

## 4. Honest Completion Boundary

Aggregate固定分母為`QA-101-001..048`：PASS=0、FAIL=0、BLOCKED=0、NOT_RUN=48；`completionCandidate=false`、Independent QC=`NOT_RUN`。因此本收據只支持「DEV-101 RD開發完成並可交QA」，不支持`Local QA-QC PASS`、CAPA Effective或production ready。

仍未完成且不得混入本DEV結論：

- DEV-079 all-adapter owner resolver、accepted-state command／DB invariant、legacy reconciliation與GET zero-write sunset。
- A0002-M01 primary資料處置或既有v1 request重送。
- production/staging inventory、writer activation、migration、deploy、traffic或release。

本輪未stage、commit、merge、PR、deploy或release，未修改primary schema／data。
