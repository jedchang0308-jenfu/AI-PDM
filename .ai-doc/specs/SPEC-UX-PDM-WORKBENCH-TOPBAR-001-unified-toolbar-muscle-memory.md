# SPEC-UX-PDM-WORKBENCH-TOPBAR-001：三工作台頂部欄一致化與肌肉記憶

版本：1.2
日期：2026-08-11；amended 2026-08-20、2026-08-21
狀態：`RD Implemented / Focused Contract QC 13/13 / Browser Smoke Blocked by auth / Production Release Gated`
Related DEV：`DEV-066`；`DEV-PDM-APPROVAL-INBOX-WORKBENCH-001` / `DEV-070`；`DEV-085`
父任務：`DEV-062`、`DEV-065`

## 0. 使用思考習慣

`#目的`：讓使用者在圖料、圖號、料號三個工作台，看到相同定義就能在相同位置操作，不必重新學習每個模組的頂部欄。

`#捷思法`：固定空間位置比新增文字提示更能形成肌肉記憶；搜尋／篩選是同一組任務，歷史條件是左側輔助條件，顯示模式是右側呈現選擇。

`#內容組織`：頂部欄只保留頁面識別與建立／重新整理；工具列固定為「篩選列 → 工具列 footer」；清單內容與分頁固定在結果面板底部。

## 0A. DEV-070 Compatible Extension：審核清單共用空間語法

Status：`Local RD Implemented / Focused Browser QC Passed / Full APW Matrix Pending / Production Release Gated`。

DEV-070 將相同的 topbar、filter row、result panel、selection、loading/empty/error 與 pagination 空間語法延伸到 `/approvals`，但不把審核工作台改成第四種圖料關係瀏覽器：

- 審核工作台使用搜尋、status/domain/action filters；沒有 `包含歷史` 與 view-mode switch 時，不渲染空白 footer control 或占位。
- 結果列透過既有 `PdmWorkbenchList` 顯示 approval-specific columns，不使用 `RelationRowCard`，也沒有關係樹／矩陣。
- 分頁仍由 `PdmWorkbenchPagination` 擁有 markup、ARIA、順序與位置。DEV-070 只增加 optional `hasPreviousPage?: boolean`；未傳入時仍以 `pageIndex > 0` 判定，DEV-066 三工作台行為不變。
- `.pdm-workbench-toolbar`、`.pdm-workbench-list-*`、`.pdm-workbench-pagination` 及 shared selected/loading/empty/error selectors 是 enabled inbox 的視覺 authority；不得保留平行 approval-only list/selection/pagination CSS。
- 審核頁可以保留 approval status chip 與 legacy detail fallback 的 domain styling；這些不改變 shared shell mechanics。

本 amendment 只做 compatible extension。DEV-070 的 API/cursor/return、exact files與 `APW-001..028` 由 approval platform SPEC/QA 管理；DEV-066 的歷史 12/12 evidence 不被重新宣稱為 DEV-070 evidence。

實作證據：`/approvals` 已接入 shared controller、`PdmWorkbenchList`、`PdmWorkbenchPagination` 與 shared keyboard mechanics；focused contract/query/navigation/typecheck/build/browser QC 已通過。完整四 viewport、101+ 分頁、cross-scope 與決策返回矩陣仍待 QA phase gate。

## 0B. DEV-085 Intentional Follow-up：Excel 式複選篩選器（2026-08-20）

Status：`RD Implementation Ready / Human Confirmed / RD Not Started / Local Only / Production Release Gated`。

DEV-085 保留本規格的 topbar、filter row、footer、顯示模式、結果面板、分頁位置與 RWD 空間契約，但有意把三工作台原本 scalar filter semantics 擴充為 Excel 式複選：

- 收合時仍是一欄一個控制項，不新增永久 chips、第二層 toolbar 或 domain-specific 平行版面；popover 是依觸發器定位的獨立表面，不參與 filter grid 排版。
- 使用者可見狀態固定為全選、部分選取、未選取；內部使用 explicit `all / none / some`，未選取必須得到零筆，不能解讀為全部。
- popover 內使用草稿；只有`確定`套用，`取消`、Escape、外部點擊或焦點離開捨棄草稿。`（全選）`在部分選取時呈現 indeterminate。
- 本規格第 3.4／4.2 節中「DEV-066 不改 filter semantics／URL／API」只描述 DEV-066 歷史範圍；DEV-085 對 filter semantics 的 focused replacement 以 `SPEC-PDM-WORKBENCH-MULTISELECT-FILTER-001` 與其 QA plan 為準，其他 topbar 契約不被取代。
- DEV-066 的歷史 12/12 contract evidence 只證明原版面，不得宣稱為 DEV-085 的複選、URL、server-side filter、cursor 或鍵盤證據。

權威文件：`.ai-doc/specs/SPEC-PDM-WORKBENCH-MULTISELECT-FILTER-001-excel-style-filter-contract.md`；驗證計畫：`.ai-doc/qa/qa-dev-085-workbench-multiselect-filter-validation-plan-2026-08-20.md`。

## 0C. Workbench history control removal（2026-08-21）

使用者要求移除圖料、圖號與料號三個工作台 footer 的「包含歷史／顯示已取消、已作廢與已合併紀錄」控制項。此為 UI 降噪，不改歷史資料的 server scope 或 deep-link 相容性：

- `relation-workbench`、`drawing-workbench` 與 `part-workbench` 均不再渲染 inline history checkbox/helper text。
- `/parts` 的 legacy fallback filter grid 也不再渲染同一控制項；僅保留 URL history scope 的讀取相容性。
- `/numbering/search`、`/numbering/drawings`、`/parts` 預設仍以 `history=exclude` 載入；既有 `history=include` deep link、history-only detail 自動納入與 terminal read-only 投影仍保留。
- drawing footer 只在 preview layout switch 可用時渲染；preview 關閉時不留下空白 footer 或占位。
- drawing history 的完整追溯仍由既有 detail／deep link／audit 位置承擔，不新增替代控制項。

## 1. 問題與使用者價值

目前三個工作台的欄位定義大致相同，但版面位置不一致：

- 圖料的 `關係樹／矩陣` 在篩選器下方左側，歷史勾選再獨立一列。
- 圖號與料號的 `清單／預覽圖` 在 footer 右側，歷史勾選在 footer 左側。
- 分頁雖然使用相近 CSS，未由共用元件保證結構、ARIA 與按鈕順序一致。

這會使使用者在切換模組後重新尋找同一個控制項，增加誤操作與認知負擔。本 DEV 將三個工作台視為同一種工作台 shell，保留各模組自己的欄位與領域動作，但統一空間語法。

## 2. 產品決策與明確邊界

### 2.1 固定版面契約

三個模組的頂部區域必須遵守以下固定順序：

1. `topbar`：左側頁面標題；右側重新整理、建立與既有說明入口。不得因本 DEV 新增不適用的 help 按鈕。
2. `filter row`：搜尋欄與所有篩選器同一組 grid，同一桌面列優先順序。
3. `toolbar footer`：三個工作台不渲染 inline history control；模式切換器固定在右側。若該模組沒有模式切換器，則不渲染空白 footer。
4. `result panel`：清單／關係內容；若有分頁，分頁固定在結果面板最下方、右側對齊。

### 2.2 顯示模式

- 圖料：保留 `關係樹／矩陣`，移入 footer 右側。
- 圖號、料號：保留 `清單／預覽圖`，移入 footer 右側。
- 三者沿用同一 segmented-control 視覺 primitive 與 focus/active/disabled 狀態；不新增第三種模式。
- 本 DEV 不改 DEV-065 的預覽來源、代表圖、缺圖 fallback、URL 優先序或 per-module preference。

### 2.3 分頁

- 三個工作台共用同一個 `PdmWorkbenchPagination` 元件契約。
- 控制順序固定為：`上一頁` → `第 N 頁` → `下一頁`。
- 無前頁／無後頁／載入中必須以 disabled state 表達；沒有可分頁時不渲染空白控制列。
- 不改 cursor、page index、API payload 或資料排序，只統一 markup、ARIA 與視覺位置。

## 3. RD Implementation Contract

### 3.1 共用元件

新增：`src/components/pdm-workbench-pagination.tsx`

```ts
type PdmWorkbenchPaginationProps = {
  pageIndex: number;
  hasNextPage: boolean;
  loading?: boolean;
  onPrevious: () => void;
  onNext: () => void;
};
```

元件責任：

- 無 `pageIndex > 0` 且無 `hasNextPage` 時回傳 `null`。
- 以 `<nav aria-label="工作台分頁">` 包住控制列。
- 顯示 `第 {pageIndex + 1} 頁`，不可讓 domain adapter 自行改字串。
- 只接收 controller callback，不直接讀取 URL、repository 或 API。

新增共用 class（可直接在既有元件內實作，不要求另建 toolbar component）：

- `.pdm-workbench-toolbar`
- `.pdm-workbench-toolbar-footer`
- `.pdm-workbench-toolbar-view-actions`
- `.pdm-workbench-pagination`

### 3.2 三個 adapter 的必要結構

`relation-workbench.tsx`、`drawing-workbench.tsx`、`part-workbench.tsx` 的 toolbar 必須保持以下 DOM 順序；history control 依 0C 由三個 adapter 省略：

```tsx
<section className="panel pdm-workbench-toolbar">
  <div className="drawing-workbench-filter-grid">{/* search + filters */}</div>
  <div className="pdm-workbench-toolbar-footer">
    {/* 三個 adapter 均省略 history；只保留可用的 mode switch */}
    <div className="pdm-workbench-toolbar-view-actions">
      {/* relation switch 或 PdmWorkbenchLayoutSwitch */}
    </div>
  </div>
</section>
```

不得將模式切換器放回 filter grid，也不得讓 history toggle 依模組出現在不同側。

### 3.3 共用 CSS 行為

桌面（>1024px）：

- 篩選器維持單一 grid row；欄位順序依既有 domain 定義，不重新命名或刪欄位。
- footer 使用 `display:flex; justify-content:space-between; align-items:center`。
- 三個模組均只在有模式切換時渲染靠右的 footer action；模式切換器不得因 `grid-column` 規則被拉回 filter grid。
- footer 與 filter row 之間保留一致的垂直間距與一條低對比分隔線。

平板（761–1024px）：

- 篩選器依既有 responsive grid 分成多列；footer 仍保持左／右兩端。

手機（≤760px）：

- 篩選器單欄堆疊。
- footer 只保留模式切換並可觸控；沒有模式切換時不渲染 footer。
- 不得產生水平溢位、裁切或把模式切換器移入結果內容。

### 3.4 頂部欄與既有功能保護

- 三個頁面的 `topbar` 加上共用語意 class，但保留 drawing 專屬 help 入口，不將 help 強行補到其他模組。
- 重新整理、建立入口、搜尋、篩選、三個模組的 history deep link、drawer/selection、sorting、cursor 與 URL layout 行為不得改變。
- 本 DEV 不改 schema、migration、repository、API route、permission、status projection、preview resolver、storage key 或 feature flag。

## 4. 驗收契約（RD self-check → QA → QC）

### 4.1 結構與位置

- [ ] 圖料、圖號、料號三個工作台的搜尋與篩選器均位於第一工具列 row。
- [ ] 三個工作台均不渲染 `包含歷史` 控制；可用的模式切換均在 footer 右側。
- [ ] 沒有 mode switch 時不渲染空白 footer，且三個 route 的 history deep link／terminal detail 仍可讀取。
- [ ] 三者使用同一 footer class 與同一分頁元件；不得存在模組專用的替代 footer 結構。
- [ ] 桌面截圖中相同定義的控制項左／右對齊位置一致。

### 4.2 行為與相容性

- [ ] 關係樹／矩陣切換仍保留目前 query、selection、drawer 與資料讀取行為。
- [ ] 清單／預覽圖切換仍遵守 DEV-065 的 URL 優先與 per-module 記憶規則。
- [ ] 分頁上一頁／下一頁、disabled state、loading state 與 cursor 行為在三模組一致。
- [ ] 無資料或單頁時不顯示空白分頁列；有資料跨頁時分頁固定在結果面板底部。
- [ ] 不新增 API request、不增加 per-row query、不改既有資料排序。

### 4.3 無障礙與 RWD

- [ ] 模式切換與分頁均有可辨識的 group/nav label、active state 與 keyboard focus。
- [ ] 1440×900、1024×768、768×1024、390×844 無水平溢位、重疊、裁切或 invisible control。
- [ ] 鍵盤可依序到達篩選器、模式切換與分頁；三個工作台不存在的 history control 不進入 Tab 順序。

### 4.4 停止條件

需要改 API／schema／permission／狀態機／preview authority、引入新的模式、改變既有欄位語意、執行 migration、production/staging deploy、merge/PR/release 時，停止本 DEV 並回 PM 重新建 DEV 或 release gate。

## 5. 實作分期

- Phase 1A：新增共用 toolbar footer 與 pagination contract，完成三個 adapter markup。
- Phase 1B：完成 CSS desktop/tablet/mobile 收斂與 relation switch override。
- Phase 1C：執行 focused lint/typecheck、DOM contract/QC、四 viewport browser visual check。
- Phase 1D：記錄 evidence、未通過項目與 browser/auth 限制；未取得真實瀏覽器證據不得宣告 UI 全 PASS。

## 6. 預期影響檔案

- `src/components/relation-workbench.tsx`
- `src/components/drawing-workbench.tsx`
- `src/components/part-workbench.tsx`
- `src/components/pdm-workbench-pagination.tsx`（新增）
- `src/app/globals.css`
- `scripts/qc-dev-066-workbench-topbar.mjs`
- `.ai-doc/dev_task.md`
- `.ai-doc/documentation_map.md`
- `.ai-doc/qa/qa-dev-066-workbench-topbar-muscle-memory-validation-plan-2026-08-11.md`

## 7. 交付判定

本 DEV 的本機 UI 交付只有在三個工作台均完成結構、行為、RWD 與 accessibility 契約，且 QA/QC 對同一組 evidence 逐項判定後才可標記完成。Production migration、deploy、merge、PR、release 不包含在本 DEV，必須另走既有 gate。

Focused contract command：`node scripts/qc-dev-066-workbench-topbar.mjs`。
