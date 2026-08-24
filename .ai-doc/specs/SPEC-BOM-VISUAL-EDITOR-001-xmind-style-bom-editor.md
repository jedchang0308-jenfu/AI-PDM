# SPEC-BOM-VISUAL-EDITOR-001: XMind 式 BOM 圖像化編輯器

> **Superseded 2026-08-24**：本規格已由 `ADR-PDM-BOM-RETIREMENT-001` 全面取代。現行產品不提供 BOM 圖像編輯器；本文只保留歷史追溯。

狀態: Superseded / Historical only
文件成熟度: Phase 2 `Local RD Implementation Complete / Focused QA-QC Passed`
建立日: 2026-06-07
最近更新: 2026-08-13
關聯任務: `DEV-BOM-VISUAL-EDITOR-001`（歷史）, `DEV-071` / `DEV-PDM-BOM-VISUAL-EDITOR-002`
延伸規格: `SPEC-BOM-WORKBENCH-001`, `SPEC-PDM-DETAIL-DRAWER-001`

## 1. 目標

BOM 工作台第一版已具備 Draft、樹狀資料、人工拖拉、Undo/Redo、送審與 Released Snapshot，但主要視覺仍接近清單。這次要把主編輯區升級為圖像化 BOM 關係編輯器，讓工程師像使用 XMind 一樣理解與調整父子件關係，同時保留 BOM 的工程治理語意。

成功標準:
- 工程師一眼看出 parent assembly、群組、子件、數量、版次、來源與階層。
- 可用拖拉改父子關係與同層順序。
- 節點屬性以圖號工作台同款右側 drawer 編輯，不壓縮主畫布。
- 真實資料仍以 `parentLineId` 與 `sequenceNo` 為準，不保存自由排版座標。
- 現有 BOM draft API、審核、發行、匯出與權限模型不破壞。

## 2. UX 設計

主畫面採混合式工作台:
- 左側: 料件/圖面搜尋庫，可拖入畫布。
- 中央: React Flow BOM 畫布，支援 pan、zoom、fit view、節點選取、關係連線。
- 右側: `PdmDetailDrawer` 節點屬性抽屜，沿用圖號工作台 drawer 標準。

畫布語意:
- Root parent assembly 固定為畫布左側主節點。
- Group 節點表示虛擬群組。
- Item 節點表示實際 BOM 子件。
- Edge 表示 parent-child BOM 關係。
- 節點卡片顯示料號/群組名、品名、Rev、Qty、source badge。

拖拉規則:
- 拖到節點中央: 目標節點成為新 parent，拖曳節點移到該 parent 的最後一筆子件。
- 拖到同層投放線: 調整 `sequenceNo`。
- 拖到空白畫布: 移到 root 層最後一筆。
- 搜尋結果拖入畫布時，依 drop target 建立 item line。
- 禁止移到自己或自己的子孫底下；超過 10 層要被阻擋。

Drawer 規則:
- 點選節點或按 Enter 開啟 drawer。
- Escape 關閉 drawer 並回到畫布焦點。
- Drawer 可調寬並記憶寬度，backdrop 透明，不暗化主畫布。
- Drawer 內保留節點屬性、刪除、送審原因、Draft 比對與 XLS 貼上區。

## 3. 技術設計

使用 `@xyflow/react` 作為畫布基礎，避免自製 pan/zoom/edge/selection 的高維護成本。

資料流:
1. `selectedDraft.lines` 是唯一本地真實資料。
2. `buildTreeRows` 產生階層與順序。
3. `buildFlowElements` 由 tree rows 生成 React Flow nodes/edges。
4. 節點拖拉完成後只更新 `parent_line_id` 與 `sequence_no`。
5. 儲存時沿用既有 `toPatchLine` 與 `PATCH /api/bom/drafts/[draftId]`。

Layout:
- 不保存 viewport node 座標。
- 每次 lines 改變以 deterministic tree layout 重新計算位置。
- depth 決定 X 軸，同層順序決定 Y 軸，避免自由排版與 BOM 順序不一致。
- Parent-child edge 使用 React Flow `straight`；父節點到下一階一律以單一直線連接，不使用 elbow／smoothstep 折線，避免視線在層級切換處彎折。

限制:
- 不新增 DB table/column。
- 不改 Released Snapshot schema。
- 不讓使用者以視覺座標覆蓋 BOM canonical order。

## 4. 驗證計畫

必跑:
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:bom-workbench-tree-rules`
- `npm.cmd run qc:bom-workbench-ui`
- `npm.cmd run qc:pdm-system-detail-drawer-ui`

QC 必驗:
- 桌面 1440px: 畫布非空白、節點與 edge 可見、無 page-level horizontal overflow。
- 手機 390px: 頁面可載入且不水平溢出。
- CAD Draft 生成後節點出現在畫布。
- 搜尋料件可拖入畫布。
- item 可拖到 group/節點下成為子件。
- 同層順序可調整。
- 節點屬性 drawer 可開、關、調整寬度。
- Qty / Rev / group name 編輯後節點卡片同步更新。
- Save 後 API 回傳保留 hierarchy 與 quantity。

## 5. Implementation Evidence

完成日: 2026-06-07

- RD: `/bom/workbench` 主編輯區改為 React Flow 混合畫布，自訂 root/group/item BOM node 與 smoothstep edge。
- 2026-08-14 UX amendment: legacy BOM workbench 與 XMind editor 的 parent-child edge 統一改為 `straight`，父節點到下一階不再使用 elbow／smoothstep 折線。
- RD: 左側搜尋結果新增明確 drag handle，使用標準 `DataTransfer` payload 拖入畫布。
- RD: 節點拖曳可改 parent、移回 root 或同層排序；canonical data 仍為 `parentLineId` 與 `sequenceNo`。
- RD: 右側屬性改用 `PdmDetailDrawer`，保留 Qty、group、XLS 貼上、送審與 compare。
- QC: `npm.cmd run lint` 通過。
- QC: `npm.cmd run build` 通過；僅保留既有 Turbopack dynamic path / NFT trace warnings。
- QC: `npm.cmd run qc:bom-workbench-tree-rules` 22/22 通過。
- QC: `npm.cmd run qc:bom-workbench-ui` 34/34 通過。
- QC: `npm.cmd run qc:pdm-system-detail-drawer-ui` 53/53 通過。

## 6. Assumptions

- 本輪只改 BOM 工作台主編輯 UX，不改 BOM 審核頁 diff 呈現。
- React Flow 是允許新增的前端依賴。
- Phase 1 的 XMind 類比用於「樹狀關係編輯體驗」，不是自由白板；Phase 2 允許草稿編輯暫存區，但不改變正式 BOM 的嚴格樹狀權威。
- BOM 仍是工程資料，排序與階層要可審核、可重現、可匯出。

## 7. 2026-08-13 Phase 2 直覺編輯增強 Brief

### 7.1 決策狀態與 Spec Impact Preflight

- 本節建立時成熟度：`Brief Ready / Human Confirmed / RD Not Started / Not Requested for Implementation`；目前成熟度以第 8 節 `RD Implementation Ready` 為準。
- 人類已確認：Floating Topic 在編輯過程中有價值，必須納入本次產品方向。
- Spec Impact：`Intentional replacement`。取代「畫布任何時刻都只能存在正式樹節點」的舊假設，但不取代 BOM canonical hierarchy、審核、發行、snapshot 或匯出權威。
- 正式 BOM 仍不得存在無父層的游離料件；Floating Topic 是 draft editor 的暫存物件，不是正式 BOM line，也不是任意關係線。
- 本節保留 2026-08-13 的 Human Decision Brief；第 8 節已完成 repository-specific implementation contract，若兩節有衝突，以第 8 節為準。

### 7.2 問題與使用者價值

目前編輯器雖可呈現 BOM 樹，但建立、移動、刪除與整理仍需要在畫布、drawer 與搜尋區之間反覆切換。工程師在拆解組合件時，也常先找到候選料件，再決定它應放入哪一層；若系統要求每一筆在建立當下就選定父層，會迫使使用者過早做結構決策。

Phase 2 的目標是讓常見結構操作靠近節點、在放開滑鼠前看懂結果、在錯誤後可恢復，並提供可保存的 Floating Topic 暫存區，讓「先收集、後歸位」成為安全的草稿工作方式。

### 7.3 UX Intent

- 使用者與情境：RD／BOM 編輯者在桌機或筆電上建立、重整或校對多層 BOM Draft。
- 主要任務與成功結果：快速新增、改父層、排序、暫存與修正料件，最後收斂成可送審的唯一正式樹。
- 熟悉 pattern：節點旁新增、拖放三區預覽、右鍵／更多選單、Enter／Tab 階層編輯、Undo／Redo、折疊與只看分支。
- 主要工作物件：正式 BOM 樹；Floating Topic 暫存區是相鄰但視覺分隔的次要工作區。
- 最可能誤解點：把 Floating Topic 誤認為已納入 BOM，或把拖到節點中央誤認為同層排序。
- 高風險操作：改父層、刪除含子孫的節點、把正式節點移出樹、帶有未歸位項目時送審。
- 安全預設：動作前顯示落點與影響，動作後可復原；未收斂 Floating Topic 時正式提交 fail closed。
- 降層資訊：完整屬性、where-used、audit、來源細節與長說明留在 drawer；節點只顯示主識別、Qty 與會改變判斷的例外。
- 不能發生：循環、超過深度上限、靜默刪除子樹、靜默忽略 Floating Topic、輸入欄位中誤觸畫布快捷鍵。

### 7.4 本次候選產品切片

1. **靠近節點的新增與快速編輯**
   - hover／focus 節點時顯示低干擾新增入口，可建立同層或子層料件。
   - 雙擊或 `F2` 只快速編輯允許的低風險欄位；完整屬性仍進右側 drawer。
   - 在畫布已明確取得焦點且 Draft 可編輯時，`Enter` 建立同層搜尋、`Tab` 建立子層搜尋、`Shift+Tab` 提升層級、`Alt+Up/Down` 同層排序、`Ctrl+Z/Y` 復原／重做。
   - focus 位於 `input`、`textarea`、`select`、`contenteditable`、drawer 或確認流程時，不攔截畫布快捷鍵。

2. **拖放結果可預測**
   - 目標節點上方投放線代表排在前面；中央代表成為子件；下方投放線代表排在後面。
   - 放開滑鼠前顯示新父層、同層順序或禁止原因；不可只靠顏色表達三種結果。
   - 自己、子孫、不可編輯狀態、超過深度或不允許的節點型別顯示禁止狀態且不改資料。

3. **安全刪除與可理解的歷史**
   - 分開提供「只移除這一節點並提升／重新掛接子件」與「刪除整個子樹」。
   - 刪除子樹前顯示受影響的後代數量；完成後提供可操作的 Undo。
   - 一次欄位編輯 session 合併為一個 history step，不把每個按鍵記成一次 Undo。

4. **大型 BOM 導航**
   - 節點可折疊／展開並顯示隱藏後代數量。
   - 支援「只看此分支」，同時保留 breadcrumb 或明確返回完整樹的方式。
   - 正常狀態保持安靜；缺件、過期、未發布、重複或人工異動等例外以最小充分 marker 呈現。

5. **Floating Topic 草稿暫存區**
   - 畫布提供明確標示的「未納入 BOM」暫存區；位置、容器與標籤均需讓使用者在 5 秒內辨識它不屬於正式樹。
   - 搜尋結果可直接加入暫存區；正式樹節點也可經明確拖放移到暫存區。移入前須揭露其子件處理方式，不得讓後代靜默遺失。
   - Floating Topic 可保存於 Draft 並在重新開啟後繼續整理；此項是產品方向，具體 persistence contract 由 RD Contract 決定。
   - 從暫存區拖到正式節點中央或同層投放線後，才轉為 canonical BOM line 並納入 hierarchy、排序、diff 與後續審核。
   - 畫布與工具列顯示未歸位數量，並提供定位；不為每個正常節點重複顯示教學文字。
   - 只要仍有未歸位 Floating Topic，送審、發行與正式匯出即 disabled／fail closed，錯誤訊息需說明影響並讓使用者可定位處理。
   - 系統不得在提交或匯出時自動刪除、靜默排除或猜測父層。

### 7.5 資訊層級與既有 Drawer 邊界

- 節點主畫面預設保留料號／群組名、品名、Qty，以及真正會改變判斷的 Rev／狀態例外；完整 Rev 歷史、來源、屬性、where-used、audit 與說明放入 drawer。
- 這是對 Phase 1「所有欄位都顯示在節點」方向的 `Compatible exception`：只讓決策必要資訊回到節點，不恢復資料卡片堆疊。
- Drawer 仍為右側 fixed overlay，不推擠畫布；可調寬、記憶寬度、`Escape` 關閉並恢復原節點焦點。
- 顏色不能是狀態、drop zone 或 Floating Topic 的唯一訊號；必須搭配位置、形狀、icon、短標籤或可及名稱。

### 7.6 驗收方向

- 首次進入的工程師能在 5 秒內指出正式 BOM 樹、目前選取節點、可新增位置與「未納入 BOM」暫存區。
- 使用者在放開滑鼠前能分辨 reorder-before、reparent 與 reorder-after，且 invalid target 不改變 Draft。
- 使用者可只靠鍵盤完成同層新增、子層新增、提升層級、排序、開啟明細與復原；輸入文字時不會觸發畫布動作。
- 刪除單一節點與刪除子樹的結果不同且可預測，子樹刪除明確顯示影響數量。
- Floating Topic 保存 Draft、重新開啟、定位、歸位後資料一致；未歸位時送審／發行／正式匯出在 UI 與 server 兩側都被阻擋。
- 1440×900、1024×768、768×1024、390×844 均不得有非預期水平 overflow、浮層超界、關鍵動作被遮擋或 scroll owner 混亂；手機可降級為全寬 drawer 與結構化清單操作，不要求完整自由畫布手勢。
- Undo／Redo 覆蓋新增、改父層、排序、歸位、移入暫存與刪除；一次欄位編輯只產生一個可理解的 history step。

### 7.7 不在本 Brief 當前切片

- 任意 relationship edge、自由樣式／貼紙／插畫、Pitch Mode、任意座標作為正式 BOM 資料。
- 批次多選、跨 BOM 搬移與 AI 自動改寫 BOM；Map／Outliner 雙視圖已因 XMind 肌肉記憶要求納入第 8 節當前切片。
- schema、migration、API、permission、feature flag、transaction、idempotency、audit payload 與 Released Snapshot 變更。
- production／staging migration、正式資料修復、deploy、release、stage、commit、merge 或 PR。

### 7.8 風險、停止條件與重新進入

- 現行 `parent_line_id = null` 可能已表示 root child，不能直接拿來同時表示 Floating Topic；若 RD 無法建立不混淆 canonical line 的 editor-only persistence，停止並回 Dev PM。
- 若 Draft save 會丟棄暫存項目、提交只在前端阻擋、匯出會靜默忽略、Undo 無法涵蓋跨區拖放，均不得進入實作驗收。
- 若快捷鍵需要覆蓋瀏覽器原生行為、drawer／input focus 邊界不明、刪除單節點無法定義子件結果，須先升級契約再實作。
- 第 8 節已完成 persistence、API／repository ownership、permission、transaction／history atom、error envelope、feature rollback、exact files 與 QA evidence matrix；RD 可依 Phase 1A 開始本機實作。

### 7.9 Future Phase Capsules

- **進階篩選與批次作業**：以狀態／來源／缺件條件 highlight 或 dim、批次選取、批次移動與註記；重新進入條件是大型 BOM 真實任務證明單節點操作不足。

### 7.10 XMind 研究來源與轉譯原則

- [XMind Topic](https://xmind.com/user-guide/topic-editing-new)：同層／子層建立、Floating Topic、快速文字編輯、單節點刪除、拖放階層與同層排序。
- [XMind Outliner](https://xmind.com/user-guide/outliner-new)：Enter／Tab／Shift+Tab、拖曳重整、只看分支與 Map／Outliner 切換。
- [XMind Topic Filtering](https://xmind.com/user-guide/topic-filtering-new)：依 topic、note、marker、label、task 或 priority 聚焦內容。
- [XMind Marker](https://xmind.com/user-guide/marker-new)：以最小視覺標記支援優先、進度、狀態與角色辨識。
- [XMind Note](https://xmind.com/user-guide/note-new)：長內容降層，避免主圖被說明文字淹沒。
- [XMind Advanced Layout](https://xmind.com/user-guide/advanced-layout-new)：確認 Floating Topic 可自由放置；BOM 只借用其「暫存與再歸位」心智模型，不複製自由座標作為正式資料。

轉譯原則：複製可降低認知成本的 interaction pattern，不複製會削弱工程資料治理的自由度。正式 BOM 的父子關係、排序、審核與發行仍由 PDM domain contract 決定。

## 8. Phase 2 RD Implementation Contract

### 8.1 Readiness 與權威邊界

- 成熟度：`RD Implementation Ready / Human Confirmed / RD Not Started / Local Implementation Eligible / Production Release Gated`。
- 來源 ID：`DEV-PDM-BOM-VISUAL-EDITOR-002`；短碼：`DEV-071`。
- 目標：桌機／筆電的建立、編輯、階層調整、聚焦、折疊、Floating Topic 與 Map／Outliner 切換，須讓熟悉 XMind 的使用者不需重新建立主要肌肉記憶。
- 品牌邊界：沿用 AI PDM 色彩、字型、icon library 與 domain 文案；不得複製 XMind 商標、專有圖示、插畫、template 或裝飾樣式。需對齊的是 command、順序、空間位置、focus 與結果，不是品牌 trade dress。
- PDM 權威：`bom_lines_tree`、BOM review/release、Released Snapshot 與正式 export 維持 canonical；新資料只保存 draft-only Floating Topics 與 editor concurrency，不建立第二套正式 BOM。
- ADR 判定：不新增 ADR。產品方向已由使用者確認；資料方案是既有 strict-tree authority 的 additive editor extension，未改變 ownership 或 release authority。

### 8.2 Repository Fact Finding

現行可重用能力：

- `src/app/bom/workbench/page.tsx` 已使用 `@xyflow/react`、deterministic tree layout、`PdmDetailDrawer`、Draft save、Undo/Redo、indent/outdent、同層排序與搜尋插入。
- `selectedDraft.lines`、`parent_line_id`、`sequence_no` 是 client canonical tree；`pushLines()` 每次 mutation 都建立 history snapshot。
- `PATCH /api/bom/drafts/[draftId]` 目前只接受 `lines`，`saveDraftTree()` 會在 transaction 內 delete-and-reinsert `bom_lines_tree`，尚無 editor version guard。
- `POST /api/bom/drafts/[draftId]/submit-review` 目前只檢查 mutable、reconfirmation、change reason 與 pending review，尚無 Floating Topic server gate。
- `bom_lines_tree.parent_line_id = null` 已代表正式 root child，不能再拿 null 表示 Floating Topic。
- 現行 `deleteLine()` 直接刪除整棵子樹；drawer 的受控欄位每一個 `onChange` 都新增 history step；React Flow drop 只用最近節點距離，尚無 before／child／after preview。
- 現行 `Controls` 與 `MiniMap` 使用 React Flow 預設位置；toolbar 依序是儲存、Undo、Redo、群組、插入、設為目前、複製、刪除，與 XMind command order 不一致。

Dirty worktree boundary（2026-08-13 assessment）：

- 已修改且 RD 必須逐 hunk 保留：`db/schema.sql`、`package.json`、`src/app/globals.css`、`src/lib/bom-create-context.ts`。
- 已存在未追蹤 migration：`db/postgres/033_drawing_recognition.sql`、`db/postgres/034_root_vocabulary_human_label.sql`；DEV-071 必須使用 `035_bom_draft_floating_topics.sql`，不得覆蓋或重新編號。
- 禁止 reset、checkout、全域 formatter 或把不相關 dirty 變更混入 DEV-071 commit。

### 8.3 XMind Muscle-Memory Parity Contract

#### 8.3.1 桌機／筆電空間配置

`>= 1024px` 必須維持以下由上而下、由左而右的固定空間語法：

1. **Editor context strip**：現有 Part Number、BOM Rev、狀態與返回入口留在最上方；不放高頻結構指令。
2. **XMind command toolbar**：緊貼 context strip 下方、畫布上方，單列高度 `52px`、左右 padding `8px`、group gap `4px`、separator `1×24px`。不得因 selection 或 loading 改變按鈕位置。
3. **Canvas／Outliner 主工作面**：填滿 toolbar 下方可用高度；右側 drawer 為 fixed overlay，不推擠、不縮窄主工作面。
4. **右下角 view controls**：在主工作面內 `right:16px; bottom:16px`；順序固定為 `大綱／心智圖`、`縮小`、`比例`、`放大`、`符合畫面`。移除常駐 MiniMap，導覽圖只可放入「更多」。
5. **右側 Inspector**：toolbar 最右的 `明細` 按鈕開啟既有 `PdmDetailDrawer`；drawer 預設 `520px`、最小 `400px`、記憶寬度、透明 backdrop、`Escape` 關閉並恢復原節點焦點。
6. **Branch-only exit**：只看分支時，畫布左上角顯示單一 `顯示完整內容` 控制；退出後選取與 viewport 回到原分支。

Toolbar DOM 與視覺順序固定如下；RD 必須使用 `data-xmind-slot`，QC 以 `getBoundingClientRect()` 驗證相對位置：

| Group | `data-xmind-slot` | 可見文案／用途 | 尺寸與位置 |
| --- | --- | --- | --- |
| History | `undo` | 復原 | toolbar 最左，`36×36` icon button |
| History | `redo` | 重做 | undo 正右方，`36×36` |
| Create | `topic` | 同層料件 | 第一個主要建立按鈕，`min 88×40` |
| Create | `subtopic` | 子層料件 | Topic 正右方，`min 88×40` |
| Create | `insert` | 插入 | 開啟 Parent Topic／Floating Topic／群組 menu，`min 72×40` |
| Navigate | `fold` | 收合／展開 | create group 後第一個 icon button |
| Navigate | `focus-branch` | 只看分支 | fold 正右方 |
| Governance | `save` | 儲存／已儲存 | flexible spacer 後第一項；dirty 才提高權重 |
| Inspector | `detail` | 明細 | toolbar 右端倒數第二項 |
| Overflow | `more` | 更多 | toolbar 最右；承接設為目前、複製草稿、刪除草稿、導覽圖 |

空間規則：`undo.left < redo.left < topic.left < subtopic.left < insert.left < fold.left < focus-branch.left < save.left < detail.left < more.left`；save 以前的 group 靠左，save 以後靠右。`768–1023px` 可隱藏 icon button 文案但順序不得改；`<768px` 預設進 Outliner，toolbar 水平捲動且 create group 仍在 history group 之後，不能把主要建立動作藏入 hamburger。

#### 8.3.2 指令與快捷鍵

只有主工作面明確 focus、Draft mutable、沒有 modal／drawer form／inline picker 正在輸入時，才攔截資料異動快捷鍵。

| XMind pattern | Windows/Web shortcut | BOM 結果 | 防呆與例外 |
| --- | --- | --- | --- |
| Add Topic | `Enter` | 在選取節點後開啟「同層料件」inline canonical item picker | Root 選取時建立 root child；選定結果前不改 Draft |
| Add Subtopic | `Tab` | 在選取節點下開啟「子層料件」inline picker | depth 10、immutable、item-type constraint fail closed |
| Add Parent Topic | `Ctrl+Enter` | 以新群組包住選取節點，inline 編輯群組名 | 一個 history atom；取消時零寫入 |
| Add Floating Topic | 雙擊畫布空白 | 在點擊 world coordinate 開啟 Floating Topic inline picker | 點到 node／edge／control 不觸發；選定前零寫入 |
| Add Floating Topic | blank context menu → `插入暫存料件` | 同上 | menu 出現在 pointer 附近但保持 viewport 內 |
| Edit Topic | `Space` 或雙擊節點文字 | item 開 canonical replace picker；group 開 inline name editor | 不允許自由輸入不存在的 Part Number |
| Reorder | `Alt+Up/Down` | 同父層上移／下移 | 邊界時按鍵無資料變更並有低干擾回饋 |
| Indent／Outdent | `Tab`／`Shift+Tab`（Outliner row 已選取且非 create mode） | 調整父層 | Map 的 Tab 保留 Add Subtopic；Outliner 依 XMind 語意縮排 |
| Delete Single Topic | `Ctrl+Delete` | 只移除節點，子件提升到原父層並保留相對順序 | Root 不可刪；一個 history atom；toast 提供 Undo |
| Delete Topic | `Delete` | 刪除整個 branch | leaf 可直接刪並 Undo；有後代時顯示數量確認 |
| Undo | `Ctrl+Z` | 還原一個 semantic history atom | inline typing session、drag、promote、subtree delete 各自只算一步 |
| Redo | `Ctrl+Shift+Z` | 重做 | `Ctrl+Y` 僅作 Windows 相容 alias |
| Fold／Unfold selected | `Ctrl+/` | 收合／展開選取 branch | 收合後顯示隱藏後代數 |
| Fold all | `Ctrl+Alt+/` | 收合所有 root branches | 再次執行展開；toolbar tooltip 顯示 shortcut |
| Show Branch Only | `Ctrl+;` | 只看選取 branch／再次執行回完整樹 | 左上角同步顯示 `顯示完整內容` |
| Cancel／Close | `Escape` | 依序取消 inline editor、關 menu、關 drawer、退出暫時狀態 | 不清除已保存 selection |
| Save | `Ctrl+S` | 儲存 Draft | PDM 特有；prevent browser save 只在 editor focus 且 dirty 時啟用 |
| Central Topic | `Home` | 選取並置中 BOM root | 不攔截 XMind desktop 的 `Ctrl+R`，因 Web 必須保留重新整理 |

刻意差異：`Ctrl+R` 與 `Ctrl +/-` 不得被 Web app 攔截，分別保留瀏覽器 reload 與 page zoom；畫布縮放使用右下角控制、trackpad／wheel 與 `符合畫面`。此為 browser safety exception，不得以「完全相同」為由覆蓋原生快捷鍵。

#### 8.3.3 Node、hover 與 context menu

- 節點維持 XMind 的「主題先於卡片」掃描感：主識別一行、品名第二行、Qty 與真正的例外 marker 第三行；不得恢復 source／Rev／狀態 badge 堆疊。
- 選取節點時顯示清楚外框；hover／keyboard focus 時在節點右邊緣中央顯示 `+`，點擊等同 `Tab` 的子層料件 picker。`+` 的 hit target 至少 `32×32px`，不造成節點尺寸跳動。
- group 與 item 使用相同外形骨架，只以 icon、短標籤與可及名稱區分；Floating root 使用虛線外框與 `未納入 BOM` 短標籤，不能只靠顏色。
- 右鍵 menu 固定順序：`同層料件`、`子層料件`、`新增父群組`、`移到未納入 BOM`／`納入 BOM`、separator、`編輯`、`收合／展開`、`只看分支`、`明細`、separator、`只刪除此節點`、`刪除整個分支`。
- Root context menu 移除刪除與移出樹；immutable Draft 隱藏 mutation commands，只保留 fold、focus、details。

#### 8.3.4 Drag-and-drop parity

- 拖曳節點時整個 branch 跟隨，與 XMind hierarchy drag 心智一致；不得只移動 root 而遺留子件。
- 正式 node 的 target 分三區：上 25%=`before`、中 50%=`child`、下 25%=`after`。drop preview 必須顯示投放線／父層框、短標籤與 `aria-live` 結果。
- 拖到 `未納入 BOM` zone：整個 branch 轉成 floating subtree，root 保存 world coordinate，後代保存相對 hierarchy。
- Floating subtree 拖回正式 target：root 與所有後代一次轉回 `bom_lines_tree`，world coordinate 不進 canonical data。
- invalid cycle、depth>10、immutable、self、cross-draft 或 unavailable part 顯示 forbidden cursor、原因 tooltip，drop 後 Draft／history 不變。
- search result 拖入正式 node 使用同一三區 preview；拖到空白畫布建立 Floating Topic，而不是猜成 root child。

#### 8.3.5 Map／Outliner

- 右下角 `心智圖／大綱` 切換與 XMind 同位置；兩者共用同一 `selectedId`、collapsed IDs、focus branch、filter、history、dirty 與 persistence state。
- Outliner 第一區顯示正式 BOM tree；第二區固定標題 `未納入 BOM (n)` 並顯示 Floating subtrees，不能隱藏未歸位風險。
- Outliner `Enter` 建同層、`Tab` indent、`Shift+Tab` outdent；Map `Enter` 建同層、`Tab` 建子層。模式切換後焦點回到同一 selected entity。
- Desktop/laptop 預設記憶 local view preference；mobile `<768px` 預設 Outliner，但使用者可切回 Map。

### 8.4 Data Model 與 Migration Contract

選定方案：新增 editor-only table，不把 Floating Topic 塞入 `bom_lines_tree.parent_line_id = null`。

`bom_drafts` additive column：

- `editor_version INTEGER NOT NULL DEFAULT 0`：每次成功保存 tree + floating topics 原子加一，用於 optimistic concurrency。

新增 `bom_draft_floating_topics`：

| Column | Contract |
| --- | --- |
| `id TEXT PRIMARY KEY` | client-stable topic id；在 formal↔floating conversion 中保留 |
| `bom_draft_id TEXT NOT NULL` | FK `bom_drafts(id) ON DELETE CASCADE` |
| `parent_floating_topic_id TEXT NULL` | 只可指向同 draft floating topic；null 表示 floating root |
| `node_type TEXT NOT NULL` | `item` 或 `group` |
| `item_id TEXT NULL` | item lookup 結果，FK items，與既有 line 行為一致 |
| `part_number TEXT NULL` | item 必填，group 為 null |
| `group_name TEXT NULL` | group 必填，item 為 null |
| `quantity REAL NULL` | item > 0，group null |
| `sequence_no INTEGER NOT NULL` | floating siblings deterministic order |
| `position_x REAL NULL`, `position_y REAL NULL` | 只有 floating root 必填；finite 且各在 `-100000..100000` |
| `source TEXT NOT NULL DEFAULT 'manual'` | 沿用既有 source enum；save 後為 manual |
| actor／timestamp columns | 對齊 `bom_lines_tree` |

Constraints／indexes：

- item／group field CHECK 與 `bom_lines_tree` 一致。
- root 必須同時有 x/y，child 必須同時沒有 x/y。
- `UNIQUE (bom_draft_id, id)`；self-reference 使用 `(bom_draft_id, parent_floating_topic_id)` → `(bom_draft_id, id)`，阻止 cross-draft parent。
- index `idx_bom_draft_floating_topics_draft_parent(bom_draft_id,parent_floating_topic_id,sequence_no)`。
- migration：`db/postgres/035_bom_draft_floating_topics.sql`；同步更新 `db/schema.sql`、`src/lib/db.ts` SQLite compatibility、`db/postgres/001_initial_schema.sql` baseline 與 `db/postgres/002_supabase_rls_plan.sql` table inventory。migration additive、零 backfill、既有 Draft `editor_version=0`、floating count=0。
- Released Snapshot schema 不新增 floating 欄位；snapshot 建立前 count 必須為 0。

Type contract：

```ts
type BomDraftFloatingTopic = {
  id: string;
  bom_draft_id: string;
  parent_floating_topic_id: string | null;
  node_type: "item" | "group";
  item_id: string | null;
  part_number: string | null;
  part_name?: string | null;
  group_name: string | null;
  quantity: number | null;
  sequence_no: number;
  position_x: number | null;
  position_y: number | null;
  source: BomWorkbenchSource;
};

type BomWorkbenchDraftDetail = BomWorkbenchDraftSummary & {
  editor_version: number;
  lines: BomWorkbenchLine[];
  floating_topics: BomDraftFloatingTopic[];
  reconfirmation_flags: BomReconfirmationFlag[];
};
```

### 8.5 API、Permission 與 Transaction Contract

#### GET `/api/bom/drafts/[draftId]`

- Response 維持 `{ draft }`，`draft` additive 回傳 `editor_version` 與 `floating_topics`。
- read permission 維持 `canReadBomDraftRecordAsync`；Manufacturing／Procurement 仍不可讀 Draft editor。

#### PATCH `/api/bom/drafts/[draftId]`

Request：

```json
{
  "expectedEditorVersion": 4,
  "reason": "Save BOM editor state",
  "lines": [],
  "floatingTopics": []
}
```

- `lines` shape 沿用現行 contract；`floatingTopics` 使用 camelCase：`parentFloatingTopicId`、`nodeType`、`partNumber`、`groupName`、`quantity`、`sequenceNo`、`positionX`、`positionY`。
- 新增 `canEditBomDraftRecordAsync(user,draft)`：復用 company／owner access，Engineer 只可編輯自己的 owner Part Number，R&D Manager／Admin 可編輯 company scope；Manufacturing／Procurement、immutable status、active review 一律拒絕。GET 不得因新增 write helper 而縮窄。
- server validation：兩陣列 id 全域不重複、各自無 cycle／orphan、formal depth<=10、floating depth<=10、總 entity<=2000、quantity>0、part exists/available、finite position、root position contract。
- Postgres 以 `SELECT ... FOR UPDATE` 鎖 draft；SQLite 由既有 write transaction serialization 承接。比較 `expectedEditorVersion`，不符回 `409 BOM_DRAFT_EDITOR_VERSION_CONFLICT` 與 latest version，不得覆蓋他人結果。
- 同一 transaction：delete/insert formal lines、delete/insert floating topics、更新 canonical `line_count`、`editor_version+1`、updated_at/by、寫一筆 `bom_edit_events.save_editor_state` 與一筆 audit。任何一步失敗全部 rollback。
- Response `{ draft }` 回傳新 version 與兩組資料；client reset history baseline，但保持 selected id（若仍存在）。

#### Review／release／export fail-closed

- `POST /api/bom/drafts/[draftId]/submit-review` 在同一 locked transaction 查 floating count；大於 0 回 `409 BOM_FLOATING_TOPICS_UNRESOLVED`，payload 含 `count`，不回傳 topic 內容。
- `approveReview()`／Released Snapshot 建立前再次查 count=0，防止 bypass 或 race；否則 review 保持 Pending/Rejected 原狀，無 snapshot、無 partial status mutation。
- 所有 Draft diff／formal export 入口遇到 floating count>0 回同一 domain code；Released-only export 不受影響，因 Released Snapshot 永遠沒有 floating data。
- UI submit disabled 是提示，不是唯一 gate；direct API、stale tab、back/forward、reload 都必須 fail closed。

### 8.6 Client State、History 與 Conversion Contract

- 新增 `BomEditorState = { lines, floatingTopics, selectedEntityId, collapsedIds, focusRootId }`；history 只保存 domain-editable state，不保存 drawer open、menu open、hover、viewport zoom 或 transient picker query。
- `commitHistory(commandId,before,after)` 以 command 為 atom；inline editor在 focus/blur 或 Enter commit 時合併，Escape 還原；drag start→drop 一步；delete／promote／formal↔floating conversion 各一步。
- history 上限 100 atoms；新 command 會截斷 redo tail。Save 不清空目前可 Undo 歷史，但把 dirty baseline 指向新 editor version；重新載入才 reset history。
- formal→floating：選取 root 與全部 descendants 自 `lines` 移除，保留 ids／node data／relative parent；root 的 `parent_floating_topic_id=null` 並保存 drop world position。
- floating→formal：整個 floating subtree 自 `floatingTopics` 移除，root 指向 drop target 或 root，後代 parent ids 保留，所有 formal siblings 重新 normalize `sequence_no`；x/y 丟棄。
- delete-single：移除 entity，children 插到被刪 entity 原位置，依原 sequence 保序；formal 與 floating 各自在自己的 graph 執行，不能跨 graph promote。

### 8.7 Exact Product File Plan

新增（實作後收斂為實際路徑）：

- `src/lib/bom-editor-history.ts`：semantic history 與 editor graph pure functions。
- `src/lib/bom-editor-feature.ts`：default-off feature flag resolver。
- `src/components/bom-editor/bom-editor-types.ts`：editor state、command 與 drop zone types。
- `src/components/bom-editor/xmind-bom-toolbar.tsx`：固定 toolbar slots、Insert／More menus與 tooltips。
- `src/components/bom-editor/xmind-bom-node.tsx`：node、hover `+`、collapse count與 drop preview anchors。
- `src/components/bom-editor/bom-inline-picker.tsx`：Topic／Subtopic／Floating canonical item picker。
- `src/components/bom-editor/bom-floating-stage.tsx`、`bom-outliner.tsx`、`bom-node-inspector.tsx`、`bom-node-context-menu.tsx`：雙 graph staging、Outliner、inspector 與 context menu。
- `src/components/bom-editor/use-bom-editor-shortcuts.ts`：focus-scoped shortcuts與 native-browser exclusions。
- `src/components/bom-editor/bom-xmind-editor.tsx`：Map／Outliner 共用 editor controller、拖放、history、save與 recovery UI。
- `db/postgres/035_bom_draft_floating_topics.sql`。
- `scripts/qc-dev-071-contract.mjs`、`scripts/qc-dev-071-api.mjs`、`scripts/qc-dev-071-browser.mjs`。

修改：

- `src/app/bom/workbench/page.tsx`：拆出元件、compose editor controller、雙 graph state、menus、keyboard、Map／Outliner、save/version conflict。
- `src/app/globals.css`：只加 `.xmind-bom-*` scoped styles與 viewport rules，不改全域 button/drawer contract。
- `src/lib/types.ts`、`src/lib/bom-workbench-async.ts`、`src/lib/repositories/bom-workbench-async-repository.ts`：types、read/save、validation、transaction、review/release gates。
- `src/lib/bom-create-context.ts`：新增 write-specific `canEditBomDraftRecordAsync`，保留既有 read/create semantics。
- `src/app/api/bom/drafts/[draftId]/route.ts`、`src/app/api/bom/drafts/[draftId]/submit-review/route.ts`：additive request/response、write permission、domain error envelope。
- review approval／release snapshot／export 的既有 owner files：只加入 unresolved-floating gate；RD 先以 `rg "approveBomWorkbenchReviewAsync|bom_release_snapshots|export"` 鎖定實際 caller，不複製 release authority。
- `db/schema.sql`、`src/lib/db.ts`、`db/postgres/001_initial_schema.sql`、`db/postgres/002_supabase_rls_plan.sql`、`db/postgres/README.md`。
- `package.json`：註冊 `qc:dev-071-contract|api|browser`；schema/migration 使用既有 `qc:bom-workbench-migration-path` 與 `qc:postgres-shadow`。
- 既有 `scripts/qc-bom-workbench-tree-rules.mjs`、`scripts/qc-bom-workbench-ui.mjs`、`scripts/qc-bom-workbench-review-release.mjs`、`scripts/qc-bom-workbench-release-export.mjs`：只更新被本契約 intentional replacement 的 expectations。

RD 開始前依 workspace `AGENTS.md` 讀取目前 Next 版本的：

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/forms.md`

### 8.8 Phase Coverage

1. **Phase 1A — Schema／repository／API**：035、SQLite compatibility、types、read/save transaction、editor version、write permission、review/release/export fail-closed。
2. **Phase 1B — Editor core**：pure graph conversion、history atoms、drop zone resolver、collapse/focus、keyboard hook、inline picker。
3. **Phase 1C — XMind spatial UI**：fixed toolbar slots、node hover `+`、context menu、three-zone preview、Floating stage、Map／Outliner、right inspector、bottom-right controls、responsive。
4. **Phase 1D — QA/QC**：contract/schema/API/browser evidence與既有 BOM regressions；完成前不宣稱產品 Done。

Phase 1A→1B→1C→1D 依序進行；若 1A data/API contract 未通過，不得先用 page-local storage 偽造 Floating persistence。

### 8.9 Acceptance Criteria 與 Evidence Matrix

| ID | Acceptance Criteria | Auto Evidence | Manual/Browser Evidence |
| --- | --- | --- | --- |
| XMB-001 | toolbar slot 順序、52px row、左右群組與 button 位置固定 | DOM slots + rect order | 1440/1024 screenshot |
| XMB-002 | Enter／Tab／Ctrl+Enter／double-click blank 結果符合 contract | keyboard integration | 熟悉 XMind 使用者 task walk |
| XMB-003 | Space／double-click 編輯不允許不存在 Part Number | API/DOM | picker keyboard walk |
| XMB-004 | Alt+Up/Down、Ctrl+Delete、Delete、Undo/Redo 都是一個 semantic atom | pure unit + API | toast/confirm/undo walk |
| XMB-005 | Ctrl+/、Ctrl+Alt+/、Ctrl+; 與左上 full-content recovery 可用 | DOM/state test | branch focus screenshot |
| XMB-006 | drag before/child/after 在放開前可辨識，invalid drop 零變更 | drop resolver test | mouse/pointer walk |
| XMB-007 | formal↔floating 整棵 subtree 可逆、ids/ordering preserved | pure + disposable DB | before/after screenshot |
| XMB-008 | Floating save/reopen 保留 graph 與 root coordinates | SQLite/Postgres API | reload/back/forward |
| XMB-009 | unresolved floating 在 submit/approve/export 全部 fail closed | direct HTTP + DB readback | disabled reason + locate |
| XMB-010 | concurrent stale save 回 409 且不覆蓋 winner | two-client transaction test | stale tab recovery |
| XMB-011 | Map／Outliner 右下同位置，共用 selection/collapse/focus/dirty | DOM/state test | mode switch/focus |
| XMB-012 | drawer 從右上 detail 開啟、overlay 不推擠、Escape focus restore | existing drawer QC | 4 viewport screenshot |
| XMB-013 | input/drawer/modal focus 不攔截 canvas shortcuts；Ctrl+R/+/− 保留 browser | event test | physical keyboard walk |
| XMB-014 | desktop/laptop 5 秒可辨識正式樹與未納入區，mobile 預設 Outliner | semantics/DOM | 1440/1024/768/390 human check |
| XMB-015 | 無 cycle/orphan/depth>10/cross-draft parent/position overflow | validation suite | error recovery walk |
| XMB-016 | Released Snapshot/export 不含 floating schema 或內容 | snapshot regression | released export readback |

必跑順序：

```text
npm.cmd run qc:dev-071:contract
npm.cmd run qc:dev-071:schema
npm.cmd run qc:dev-071:api
npm.cmd run qc:bom-workbench-tree-rules
npm.cmd run qc:bom-workbench-review-release
npm.cmd run qc:bom-workbench-release-export
npm.cmd run qc:bom-workbench-ui
npm.cmd run typecheck:app
npm.cmd run lint -- --quiet
npm.cmd run build:isolated
npm.cmd run qc:dev-071:browser
```

Browser matrix：`1440×900`、`1024×768`、`768×1024`、`390×844`；必留 toolbar、Map、Outliner、Floating stage、three drop zones、branch-only、drawer、delete confirm、version conflict、unresolved submit blocker screenshots與 console/network manifest。P0/P1=0、非預期 4xx/5xx=0、水平 overflow=0 才可通過。

### 8.10 Error／Recovery Contract

| Code | HTTP | Human impact | Recovery |
| --- | --- | --- | --- |
| `BOM_DRAFT_EDITOR_VERSION_CONFLICT` | 409 | 另一個頁籤已先儲存 | 顯示「重新載入最新內容」；不提供盲目覆蓋 |
| `BOM_FLOATING_TOPICS_UNRESOLVED` | 409 | 尚有 n 筆未納入正式 BOM | 顯示 count、切回 Map/Outliner 並定位第一筆 |
| `BOM_EDITOR_GRAPH_INVALID` | 400 | cycle/orphan/depth/id/position 不合法 | 保留本地 state，指出第一個可定位 entity |
| `BOM_DRAFT_NOT_EDITABLE` | 409 | 狀態已不可編輯或 review lock 生效 | reload server state，toolbar mutation disabled |
| `BOM_PART_NOT_AVAILABLE` | 400 | item 已不存在／不可用 | 保留 picker query，重新選 canonical item |
| `FORBIDDEN` | 403 | 無 company/owner/edit scope | 關閉 mutation UI，保留唯讀可返回路徑 |

API 不回 raw SQL、stack、table 名或 secret；client 不以 toast 取代 persistent blocked state。Save network failure保留 dirty history；重試使用同一 expected version，只有 server 409 才要求 reload。

### 8.11 Rollback 與 Stop Conditions

- Feature flag：新增 `PDM_BOM_XMIND_EDITOR_V2_ENABLED`，預設 `false`；false 使用現行 editor UI 與 `lines` contract，仍可讀取 additive `editor_version/floating_topics` 但不得靜默刪除既有 floating data。若 count>0，legacy UI 必須顯示 blocked handoff 到 v2，不能用舊 PATCH 覆蓋。
- Code rollback：關 flag 回舊 UI；schema/table 保留 additive，不做 down migration、不刪 floating data。
- API backward compatibility：舊 PATCH 缺 `expectedEditorVersion/floatingTopics` 僅在 floating count=0 且 flag=false 時接受；flag=true 或已有 floating data 回 `409 BOM_EDITOR_V2_REQUIRED`。
- Stop if：需要改 Part Number/BOM Revision authority、Released Snapshot schema、approval decision semantics、任意 relationship edge、跨 BOM clipboard、production/live migration、直接資料修復、stage/commit/merge/PR/deploy/release。
- Stop if：無法在同一 transaction 保存兩個 graph 與 editor version、無法在 approve/release path server recheck、或 browser shortcut 必須覆蓋 `Ctrl+R`/`Ctrl +/-` 才能達成。

### 8.12 Completion Definition

- `RD Implementation Ready` 只代表本文件已足以估工與開發，不代表產品已完成。
- 只有 Phase 1A～1D、XMB-001..016、既有 BOM regression、四 viewport browser evidence、dirty-boundary audit 全部通過，才能標記 Local RD/QA/QC complete。
- Production migration、flag activation、deploy、release 與正式資料仍須獨立 release gate。

### 8.13 Implementation Closure（2026-08-13）

- Phase 1A～1D 已於本機完成；`PDM_BOM_XMIND_EDITOR_V2_ENABLED` 預設仍為 `false`，舊 editor 路徑保留。
- Toolbar 10 個 slot、52px 高度與順序，XMind 對應快捷鍵、blank double-click Floating Topic、hover `+`、context menu、三區 drop preview、branch focus recovery、Map／Outliner、右側 inspector、右下 controls 與四 viewport 均已實作。
- formal lines、Floating Topics 與 `editor_version` 以單一 transaction 儲存；stale version 回 409 且不覆蓋 winner。未歸位 Floating Topics 在 UI、submit 與 approve/release authority fail closed。
- QA：`qc:dev-071-contract` 18/18、`qc:dev-071-api` 16/16、`qc:bom-workbench-migration-path` 21/21、`qc:postgres-shadow` 27/27、`typecheck:app` PASS。
- Browser：36/36、13 張畫面、4 個 viewport、console error 0、非預期 HTTP error 0、P0/P1=0；預期 stale PATCH 409 被獨立辨識。
- 權威證據：`output/qa/dev-071-xmind-bom-editor/20260813102707/run-manifest.json`；QA 與 QC 結論分別見 `.ai-doc/qa/qa-dev-071-xmind-bom-editor-validation-plan-2026-08-13.md`、`.ai-doc/qc/qc-dev-071-xmind-bom-editor-2026-08-13.md`。
- 未執行 live PostgreSQL migration、feature flag activation、正式資料寫入、stage/commit/merge/PR/deploy/release；這些仍須獨立 release gate。
- 2026-08-14 visual amendment QC：flag-off legacy rendered screenshot 與 flag-on XMind browser run 均確認 edge 為單一直線；證據見 `output/qa/bom-straight-edge/20260814101014/run-manifest.json`、`output/qa/bom-straight-edge/20260814101255/run-manifest.json`。
