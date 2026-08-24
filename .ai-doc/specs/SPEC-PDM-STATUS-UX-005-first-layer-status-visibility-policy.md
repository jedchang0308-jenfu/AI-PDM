# SPEC-PDM-STATUS-UX-005：全系統第一層狀態可見性與例外分層

狀態：`RD Implemented Locally / Human Confirmed / DEV-080 Focused QC Passed / Existing Baseline Findings Recorded / Production Release Gated`
日期：2026-08-19
關聯 DEV：`DEV-080` / `DEV-PDM-STATUS-VISIBILITY-POLICY-001`
父規格：`SPEC-PDM-STATUS-UX-003`、`SPEC-PDM-STATUS-UX-004`
風險：Medium

> **2026-08-22 DEV-087 scoped supersession**：本文件對非三工作臺surface仍有效；圖號、料號、圖料工作臺的六狀態、exception badge/popover與filter由DEV-087極簡契約取代。新決策優先：第一層只保留編號、品名、資料層/圖號版次、固定角色handling，正常留空；受阻只在drawer顯示一項原因。舊projector/exception/current-status filter在activation時拆除，不作fallback。

## 1. 目標與已確認決策

第一層清單、卡片與 drawer header 只保留足以立即判斷工作的資訊：

1. 一個主要工作狀態：沿用 `全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`；`全部`只存在於篩選器。
2. 最多一個會改變當下判斷、下一步或風險的例外提示。
3. 正常、成功、重複、技術性與歷史細節降到可及的 popover、drawer 或 audit surface。

這不是「所有次要狀態都藏進 hover」。阻擋、錯誤、資安、權限、資料衝突、缺必要條件等例外必須留在第一層；hover 只能補充原因，不能承擔唯一警示。`缺製造圖`必須可見，`關聯完整`預設降層或隱藏。

## 2. 問題定義

目前已有中央狀態字典、狀態軸、六狀態主要投影與可及的 human-status popover，但缺少「某一狀態在某一 surface 應顯示在哪一層」的共用政策，造成：

- `關聯完整`與主要工作狀態並列，正常資訊搶占第一層。
- relation、approval、account、invitation、BOM、transfer、attachment 與 recognition 仍有 page-local chip、label map 或 raw fallback。
- 同一列可同時出現主資料狀態、待審、同步、發布異常與檔案狀態，形成 badge wall。
- `InfoHint`／`RiskHint`只用原生 `title`，無法作為觸控、鍵盤及重要例外的唯一載體。
- 現有 20 個 status scope 中，審核中心、帳號管理與邀請管理已有定義但 active UI 未掛載說明入口；`/bom/new`與`/numbering/recognition/[sessionId]`另缺專用 scope 契約。

## 3. Authority 與不變條件

權威順序固定為：

`domain facts → HumanStatusProjection / ResponsibilityStatusProjection / AvailabilityScopeProjection → WorkStatusPresentation → StatusVisibilityProjection → UI surface`

- domain lifecycle、raw status、assignment、permission、actionability、API 與 DB 仍由既有規格治理。
- `WorkStatusPresentation`決定主要工作狀態的名稱、說明、tone 與 icon；本規格不重算它。
- `StatusVisibilityProjection`只決定第一層、例外層、細節層或隱藏，不得改寫 domain fact 或動作權限。
- client 不得以目前登入者、permission 聯集或自由字串推測責任與風險。
- 同一 entity/version/company 的主要狀態與例外判斷對所有合法觀看者一致；可操作性仍可依 `viewerActionability`不同。

## 4. 四層顯示模型

| 層級 | machine value | 顯示位置 | 適用內容 |
|---|---|---|---|
| 主要 | `primary` | 列表、卡片、drawer header 固定可見 | 六狀態主要工作投影或精確 terminal result |
| 例外 | `exception` | 第一層固定可見，最多一個 | 阻擋、錯誤、衝突、缺必要條件、資安／權限風險、需立即人工處理 |
| 細節 | `detail` | hover + focus + click/touch popover、drawer | 正常進度、處理角色、同步中、完整原因、technical evidence |
| 隱藏 | `hidden` | 不重複 render，可在 audit 保留 | 與主要狀態同義、正常成功且無比較價值、純技術 raw code |

獨立頁面狀態 `loading / unauthorized / forbidden / not_found / error / empty`不是次要 badge，必須維持 inline panel、alert 或 empty state，不套用本表隱藏規則。Audit、歷史、法規告知與安全紀錄也不得改成 hover-only。

## 5. Deterministic visibility contract

新增 `src/lib/status-visibility-policy.ts`：

```ts
export type StatusVisibilityLevel = "primary" | "exception" | "detail" | "hidden";

export type StatusSurface =
  | "list"
  | "card"
  | "drawer_header"
  | "detail"
  | "form"
  | "audit"
  | "public_readonly";

export type StatusSignalInput = {
  id: string;
  context: StatusDisplayContext;
  raw: string | null;
  isPrimaryAxis: boolean;
  duplicateOfPrimary?: boolean;
  affectsCurrentAction?: boolean;
  supportsComparison?: boolean;
  securityRelevant?: boolean;
};

export type StatusVisibilityProjection = {
  level: StatusVisibilityLevel;
  severity: "critical" | "blocking" | "action_required" | "informational" | "normal";
  label: string;
  description: string;
  reason: string;
};
```

`projectStatusVisibility(signal, surface)`由下列規則依序判定，第一個命中即停止：

1. `isPrimaryAxis=true` → `primary`。
2. security、permission loss、data conflict、failed、blocked、rejected、missing required evidence，且影響當前工作 → `exception`。
3. registry `abnormal=true`或`actionable=true`，但不影響目前 surface 的動作 → `detail`；不得僅因異常詞彙就製造假待辦。
4. `duplicateOfPrimary=true` → `hidden`。
5. terminal result 在 active list 由 history scope 控制；一旦列入清單即為 neutral `primary`，不得隱藏。
6. normal/success/complete/synced 且不支援該 surface 的比較、篩選或排序 → `detail`或`hidden`。
7. 無法分類、raw value 未註冊或 evidence 互斥 → fail closed 為 `exception / 待確認`，並在 detail 顯示安全說明；禁止直接輸出 raw code。

`StatusDefinition.terminal / abnormal / actionable`是輸入證據，不是單獨顯示規則。若現有 context 缺少必要 metadata，應補中央字典，不得在 page-local `if`複製判斷。

### 5.1 Recognition context 與 scope 契約

現有 `jobStatus`只能表達 queued/running/completed/failed，不能無損表示圖面辨識的「待人工核對、部分完成、可確認寫入、已正式寫入」；DEV-080 必須在 `src/lib/status-display.ts`新增兩個 context，使 `StatusDisplayContext`由23增為25：

| Context | Raw values | Canonical UI semantics |
|---|---|---|
| `recognitionStatus` | `queued`、`extracting`、`review_ready`、`extraction_partial`、`extraction_failed`、`ready_to_formalize`、`formalized`、`cancelled` | 等待辨識、辨識中、待人工核對、部分完成待核對、辨識失敗、可確認寫入、已寫入PDM、已由新版取代；failed為abnormal/actionable，formalized/cancelled為terminal |
| `recognitionReviewStatus` | `proposed`、`conflict`、`accepted`、`corrected`、`mapped`、`ignored`、`deferred`、`blocked` | 待核對、與正式值不同、已接受、已修正、已歸類、已忽略、已延後、需處理；conflict/blocked為abnormal/actionable，已接受／修正／歸類／忽略為terminal |

status axis仍維持13條，不新增資料層軸：`recognitionStatus`映射`taskStatus`；`recognitionReviewStatus`映射`approvalStatus + readinessStatus`。未知值一律投影為`待確認`，不得fallback raw。

`StatusScopeId`由20增為22：

- `bomCreate`：route `/bom/new`，contexts=`masterRecord/bomDraft/fileStatus/readinessStatus`。
- `drawingRecognition`：route `/numbering/recognition/:sessionId`，contexts=`recognitionStatus/recognitionReviewStatus/readinessStatus/reminderStatus`。

Route wrapper不得自行建立第三套說明：`/approvals/[requestId]`繼承`approvalInbox`、`/bom/workbench/[draftId]`繼承`bomWorkbench`、兩條drawing submission wrapper繼承`uploadSubmission`、drawing owner workspace的版次區繼承`revisionSubmission`且辨識區使用`drawingRecognition`、`/technical-transfer`與`/transfer-packages/*`繼承`transferPackageWorkbench`、`/settings/{integrations,security,system,workflow}`繼承`settingsCenter`。Public/auth/legal頁使用inline說明，不強制掛scope popover。

## 6. 第一層容量與多例外規則

- 每個 item 第一層固定為 `1 primary + 0..1 exception`。
- 多個例外依 `critical/security > blocking/error > action_required/warning > informational`排序。
- 最高嚴重度例外顯示具體名稱；其餘聚合為同一控制的 `另有 N 項`。若沒有單一代表項，顯示 `N 項需處理`。
- popover／drawer 必須列出全部例外、原因、負責角色、是否自動完成與可發現的下一步。
- `drawingRecognition` 的欄位級 `conflict`／`blocked` 例外標籤可用 hover、focus 與 click 開啟最小 tooltip；料號 `blocked` 文案必須區分「已辨識到料號文字」與「尚未連結正式料號主檔」，不得暗示為 OCR 辨識錯誤。
- 不得為了維持「一個例外」而漏掉會導致錯誤發布、錯誤製造、資料外洩或不可逆動作的警示；若兩個 critical 例外無法安全聚合，停止並回 Dev PM。

## 7. Canonical examples

| 狀態事實 | 第一層 | 第二層／說明 | 理由 |
|---|---|---|---|
| `編輯中` + 關聯完整 | 只顯示 `編輯中` | 關聯摘要可在 popover/drawer 查閱 | 正常完成訊號，不改變下一步 |
| `編輯中` + 缺製造圖 | `編輯中` + `缺製造圖` | 缺少哪張圖、責任與修正入口 | 會阻擋送審／可用性 |
| `審核中` + 關係已建立但尚未生效 | `審核中` | 預設放 detail；若頁面專門比較關聯效力，可顯示 `尚未生效` | 依 surface 決策價值判定 |
| 自動發布中 | `審核中` | 系統自動發布、不需人工 | 正常背景處理不增加第二 badge |
| 自動發布失敗 | `待確認` + `發布失敗` | 系統管理員、恢復動作與錯誤摘要 | verified exception |
| 檔案同步成功 | 不新增 badge | drawer 顯示同步證據 | 正常成功訊號 |
| 檔案同步失敗 | 顯示 `同步失敗` | 重試／管理者處理 | 影響檔案可用性 |
| 帳號啟用 + 隱私告知未確認 | 帳號狀態 + `告知待確認` | detail 顯示告知版本與處理方式 | 法遵／存取風險不可藏 |

## 8. Shared UI contract

新增 `StatusSignalGroup`，既有 `StatusBadge`與`HumanStatusBadge`保留但接入同一 visibility authority：

- 不接受 page-local label map；輸入須為註冊 context、projection 或明確例外 descriptor。
- 第一層例外按鈕同時支援 hover、keyboard focus、click/touch、outside click 與 Escape。
- 觸發器有可見文字、`aria-expanded`、`aria-controls`；不能只靠顏色、icon 或原生 `title`。
- list row 的觸發器不得誤觸父列選取；關閉後焦點回原控制。
- 390px viewport 的 popover 不超出畫面，不產生水平捲動；互動內容存在時使用可管理焦點的 disclosure/dialog pattern。
- screenshot 中仍能看到主要狀態與最高嚴重度例外；正常細節不影響跨角色溝通。

`CompactHints`只保留低風險資訊摘要；critical/blocking/actionable 狀態不得只使用 `title`。

## 9. 全系統盤點基準

2026-08-19 QA re-audit 後基準：

| 項目 | Current baseline | DEV-080 target | 結論 |
|---|---:|---:|---|
| `src/app/**/page.tsx` routes | 42 | 42 | 全 route 稽核母體；每條route必須有處置，不以status-bearing page猜測覆蓋 |
| 直接承載 status 文案／元件的 page routes | 19 | 僅作census | component-hosted workbench會漏掃，19不得作PASS gate |
| `StatusDisplayContext` | 23 | 25 | 新增`recognitionStatus`與`recognitionReviewStatus` |
| status axes | 13 | 13 | 資料軸保持，不合併資料層 |
| status scope definitions | 20 | 22 | 新增`bomCreate`與`drawingRecognition` |
| active UI 可達 scope | 15 | 20 | 補`approvalInbox/accountList/invitationList`及兩個新scope；wrapper依§5.1繼承 |
| 歷史／alias scope | 2 | 2 | `numberingRequest/numberingDraftList`只標相容或退休，不重建舊頁 |

`account-recovery`、`login`、`policy`等頁雖含狀態詞彙，但其 loading/error/legal 內容不是 item secondary status；列入回歸，禁止機械改成 badge 或 hover。

### 9.1 42-route disposition matrix

`Required`代表route本身或其直接承載元件列入§10.1；`Validation`代表不得預設改碼，但必須有source/rendered結果；`Alias`只驗證安全導向與query保留；`Inline state`代表loading/auth/legal/error不得轉成secondary badge。

| # | Route | Disposition | Scope / assertion owner |
|---:|---|---|---|
| 1 | `/account-invitation/firebase` | Validation / inline state | invitation/auth inline；不得raw error |
| 2 | `/account-recovery` | Validation / inline state | recovery loading/ready/done/error |
| 3 | `/account-recovery/request` | Validation / inline state | recovery request result |
| 4 | `/account/security` | Validation | account/session security；critical原因不得hover-only |
| 5 | `/approvals/[requestId]` | Required via component host | `approvalInbox`；`approval-request-workspace.tsx` |
| 6 | `/approvals` | Required | `approvalInbox` |
| 7 | `/bom/new` | Required via component host | `bomCreate`；`bom-create-workflow.tsx` |
| 8 | `/bom/reviews` | Alias | redirect至approval workbench |
| 9 | `/bom/workbench/[draftId]` | Validation wrapper | inherit `bomWorkbench` |
| 10 | `/bom/workbench` | Validation host + required child | `bomWorkbench`；XMind child由§10.1治理 |
| 11 | `/drawings/[drawingNumber]/submission-workbench` | Validation wrapper | inherit `uploadSubmission` |
| 12 | `/handoff` | Validation | `handoffWorkbench` |
| 13 | `/invite/accept` | Validation / inline state | invitation acceptance |
| 14 | `/login` | Validation / inline state | auth state；不得轉secondary badge |
| 15 | `/numbering/approvals` | Alias | redirect至approval workbench |
| 16 | `/numbering/change-reviews` | Alias | redirect至approval workbench |
| 17 | `/numbering/drawings/[drawingId]/workspace` | Validation host + required child | `revisionSubmission` + `drawingRecognition` |
| 18 | `/numbering/drawings` | Required | `drawingList` |
| 19 | `/numbering/impact` | Validation | `impactWorkbench` |
| 20 | `/numbering/recognition/[sessionId]` | Required via component host | `drawingRecognition` |
| 21 | `/numbering/reports` | Validation | `reportCenter` |
| 22 | `/numbering/revisions` | Validation host + required child | `revisionSubmission` + recognition pre-submit |
| 23 | `/numbering/search` | Required | `numberingSearch` |
| 24 | `/numbering/submissions/drawings/[drawingNumber]` | Validation wrapper | inherit `uploadSubmission` |
| 25 | `/numbering/tasks` | Required | `taskCenter`；critical marker detail可及 |
| 26 | `/` | Validation component host | `dashboardSummary` |
| 27 | `/parts` | Validation component host | `partsList` |
| 28 | `/policy` | Validation / inline legal | legal/audit內容不得降層 |
| 29 | `/production-slice-blocked` | Validation / inline state | blocked page保持inline |
| 30 | `/settings/account-invitations` | Required | `invitationList` |
| 31 | `/settings/accounts` | Required | `accountList` |
| 32 | `/settings/integrations` | Validation wrapper | inherit `settingsCenter` |
| 33 | `/settings` | Validation | `settingsCenter` |
| 34 | `/settings/security` | Validation wrapper | inherit `settingsCenter` |
| 35 | `/settings/system` | Validation wrapper | inherit `settingsCenter` |
| 36 | `/settings/workflow` | Validation wrapper | inherit `settingsCenter` |
| 37 | `/share/[token]` | Required / public inline | public-readonly；unknown不得raw、必要說明不得hover-only |
| 38 | `/submissions/[id]` | Validation | `submissionDetail` |
| 39 | `/technical-transfer` | Required via component host | inherit `transferPackageWorkbench` |
| 40 | `/transfer-packages/[id]` | Required via component host | `transferPackageWorkbench` |
| 41 | `/transfer-packages/new` | Required via component host | `transferPackageWorkbench` |
| 42 | `/upload` | Validation host + required child | `uploadSubmission`；lifecycle child由§10.1治理 |

## 10. Repository direct-edit inventory

QA re-audit修正後直接修改總數為 `58 files = 30 source + 27 test/QC scripts + package.json`。另有 `43 validation-only source`與 `1 conditional CSS`。數量是當前working tree的派工基準，不是凍結成功指標；實作若inventory偵測到新consumer，必須先更新run manifest、逐檔責任與本規格，再繼續，不得為維持58而漏檔。

### 10.1 Required source — 30 files

| Work package | Files | Required change |
|---|---|---|
| Shared policy（8） | `src/lib/status-visibility-policy.ts`（new）、`src/lib/status-display.ts`、`src/lib/status-scope-display.ts`、`src/components/status-help-popover.tsx`、`src/components/status-signal-group.tsx`（new）、`src/components/human-status-badge.tsx`、`src/components/compact-hints.tsx`、`src/app/globals.css` | 建立唯一 visibility projection、例外聚合、可及 popover、scope gap 與共用 styling |
| PDM list/relation/file（6） | `src/components/relation-workbench.tsx`、`src/components/relation-projection.tsx`、`src/app/numbering/search/page.tsx`、`src/app/numbering/drawings/page.tsx`、`src/components/master-attachment-panel.tsx`、`src/components/part-detail-content.tsx` | 移除正常重複 chip；保留缺件／發布／同步例外；legacy drawing 多 badge 收斂；附件只保留最高風險例外；baseline status不得raw |
| Workflow/BOM/transfer/recognition（12） | `src/app/approvals/page.tsx`、`src/components/approval-request-workspace.tsx`、`src/components/review-context-projection.tsx`、`src/components/bom-editor/bom-xmind-editor.tsx`、`src/components/bom-create-workflow.tsx`、`src/components/technical-transfer-workspace.tsx`、`src/components/transfer-package-workbench.tsx`、`src/components/lifecycle-ux.tsx`、`src/components/drawing-recognition-status-chip.tsx`、`src/components/drawing-recognition-review.tsx`、`src/components/drawing-recognition-workspace-panel.tsx`、`src/components/drawing-recognition-pre-submit-panel.tsx` | 移除 raw fallback/local map與重複狀態；接入兩個recognition context與共用例外聚合；BOM create、完整核對及owner workspace不得成為旁路 |
| Admin（2） | `src/app/settings/accounts/page.tsx`、`src/app/settings/account-invitations/page.tsx` | 改用 account/invitation context、掛載scope help；安全／隱私例外固定可見 |
| Task/public（2） | `src/app/numbering/tasks/page.tsx`、`src/app/share/[token]/page.tsx` | 移除raw fallback；critical marker原因支援click/touch/keyboard；public結果使用安全inline說明 |

### 10.2 Required test/QC — 27 scripts + package.json

新增（3）：

- `scripts/qc-dev-080-status-visibility-projection.mjs`
- `scripts/qc-dev-080-status-visibility-contract.mjs`
- `scripts/qc-dev-080-status-visibility-browser.mjs`

修改（24）：

- `scripts/generate-dev-049-status-scope-inventory.mjs`
- `scripts/qc-pdm-status-scope-coverage.mjs`
- `scripts/qc-pdm-status-scope-browser.mjs`
- `scripts/qc-pdm-status-ui-vocabulary.mjs`
- `scripts/qc-dev-078-responsibility-status-contract.mjs`
- `scripts/qc-dev-055-human-status-contract.mjs`
- `scripts/qc-dev-062-relation-workbench.mjs`
- `scripts/qc-pdm-approval-platform.mjs`
- `scripts/qc-pdm-numbering-approval-review-ui.mjs`
- `scripts/qc-pdm-account-lifecycle.mjs`
- `scripts/qc-pdm-account-invitations.mjs`
- `scripts/qc-master-attachments.mjs`
- `scripts/qc-bom-workbench-ui.mjs`
- `scripts/qc-pdm-transfer-package-phase3a0.mjs`
- `scripts/qc-dev-053-drawing-workbench-ui.mjs`
- `scripts/qc-dev-068-contract.mjs`
- `scripts/qc-dev-060-bom-create.mjs`
- `scripts/qc-dev-068-browser.mjs`
- `scripts/qc-dev-079-contract.mjs`
- `scripts/qc-dev-071-contract.mjs`
- `scripts/qc-dev-071-browser.mjs`
- `scripts/qc-pdm-numbering-task-center-ui.mjs`
- `scripts/qc-ux-attribute-hierarchy.mjs`
- `scripts/qc-pdm-entity-detail-drawer.mjs`

修改 `package.json`新增 `qc:dev-080:{projection,contract,browser}`與 fail-fast `qc:dev-080` aggregate；不得改名或刪除既有命令取得綠燈。

Aggregate除原有status／approval／account／attachment／BOM／transfer／DEV-053／DEV-055／DEV-062／DEV-068／DEV-078外，必須明確納入`qc:dev-060-bom-create`、`qc:dev-071-contract`、`qc:dev-071-browser`、`qc:dev-079:contract`、`qc:pdm-numbering-task-center-ui`與`qc:ux-attribute-hierarchy`；不得只依新DEV-080 browser間接聲稱這些surface已覆蓋。

### 10.3 Validation-only source — 43 files

下列檔案必須做 source scan、rendered regression 或 contract parity；只有發現 drift 才改碼並更新 inventory：

- Shared/owner surfaces：`src/lib/work-status-presentation.ts`、`src/lib/human-status-projection.ts`、`src/components/drawing-workbench.tsx`、`src/components/part-workbench.tsx`、`src/components/drawing-projection.tsx`、`src/components/part-projection.tsx`、`src/components/pdm-workbench-preview-gallery.tsx`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/components/drawing-detail-preview.tsx`。
- Dashboard/workflow：`src/components/dashboard.tsx`、`src/components/dashboard/layout-parts.tsx`、`src/app/bom/workbench/page.tsx`、`src/app/upload/page.tsx`、`src/app/submissions/[id]/page.tsx`、`src/app/numbering/revisions/page.tsx`、`src/app/handoff/page.tsx`。
- Report/admin：`src/app/numbering/impact/page.tsx`、`src/app/numbering/reports/page.tsx`、`src/app/settings/page.tsx`、`src/app/account/security/page.tsx`、`src/components/number-state-workspace.tsx`、`src/components/number-state-legacy-route.tsx`。
- Projection/data contracts：`src/components/human-status-filter.tsx`、`src/lib/responsibility-status-projection.ts`、`src/lib/availability-scope.ts`、`src/lib/drawing-workbench-status.ts`、`src/lib/drawing-part-relation-status.ts`、`src/lib/part-human-status.ts`、`src/lib/pdm-detail-status-actionability.ts`、`src/lib/numbering-human-status-viewer.ts`、`src/lib/drawing-workbench.ts`、`src/lib/part-workbench.ts`、`src/lib/relation-workbench.ts`、`src/lib/pdm-entity-detail.ts`、`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-entity-detail-contract.ts`、`src/lib/drawing-recognition-contract.ts`。
- Host/container surfaces：`src/components/drawing-owner-workspace.tsx`、`src/components/pdm-detail-drawer.tsx`、`src/components/pdm-entity-detail-drawer.tsx`、`src/components/pdm-workbench-list.tsx`、`src/components/numbering-submission-result.tsx`、`src/components/numbering-candidate-revision-editor.tsx`。

### 10.4 Conditional CSS — 1 file

`src/app/styles/responsive.css`只有在三viewport rendered QA證明共用CSS無法安全容納時才修改；未重現不得預先產生diff。它不計入30 required source或58 direct files；一旦修改，run manifest的direct total必須加1並附重現證據。

## 11. Module policy matrix

| Module | Primary | First-layer exception | Detail/hidden |
|---|---|---|---|
| Drawing/Part/Relation | 六狀態 work status | 缺製造圖、主圖失效、資料衝突、發布失敗 | 關聯完整、正常 usage、raw record status |
| Approval/Submission | 案件或工作狀態 | apply failed、逾期且需處理、權限／work item 不一致 | target type/role、已完成決策、technical request status |
| BOM | 草稿／審核／發布／歷史結果 | Floating topic、需重新確認、退回、衝突 | 目前使用、正常同步、匯出證據 |
| Transfer/Handoff | package lifecycle | readiness blocker、stale、release failed | adapter complete、正常 published evidence |
| File/Preview/Recognition | 當前檔案／工作狀態 | missing required、failed、stale、unsupported when required | synced、ready derivative、正常 OCR progress detail |
| Account/Security | account/invitation lifecycle | suspended、expired、privacy/security action required | active identity、normal aliases、歷史紀錄 |
| Dashboard/Reports/Tasks | 該 surface 的主要比較軸 | 失敗、逾期、需人工處理 | 成功完成、technical job evidence |
| Public/read-only | 精確可理解結果 | 存取失效、撤銷、不可用 | 不依賴 hover；必要說明直接 inline |

## 12. Data/API/schema/permission boundary

- DB/schema/index/migration/backfill：無。
- API route、raw DTO、query、pagination、cache、permission：原則無變更。
- write flow、approval decision、publication/retry、assignment：無變更。
- 新增的是 shared read presentation policy與元件 contract；現有 row-specific reason 足夠時直接使用。
- 若某例外缺少可信 server evidence，必須 fail closed／停止，不能由 client 猜測；若因此需要新增 API 欄位，回 Dev PM 重新做 additive contract review。

## 13. RD slices and gates

### 080-A — Shared authority and prevention gate

建立 policy、signal group、metadata、兩個recognition context、兩個新scope、三個既有active scope掛載缺口與三支新QC。Gate：25-context/22-scope inventory、projection matrix、raw-code shield、page-local map scan、typecheck PASS。

### 080-B — PDM list/relation/file convergence

處理 relation complete、missing drawing、legacy drawing多 badge與attachment例外聚合。Gate：DEV-078／055／062／053與master-attachments regression PASS。

### 080-C — Workflow convergence

處理 approval、review context、BOM create/workbench、lifecycle panel、transfer與recognition三個surface。Gate：approval、DEV-060、DEV-071、transfer、DEV-068與DEV-079 contract/browser PASS；人工阻擋不被降層。

### 080-D — Admin and active scope closure

處理 accounts、invitations與三個 active scope help gap。Gate：account lifecycle/invitation、scope coverage/browser PASS；security/privacy例外固定可見。

### 080-E — Aggregate rendered QA/QC

四 actor（RD、RD主管、系統管理員、唯讀）× 1440×900／1024×768／390×844，依42-route disposition驗證list/card/drawer/form/public-readonly與alias/inline state。Gate：`npm.cmd run qc:dev-080`完整 PASS，P0/P1=0，unexpected raw status=0，critical hidden=0，keyboard/touch inaccessible=0。

前一 gate 未通過不得進下一 slice；shared authority與consumer切換必須在同一可建置 artifact 內完成。

## 14. Acceptance criteria

1. `AC-080-01` 第一層每個 item 最多一個 primary與一個 exception control；不存在 badge wall。
2. `AC-080-02` `關聯完整`預設不與六狀態 primary 並列；`缺製造圖`仍固定可見。
3. `AC-080-03` 關聯、審核、帳號、邀請、BOM、transfer、attachment、recognition 不直接輸出未註冊 raw status。
4. `AC-080-04` critical/security/blocking/action-required 不得只存在於 hover、`title`、顏色或 icon。
5. `AC-080-05` 多例外排序穩定，popover/drawer 可查全部原因與下一步。
6. `AC-080-06` 主要六狀態、filter、mine/history scope及跨 actor 一致性不退化。
7. `AC-080-07` `approvalInbox/accountList/invitationList/bomCreate/drawingRecognition`均有可達status help；wrapper依§5.1繼承；兩個historical/alias scope不誤建舊頁。
8. `AC-080-08` loading/error/permission/empty state、audit、法律告知與 public read-only 不被錯誤隱藏。
9. `AC-080-09` hover、focus、click/touch、Escape、focus return與row click隔離均通過。
10. `AC-080-10` 三 viewport 無 overflow、遮蔽、截斷或 popover 出界。
11. `AC-080-11` schema、permission、lifecycle、write API、filter-before-limit與private/no-store無變更／退化。
12. `AC-080-12` 42 routes均有disposition；當前inventory為58 direct files與43 validation-only source，run manifest以實際consumer為準且所有差異有原因、PASS或finding。

## 15. Failure, recovery and stop conditions

- 本 DEV 無資料 migration；失敗時最小回退 DEV-080 presentation/component/tests，domain facts不需 rollback。
- 不得用 `git reset --hard`、整檔覆寫或清理其他 dirty worktree 變更。
- browser runtime使用free port與隔離資料；完成後停止task-owned process tree並確認其port釋放。
- 立即停止並回 Dev PM：需要改schema／assignment／permission／lifecycle；兩個critical例外無法安全聚合；某阻擋只能從client猜測；public/read-only只能靠hover理解；或全系統切換會要求移除audit／法規證據。

## 16. Definition of Done

- 080-A～080-E全部完成，42 routes、58 direct files與43 validation-only source可追溯；新增consumer有manifest與逐檔責任。
- `qc:dev-080`、affected regression、typecheck、isolated build與三 viewport browser全部PASS。
- P0/P1=0；critical hidden、raw status、duplicate primary、inaccessible popover均為0。
- 文件、QA evidence、DEV control board與documentation map同步。
- Local completion不等於production release；deploy/release另走既有gate。

## 17. Spec Impact Preflight

- `Compatible extension`：延續`SPEC-PDM-STATUS-UX-003`的字典、axis與help，新增surface visibility authority。
- `Intentional presentation refinement`：延續`SPEC-PDM-STATUS-UX-004`的單一主要狀態與六狀態 vocabulary；修正「所有次要狀態都固定並列」或「所有次要狀態都可hover-only」的過度解讀。
- `Compatible preservation`：DEV-073 actionability、DEV-078跨actor一致性、filter-before-limit、availability、permission與cache contract全部保留。
- ADR：amend既有`ADR-PDM-STATUS-UX-004`；不建立新的architecture family。
- Human Decision：0。使用者已確認精簡方向與「例外不能被藏掉」的產品意圖，RD可開始本機實作。

## 18. Execution result — 2026-08-19

080-A～080-E的產品接線已在本機完成；shared policy、signal group、兩個recognition context、兩個scope、PDM／workflow／BOM／admin／task／public consumer與scope help均已落地。Focused evidence：

- projection gate：15/15 PASS。
- contract gate：26/26 PASS。
- rendered browser gate：240/240 PASS，7 routes × 3 viewports，包含primary/exception聚合、scope help、popover keyboard/focus return、legacy label shielding與console/request/overflow sweep。
- affected regression：DEV-071 browser 56/56 PASS；`typecheck:app` PASS；isolated build PASS，124 pages generated。
- evidence root：`output/qa/dev-080-status-visibility/20260819072228-1d1c809a/`。

完整 `qc:dev-080` fail-fast aggregate尚未全綠，原因是既有 `qc:dev-060-bom-create` released-child fixture缺失、`qc:ux-attribute-hierarchy`仍使用已退役generic submission POST（HTTP 410），以及`qc:dev-068:browser`既有recognition fixture回404；三項均在QA計畫§15留存為baseline finding，未歸因於DEV-080。故本規格允許標記為Local Implementation Complete，但不得宣告production/release或跨DEV aggregate complete。
