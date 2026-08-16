# QA 驗證計畫：DEV-060 BOM 建立入口與物料身份／版次治理

對應任務：`DEV-060` / `DEV-PDM-BOM-MODULE-ENTRY-001`  
對應規格：`SPEC-BOM-WORKBENCH-001` 2026-08-10 Amendment  
對應 ADR：`ADR-PDM-MATERIAL-IDENTITY-REVISION-001`  
狀態：Executed / Local QA-QC Passed / Production Release Gated  
日期：2026-08-10  
風險：Medium；資料語意缺陷最高 P0

## 1. 結論邊界

- 本計畫驗證「方案 B」兩步驟建立頁、三種來源、canonical Part Number owner、獨立 BOM revision、權限、冪等與 workbench handoff。
- 靜態 source assertion 不能單獨證明建立流程通過；至少要有 isolated disposable runtime 的真實 UI 建立、API/DB readback 與 cleanup。
- Production、live Cloud SQL/GCS、正式資料 mutation、deploy、release 不在本 DEV 驗證邊界。
- 任一畫面、API、export 或 DB 新寫入仍把 Part Number 表示為有 Revision，判定 P0 未通過。

## 2. FMEA

| 失效模式 | 影響 | 優先級 | 必要驗證／護欄 |
|---|---|---:|---|
| 以 drawing submission revision 當 BOM revision | Drawing/BOM 被錯誤綁版 | P0 | schema/API assertion、獨立升版負向案例 |
| 無 canonical owner Part Number 仍可建立 | orphan BOM、Where-used 失真 | P0 | request tampering、FK/readback、UI blocker |
| double click／timeout retry 建立兩份 Draft | 重複草稿與稽核污染 | P0 | idempotency key、response-loss readback、DB count |
| 空白人工 BOM 仍要求 submissionId | 第三來源無法使用 | P1 | manual source 真實建立，`sourceSubmissionId=null` |
| CAD/XLS source 偷改 owner 或 BOM Rev | 來源資料成為治理 authority | P0 | mismatch request、server reject、owner/revision readback |
| Engineer 跨公司或製造／採購建立 Draft | 權限與資料隔離失效 | P0 | role/company negative cases |
| legacy revision 被顯示成料號版次 | 使用者做錯換號／升版判斷 | P1 | visible-text inventory、export/diff schema check |
| migration 猜測不明 legacy ownership | 歷史 BOM 被錯配 | P0 | dry-run `manual_review`、零 destructive write |
| mobile/低高度無法返回或完成第二步 | 主要任務阻斷 | P1 | 390×844、1024×768 真實操作 |

## 3. Gate 0：Provenance 與安全

記錄 repo root、branch、HEAD、dirty files、runtime URL、port owner、DB provider/path、company、actor/role、feature flags、migration version、`productionConnected`、`productionWrites` 與 timestamp。Mutation 只允許名稱含 `QA_DEV060_<runId>` 的 isolated disposable資料；不能證明隔離時停止 mutation，整體最多 `未充分驗證`。

## 4. Gate 1：Schema／Migration Contract

必測：

- canonical owner 為 `part_numbers.id`；新 BOM draft/release 有獨立 `bom_revision`。
- DEV-060 create suggestion 依 BOM release history 使用 `release_area` major revision；無歷史時為 `1`，不得由 Drawing Rev 或 minor revision 成為正式 Released BOM。
- `source_submission_id` nullable；manual source 不建立假的 submission。
- 新 active/pending uniqueness 以 `owner_part_number_id + bom_revision` 為鍵。
- 新 line write 不填 `child_revision`／`revision` 作為料號版次；merge key 不含料號版次。
- migration dry-run 對 company + part number 唯一者產生 deterministic mapping；缺少 identity、衝突或序列不明者輸出 `manual_review` 並 fail closed。
- legacy source submission/drawing revision 與 migration reason 可追溯；不得刪除 Released snapshot。
- SQLite、PostgreSQL migration 與 Supabase mirror/manifest schema parity 通過。

## 5. Gate 2：API／Permission／Idempotency

| ID | 案例 | 預期 |
|---|---|---|
| API-001 | 合法角色搜尋 owner Part Number | 只回傳同 company 且非終止身份；無 BOM history 時 server suggestion=`1`，且不讀 Drawing Rev |
| API-002 | 空 owner／不存在／跨公司 owner | 400/404/403，人類可理解錯誤，零 Draft |
| API-003 | Engineer 建立自己 created part、自己 submission_part_scope part、legacy 自己 submission exact-part；R&D Manager/Admin 建立同 company part | 依 exact predicate 成功 |
| API-004 | Manufacturing、Procurement 建立 | 403，零 Draft |
| API-005 | manual create | `source=manual`、`sourceSubmissionId=null`，正確 owner/bomRevision |
| API-006 | CAD create | source submission 同 company 且關聯同 owner；否則 fail closed |
| API-007 | XLS create | 檔案 policy、profile/version、owner/revision、來源證據皆保存 |
| API-008 | 同 idempotency key 重送／double click | 回同一 receipt/draft，DB effect count=1 |
| API-009 | server commit 後 client 遺失 response | authoritative readback 找到同 Draft，不發第二次 effect |
| API-010 | 同 owner + BOM Rev 已 PendingReview | 建立／送審依 lifecycle rule 阻擋，不以 drawing rev 繞過 |

## 6. Gate 3：真實 UI 主流程

AI 需從側欄執行，不得直接呼叫 handler 代替：

1. 看見 `BOM > 建立 BOM / BOM 工作台 / BOM 審核`，三者目的可在 5 秒內回答。
2. 進入 `/bom/new`；第一步看見三個互斥路徑：已偵測組合件、建立全新空白 BOM、已有 BOM 草稿。
3. 組合件區只顯示有 CAD 組合件證據且沒有進行中草稿的 owner；沒有證據時呈現空狀態，不把既有 BOM 行數當成組合件證據。
4. 空白 BOM 區只能選沒有進行中草稿的 canonical owner，BOM Rev 由 BOM history 預填；建立空白 BOM 直接建立零 line Draft。既有 Draft／PendingReview／Rejected 只提供續作入口。
5. 組合件與 XLS 路徑進入第二步；第二步可分別完成 CAD、SolidWorks XLS、空白人工三種來源。
5. 建立前摘要明示 owner Part Number、BOM Rev、來源；Drawing Rev 只能出現在 CAD 來源證據區。
6. 建立成功導向 `/bom/workbench?draftId=<id>`；hard reload/deep link 可恢復同一 Draft。
7. Cancel、Back、重入不產生 Draft；成功後 Back/Forward 不重送 POST。
8. `BOM 審核` 進入 canonical `/approvals?domain=bom`，不建立第二審核 authority。

## 7. Gate 4：治理負向案例

- Drawing Rev 由 `0.1` 升至 `0.2`、BOM 結構不變：Part Number 與 BOM Rev 不自動變更。
- 同 Part Number 的 BOM 結構改變：只建立下一 BOM Rev，Drawing Rev 不自動變更。
- Drawing 與 BOM 都改變但身份不變：同 Part Number，各自獨立 Rev，可為不同值。
- FFF／互換性／法規品質身份條件確認改變：舊 Part Number 下不得建立「新料號版次」；必須導向新 Part Number 流程，新 Part Number 再建立自己的 BOM。
- CAD/XLS 內的料號、Drawing Rev 與使用者所選 owner 不一致：顯示 mismatch，禁止靜默改 owner。
- Released 舊 BOM、Where-used 與舊料號在上述案例後 hash/count 不變。

## 8. Gate 5：UI／Accessibility／Visible Noise

必測 viewport：`1440x900`、`1024x768`、`390x844`。每個 viewport 驗證：

- 無水平 overflow、裁切、重疊、sticky footer 遮擋或不可達 CTA。
- Tab 順序依「owner → BOM Rev → 下一步 → source → 建立」，focus 可見且錯誤後回到第一個無效欄位。
- loading、empty、no-result、403、409、413、500、timeout/unknown-result 均有人類文案與安全復原動作。
- 首屏不恢復已刪除的流程定位 strip；三個建立路徑各自只保留一個 primary CTA，既有草稿以 row/link 續作，不複製建立動作。
- 不顯示 raw payload、SQL、stack、route 名稱、secret 或模糊的 `Current/Next/5 steps` 雜訊。

## 9. Gate 6：Regression 與證據

最低命令／證據：

- `npm run typecheck`
- affected-file ESLint
- 新增 focused schema/migration、HTTP/idempotency、UI 與 real-operation QC scripts
- 既有 BOM foundation、tree rules、review/release、release gate/resubmit、export、permission、migration path、XLS import 與 UI suites
- browser trace、三 viewport screenshots、console/network、API receipts、DB before/after、migration dry-run、data sanity、cleanup result

建議 evidence root：`output/qa/dev-060-bom-create/<runId>/`。必含 `provenance.json`、`migration-dry-run.json`、`operations.json`、`network.json`、`data-sanity.json`、`cleanup.json`、screenshots 與 summary。P0/P1 不為 0、cleanup 非 removed、production connection/write 不為 false，或缺任何三來源真實操作時，不得判 PASS。

## 10. Stop Conditions

- 無法用 canonical Part Number 建立 owner，仍需以 submissionId 當 authority。
- 必須猜測或直接覆寫 legacy BOM revision／Released snapshot。
- 任一來源無法做到冪等或 unknown-result authoritative readback。
- 權限只能靠 UI 隱藏，API 無法 company fail closed。
- 需要 production/live cloud mutation、資料刪除、deploy 或 release 才能驗證。

## 11. 執行結果（2026-08-10）

- 結論：PASS；本機／isolated範圍無 open P0/P1。
- focused real-operation：`npm.cmd run qc:dev-060-bom-create` 50/50 PASS，涵蓋三來源真實 UI、canonical DB readback、idempotency/response-loss readback、已占用 BOM Rev 409、Engineer/R&D Manager/跨公司/Manufacturing/Procurement角色矩陣、review/release/export與3 viewport。
- migration baseline：`npm.cmd run qc:bom-workbench-migration-path` 21/21 PASS；PostgreSQL 028與Supabase mirror/manifest artifact已建立，未套用live target。
- 靜態品質：`npm.cmd run typecheck`與 affected-file ESLint PASS。
- 隔離邊界：random local port、temporary copied SQLite、temporary repository、獨立 Next dist；`productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`。
- 視覺證據：`output/playwright/dev-060-bom-create/`；完整判定見 `.ai-doc/qc/qc-dev-060-bom-entry-material-identity-validation-report-2026-08-10.md`。
