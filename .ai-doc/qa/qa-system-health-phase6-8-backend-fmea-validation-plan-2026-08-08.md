# QA Validation Plan — System Health Phase 6–8 Backend FMEA

Date: 2026-08-08  
Role: QA  
Status: Prepared / Not executed  
Baseline commit: `0cc7a826`  
Candidate commits: `cbe5fb37`, `035ab305`, `f01d043b`

## 1. QA 結論

本計畫驗證 Phase 6–8 中會影響後端行為的三項變更：release filename conflict 與 drawing package asset 的 read-query batching、notification 五查詢並行化，以及 BOM import 原始檔由同步 I/O 改為 awaited asynchronous I/O。

目前既有 characterization 足以證明主要 happy path、400/401 query budget、基本順序與 notification error propagation，但不足以單獨支持後端風險關閉。QC 必須再補足跨 chunk duplicate/error、真實 SQLite/Postgres 語意、連線池壓力、BOM filesystem/DB failure ordering、權限副作用與 oversized payload 等情境。

本計畫區分兩個 gate：

- Regression gate：證明候選 commit 沒有改變既有 scope、順序、缺值、重複值、錯誤、檔案內容、DB side effects 與 lifecycle 語意。
- Release-readiness gate：除 regression 外，還必須關閉或正式接受 P0/P1 殘留風險。現階段 production deploy、provider activation、正式資料與 migration 均不在授權範圍。

## 2. 驗證範圍

### 2.1 In scope

- `AsyncReleaseRepository.findReleasedFilenameConflicts`
- `AsyncDrawingRevisionPackageRepository.loadPackageFileAssets`
- `AsyncNotificationRepository.listNotifications`
- `chunkReadQueryInput` 與 `READ_QUERY_BATCH_SIZE = 400`
- `AsyncBomWorkbenchRepository.createDraftFromSolidWorksXls`
- `saveBomImportOriginalFile`
- SQLite 與 Postgres async provider 對上述路徑的行為一致性
- API 邊界：`GET /api/notifications`、`POST /api/bom/drafts/import-xls`
- query budget、錯誤傳遞、權限/scope、filesystem/DB consistency、event-loop 與連線池資源風險

### 2.2 Out of scope

- `BomWorkbenchPresentation`、clipboard 與 `formatBytes` 等前端呈現/utility 行為
- auth、approval、release policy、lifecycle、canonical hashing 的產品修改
- schema、migration、production data、production provider pointer、deploy/release
- Settings、Secret Manager、preview worker 與目前使用者 dirty worktree
- 修復產品缺陷；QA 僅定義驗證、證據與 gate

## 3. 系統邊界與關鍵後端流程

| 流程 | 入口 | 核心依賴 | 主要輸出 / side effect | 不可改變的契約 |
|---|---|---|---|---|
| Release conflict preflight | release service | submissions、submission_files、async DB provider | conflict list 或 release block error | 只比對其他 item 的 Released submission；case-insensitive filename；依輸入順序保留 duplicate；missing 不輸出 |
| Drawing package asset load | package repository private path | file_assets、async DB provider | scoped asset rows | 只允許同 drawing、未刪除 asset；trim/deduplicate 後保留首次輸入順序；missing 不輸出 |
| Notification aggregation | `GET /api/notifications` | 五個 read queries、auth、storage evidence | severity/time 排序清單與 summary | Engineer scope 不可外洩；Manager/Admin team scope 不可縮小；任一 DB error 不得回傳部分成功資料 |
| BOM XLS import | `POST /api/bom/drafts/import-xls` | auth、submission、filesystem、parser、DB transaction/repository | original file、file_asset、draft、lines、job、edit event、audit | 未授權/無 parent/無效檔案不得寫入；成功回應前檔案必須落地；hash/storage key/DB reference 必須一致 |

## 4. FMEA 方法

- Severity（S）：1 無感；2 輕微；3 功能受限；4 主要流程失敗；5 權限外洩、錯誤發行、資料不一致或服務可用性重大影響。
- Occurrence（O）：1 極少；2 特定邊界；3 可合理發生；4 常見；5 高頻。
- Detection difficulty（D）：1 立即可見；2 一般測試可見；3 需整合測試；4 需故障注入/壓測；5 容易靜默通過。
- RPN：`S × O × D`。
- Priority：P0 為 S=5 且涉及權限/發行/資料完整性，或 RPN >= 60；P1 為 RPN 40–59 或主要流程高風險；P2 為 RPN 20–39；P3 低於 20。

## 5. FMEA 風險表

| ID | 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | S | O | D | RPN | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---:|---:|---:|---:|---|---|
| FMEA-RQ-01 | Release conflict false negative | batch SQL、key normalization 或跨 chunk merge 漏掉已 Released 的同名檔 | 錯誤放行，正式發行檔名衝突 | 真實 DB fixture；baseline/candidate deep-equal；跨 400 邊界 duplicate | 5 | 2 | 5 | 50 | P0 | 覆蓋 case variant、same/other item、latest/old、duplicate 跨 chunk、missing |
| FMEA-RQ-02 | Release conflict false positive、順序或 duplicate 語意改變 | SQL 移除 per-input `LIMIT 1` 後 map first-row 不正確 | 合法發行被擋，錯誤訊息順序改變 | 同 key 多個 Released row 與時間 tie fixture | 4 | 3 | 4 | 48 | P1 | 對 baseline/candidate 做完整陣列 deep-equal，不只比 count |
| FMEA-RQ-03 | 400/401 邊界發生 parameter 或 expression limit error | release 每 pair 使用兩個參數；provider 上限不同 | 大附件包在發行前 500 | 0/1/399/400/401/800/801 provider integration | 4 | 3 | 3 | 36 | P1 | assert query count 與 provider 原始錯誤；SQLite/Postgres 都執行 |
| FMEA-RQ-04 | 大輸入一次啟動過多 chunk queries | `Promise.all(ceil(N/400))` 無總併發上限 | Postgres pool 排隊、timeout、其他 API starvation | 10k synthetic input、pool metrics、concurrent request load | 4 | 2 | 4 | 32 | P1 | 驗證業務輸入上限；若無上限，建立後續 concurrency cap DEV |
| FMEA-PA-01 | Package asset 跨 drawing、soft-deleted asset 被帶入 | batch `IN` scope predicate 漏失或 provider 行為差異 | 附件越權/錯包 | 兩 drawing + deleted fixture；DB/API row identity | 5 | 2 | 4 | 40 | P0 | 同時驗證 `linked_entity_type/id` 與 `deleted_at IS NULL` |
| FMEA-PA-02 | Asset trim/deduplicate/order/missing 語意改變 | DB `IN` 回傳順序不保證；merge key 錯誤 | package 內容順序或數量漂移 | reversed DB order、空字串、重複、missing、跨 chunk duplicate | 4 | 3 | 3 | 36 | P1 | 以 normalization 後 first-seen 順序做 deep-equal |
| FMEA-RQ-05 | 第二個 chunk 失敗仍回傳部分資料或錯誤型別改變 | Promise aggregation/error wrapping 不一致 | 呼叫端誤判完整結果，監控無法辨識原始錯誤 | 對每個 chunk 注入 unique Error identity | 4 | 2 | 4 | 32 | P1 | release/assets 必須 reject 原始 error，且不得 expose partial output |
| FMEA-NT-01 | Engineer 看到其他人的通知，或 Manager/Admin scope 被錯誤縮小 | 五查詢並行時共用 params、role 判斷或 SQL scope 漂移 | 權限外洩或主管漏接重大事件 | Engineer/Manager/Admin fixture；逐 query params 與 API payload | 5 | 2 | 4 | 40 | P0 | 五類通知逐角色驗證 positive/negative scope |
| FMEA-NT-02 | 通知排序、severity、summary 非決定性 | 五查詢完成順序不同、tie sorting 未 characterization | 使用者看到順序跳動或 critical count 錯誤 | 隨機 query completion、相同 timestamp、跨 kind ties | 3 | 3 | 4 | 36 | P2 | 重複 100 次輸出 deep-equal；summary 必須由 final list 計算 |
| FMEA-NT-03 | 任一 query 失敗時回傳部分 200 | `Promise.all` 被替換為 partial-success aggregation 或 route 吞錯 | 風險通知靜默缺漏 | 五種 query 各自 fault injection；HTTP status/body/server log | 5 | 2 | 4 | 40 | P0 | 必須 fail closed，不得回傳 partial notification list |
| FMEA-NT-04 | 五查詢佔滿 Postgres pool，併發 request timeout | default pool max 為 5；每 request 同時需要 5 connections | dashboard/notifications 延遲，連帶壓迫其他 read path | 1/5/10/25 concurrent API calls、pool wait/timeout/p95 | 4 | 3 | 4 | 48 | P1 | live non-production Postgres load；確認零 timeout 與 pool <= configured max |
| FMEA-NT-05 | 以 mock 的 `maxInFlight=5` 誤判 SQLite/實際 provider 效能 | SQLite async adapter 底層仍同步執行；mock 不等於 runtime | 優化成效被高估，event loop 仍阻塞 | SQLite/Postgres 分開量測，不混合結論 | 3 | 4 | 4 | 48 | P1 | 報告必須分 provider；mock 只證明 orchestration，不證明 live latency |
| FMEA-NT-06 | 並行讀取跨到資料更新，產生非單一 snapshot 清單 | 五查詢不在 read transaction | 短暫 summary/list 不一致 | 查詢 barrier 中插入受控資料變更 | 3 | 2 | 5 | 30 | P2 | 先確認 eventual-consistency 契約；不得把非原子 snapshot 宣稱為一致交易 |
| FMEA-BOM-01 | API 成功但 DB 指向不存在、截斷或 hash 不符的原始檔 | 未 await write、partial write、錯誤 storage key/hash | BOM 稽核證據不可追溯 | success 後讀回 bytes、size、SHA-256、relative storage key | 5 | 2 | 4 | 40 | P0 | success response 前完成檔案/DB cross-check |
| FMEA-BOM-02 | mkdir/write 失敗後仍建立 draft/job/audit | await ordering 或 error handling 錯誤 | DB 出現無檔案的匯入紀錄 | fs fault injection + DB before/after snapshot | 5 | 2 | 4 | 40 | P0 | fs failure 必須發生在 DB create 前且無 DB side effect |
| FMEA-BOM-03 | 檔案成功、DB transaction 失敗後留下孤兒檔 | filesystem 不在 DB transaction，無 compensation | repository 垃圾累積、重試難以稽核 | transaction step fault injection + filesystem inventory | 4 | 3 | 5 | 60 | P0 | 記錄現行行為；release-readiness 前需 cleanup/compensation 或正式風險接受 |
| FMEA-BOM-04 | 惡意 filename 造成 path traversal、覆寫或碰撞 | sanitize 不完整、Windows reserved name/case collision | 任意檔案寫入或證據被覆蓋 | `../`、絕對路徑、Unicode、reserved name、同 job collision | 5 | 2 | 4 | 40 | P0 | 實際 resolved path 必須位於該 importJobId directory，既有檔不可被覆寫 |
| FMEA-BOM-05 | 未登入/無 scope 使用者仍造成 file/DB write | auth/read permission 在 parsing/write 後執行或被繞過 | 越權寫入與磁碟消耗 | 401/403 fixture + filesystem/DB zero-delta | 5 | 2 | 4 | 40 | P0 | 認證與 scope gate 必須先於 file persistence |
| FMEA-BOM-06 | oversized multipart/base64 造成記憶體或 event-loop DoS | route 先把完整 payload 轉 Buffer；目前無明確 size cap | API process memory spike、其他使用者 timeout | 逐級 payload、RSS/heap/event-loop delay、HTTP status | 5 | 3 | 4 | 60 | P0 | 需求方先定義 max bytes；超限應在落地/解析前拒絕並留下可監控狀態 |
| FMEA-BOM-07 | Promise I/O 已改但同步 parser/hash 仍阻塞 | 全檔 Buffer parse 與 SHA-256 在主 thread | 大 BOM 匯入時其他 API latency 上升 | heartbeat + concurrent read API under import load | 4 | 3 | 4 | 48 | P1 | 分離 filesystem improvement 與 total request latency；不可只做 source regex 判定效能通過 |
| FMEA-BOM-08 | SQLite/Postgres failure atomicity 不一致 | import create path 僅在 Postgres 顯式 transaction；SQLite 直接逐步執行 | SQLite failure 留下部分 draft/line/job/audit | 每個 execute step fault injection，兩 provider DB diff | 5 | 2 | 5 | 50 | P0 | provider parity gate 必須比較 failure side effects，不只 happy-path payload |
| FMEA-BOM-09 | retry 建立重複 draft/asset/job 或覆寫 evidence | request 無 idempotency key；第一次結果不明 | 使用者重試後多份 Draft、孤兒檔增加 | timeout-after-write、timeout-after-commit、same payload retry | 4 | 3 | 4 | 48 | P1 | 先 characterize intentional new-draft behavior；不明結果 retry 需列殘留風險 |
| FMEA-OBS-01 | operational filesystem/DB error 被 API 回成 400 | route 將未知 exception 統一映射 400 | 監控誤判 client error，客戶端錯誤重試策略 | fs/DB fault 的 HTTP/status/error/server log | 4 | 3 | 4 | 48 | P1 | regression 先保留既有語意；另立 error taxonomy DEV，release 前需可觀測性決策 |

## 6. 風險處置建議

### 6.1 P0 必須先於 release-readiness 關閉

Release false negative、asset/notification scope leakage、BOM file/DB inconsistency、未授權 side effect、path traversal、oversized payload 與 provider failure atomicity不得以「既有 focused QC 通過」取代故障注入證據。

使用思考習慣：#可驗證性、#證據基礎、#系統描繪

### 6.2 Mock、SQLite、Postgres 結論必須分開

Mock `maxInFlight=5` 只證明程式在同一 Promise stage 啟動五個 query；SQLite adapter 底層同步執行，Postgres 又受 pool max=5 約束。效能報告不得把三者合併成單一「並行化成功」結論。

使用思考習慣：#證據基礎、#可驗證性

### 6.3 BOM size limit 與 orphan-file policy 需另立產品決策

目前程式沒有可引用的 BOM import 最大檔案大小，也沒有 DB failure 後的 filesystem compensation 契約。Regression gate 可記錄「未惡化」，但 release-readiness 不得在兩項尚未決策時宣告完整通過。

使用思考習慣：#系統描繪、#可驗證性

## 7. 驗證策略與階段

### Gate 0 — Provenance、環境與 fixture gate

- 記錄 baseline/candidate SHA、Node/npm 版本、OS、DB provider、schema hash、batch size。
- 使用 disposable data/repository directory；不得連 production，不得使用正式 CAD/BOM 檔。
- SQLite 使用 fresh schema + deterministic seed。
- Postgres 僅能使用已核准的 non-production isolated target；無 URL 時只能標記 live provider test `Blocked`，不能以 static QC 代替。
- 所有 fault injection 必須能清理 fixture，若 audit append-only 則使用整個 disposable database 回收。

### Gate 1 — Static contract 與既有 characterization

- 確認 batch size 400、BOM helper awaited promises、無 `mkdirSync/writeFileSync`。
- 執行 Phase 6/7 focused QC、TypeScript、lint、provider contract 與 repository semantic QC。
- 此 gate 只證明 source/fixture contract，不代表 load、filesystem failure 或 live Postgres 已通過。

### Gate 2 — Baseline/candidate deep-equality

- 在 baseline `0cc7a826` 與 candidate `f01d043b` 的 disposable worktree 使用相同 deterministic fixtures。
- 正規化純時間欄位後，比較完整 output、array order、duplicates、missing omission、scope 與 exact error identity/code。
- Release/assets query count 允許不同；產品資料與錯誤語意不允許不同。

### Gate 3 — SQLite integration 與 fault injection

- 執行真實 better-sqlite3 provider，不只 mock client。
- 驗證 400/401、scope、soft-delete、排序、filesystem bytes/hash、DB row graph 與逐步 fault injection。
- 每個失敗案例都做 DB/filesystem before/after delta。

### Gate 4 — Postgres parity 與 pool pressure

- 使用 isolated non-production Postgres，套用相同 fixtures。
- 比較 SQLite/Postgres happy path、error code、ordering、row graph、rollback side effects。
- 驗證 5-query notification stage 在 pool max 5 下的 1/5/10/25 concurrent requests。
- 收集 acquire wait、query/statement timeout、p50/p95/p99、error count 與最大連線數。

### Gate 5 — BOM I/O resilience 與 event-loop

- 注入 mkdir failure、write failure、DB first/middle/last execute failure、post-commit response failure。
- 量測成功檔案 bytes/hash/storage key；失敗後列出 orphan/partial DB graph。
- 以 10 ms heartbeat 配合 concurrent read API，比較 baseline sync write 與 candidate async write；另列 parser/hash 的同步成本。
- 在需求方定義 max import bytes 前，只能探索 1/5/10/25/50 MB，不得把最大成功檔當作正式上限。

### Gate 6 — Regression suite 與 disposition

- 執行 related repository、drawing package、BOM import、provider、cycle/duplicate baseline。
- P0 全部 pass；P1 必須 pass 或有 owner、理由、期限、補救與正式風險接受。
- 任一 unexpected 4xx/5xx、partial output、scope leakage、missing file、partial DB graph 或 provider-only drift，直接判定 `Fail`/`Reopen`。

## 8. 測試案例

| Test ID | 風險對應 | 前置 / 資料 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| BE-CHAR-001 | 全域 | baseline/candidate disposable worktree | 執行相同 fixtures 並序列化完整 repository output | 除 query metrics 外 deep-equal | 兩 SHA、raw/normalized diff |
| BE-RQ-001 | RQ-01/02 | current submission、same-item Released、other-item new/old Released、case variants | 查詢多組 filename conflicts | 只回 other item 最新 conflict；依 input order；duplicates 保留；missing omit | SQL params、完整 result array |
| BE-RQ-002 | RQ-03 | N=0/1/399/400/401/800/801 | 計數 query/queryOne | N=0 為 0；其餘 `ceil(N/400)`；queryOne=0 | query trace |
| BE-RQ-003 | RQ-01/02 | duplicate keys 位於 index 0、399、400、800 | 跨 chunk 查詢 | 與 baseline duplicate/order 完全一致 | expected/actual deep diff |
| BE-RQ-004 | RQ-01/02 | 同 key 多個 release timestamp 與 id tie-break | 連續執行 100 次 | 永遠選相同最新 row | 100-run hash |
| BE-RQ-005 | RQ-01 | filename 含 quote、SQL token、Unicode/case | 執行 conflict query | 參數化，無 SQL injection；結果只依資料匹配 | provider log/fixture rows |
| BE-RQ-006 | RQ-05 | 每個 chunk 可獨立丟 unique Error | 逐 chunk fault injection | reject exact original error；無 partial result | error identity/code/stack |
| BE-PA-001 | PA-01 | drawing A/B、entity type variant、deleted asset | drawing A package load | 只回 drawing A、type 正確、未刪除 rows | input IDs/DB rows/result |
| BE-PA-002 | PA-02 | reversed DB order、spaces、blank、duplicate、missing | asset load | trim/deduplicate；first-seen order；missing omit | deep-equal result |
| BE-PA-003 | PA-02/RQ-03 | 399/400/401/800/801 unique IDs 與跨 chunk duplicate | asset load | `ceil(unique/400)` query；輸出不重複、不重排 | query count/result hash |
| BE-PA-004 | RQ-05 | 第二個/最後一個 chunk error | asset load | exact reject，無 partial package output | error evidence |
| BE-NT-001 | NT-01 | 五類通知各含 self/other owner；Engineer/Manager/Admin | 各角色呼叫 repository/API | Engineer 僅自己；Manager/Admin team scope；五 query params 正確 | role matrix、payload diff |
| BE-NT-002 | NT-02 | severity/time ties；query completion 隨機化 | 重複 100 次 | 完整 order、kind、severity、summary 穩定且與 baseline 相同 | 100-run output hash |
| BE-NT-003 | NT-03 | 五類 query 各自 fault | 每次只讓一類失敗 | repository/route fail closed；不得 200 partial list | HTTP、body、server stack |
| BE-NT-004 | NT-04/05 | mock、SQLite、Postgres | 單 request 計量 | query count=5；mock stage maxInFlight=5；runtime 結論分 provider | query timeline |
| BE-NT-005 | NT-04 | Postgres pool max=5 | 1/5/10/25 concurrent API calls，各 30 回合 | 零 timeout/5xx；連線不超過 5；candidate p95 不得比 baseline 惡化 >10% | pool/timing/error metrics |
| BE-NT-006 | NT-06 | query barrier 與受控資料 mutation | 五查詢期間插入/更新通知來源 | 記錄 eventual-consistency 實際語意；不得宣稱 transaction snapshot | query timeline/result |
| BE-BOM-001 | BOM-01 | current seed submission、valid TSV/CSV/HTML/XML | 由 current `/api/bom/drafts/import-xls` 匯入 | 201；檔案 bytes/size/hash、asset、job、draft、lines、event、audit 一致 | HTTP、DB graph、file hash |
| BE-BOM-002 | BOM-02 | mkdir/write fault injection | 呼叫 import | 非 2xx；draft/job/asset/event/audit zero-delta | error、DB/file delta |
| BE-BOM-003 | BOM-03/08 | DB 每一 execute/query step fault；SQLite/Postgres | 檔案寫入後觸發 DB failure | Postgres DB rollback；SQLite 實際 partial graph 完整記錄；orphan file inventory | provider DB diff、file list |
| BE-BOM-004 | BOM-04 | `../x`, absolute path, separators, control chars, Unicode、Windows reserved names | 匯入每個 filename | resolved path 永遠在 importJobId dir；既有外部檔案 hash 不變 | resolved paths/before-after hashes |
| BE-BOM-005 | BOM-05 | unauthenticated、wrong-company/no-scope users | 送 multipart 與 JSON import | 401/403；request 不造成 filesystem/DB 變化 | HTTP、DB/file zero-delta |
| BE-BOM-006 | BOM-06 | 1/5/10/25/50 MB payload | multipart 與 base64 import | 記錄 RSS/heap/event-loop/status；未定義 max 前 release-readiness 保持 open | resource chart、status/body |
| BE-BOM-007 | BOM-07 | concurrent import + lightweight read heartbeat | baseline/candidate 各 30 回合 | async write期間 heartbeat 可前進；candidate event-loop p95 不得惡化；parser cost 分列 | heartbeat/timing trace |
| BE-BOM-008 | BOM-09 | timeout after file write、after DB commit；重送相同 payload | 模擬未知結果 retry | 列出 draft/asset/job/file 數量；不得把 duplicate/orphan 靜默當成功 | id/row/file inventory |
| BE-BOM-009 | OBS-01 | fs EACCES/ENOSPC、DB timeout/constraint | 經 API fault injection | 記錄實際 HTTP taxonomy；server log 可定位 root cause；未知 400 列 P1 gap | HTTP/body/log correlation |
| BE-REG-001 | 全域 | candidate worktree | typecheck、lint、provider/repository/BOM/drawing QC | 0 errors；既有 warnings 不增加；所有 applicable suite 0 fail | command output |
| BE-ARCH-001 | RQ-04/NT-04 | candidate worktree | cycle/duplicate baseline | cycle <=6；duplicate groups/pairs 不增加 | baseline JSON |

## 9. 測試資料需求

### 9.1 Release fixture

- current submission 與同 item 的其他 Released submission。
- 不同 item 的新/舊 Released submission，filename 僅大小寫不同。
- file roles：`pdf`、`native`、`step`；包含 missing、Unicode、quote/SQL token。
- 0、1、399、400、401、800、801 與 10k synthetic pairs。
- duplicate key 必須跨越 chunk boundary。

### 9.2 Package asset fixture

- drawing A/B 各自有效 asset。
- wrong entity type、soft-deleted、missing、blank/space-padded ID。
- reversed DB return order、跨 chunk duplicate。

### 9.3 Notification fixture

- Engineer A/B、R&D Manager、Admin。
- release failed、pending review、upload failed、missing release package、active lock 各至少 self/other 一筆。
- severity/time ties、每類超過 20 筆的 limit fixture。
- 每一 query 類型可獨立延遲與失敗。

### 9.4 BOM fixture

- current schema/seed 中可讀取的 parent submission；不得用已退役 generic `POST /api/submissions` 建 fixture。
- TSV、CSV、Excel HTML、SpreadsheetML、empty、binary OLE、invalid text/base64。
- traversal/reserved/Unicode filename。
- disposable repository 支援 mkdir/write/space/permission fault injection。
- SQLite fresh DB 與已核准 isolated Postgres，內容使用相同 deterministic IDs。

## 10. 通過、失敗與阻塞標準

### 10.1 Regression gate pass

- BE-CHAR、BE-RQ、BE-PA、BE-NT、BE-BOM-001/002/004/005、BE-REG、BE-ARCH 全部通過。
- Release/assets 完整輸出與 baseline deep-equal；query budget 符合 400 chunk 公式。
- 五 notification queries 在 orchestration 層同 stage 啟動；五種 error 均 fail closed 且保留原始 error。
- BOM 成功後 filesystem bytes/hash 與 DB graph 一致；未授權、parse/fs failure 不得產生 side effect。
- SQLite/Postgres applicable happy-path output 一致；沒有新增 lifecycle、auth、approval、release policy 或 schema 變更。

### 10.2 Release-readiness pass

- 所有 P0 通過。
- P1 通過，或具備明確 owner、補救、期限與人類正式風險接受。
- BOM 最大輸入大小已定義並在 buffer/parse/write 前 enforce，或 release owner 明確接受 P0 可用性風險。
- DB failure 後 orphan file/SQLite partial graph 具備 compensation/cleanup 契約，或 release owner 明確接受殘留風險。
- Live non-production Postgres pool/load 與 failure parity 已執行；沒有 credential 時只能判定 `Blocked`，不能判定 pass。

### 10.3 Fail

- 任一 false-negative release conflict、scope leakage、200 partial notification、成功回應但檔案/DB 不一致。
- 任一未授權 filesystem/DB write、path escape/overwrite、provider-only data drift。
- 400/401 boundary provider error、candidate output/order/error 與 baseline 不一致。
- TypeScript/lint error、focused QC failure、cycle >6 或 duplicate baseline 增加。

### 10.4 Blocked / Not sufficiently verified

- 無 isolated Postgres credential/approval：live Postgres gate `Blocked`。
- 無 filesystem/DB fault injection：BOM resilience 只能 `Not sufficiently verified`。
- 只有 source regex/mock，沒有真實 provider/data：效能與 provider parity 只能 `Not sufficiently verified`。
- 未定義 BOM max bytes：release-readiness P0 保持 open。

## 11. 失敗時必須收集的證據

- Test ID、baseline/candidate SHA、provider、schema hash、seed ID、Node/npm/OS。
- 完整 request shape（secret/cookie/token redacted）、HTTP status/body、repository error code/identity/stack。
- SQL template、named params、query count、chunk index、start/end/latency；不得記錄 credential。
- 預期與實際完整 array diff，包含 order、duplicate、missing、scope。
- DB before/after row graph：draft、line、asset、job、event、audit、相關 release/package/notification source rows。
- Filesystem before/after path、resolved path、size、SHA-256、orphan/partial file inventory。
- Postgres pool max/current/wait/timeout 與 p50/p95/p99；SQLite event-loop heartbeat。
- Cleanup 結果與未清除 residue；append-only audit 使用 disposable DB 回收，不直接破壞正式稽核資料。

## 12. QC 執行指令

### 12.1 目前可執行的 local/static/semantic suite

```powershell
git rev-parse HEAD
npm.cmd run typecheck
npm.cmd run lint
node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-system-health-phase6-read-paths.mjs
node scripts/qc-system-health-phase7-io-utilities.mjs
npm.cmd run qc:db-provider-contract
npm.cmd run qc:db-provider-postgres
npm.cmd run qc:access-control-async-repository
npm.cmd run qc:pdm-drawing-revision-package-model
node scripts/qc-dependency-cycle-baseline.mjs
node scripts/qc-duplicate-function-baseline.mjs
git diff --check cbe5fb37^..f01d043b
```

說明：沒有 `PDM_POSTGRES_URL` 時，`qc:db-provider-postgres` 的 live probe 會 skip；這只能證明 static contract，不能關閉 Gate 4。

### 12.2 待自動化的 FMEA suite

建議新增獨立測試 runner，但 QA 本輪不修改測試程式：

```powershell
node scripts/qc-system-health-phase6-8-backend-fmea.mjs --provider sqlite --mode integration
node scripts/qc-system-health-phase6-8-backend-fmea.mjs --provider sqlite --mode fault-injection
node scripts/qc-system-health-phase6-8-backend-fmea.mjs --provider postgres --mode parity
node scripts/qc-system-health-phase6-8-backend-fmea.mjs --provider postgres --mode pool-load
```

上述檔案目前不存在；在 RD 建立並經 QA 比對 Test ID 前，不得把這四行列為已執行證據。

### 12.3 Current-contract BOM API smoke

- 使用 fresh isolated data/repository directory、random free port 與 current seed。
- 從 seed 取得既有 parent submission，再呼叫 `/api/bom/drafts/import-xls`。
- 不得使用已退役的 generic `POST /api/submissions` 建 fixture。
- `scripts/qc-bom-workbench-solidworks-xls-import.mjs` 目前仍依賴 retired endpoint；fixture 更新前不能作為本 gate 的 pass evidence。

## 13. QC 最終報告格式

- Disposition：`Pass` / `Fail` / `Blocked` / `Not sufficiently verified`。
- Regression gate 與 release-readiness gate 分開判定。
- FMEA P0/P1 每列需對應 Test ID、結果、證據路徑與 residual owner。
- Mock、SQLite、Postgres 分開列結果。
- 不得用 TypeScript/lint/static QC 的成功覆蓋 API、filesystem、DB 或 pool/load failure。
- QA 只有在 QC 證據完成後才能建議更新 `dev_task.md`；本文件建立本身不代表功能已驗證或可 release。
