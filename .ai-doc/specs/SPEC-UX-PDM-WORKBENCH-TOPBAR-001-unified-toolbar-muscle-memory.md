# SPEC-UX-PDM-WORKBENCH-TOPBAR-001：三工作台頂部欄一致化與肌肉記憶

版本：1.0
日期：2026-08-11
狀態：`RD Implemented / Focused Contract QC 12/12 / Browser Smoke Blocked by auth / Production Release Gated`
Related DEV：`DEV-066`
父任務：`DEV-062`、`DEV-065`

## 0. 使用思考習慣

`#目的`：讓使用者在圖料、圖號、料號三個工作台，看到相同定義就能在相同位置操作，不必重新學習每個模組的頂部欄。

`#捷思法`：固定空間位置比新增文字提示更能形成肌肉記憶；搜尋／篩選是同一組任務，歷史條件是左側輔助條件，顯示模式是右側呈現選擇。

`#內容組織`：頂部欄只保留頁面識別與建立／重新整理；工具列固定為「篩選列 → 工具列 footer」；清單內容與分頁固定在結果面板底部。

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
3. `toolbar footer`：左側固定 `包含歷史`；右側固定顯示模式切換器。
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

`relation-workbench.tsx`、`drawing-workbench.tsx`、`part-workbench.tsx` 的 toolbar 必須保持以下 DOM 順序：

```tsx
<section className="panel pdm-workbench-toolbar">
  <div className="drawing-workbench-filter-grid">{/* search + filters */}</div>
  <div className="pdm-workbench-toolbar-footer">
    <label className="drawing-workbench-history-toggle">{/* 包含歷史 */}</label>
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
- history 在左、模式切換在右；模式切換器不得因 `grid-column` 規則被拉回 filter grid。
- footer 與 filter row 之間保留一致的垂直間距與一條低對比分隔線。

平板（761–1024px）：

- 篩選器依既有 responsive grid 分成多列；footer 仍保持左／右兩端。

手機（≤760px）：

- 篩選器單欄堆疊。
- footer 改為上下堆疊，history 在上、模式切換在下；模式切換按鈕等寬並可觸控。
- 不得產生水平溢位、裁切或把模式切換器移入結果內容。

### 3.4 頂部欄與既有功能保護

- 三個頁面的 `topbar` 加上共用語意 class，但保留 drawing 專屬 help 入口，不將 help 強行補到其他模組。
- 重新整理、建立入口、搜尋、篩選、歷史 toggle、drawer/selection、sorting、cursor 與 URL layout 行為不得改變。
- 本 DEV 不改 schema、migration、repository、API route、permission、status projection、preview resolver、storage key 或 feature flag。

## 4. 驗收契約（RD self-check → QA → QC）

### 4.1 結構與位置

- [ ] 圖料、圖號、料號三個工作台的搜尋與篩選器均位於第一工具列 row。
- [ ] 三者的 `包含歷史` 均在 footer 左側；三者的模式切換均在 footer 右側。
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
- [ ] 鍵盤可依序到達篩選器、歷史 toggle、模式切換與分頁。

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
