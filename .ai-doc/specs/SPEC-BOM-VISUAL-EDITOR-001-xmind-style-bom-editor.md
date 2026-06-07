# SPEC-BOM-VISUAL-EDITOR-001: XMind 式 BOM 圖像化編輯器

狀態: Implemented
建立日: 2026-06-07
關聯任務: `DEV-BOM-VISUAL-EDITOR-001`
延伸規格: `SPEC-BOM-WORKBENCH-001`, `SPEC-PDM-DETAIL-DRAWER-001`

## 1. 目標

BOM 工作台第一版已具備 Draft、樹狀資料、人工拖拉、Undo/Redo、送審與 Released Snapshot，但主要視覺仍接近清單。這次要把主編輯區升級為圖像化 BOM 關係編輯器，讓工程師像使用 XMind 一樣理解與調整父子件關係，同時保留 BOM 的工程治理語意。

成功標準:
- 工程師一眼看出 parent assembly、群組、子件、數量、版次、來源與階層。
- 可用拖拉改父子關係與同層順序。
- 節點屬性以圖號模組同款右側 drawer 編輯，不壓縮主畫布。
- 真實資料仍以 `parentLineId` 與 `sequenceNo` 為準，不保存自由排版座標。
- 現有 BOM draft API、審核、發行、匯出與權限模型不破壞。

## 2. UX 設計

主畫面採混合式工作台:
- 左側: 料件/圖面搜尋庫，可拖入畫布。
- 中央: React Flow BOM 畫布，支援 pan、zoom、fit view、節點選取、關係連線。
- 右側: `PdmDetailDrawer` 節點屬性抽屜，沿用圖號模組 drawer 標準。

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
- XMind 類比用於「樹狀關係編輯體驗」，不是自由白板。
- BOM 仍是工程資料，排序與階層要可審核、可重現、可匯出。
