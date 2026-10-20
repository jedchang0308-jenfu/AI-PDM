# DEV-122：AI-PDM 內部自用功能契約

狀態：`ACTIVE_CAPABILITIES_PENDING`

適用產品：公司內部自用的 AI-PDM

主要裝置：桌面瀏覽器

機器可讀分母：[DEV-122-self-use-acceptance.v1.json](DEV-122-self-use-acceptance.v1.json)
歷史原文：[DEV-122 contract history](DEV-122-ai-pdm-internal-function-issues.history-through-2026-10-19.md)

## 1. 決策

DEV-122 保留原始 7 issues／29 groups 作為總驗收分母，不刪除、重排或把舊 FAIL 改成 PASS。現行施工與選測改以四項產品能力管理，讓各切片能獨立交付與重用證據；四項能力／11 個核心案例是優先工作視圖，不取代 7／29。

這個系統是單一公司內部工具，沒有 SaaS 多租戶銷售、外部客戶 SLA、行動裝置優先或供應商入口的現行需求。若未來需求成立，以獨立 DEV 加回其責任與驗收，不在本 DEV 預先維護未使用的控制。

## 2. 現行範圍

| 能力 | 目標 | 現況 | 結案條件 |
|---|---|---|---|
| `identity_roles` | 正常登入；管理員可智慧辨識；RD 可讀寫及送審；RD 不可核准 | `LOCAL_RD_PERMISSION_PASS / PRODUCTION_PENDING` | 實際 actor 的 allow／deny 與拒絕零副作用 |
| `pdm_lifecycle` | Part 首次發行、Drawing major／minor、退回與重送保持一致 | `LOCAL_NATIVE_AND_UI_EVIDENCE_AVAILABLE` | 受影響交易、CAS、rollback／replay 通過 |
| `drawing_preview` | 目前版本 PDF 可閱讀；預覽任務有限且有終態 | `LOCAL_QC_PASS / PRODUCTION_ACCEPTANCE_PENDING` | 正確版本 bytes、桌面可讀性、terminal／error 行為 |
| `operations` | 正確來源建置、候選 smoke、切換讀回與 rollback-ready | `NO_RELEASE_IN_THIS_CHANGE` | 只有實際發布時驗 exact source／image／revision／traffic |

能力可獨立標記 `PASS`、`FAIL`、`PENDING` 或 `NOT_APPLICABLE`。一項能力未完成，不改寫其他能力已成立的證據；DEV-122 整體結案仍需原始 7／29 全部有可接受結果。

## 3. 十一個核心案例

### 身分與角色

| ID | 可觀察結果 |
|---|---|
| `AUTH-01` | 既有正常帳號可登入、reload 維持同一身分，logout 後受保護入口為 401。 |
| `AUTH-02` | 具有目前有效管理員 grant 的 actor 可讀取並啟動智慧辨識。 |
| `AUTH-03` | 具有目前有效 RD grant 的 actor 可讀取圖號工作台、建立／編輯並送審。 |
| `AUTH-04` | 同一 RD actor 核准時拒絕，拒絕前後 lifecycle 資料與 queue 無副作用。 |

### PDM 生命週期

| ID | 可觀察結果 |
|---|---|
| `LIFE-01` | Part 首次發行於同一交易建立正式狀態與目前指標；一般編輯不發行。 |
| `LIFE-02` | Drawing major 核准後 canonical、master、revision pointer 與目前檔案一致。 |
| `LIFE-03` | Drawing minor 不錯誤發行或覆蓋 major 正式指標。 |
| `LIFE-04` | 退回、fresh 重送、grant 撤回、stale CAS、故障 rollback 與 replay 保持可預期且不重複套用。 |

### 圖面預覽

| ID | 可觀察結果 |
|---|---|
| `PREVIEW-01` | UI 顯示目前 revision 綁定的 PDF；桌面可翻頁、縮放並讀取尺寸與註記。 |
| `PREVIEW-02` | preview list／asset 輪詢有上限；ready、failed、delayed 與停止自動刷新均有明確終態及可恢復操作。 |

### 營運

| ID | 可觀察結果 |
|---|---|
| `OPS-01` | 實際發布綁定確切 source SHA、image digest、revision、traffic 讀回與前一 revision rollback 目標。 |

### RD 圖號工作台當前恢復點（2026-10-20）

PR #386 的 exact main 為 `21a1ba0b6a6f7a142e0c03a99d4461316bff711d`。C56 run `39192302084` 的 prepare／build與 Cloud Build `b24a3b7f-614e-451c-b3d2-23f924771d3d` 成功；migration 在任何新 Job execution 前以 `MIGRATION_JOB_READBACK_MISMATCH` 停止，terminal 為 `PRE_ACTIVATION_ABORTED / NOT_APPLIED`，正式 revision／traffic 未變，worker 為 `PAUSED_RECOVERED`。provider readback 證明 reuse receipt 的 runner digest／source 與 live `ai-pdm-prod-migration-runner` 不同，而 producer 重發舊 receipt 時沒有讀取 live Job。

R25 唯讀 run `39196373315` 證明 ledger 為 33，migration 084／085 均 `NOT_APPLIED`，判定為 `AUTHORIZED_CONDITION_085_ABSENT`；prepare／build／migrate 均未執行。當前 corrective 將 reuse receipt 升為 v2，先驗 live Job READY、identity、template、digest 與 runner source，並在 ordinary full35 分離 release source 與 runner source。恢復順序是完成本切片 required CI 與 protected merge，再由正常 app-owned APP_INFRA 路徑建立 provider 一致的新 runner receipt，之後以 fresh exact-main capsule 執行 full35；不得手動 patch Job。085、catalog v7、candidate、traffic及專用測試 RD 帳號的 UI／API 正負驗收仍未完成，原 7 issues／29 groups 與 DEV-122 整體維持 `NOT_ACCEPTED`。

後續 C67 owner run `39254333670` 在 prepare 以 `DATA_CUTOVER_AUTHORITY_REF_INVALID` 停止，build／migration／candidate／traffic 均未執行；C69 只有 exact-source 輸入準備，未派送。PR #394 已修正 live Cloud Run v2 Job readback 的 terminal／generation 契約，但未改變正式 service、ledger、catalog 或 traffic；這些失敗與未執行狀態不得因本次精簡而改判。

C70 的 prepare／build 已完成，但 migration outcome 為 `UNKNOWN`；其 immutable `prepare.json` 合法帶入 `ai-pdm.principal-postbuild-pre-migration-abort-basis.v1`。C77／C78 exact-main worker reuse 在任何新 evidence publication 前，由共用 continuation reader 以 `DEV121_PREACTIVATION_CONTINUATION_INVALID` 拒絕。直接證據顯示 reader 的 completed-build allowlist 只接受 prebuild／unpublished basis，卻漏掉同一模組本身產生的 postbuild-pre-migration basis；因此第二次 postbuild attempt 無法承接前一次 postbuild／UNKNOWN migration lineage。最小修正只把該具名 schema 加入 closed allowlist，既有 failed intent、previous revision、control SHA、source、hash、provider 與零重送守門不變；未知 schema 仍拒絕。production-shaped `postbuild → postbuild → UNKNOWN migration` fixture 與負例已加入。本機 planner 判定 `FULL`；focused 33／33、worker 108／108、required continuous QC 479／479、catalog v7 3／3、abort 6／6、DB boundary、typecheck 與 isolated build均通過。required CI、protected merge、新 exact-main immutable evidence、full35、migration 085、catalog v7 active readback、專用測試 RD actor 的 UI／API 正負驗收仍未完成，故 production acceptance 與 DEV-122 整體仍為 `NOT_ACCEPTED`。

### Release source authority 與 artifact transport 分離

Active owner release 的跨元件來源權威只由 protected release intent 的 exact `sourceRevision`／canonical source lock，以及 worker reuse association 的相同 `sourceRevision`／`sourceLockRef` 構成。app 與 worker 可由不同 OS、tar 或 gzip 實作產生來源物件；archive SHA、generation 與 CRC32C 只驗各自上傳物件，不得跨 build、attempt 或 descriptor 決定 source identity。worker artifact 另由逐檔 input manifest、effective recipe、provider build identity 與 image digest 驗證。

Reader 能否讀取已准入 revision、requested revision 應採 current 或 historical profile policy，以及 executable bytes 來自 current checkout 或 historical archive，是三個分離事實。既有 v1～v4 receipt 欄位維持 immutable legacy metadata；只有 provider readback 證明正式 rollback／recovery 不再引用時，才可另行移除相容 reader。本切片不執行正式發布，也不把本機或 CI 結果宣稱成 RD production acceptance。

## 4. 已刪除或縮減的額外要求

| 項目 | 處置 |
|---|---|
| 原始 7 issues／29 groups | 保留總驗收分母；不再要求每一組重跑同一套發布、DB、worker 與 UI 證據。 |
| 外部 supplier 回覆 | `DISABLED_DEFERRED`／`NOT_PASS`；端點維持 fail closed，本次不恢復施工。 |
| procurement 清單 | 縮為公司內部清單的既有案例；刪除外部 portal、SLA、規模化與未提出的流程要求。 |
| 完整原生 CAD 自訂屬性對等 | `USER_OWNED_PENDING_NOT_PASS`；本次不恢復施工或以 PDF 代替原結果。 |
| 390×844 全流程與每頁鍵盤證據 | 不屬預設驗收；只有明確行動情境或關鍵表單可達性受影響時執行。 |
| 每案完整 GET／POST／actor／grant／source／image／revision／traffic／截圖組合 | 刪除；只保存對應失敗機制的證據。 |
| 低風險 UI／文字修改的獨立 QC | 刪除；focused test、lint／typecheck 與 CI 足夠。 |

## 5. 變更責任與關卡

`scripts/plan-production-slice.mjs` 是唯一機械式選擇器。文件敘述不得額外展開一套平行 gate。

| 變更責任 | 必要檢查 | 不自動要求 |
|---|---|---|
| 純文件 | planner 與文件連結／JSON 解析 | app build、PostgreSQL、瀏覽器、發布 |
| 一般 application／UI | focused tests、lint／typecheck、isolated build、桌面 smoke | native PostgreSQL、migration、行動版、獨立 QC |
| authorization | focused allow／deny、實際 actor（正式驗收時）、consumer 相容 | DB gate；除非同時修改 schema／migration／repository |
| database／lifecycle | DB boundary、forward-only migration、native PostgreSQL、交易／rollback | 未受影響 worker／preview 歷史 |
| preview／file | current-version binding、bytes／hash、terminal job、桌面可讀性 | 授權或 DB 全套；除非路徑也受影響 |
| worker | job claim／complete、terminal、bytes、來源與 cleanup | 一般 UI 全套 |
| infrastructure／release-control／unknown | protected full gate | 無 |

授權程式碼不再因「authorization」分類自動觸發資料庫檢查；只有實際資料庫責任路徑才啟用 `database`、`dbBoundary`、`nativePostgres` 與 `migration`。

## 6. 證據最小集合

- 權限：actor、目前有效 grant、allow／deny、拒絕零副作用。
- 生命週期：輸入、交易結果、目前資料 readback、rollback／replay。
- PDF／檔案：revision 綁定、bytes hash／size、畫面可讀性。
- worker：source／job、claim／complete、terminal、錯誤與 cleanup。
- 發布：source SHA、image digest、revision、traffic、rollback revision。
- 純 UI：操作結果與必要畫面；非視覺變更不要求截圖。

本機、合成或 API PASS 只證對應層級。原始 FAIL、UNKNOWN、NOT_RUN 保持原狀；同一責任未變的既有證據可重用。

## 7. 發布流程

對產品與審查者只暴露五個邏輯階段：`preflight → build → migrate-if-needed → candidate-smoke → activate-readback`。既有 executor 的內部 jobs 與收據可維持相容實作，但不再是 DEV-122 的逐項人工驗收清單。

- `migration=true` 只由 database 或 full gate 產生。
- application／preview／recognition 變更不得因無 DB 變更而新增資料庫驗收要求。
- 正式發布仍使用不可變來源、required CI、provider readback 與既有 rollback。
- 本契約不授權正式發布、IAM／Secret、資料寫入或資源新增。

## 8. 共同安全底線

- 實際 Principal 與有效 grant 必須 fail closed；不得以 UI 隱藏替代 server 授權。
- RD 不得核准自己送審的工作；撤權後不得沿用舊決策。
- 核准、正式狀態與目前指標必須同交易或完整回復。
- DB 變更只允許 `db/postgres` 的 forward-only migration，並執行 `npm run check:db-boundary`。
- 不手動修改正式資料庫；未知寫入先 provider readback，再決定是否重試。
- PDF／CAD／attachment 必須綁定目前 revision 的實際檔案。
- 只清理經驗明為本任務建立的 runtime、port、tab 與暫存路徑。

## 9. 歷史對照

| 原項目 | 現行去向 |
|---|---|
| `D122-01`、`D122-02` | 已修歷史回歸；只有受影響時重驗。 |
| `D122-03`、`D122-04` | `pdm_lifecycle`。 |
| `D122-05` | `drawing_preview` 與受影響 worker。 |
| `D122-QA-01` | 測試可信度要求；不是產品能力。 |
| `D122-06` | `operations`／內部 procurement 清單；保留在原 7／29 分母，僅刪除外部 portal、SLA 與規模化假設。 |
| `D122-07` | supplier `DISABLED_DEFERRED`。 |
| `D122-08` | 原 7／29 之外的追加修復；已完成歷史修復，按來源適用性重用，不改變原分母。 |

完整舊契約、B23～B54 續點、7／29 對照、原始正式失敗與 QA/QC 連結均保存在歷史原文及既有收據；歷史檔不能自行恢復已刪除的額外流程或擴張現行施工。

## 10. 結案

每項能力在其優先核心案例中沒有未處理 FAIL，且需要正式環境的案例取得對應正式證據後，可獨立標記完成並停止重跑未受影響責任。DEV-122 整體仍以原始 7 issues／29 groups 結案；supplier 維持 `DISABLED_DEFERRED / NOT_PASS`，完整原生 CAD 維持 `USER_OWNED_PENDING_NOT_PASS`，本次不恢復兩者施工。全流程窄 viewport、逐案完整證據包、無條件 DB／migration 與低風險獨立 QC 不是額外結案要求。
