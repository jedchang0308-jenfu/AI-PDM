# QA 驗證計畫：DEV-060 BOM 建立入口 AI 真實操作

對應任務：`DEV-060` / `DEV-PDM-BOM-MODULE-ENTRY-001`  
對應規格：`SPEC-BOM-WORKBENCH-001` 第 17 節 2026-08-10 Amendment  
前置計畫：`qa-dev-060-bom-entry-material-identity-validation-plan-2026-08-10.md`  
角色：QA 設計計畫；由 QC／AI 執行事實驗證  
狀態：Planned / Awaiting QC Execution  
日期：2026-08-12  
風險：High；錯誤候選與重複建立會污染 BOM 治理資料

## 1. 驗證目的與結論邊界

本計畫要證明：AI 以真實瀏覽器操作 `/bom/new` 時，使用者可以依照畫面結構正確判斷三種互斥建立路徑，並完成合法的 BOM Draft 建立與 workbench handoff；同時不會把「已有 BOM」誤當成「CAD 組合件證據」，也不會因既有進行中草稿而重複建立。

本計畫包含：

- 真實瀏覽器開頁、重新整理、點擊、選取、輸入、上傳、返回與再次進入。
- Step 1 三條路徑：`從已偵測的組合件建立`、`建立全新空白 BOM`、`已有 BOM 草稿`。
- Step 2 三種來源：CAD、SolidWorks XLS、空白人工。
- 建立後的 `/bom/workbench/<draftId>` handoff、hard reload 與資料 readback。
- Admin、Engineer、R&D Manager、Manufacturing、Procurement 的可見性與建立權限邊界。
- 1440×900、1024×768、390×844 的 rendered UI、互動狀態與 visible error sweep。

本計畫不授權：production、live Cloud SQL／Supabase／GCS mutation、deploy、release、正式資料修復或刪除。無法證明資料與服務均為 isolated disposable runtime 時，立即停止所有寫入案例，整體最多判定為 `阻塞`。

## 2. UX Intent 與可觀察成功結果

- 使用者與情境：RD／工程人員在建立 BOM 前，需要知道是從 CAD 組合件開始、憑空建立空白 BOM，或回到已存在的草稿。
- 主要工作物件：canonical Part Number owner、獨立 BOM Rev、建立來源與 Draft。
- 主要成功結果：畫面只讓使用者在合法路徑上選擇，建立後產生一份唯一 Draft，且 workbench 讀到相同 owner、BOM Rev、source。
- 非語言溝通驗收：三條路徑以位置、icon、狀態 badge、可用／disabled CTA、empty state 與 draft link 形成清楚分流；不依靠大段說明文字補救。
- 最可能誤解點：有 BOM line 或舊 BOM 的料號，並不等於有 CAD 組合件檔；進行中的 BOM Draft 也不等於可再次建立。
- 高風險操作：建立 Draft、匯入 XLS、同一 owner + BOM Rev 的重複建立。
- 恢復方式：回到 Step 1、使用既有草稿續作、使用原 idempotency key readback；不得在未知結果時自動換新 key 再建立。

## 3. AI 操作者契約

AI 執行 QC 時必須遵守下列操作方式：

1. 先讀取目前 route、viewport、登入角色與畫面可見文字，再操作；不可只看 DOM 或直接呼叫 API 宣稱 UI 通過。
2. 使用 Playwright CLI／等效真實 browser session 操作；每次 navigation、Step 切換、選取或上傳後重新取得 snapshot，不沿用已失效的元素 reference。
3. UI 案例的建立動作必須由畫面上的 button、select、radio、link、file picker 完成；API／DB 只可用於前置資料準備、建立後 authoritative readback 與 cleanup，不得代替 UI 操作。
4. 每一個主要案例記錄：`caseId`、角色、時間、URL、viewport、操作序列、預期、實際、console、network、screenshot 與結果。
5. 發現 visible `.inline-error`、`[role=alert]` 失敗文字、load failed、可見 HTTP 4xx/5xx、`Not Found`、`Internal Server Error` 或 `/api/...` route error 時，該案例立即失敗；不可用後續重新整理把原始失敗覆蓋掉。
6. AI 不得因為畫面空白就自行推論「沒有資料」。必須先核對 fixture 的 expected count；只有 fixture 明確設計為 empty 才能判定 empty state 通過。
7. 建立成功後不得刪除正式資料。只允許刪除本次 run ID 建立的 isolated disposable rows／files，並保留 cleanup 結果。

## 4. 安全前置 Gate 0：Runtime Provenance

### 執行前必查

| 項目 | 必須記錄 | 通過條件 |
|---|---|---|
| Repo | root、branch、HEAD、dirty files | 與本次 QA run 對應，保護既有 dirty worktree |
| Runtime | URL、port、process owner、啟動時間 | 可由專案服務提供，不能是未知服務 |
| DB | provider、database path、fixture copy path | isolated SQLite／disposable repository |
| Actor | company、user、role、session | 與案例矩陣一致 |
| Safety flags | `productionConnected`、`productionWrites`、release mode | `false`、`false`、local stub／等效安全模式 |
| Run identity | `DEV060-AI-<timestamp>-<random>` | 所有 mutation 都可追蹤與 cleanup |

### 建議啟動與輔助命令

```powershell
npm.cmd run dev:local:check
npm.cmd run qc:dev-060-bom-create
npm.cmd run typecheck:app
npx.cmd eslint src/components/bom-create-workflow.tsx src/lib/bom-create-context.ts src/app/api/bom/create-context/route.ts
```

若需啟動本機服務，使用 `npm.cmd run dev:local`；若 port 已被服務佔用，先確認 process 是否為本專案，未經明確授權不得停止其他 process。既有 `qc:dev-060-bom-create` 的 isolated runner 可作為自動化輔助證據，但不能取代下列 AI 真實瀏覽器案例。

## 5. 測試資料矩陣

測試資料必須在 isolated fixture 中建立或標記，不能把目前正式資料當成可任意修改的測試資料。

| 資料代號 | 必要條件 | 預期出現位置 | 用途 |
|---|---|---|---|
| `ASSEMBLY_READY` | 同 company、可讀 canonical Part Number；有 `.sldasm` submission file 或 `assembly_component` reference；無 `Draft/PendingReview/Rejected` | 組合件區 | 驗證 CAD 組合件可以進入 Step 2 |
| `NO_CAD_BOM_ONLY` | 同 company；有既有 BOM line／Released snapshot 或歷史 BOM，但沒有 `.sldasm` 與 `assembly_component` 證據 | 不得出現在組合件區；若有進行中 Draft，僅出現在草稿區 | 重現 A0005-P01、A0056-P01 類型的錯誤候選 |
| `BLANK_READY` | 同 company、狀態可用、沒有進行中 Draft；可計算 `suggestedBomRevision` | 空白 BOM 區 | 驗證憑空建立零 line BOM |
| `DRAFT_ACTIVE` | 同 owner 有 `Draft`、`PendingReview` 或 `Rejected` | 草稿區 | 驗證不重複建立，提供續作入口 |
| `RELEASED_ONLY` | 同 owner 只有 Released／Archived history，沒有進行中 Draft | 空白 BOM 區 | 驗證可建立下一個 BOM Rev |
| `CAD_SOURCE_READY` | `ASSEMBLY_READY` 可取得同 owner、同 company 且 actor 可讀的 CAD source | Step 2 CAD | 驗證 owner／source relation |
| `XLS_VALID` | 合法 SolidWorks XLS／TSV fixture，內容可解析 | Step 2 XLS | 驗證上傳與建立 |
| `XLS_MISMATCH` | 檔案宣告的 owner 與 Step 1 選定 owner 不同 | Step 2 error | 驗證禁止靜默改 owner |
| `CROSS_COMPANY` | 另一 company 的 Part Number 或 source | 不可列出／不可建立 | 驗證 tenant boundary |

若 fixture 中確實包含 `A0005-P01` 或 `A0056-P01`，將其標記為 `NO_CAD_BOM_ONLY` 或 `DRAFT_ACTIVE` 並在 `data-sanity.json` 寫明；判定依證據，不依料號名稱猜測。若沒有任何 `ASSEMBLY_READY`，CAD 真實操作案例必須判定 `阻塞／未充分驗證`，不可因空的組合件區而 PASS。

## 6. FMEA 風險表

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／必要測試 |
|---|---|---|---|---:|---|
| 只有既有 BOM 的料號被列為組合件 | 把 BOM line、legacy BOM 或 release history 當 CAD 證據 | 使用者誤以為可從 CAD 建立，來源錯誤 | `NO_CAD_BOM_ONLY` UI 清單 + API context + DB evidence readback | P0 | AI-UI-002；組合件候選只允許 `.sldasm`／`assembly_component` |
| 進行中 Draft 同時出現在新建候選 | 未排除 Draft／PendingReview／Rejected | 建立重複 BOM、責任與稽核混亂 | Step 1 三區交叉比對 + DB count | P0 | AI-UI-003、AI-UI-004、AI-DATA-002 |
| 無法憑空建立 BOM | UI 仍要求 submission 或 CAD source | 空白 BOM 需求被迫偽造來源 | 不選 CAD、不上傳檔案直接建立 + `source_submission_id` readback | P0 | AI-UI-005、AI-DATA-003 |
| 已發布／已作廢歷史被錯誤排除 | 候選規則把所有既有 BOM 都視為不可建立 | 無法建立合法新 BOM Rev | `RELEASED_ONLY` 產生新 Rev + history count 不變 | P1 | AI-UI-006、AI-DATA-004 |
| XLS 匯入入口被 UI 改版移除 | 只保留空白 primary CTA | 既有使用情境中斷 | 空白卡片次要 `匯入 XLS` 可發現並完成 Step 2 | P1 | AI-UI-007 |
| 同一次建立重複產生 Draft | double click、timeout 或 navigation retry | 產生兩份同 owner／Rev Draft | disabled CTA、原 key replay、DB effect count | P0 | AI-DATA-005、AI-UI-008 |
| owner／BOM Rev 被來源檔案靜默覆寫 | parser 或 client 把 XLS/CAD 當 authority | BOM 綁錯料號或版次 | mismatch fixture、建立前摘要、DB readback | P0 | AI-UI-009、AI-DATA-006 |
| 手機或低高度畫面無法操作 | 卡片擠壓、水平溢出、footer 遮蔽 | 主要任務阻斷或誤按 | 三 viewport screenshot、scroll／focus 實操 | P1 | AI-UI-010 |
| 可見錯誤被忽略 | API 失敗後仍只看頁面骨架 | 使用者看到錯誤但報告誤判 PASS | DOM、console、network、screenshot hard gate | P0 | 所有案例 Visible Error Sweep |

## 7. AI 真實瀏覽器測試案例

### AI-UI-001：入口 5 秒理解與三路徑可見性

前置：Admin 或具建立權限的角色；Step 1 fixture 同時包含 `ASSEMBLY_READY`、`BLANK_READY`、`DRAFT_ACTIVE`。

操作：

1. 由側欄進入 BOM 建立入口，不直接貼 `/bom/new` 取代導覽證據。
2. 到達 `/bom/new` 後先停留 5 秒，不點擊任何控制項，記錄 AI 能從畫面辨識的主要工作物件、三條路徑與各自 CTA。
3. 以 1440×900 截圖，再於 1024×768、390×844 hard reload 截圖。
4. 檢查三區各只有對應用途；不得出現 `料號 Rev`、`DEV-###`、API route、raw status 或逐卡「下一步」雜訊。

預期：三個 `.bom-create-entry-option` 均存在；組合件、空白 BOM、既有草稿的標題／icon／位置可區分；primary CTA 不互相競爭；沒有 visible error、水平 overflow、重疊或裁切。

證據：三 viewport screenshots、5 秒理解紀錄、DOM role inventory、visible error sweep、overflow measurement。

### AI-UI-002：組合件候選只由 CAD 證據決定

前置：`ASSEMBLY_READY` 與 `NO_CAD_BOM_ONLY` 均在同 company；後者可有 BOM line 或 Released history，但沒有 `.sldasm`／`assembly_component`。

操作：

1. 在組合件區掃描所有候選，記錄 Part Number、品名與狀態。
2. 尋找 `NO_CAD_BOM_ONLY`；若存在 A0005-P01 或 A0056-P01，逐一確認其不在組合件區。
3. 點擊 `ASSEMBLY_READY`，確認進入 Step 2；確認可見 owner、BOM Rev 與 CAD source。
4. 返回 Step 1，再重新整理，確認候選結果穩定。

預期：沒有 CAD evidence 的料號永不出現在組合件區；不能以「既有 BOM 存在」推導組合件。真正有 `.sldasm`／`assembly_component` 的 owner 才能進入 CAD source path。

證據：Step 1 清單截圖、context response 的候選摘要、submission/file-reference evidence、Step 2 截圖、返回／reload 操作紀錄。

### AI-UI-003：進行中 Draft 不得重複列入新建候選

前置：`DRAFT_ACTIVE` 至少各準備一筆 `Draft`、`PendingReview` 或 `Rejected`；其中一筆可對應 A0005-P01 或 A0056-P01。

操作：

1. 在 Step 1 同時檢查組合件區與空白 BOM selector。
2. 確認 `DRAFT_ACTIVE` owner 不在兩個新建候選位置。
3. 在「已有 BOM 草稿」區找到同一 owner，確認 status badge、BOM Rev、line count 與更新時間可讀。
4. 點擊該 draft link，確認進入正確 `/bom/workbench/<draftId>`，記錄 draft ID。

預期：同一 owner 只提供續作入口，不提供新的建立 CTA；draft link 對應的 owner／Rev／status 與 readback 一致；不存在重複 Draft。

證據：三區交叉截圖、draft row 操作錄影或 trace、workbench URL、DB/API readback、draft count before/after。

### AI-UI-004：既有草稿的三種狀態續作

前置：分別準備 `Draft`、`PendingReview`、`Rejected` 三筆可讀草稿，或明確記錄缺少的狀態。

操作：逐一點擊草稿列／連結，開啟 workbench，hard reload，再返回 `/bom/new`。

預期：三種狀態皆導向原 Draft，不產生新 Draft；狀態文字與可編輯／不可編輯行為符合 lifecycle；返回後仍只在草稿區出現。

證據：每個 status 的 before／after screenshot、URL、workbench stage、DB count、console/network。

### AI-UI-005：憑空建立全新空白 BOM

前置：選定 `BLANK_READY`，沒有進行中 Draft；server 提供 `suggestedBomRevision`。

操作：

1. 在「建立全新空白 BOM」選擇 `BLANK_READY`。
2. 確認 BOM Rev 預填且可理解，沒有把 Drawing Rev 顯示成 BOM Rev。
3. 不上傳檔案、不選 CAD，按唯一 primary `建立空白 BOM`。
4. 等待導向 `/bom/workbench/<draftId>`；記錄 URL、畫面 owner、BOM Rev 與 line count。
5. hard reload，再以同一 Draft 重新讀取。

預期：建立成功；`source=manual`、`source_submission_id=null`、line count=0；owner 是選定 canonical Part Number；BOM Rev 是 BOM history 的 suggestion；只有一份新 Draft；workbench reload 不重送 POST。

證據：Step 1 選取／預填 screenshot、workbench screenshot、URL、network POST count、authoritative API／DB readback、before/after counts。

### AI-UI-006：Released／Archived history 可以建立新 BOM Rev

前置：`RELEASED_ONLY` 只有正式／歷史 BOM，沒有進行中 Draft。

操作：選取該 owner，記錄 UI 顯示的 suggested BOM Rev，建立空白 BOM，進入 workbench。

預期：可建立下一個合法 BOM Rev；既有 Released snapshot、line count、hash 與歷史資料不被覆寫；新 Draft 與舊 history 可區分。

證據：history before/after、suggested revision、workbench URL、DB snapshot hash／count、cleanup。

### AI-UI-007：空白 BOM 區的 XLS 次要路徑

前置：`BLANK_READY` 可選；準備 `XLS_VALID`。

操作：

1. 選擇 owner，不按 `建立空白 BOM`。
2. 點擊同一卡片的次要 `匯入 XLS`，確認進入 Step 2，並看到 CAD、XLS、空白三個互斥 source card。
3. 選擇 XLS source，使用 file picker 上傳 `XLS_VALID`。
4. 確認檔名、檔案大小、解析／validation 狀態與 owner／BOM Rev 摘要，再按 `建立 BOM 草稿`。
5. 進入 workbench 後確認 line count、source 與 owner。

預期：XLS 入口可被發現但不與空白 primary CTA 競爭；建立流程完整；解析成功只產生一份 Draft；來源檔案不改寫 Step 1 owner 或 BOM Rev。

證據：Step 1、Step 2 source grid、file picker、建立前摘要、workbench、network／DB readback。

### AI-UI-008：組合件 CAD 路徑

前置：`ASSEMBLY_READY` 與 `CAD_SOURCE_READY` 可用；actor 對 submission 有讀取權限。

操作：點擊組合件 owner → `下一步：選擇來源` → 選擇 `從 CAD 結構帶入` → 選定 CAD source → 建立 BOM Draft → 進入 workbench。

預期：CAD source 與所選 owner exact match；摘要可分開顯示 Drawing Number／Drawing Rev；BOM Rev 不取代為 Drawing Rev；建立後 source 為 `cad_reference`，line count 與解析結果一致。

證據：Step 1／Step 2／summary／workbench screenshots、submission relation、owner／bomRevision／source readback。

### AI-UI-009：來源 owner mismatch 與錯誤恢復

前置：`XLS_MISMATCH` 或可由隔離 runtime 產生 owner mismatch；另準備可安全模擬的 403、409、413、500／timeout／response-loss。

操作：

1. 在 Step 1 選 owner A，於 Step 2 上傳宣告 owner B 的檔案。
2. 觀察錯誤訊息、focus、可用的返回／重選控制項。
3. 以同一原始流程修正檔案或 owner，不使用新 owner 偷換完成。
4. 對 timeout／response-loss，依畫面指示查詢結果；不得自行產生新 idempotency key。

預期：mismatch 阻擋建立，不靜默更換 owner；錯誤文案是人類可理解的恢復訊號；未知結果先 readback；parser 失敗不留下 orphan Draft；visible error sweep 的原始錯誤要保留於證據。

證據：錯誤狀態 screenshot、role／focus、network status、原始 response、readback、before/after Draft count。

### AI-UI-010：RWD、鍵盤與互動狀態

前置：同一組合法 fixture；viewport 為 1440×900、1024×768、390×844。

操作：

1. 每個 viewport 重新載入 Step 1，檢查三條路徑、empty、disabled、selected、loading、success。
2. 以鍵盤依序操作：導覽入口 → owner selector → BOM Rev → primary CTA → Step 2 source →建立 CTA。
3. 在手機版捲動頁面與卡片，確認底部操作列不遮住欄位；在 desktop 檢查不產生非預期第二個 scroll owner。
4. 對 draft link、XLS button、下一步 button 做 focus／activate；必要時使用 hover／pressed screenshot。

預期：無水平 overflow、重疊、裁切、文字逐字直排、按鈕被擠壓或 footer 遮擋；focus 可見；disabled 狀態不會被誤認為可操作；empty state 與可替代路徑可被發現；顏色不是唯一狀態訊號。

證據：各 viewport screenshot、overflow measurement、focus screenshot、操作 trace、DOM accessibility snapshot、visible error sweep。

## 8. Authoritative Data／API Readback 案例

UI 操作完成後，由 AI／QC 使用既有 read-only API 或 isolated DB query 交叉核對；這些 readback 不能代替 UI 建立。

| ID | 核對內容 | 預期 |
|---|---|---|
| `AI-DATA-001` | create-context 的 `assemblyParts` | 只含同 company、可讀且有 CAD assembly evidence 的 owner |
| `AI-DATA-002` | `parts`、`assemblyParts`、`drafts` 交集 | `Draft/PendingReview/Rejected` owner 不在新建候選；可在 drafts 續作 |
| `AI-DATA-003` | 空白 BOM create receipt／draft | canonical owner、BOM Rev、`source=manual`、`source_submission_id=null`、zero lines |
| `AI-DATA-004` | Released／Archived history | 新 Draft 不覆寫 history；suggested Rev 向前且唯一 |
| `AI-DATA-005` | duplicate／retry | 同一 idempotency key 同一 receipt／draft；effect count=1；不同 fingerprint 回 409 |
| `AI-DATA-006` | XLS／CAD source relation | source owner、company、BOM Rev 與 UI 所選值一致；不被來源檔案靜默覆寫 |
| `AI-DATA-007` | permissions | Engineer 只限 own exact predicate；R&D Manager／Admin 依 managed company；Manufacturing／Procurement 不得建立 |
| `AI-DATA-008` | cleanup | 本次 run 的 Draft、effect、asset、repository artifact 全部 removed／可追溯；正式資料 count／hash 不變 |

## 9. Gate 與判定標準

### Gate 1：資料可用性

- `data-sanity.json` 明確記錄每個資料代號的 owner、company、CAD evidence、BOM history、draft status 與 expected count。
- `ASSEMBLY_READY` 不得以 BOM line 代替 CAD evidence。
- `NO_CAD_BOM_ONLY` 若是 A0005-P01／A0056-P01，必須留下查核結果。
- 缺少必要 fixture 時，對應案例判定 `阻塞`，不以空畫面通過。

### Gate 2：UI 真實操作

- AI-UI-001～AI-UI-010 的必要案例均由真實 browser 完成。
- 至少成功完成一條空白人工、一條 XLS、一條 CAD（若 fixture 有證據）建立路徑。
- 主要路徑每一個都有 route、viewport、screenshot、操作紀錄與 workbench readback。

### Gate 3：安全與治理

- P0 風險零 open；重複建立、錯誤 owner、跨 company、進行中 Draft 重建任一失敗即整體 `未通過`。
- API／DB readback 必須與 UI 選取一致；只看 UI 不足以 PASS。
- production connection/write 必須為 false；cleanup 必須為 removed。

### Gate 4：UI／UX

- 無 visible runtime error。
- 無水平 overflow、重疊、裁切、不可讀、不可操作、sticky footer 遮擋或 scroll owner 混淆。
- 三條路徑由位置、icon、badge、CTA 狀態與 link 可理解；沒有每張卡固定「下一步」或重複主 CTA。
- 共同資訊只出現在必要的父層；不顯示內部工程詞與 raw status。

### 最終判定

- `通過`：全部必要 Gate 通過，P0/P1=0，三條建立路徑均有真實 UI 證據；CAD fixture 若宣稱可用則必須完成 CAD 真實操作；cleanup removed。
- `未通過`：任一 P0、visible error、資料語意錯誤、重複 Draft、owner mismatch、權限越界或主要 viewport 破版。
- `未充分驗證`：缺少 screenshot、viewport、主要互動、data readback 或人工理解證據；自動化、lint、typecheck 不能補足。
- `阻塞`：無法啟動、無法登入、無法取得 isolated fixture、沒有必要 CAD evidence、偵測到 production connection/write 或 cleanup 無法安全完成。

## 10. 證據目錄與報告格式

建議 evidence root：`output/qa/dev-060-ai-real-operation/<runId>/`。

必須保存：

- `provenance.json`：repo、branch、HEAD、runtime、DB、actor、flags、runId。
- `data-sanity.json`：資料矩陣與 expected／actual counts。
- `operations.json`：AI 每一步的 route、viewport、action、target、expected、actual、timestamp、result。
- `network.json`：主要 request／response status、console error、timeout／response-loss 證據。
- `screenshots/`：Step 1 三 viewport、Step 2、建立前摘要、workbench、empty、disabled、error、RWD／focus。
- `trace/`：Playwright trace 或等效操作紀錄。
- `readback.json`：draft、effect、owner、BOM Rev、source、line count、history hash／count。
- `cleanup.json`：isolated rows／files before/after、cleanup status、正式資料安全檢查。
- `summary.md`：逐案例結果、P0/P1、阻塞、重現步驟、最終判定。

## 11. QC 回報模板

```markdown
## 驗證結論

- 判定：通過 / 未通過 / 未充分驗證 / 阻塞
- Run ID：
- 判定理由：

## Runtime Provenance

- URL / port / process：
- DB provider / isolated path：
- Actor / company / role：
- productionConnected：
- productionWrites：
- cleanupStatus：

## AI 操作摘要

| Case | Role | Route | Viewport | 主要操作 | 預期 | 實際 | Result |
|---|---|---|---|---|---|---|---|

## Visible Error Sweep

- URL / route：
- Viewport：
- Timestamp：
- Screenshot：
- `.inline-error` / `[role=alert]`：
- Visible HTTP 4xx/5xx / Not Found / Internal Server Error：
- Visible `/api/` error text：
- Console / network failed requests：
- Result：

## Data Sanity / Readback

- Expected fixture：
- assemblyParts count：
- parts count：
- drafts count：
- A0005-P01 / A0056-P01 classification：
- Draft before / after：
- Effect count：
- Owner / BOM Rev / source：
- Line count：
- History count / hash：

## UI / UX

- 5 秒理解：
- 三條路徑分流：
- empty / disabled / selected / loading / success：
- RWD 1440×900 / 1024×768 / 390×844：
- overflow / overlap / clipping / focus：
- 資訊雜訊與重複 CTA：

## 問題與阻塞

- Case：
- 重現步驟：
- 預期結果：
- 實際結果：
- 影響與優先級：
- 證據路徑：
```

## 12. Stop Conditions

- 任何 mutation 連到 production／live cloud，或無法證明 `productionWrites=false`。
- `A0005-P01`、`A0056-P01` 類型資料仍因既有 BOM line／history 被判為組合件，且沒有實際 CAD evidence。
- 同一 owner 的進行中 Draft 同時出現在新建候選，或 UI 建立後產生兩份 Draft。
- 無法完成 authoritative readback，或 response-loss 後 AI 以新 key 重送建立。
- 跨 company、Manufacturing、Procurement 能建立 Draft。
- UI 有 visible error、主要 viewport overflow／遮擋／不可操作，或缺少必要的 screenshot／操作紀錄。
- 清理無法只針對本次 run，可能刪除既有資料。

## 13. QA 交付與後續

本文件完成的是 QA 驗證設計，不代表 DEV-060 已通過 QC。QC 執行後，應以本文件的 `summary.md`、readback、截圖與 cleanup 證據回填結果；只有必要 Gate 全部通過，才可由 Dev PM 更新任務進度。若發現缺陷，回報時必須保留原始畫面、操作步驟與資料 before/after，不由 QA 直接修改產品程式。
