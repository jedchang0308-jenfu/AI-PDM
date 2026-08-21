# QA DEV-081：工程師／主管／系統管理員跨負責人編輯驗證計畫

Status: `Focused QA Passed / Browser Read-Only Matrix Passed / Disposable Mutation QC Pending / Production Release Gated`

## 驗證矩陣

| 維度 | 必測值 |
|---|---|
| 角色 | Engineer owner、Engineer non-owner、R&D Manager non-owner、Admin non-owner |
| 領域 | Drawing、Part、Relation／圖料根號、BOM |
| 公司 | same-company、cross-company |
| 狀態 | mutable、in_review、processing／recovery、released／terminal |
| 權限 | action permission allowed、denied |

## Acceptance cases

- QA-081-01：共用 policy 辨識 `Engineer`／`R&D Manager`／`Admin`及既有平台 alias；其他角色無全域編輯 scope。
- QA-081-02：工程師／主管／Admin 非 owner 的 Drawing list、drawer 與 full-page workspace 顯示可操作編輯／上傳入口。
- QA-081-03：主管／Admin／Engineer 非 owner 的 Part 與 Relation candidate 顯示 enabled action；其他角色非 owner 維持 owner-required。
- QA-081-04：主管／Admin／Engineer 可編輯同公司 `Draft`／`Rejected` BOM；`PendingReview`／`Released`維持不可編輯。
- QA-081-05：所有 mutation server route 與 UI capability 同源，無 UI/API authorization drift。
- QA-081-06：cross-company、permission denied、locked／terminal state 全部 fail closed。
- QA-081-07：工程師／主管／Admin 編輯不變更 owner；audit／updated-by 記錄實際 actor。
- QA-081-08：主管／Admin 可跨負責人取消草稿、撤回尚未產生 decision 的送審，並依 action permission 審核與發行；工程師不因此取得 reviewer-only action；已有 decision 的送審、跨公司、作廢與 production release gate 仍不得旁路。
- QA-081-09：Drawing OCR session scope 對工程師／主管／Admin 與主編輯權限一致。
- QA-081-10：三 viewport 的可操作／唯讀狀態、disabled reason、focus 與 visible-error sweep 通過。

## 執行與證據

- Pure policy + source contract：`npm run qc:dev-081:contract`。
- TypeScript／affected lint／isolated build 必須通過。
- 正向 mutation 只可在 disposable DB/runtime 執行；不得寫入 shared／staging／production business data。
- Browser 至少覆蓋 Drawing、Part、Relation、BOM 的主管與非主管狀態；1440x900、1024x768、390x844。
- P0/P1=0、temporary runtime cleanup完成，才可宣告 local QA pass；production release另走既有 gate。

## 2026-08-19 執行結果

- PASS：`npm run qc:dev-081:contract`，涵蓋角色、owner／cross-company、action resolver、Drawing／Part／Relation route、mutation API guard、OCR、BOM state/company boundary、取消／撤回與migration contract。
- PASS：`npm run typecheck:app`、affected ESLint、`npm run build:isolated`。
- PASS：DEV-079現行全頁工作區contract 22/22、DEV-072 action resolver、DEV-062 Part／Relation、production deployment pipeline 20/20。
- PASS（共享3000只讀瀏覽，2026-08-19基線）：`R&D Manager`與`Admin`開啟非本人A0002工作時皆看到「編輯此版次」且選檔區可操作；當時`Engineer`同一路徑顯示「目前僅供查看」。console僅有React DevTools／HMR開發訊息，無error。此基線已由2026-08-20政策修訂取代，待重新執行工程師登入畫面證據。
- PASS（共享3000工程師登入瀏覽，2026-08-20）：`Demo Engineer`在有資料的A0002同公司非 owner 圖號明細看到「編輯此版次」，進入工作區後可見「儲存版次」、「移除檔案」、「送交審核」等操作；料號A0002-P01明細可見「編輯資料」。最新頁面console只有React DevTools／HMR訊息，未見error；BOM工作台無可用fixture，未執行BOM寫入。畫面證據：`output/playwright/dev081-engineer-drawing-detail.png`、`output/playwright/dev081-engineer-drawing-workspace.png`。
- 未執行：取消、撤回、審核、發行、上傳及BOM資料寫入；這些正向mutation需disposable DB/runtime後才能關閉QA-081-07／08的audit與owner不變證據。
- 舊`qc:dev-060-bom-create`缺released-child fixture、`qc:bom-workbench-ui`固定要求3130 runtime且會建立資料；兩者屬環境前置未滿足，不作產品失敗。BOM權限本輪以pure/source contract驗證。
- 舊`qc:dev-053:phase1h:ui`為6/12，其失敗含既有版面／詞彙契約漂移；DEV-081相關withdraw條件已由現行DEV-079與focused contract覆蓋，該舊suite列為測試債，不宣告通過。

## 2026-08-20 政策修訂後補充

- Engineer 同公司 non-owner 已納入 shared PDM edit scope；Part／Relation／Drawing 等可變更資料與 `Draft`／`Rejected` BOM 仍受 action permission、company scope 與 lifecycle gate 約束。
- BOM create context 已移除 Engineer 的 owner／creator／submission owner 篩選；送審內容的 `canReadSubmission` owner visibility 保持獨立，不因本次 PDM master-data 編輯放寬而全面開放。
- Pure policy/source contract、typecheck 與 affected ESLint 已於2026-08-20重新通過；正向 mutation、跨 viewport 真實資料 UI 與 disposable audit／owner 不變證據仍待補跑。
