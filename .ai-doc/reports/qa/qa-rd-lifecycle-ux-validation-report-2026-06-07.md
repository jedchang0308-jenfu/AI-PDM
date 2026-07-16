# QA Report: RD 圖號料號開發生命週期 UX 驗證與優化建議

日期：2026-06-07  
角色：QA  
驗證對象：研發工程師視角的圖號 / 料號開發生命週期  
環境：`http://localhost:3100`  
帳號：`engineer@example.com` / Demo Engineer  

## 結論

目前 RD 視角的生命週期 UX 不合格。

系統已經有 Lifecycle Map、WorkflowStrip 與各頁 guidance，但這些資訊多半是「流程介紹」而不是「物件狀態」。RD 建立一筆料號 / 圖號後，系統沒有持續追蹤該物件，也沒有明確告訴使用者：

- 這筆資料目前在哪個生命週期階段。
- 還缺什麼才能往下一步。
- 下一步應由誰處理。
- 下一個 CTA 是否會帶入目前料號 / 圖號。
- Draft、Pending、Active、Released 等狀態對 RD 代表什麼行動。

換句話說，目前 UI 讓使用者「看得到很多模組」，但沒有讓使用者「知道自己這筆圖料現在卡在哪」。

## 實際走查紀錄

### 1. 進入 RD Dashboard

觀察：

- 首頁有跨角色 Lifecycle UX 地圖。
- 但它是概念型流程地圖，不是 RD 目前物件的狀態追蹤器。
- 首頁同時塞入 lifecycle、待辦、通知、搜尋、資料表，使用者視覺焦點分散。
- RD 看到 `89 Pending / 11 Released`，但不知道哪些是自己的、哪些需要自己處理。

問題：

- Dashboard 沒有 `我的開發中圖料`。
- 沒有 `最近建立但未送審`。
- 沒有 `我的 Pending submission 等誰審`。
- 沒有 `ReleaseFailed 是否需要 RD 補件` 的角色分流。

證據截圖：`artifacts/qa-rd-lifecycle-ux/dashboard.png`

### 2. 領號申請

操作：

1. 進入 `領號申請`。
2. 填入核心名稱、系列、特性、用途。
3. 執行查重預檢。
4. 建立草稿號碼。

觀察：

- 頁面有 WorkflowStrip 與 LifecycleStageGuidance。
- `Required gaps` 以數字呈現，但沒有轉成 RD 可理解的句子。
- 查重預檢按下後，畫面一度仍顯示 `Duplicate risk: Not checked`，使用者不確定是否正在查、查完沒結果或查詢失敗。
- 建立後顯示結果：主根號、料號、圖號。
- 建立後查重結果顯示 1 筆 warning，但系統已建立號碼，沒有要求 RD 明確確認「仍要建立」。

問題：

- 缺少 `目前狀態：草稿號碼已建立，尚未送審`。
- 缺少 `阻塞 / 非阻塞` 判斷。
- 缺少 `查重結果為 warning，允許建立但後續需注意` 的明確說明。
- `上傳送審` 連結沒有帶入剛建立的料號 / 圖號上下文。

證據截圖：`artifacts/qa-rd-lifecycle-ux/numbering-request.png`

### 3. 從領號結果前往上傳送審

觀察：

- 從領號結果按 `上傳送審` 後，只進入 `/upload`。
- 剛建立的 `P-0051-001` / `D-0051-MA1` 沒有自動帶入。
- RD 必須自己複製貼上圖號、料號、品名與 revision。
- Upload 頁面顯示 `下一步：審核與放行`，但 Engineer 不能審核，這個 CTA 對 RD 不是可執行任務。

問題：

- 生命週期上下文在 `領號 -> 送審` 斷裂。
- 下一步 CTA 沒有依角色修正。
- 應改為：`送出後前往我的送審狀態`、`等待 R&D Manager 審核`、`補齊缺少 metadata`。

證據截圖：`artifacts/qa-rd-lifecycle-ux/upload.png`

### 4. 圖料模組查詢狀態

操作：

1. 建立草稿號碼後回到 `圖料模組`。
2. 查找剛建立的 `0051`。
3. 開啟主根明細。

觀察：

- 列表可看到 `Draft / EVT`。
- 同一物件同時出現主根、料號、圖號三種類型列，且 `0051` 有多個同名按鈕。
- 使用者不知道點哪個是主根、料號或圖號。
- 明細顯示料號、圖號、近期異動，但沒有生命週期下一步。

問題：

- `Draft` 只是資料狀態，不是操作狀態。
- 明細缺少 `下一步：上傳設計資料送審`。
- 明細缺少 `尚未送審 / 尚無 submission / 尚無 BOM / 尚未可交接`。
- 列表缺少明確 row type 欄位與視覺分層。

證據截圖：`artifacts/qa-rd-lifecycle-ux/numbering-search.png`

### 5. 圖號待辦

觀察：

- 待辦中心顯示 0 件待辦。
- 剛建立的 Draft 料號 / 圖號沒有形成 `我的草稿待送審`。
- CTA 指向發行審核、BOM 審核、MA 影響，偏主管 / 管理角色，不符合 RD 當下需求。

問題：

- RD 建立完 Draft 後，沒有 task。
- 待辦不是生命週期 inbox。
- RD 需要的是 `我的開發中項目`，不是只看 approval / notification。

證據截圖：`artifacts/qa-rd-lifecycle-ux/tasks.png`

### 6. BOM 工作台

觀察：

- BOM 工作台有 LifecycleStageGuidance。
- 但頁面一進來是大量 submission 搜尋結果。
- 對剛建立的 Draft 料號，沒有提示 `需先完成送審後才能作為 BOM parent`。
- 搜尋結果文字密度高，Pending / Released 混雜，RD 不易判斷可用父件。

問題：

- BOM 工作台缺少 `可建立 BOM 的候選主件`。
- 沒有 explain why：Draft numbering record 不能直接建 BOM parent。
- 沒有針對 RD 的 `從我的 submission 建 BOM` 入口。

證據截圖：`artifacts/qa-rd-lifecycle-ux/bom-workbench.png`

## UX FMEA

| 失效模式 | 可能原因 | 使用者影響 | 嚴重度 | 偵測方式 | 建議改善 |
|---|---|---|---:|---|---|
| RD 不知道目前狀態 | 狀態分散在頁面文字、badge、列表 | 不知道下一步該做什麼 | P0 | 新建草稿後回 dashboard / task center | 建立物件級 LifecycleStatusPanel |
| 領號與送審上下文斷裂 | CTA 只導向 `/upload`，不帶 query/context | 重複輸入，容易填錯圖號 / 料號 | P0 | 領號後點上傳送審 | CTA 帶入 draft id / drawing / part |
| Draft 沒有變成待辦 | 待辦只處理審核/通知 | RD 找不到未完成工作 | P0 | 建立 Draft 後看待辦 | 加入 `我的草稿待送審` |
| 狀態詞不可理解 | Draft/Active/PendingReview 直接暴露資料狀態 | 使用者不知道是否可送審 / 可交接 | P0 | 查詢圖料與明細 | 加入角色化狀態文案與 next action |
| 查重 feedback 不明確 | 查詢結果沒有 loading / done / failed state | RD 不知道能不能安全建立 | P1 | 按查重預檢 | 加入查重狀態與需確認 warning |
| 搜尋結果列型混雜 | 主根、料號、圖號共用列表 | 點錯物件或誤判狀態 | P1 | 圖料模組搜尋 0051 | 明確 row type、grouping、主要物件行 |
| Dashboard 資訊過載 | lifecycle、通知、搜尋、資料表同屏堆疊 | RD 無法聚焦 | P1 | 首頁首屏走查 | 首屏改為 My lifecycle queue |
| BOM parent eligibility 不清楚 | BOM 工作台只列 submission | RD 不知為何草稿料號不能建 BOM | P1 | 領號後進 BOM | 顯示 eligibility reason |

## QA 驗證計畫

### 驗證目標

確認 RD 從 `領號 -> 送審 -> 追蹤審核 -> BOM -> Gate -> 交接前狀態` 的每一步，都能在 10 秒內回答：

- 我現在在哪一步？
- 這筆圖料現在是什麼狀態？
- 還缺什麼？
- 下一步誰處理？
- 我現在能按哪個主要 CTA？

### 測試範圍

- Dashboard RD 首頁
- 領號申請
- 上傳送審
- 圖料模組查詢與明細
- 我的待辦 / 圖號待辦
- BOM 工作台
- DVT / Release Gate 入口
- 製造交接前狀態辨識

### 測試案例

| ID | 場景 | 步驟 | 預期結果 | 優先級 |
|---|---|---|---|---|
| RD-UX-001 | RD 首頁看我的狀態 | Engineer 登入 dashboard | 首屏有 `我的開發中圖料`，列出每筆 current stage / blocker / next CTA | P0 |
| RD-UX-002 | 領號欄位未填 | 進入領號頁不填資料 | 不只顯示 gap 數字，需列出缺哪些欄位與原因 | P0 |
| RD-UX-003 | 查重預檢 | 填入資料後按查重 | 顯示 checking / done / warning / failed 狀態與建議動作 | P0 |
| RD-UX-004 | 查重 warning 建立 | 有疑似重複仍建立 | 必須要求 RD 明確確認，並記錄 override reason | P0 |
| RD-UX-005 | 領號成功後接送審 | 建立號碼後按上傳送審 | Upload 自動帶入 part/drawing/name，並標示來源 draft | P0 |
| RD-UX-006 | 草稿回查 | 建立後到圖料模組查詢 | 明細顯示 `草稿已建立，尚未送審` 與下一步 CTA | P0 |
| RD-UX-007 | 待辦追蹤 | 建立 Draft 後進待辦 | 出現 `我的草稿待送審`，不可顯示 0 件 | P0 |
| RD-UX-008 | 送審後追蹤 | 建立 Pending submission | RD 可看到審核人、等待時間、目前 pending 原因 | P0 |
| RD-UX-009 | 送審頁角色化 CTA | Engineer 進 Upload | 下一步不可指向自己不能執行的審核頁，應指向追蹤狀態 | P1 |
| RD-UX-010 | 圖料列表辨識 | 查詢同一 root | 主根/料號/圖號 row type 清楚，不用猜點哪列 | P1 |
| RD-UX-011 | BOM eligibility | Draft 料號進 BOM 工作台 | 系統告知需先有 Released/Pending parent submission 或建立 submission | P1 |
| RD-UX-012 | 行動版檢查 | 390px viewport 重跑流程 | CTA、狀態、缺件說明不可 overflow 或消失 | P1 |

### 驗收標準

- 每個生命週期頁都必須有物件級狀態，而不是只有頁面級流程說明。
- RD 建立任何 Draft 後，必須在 Dashboard 或 Task Center 找得到。
- 從領號進送審不得手動重填已知圖號 / 料號。
- Status badge 必須搭配角色化解釋與 next action。
- 任何 warning 允許繼續時，必須有明確確認與稽核原因。
- Engineer 不應看到不可執行的主要 CTA 作為「下一步」。

## 優化優先序

### P0：先解決「不知道狀態」

1. 新增共用 `ObjectLifecycleStatusPanel`
   - 顯示：物件、階段、狀態、缺件、下一步、責任角色、主要 CTA。
   - 用於 dashboard、圖料明細、領號結果、upload prefill、BOM workbench。

2. 建立 `我的開發中圖料`
   - Dashboard 首屏以 RD 物件 queue 為主。
   - 包含 Draft numbering、Pending submission、Rejected / ReleaseFailed 需補件、BOM Draft。

3. 領號成功後產生可追蹤工作項
   - `Draft numbering record -> 待送審`
   - 待辦中心不可顯示 0 件。

4. 領號到送審帶上下文
   - `/upload?numberingRecordId=...`
   - 自動帶入 drawing number、part number、part name、phase。

### P1：降低誤判與找錯物件

1. 查重預檢加入明確狀態機
   - Not checked / Checking / Clear / Warning / Blocked / Failed。

2. 圖料模組列表分群
   - 先顯示 root summary，再展開料號 / 圖號。
   - 列型要有固定欄位與 icon。

3. Upload 下一步改成角色化
   - Engineer：`送出後查看我的送審`
   - Manager：`前往待審`
   - Admin：`處理 ReleaseFailed`

4. BOM 工作台加入 eligibility guidance
   - 明確說明為何某些料號不能建 BOM。

### P2：改善視覺與可測性

1. 所有主要表單欄位加穩定 `name` / `id` / test id。
2. 同名 CTA 避免重複 accessible name。
3. Tooltip / helper text 補上狀態詞定義。
4. 截圖回歸測試加入 RD lifecycle happy path。

## QA 判定

本輪 RD 生命週期 UX 驗證結果：不通過。

不通過原因不是單頁視覺壞掉，而是跨頁流程沒有形成使用者可理解的狀態鏈。現階段 RD 能建立資料，但無法自然追蹤自己的圖號 / 料號從 Draft 到 Pending、審核、BOM、Gate、交接的狀態。

建議下一輪 RD 開發任務先鎖定 P0，不要繼續增加新功能入口，否則只會讓使用者更不知道狀態。
