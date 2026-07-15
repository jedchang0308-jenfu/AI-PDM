# RD-DEV-048 Phase 1E：管理辦法品名命名補強

日期：2026-07-15

範圍：DEV-048 Phase 1E P0 local repair。依公司《工程圖資料及編號管理辦法》補回建立圖料號的品名命名引導；不改 v3 編碼 authority、不導入 `000` 萬用料號、不改 M/R 用途碼、不接 live provider、不做 production release。

## 產品決策

- 品名承擔人類溝通與系統篩選，不要求唯一。
- 圖號與料號才是唯一識別。
- 使用者先填核心名詞與其他資訊，系統產生建議品名，使用者可套用並微調為 `確定品名`。
- `確定品名`作為圖料主題名稱與同一草稿下料號預設品名。
- 相似品名查重只提醒，不阻擋儲存草稿。

## RD 變更

- `src/components/number-state-workspace.tsx`
  - 建立 modal 改用 `確定品名`，移除使用者可見的 `主根名稱`語意。
  - 品名建議依管理辦法保留三種模板：
    - 外購件：`[核心名詞]_[品牌]_[規格/型號]`
    - 自製/發包/客製非共用件：`[核心名詞]_[系列代號]_[特性]_[流水識別]`
    - 共用件：`[核心名詞]_[特性]_[流水識別]`
  - 命名段落以半形底線 `_` 串接，空白與底線會正規化。
  - 顯示品名不需唯一、唯一性由圖號 / 料號負責。
  - 將上方命名欄位標為 `品名系列代號（選填）`，下方料號資料標為 `料號系列代號（選填）`，避免兩個欄位同名。
- `src/components/numbering-contextual-entrypoints.tsx`
  - 同根新增料號文案改為 `品名跟隨確定品名`。
- `src/app/numbering/request/page.tsx`
  - Legacy request page 文字改為 `確定品名`，不再教使用者「主根名稱」。
- `scripts/qc-pdm-number-state-flow-request-equivalence.mjs`
  - 新增管理辦法模板、確定品名、半形底線、warning-only 查重與品名/料號系列欄位分工防回歸。
- `scripts/qc-pdm-numbering-contextual-entrypoints.mjs`
  - 更新 contextual append flow 的品名鎖定文案斷言。

## QC 證據

- `npm.cmd run qc:pdm-number-state-flow-request-equivalence`：10/10。
- `npm.cmd run qc:pdm-number-state-flow-phase1b`：14/14。
- `npm.cmd run qc:pdm-numbering-contextual-entrypoints`：46/46。
- `npm.cmd run qc:pdm-number-state-flow-contract`：19/19。
- `npm.cmd run qc:pdm-number-state-flow-runtime`：7/7。
- `npm.cmd run qc:pdm-number-state-flow-http`：21/21。
- `npx.cmd tsc --noEmit --pretty false`：通過。
- `npm.cmd run lint -- --quiet`：通過。
- `npm.cmd run dev:local:check`：AI_PDM healthy，`http://127.0.0.1:3000/`。

## Browser QC

本機 Admin session 只用於 local UI/API 驗證，不是登入流程 evidence。

- 路由：`/numbering/search?create=numbering`
- 測試輸入：核心名詞 `腳架測試121150`、品名系列 `JF`、特性 `100L 白鐵`、流水識別 `A`
- 建議/確定品名：`腳架測試121150_JF_100L_白鐵_A`
- API 結果：建立草稿 `201`、取得候選號 `200`、取消草稿並回收候選號 `200`
- 正式主檔計數：`part_roots 10 -> 10`、`part_numbers 13 -> 13`、`drawing_numbers 13 -> 13`
- 可見錯誤：0；console error：0；page error：0；桌面 1440 與手機 390 無水平 overflow。

截圖：

- `output/playwright/number-state-phase1e/qc-name-builder-create-modal-desktop.png`
- `output/playwright/number-state-phase1e/qc-name-builder-candidate-desktop.png`
- `output/playwright/number-state-phase1e/qc-name-builder-candidate-mobile.png`
- `output/playwright/number-state-phase1e/qc-name-builder-cancelled-desktop.png`

## 邊界

此修復完成 DEV-048 Phase 1E P0 的 local product integration 補強。正式部署、production smoke、Cloud SQL/GCS provider、release/rollback 與 live data repair 仍不在本輪，須另走 DEV-032 / DEV-046 release gate。
