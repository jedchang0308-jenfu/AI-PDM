# SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001：狀態、責任與審核工作項一致性 CAPA

狀態：`Local RD Implemented / QA-QC Passed / Human Confirmed / Production Release Gated`

日期：2026-08-14  
DEV：`DEV-PDM-STATUS-ACTIONABILITY-CAPA-001` / `DEV-073`  
關聯：`SPEC-PDM-STATUS-UX-004`、`SPEC-PDM-ENTITY-DETAIL-DRAWER-001`、`SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001`、`SPEC-PDM-APPROVAL-PLATFORM-001`

## 1. 不符合與真正問題

A0005-M01 明細曾顯示「待你處理」，但 action bar 只有歷史／返回，審核工作台 active inbox 也沒有對應項目。這不是單一按鈕漏畫，而是三個投影沒有共用同一組事實：

1. 已發布 workspace 仍被明細當成 active candidate，遮蔽 formal Drawing／Revision。
2. `rd_controlled` 被組成客觀 `preparing/waiting`，再因 owner 等於 actor 被投影為「待你處理」。
3. 舊 FFF 人工確認已讓小數版成為 effective `ReviewApproved`，但 unified Drawing／Revision 與部分 workbench reader 仍可能保留 physical `Pending/in_review`。
4. `in_review` 沒有 active request/workflow 時，UI 沒有 fail-closed 的責任缺口與恢復提示。

因果鏈：平行 lifecycle reader → 客觀狀態分歧 → viewer responsibility 只看 owner → phantom task → 明細、清單、審核工作台互相矛盾。

## 2. 矯正與預防原則

### 2.1 Canonical lifecycle precedence

- active candidate 只限尚未 published 的 workspace；published workspace 只可作 provenance，不得再決定 visible lifecycle、owner action 或 review request。
- formal Drawing 讀取時，小數版 physical `Pending/in_review` 若存在既有合法 FFF terminal confirmation，沿用既有契約投影為 effective `ReviewApproved/rd_controlled`；不得重播決策、建立假審核或把小數版發布為 `Released`。
- effective lifecycle 必須由共用 deterministic projector 供 unified synchronizer、Drawing workbench 與 entity detail 使用；不得各自複製不同優先序。
- `drawings`／`drawing_revisions` 與 deterministic effective state 不一致時，須可由只讀 dry-run 稽核發現；apply 必須有明確 local path、來源 SHA-256、備份與確認旗標。

### 2.2 Viewer actionability invariant

`viewerStatus.category = current_user` 必須同時具備可證明的目前責任與至少一個適用的 domain responsibility action。該 action 可因權限、前置條件或資料差異暫時 locked，但必須有精確原因與恢復責任；`view_history`、`view_review`、`refresh`、`return` 等查閱／utility action 不得單獨產生「待你處理」。

- `rd_controlled/released` 是客觀 usable；第一層依 availability 顯示「研發可用／生產可用」，不因 owner 指標顯示「待你處理」。
- `in_review + exact assigned reviewer/request`：reviewer 可為「待你處理」；送審者即使可撤回，預設仍是等待審核，不把可選撤回誤作必辦工作。
- `in_review + active request + 非 reviewer`：顯示「等他人處理」。
- `in_review + 無 active request/workflow`：顯示「負責人待確認」，並提供 locked「查看審核」入口，原因為找不到有效工作項及聯絡 PDM 管理者；不得顯示「待你處理」。
- building／correction／bundle／recovery 的明確 owner 或 role queue 可維持「待你處理」；即使 action locked，也要在同一控制項說明阻擋原因。

本條有意取代 `SPEC-PDM-STATUS-UX-004 §5.2` 中「assignee/reviewer 等於 current user 即一律待你處理」的過寬解讀；保留「已知責任人即使缺權限仍不能偽裝成等待」的原意，但新增 applicable domain action／active work-item 證據門檻。

### 2.3 Workflow closure invariant

- active review 必須有可解析的 active request/workflow、submitter、reviewer scope 與 owner target。
- terminal legacy review evidence 不得繼續出現在 active inbox；它應投影完成後的 effective lifecycle。
- physical `in_review` 且沒有 active workflow、也沒有可證明 terminal legacy evidence者，是 orphan review，必須由稽核報告列為異常，不得由 reader 猜成已完成。
- inbox 的 `active` 仍只收真正 pending／needs-info／apply-failed 工作；不得為了讓畫面看似一致而把已核准歷史重新塞回 active inbox。

## 3. 範圍與邊界

範圍內：server lifecycle projector、unified synchronizer、Drawing workbench/detail projection、missing-work-item locked reason、viewer actionability projector、local dry-run/backup/apply repair、focused tests、真實 UI QC。

範圍外：新 schema/migration、permission code、approval decision authority、新 inbox status、正式／staging 資料、deploy、release、merge 或 PR。若需要改變既有 FFF 業務決策、判定非小數版可直接受控，或修復結果無法由現有 evidence 唯一決定，立即停止並回 Dev PM。

風險等級：`Medium`。程式與本機資料同步屬可回復，但跨 lifecycle/read model/UI；正式資料修復維持 `High / 未授權`。

## 4. RD Implementation Contract

1. 新增純函式 effective revision lifecycle projector；`ReviewApproved` 判斷只接受既有三種 terminal FFF actions與小數版。
2. `UnifiedDrawingAsyncRepository.synchronizeFormalDrawing()` 使用 effective state，並在 legacy FFF decision 同一 transaction 內同步 canonical Drawing／Revision。
3. Drawing workbench lifecycle overlay 使用同一 effective projector；有 request 才可宣告 reviewer/other-user waiting，無 request fail closed 為 unknown。
4. `PdmEntityDetailService` 只把 active candidate 傳給 action resolver；formal effective state 優先於 published workspace provenance。
5. objective status projector將 `rd_controlled/released` 設為 usable，並在 action bar 解析完成後投影 viewer responsibility。
6. `in_review` 缺 request 時回傳 locked `view_review`，`execution=null`、reason code=`PDM_ACTION_TARGET_UNAVAILABLE`，文字提供人類影響與管理者恢復責任。
7. repair tool 預設只讀／copy dry-run；apply 前驗證來源 hash、建立備份、限制 SQLite local path，修復只呼叫 domain synchronizer，不直接改 physical package／FFF evidence。

## 5. Acceptance Criteria

- `AC-01` A0005-M01 同一 actor 的 workbench list、drawer 與 approval inbox 結論一致：effective approved 小數版顯示「研發可用」，不顯示 phantom「待你處理」，active inbox 不需出現歷史已核准項目。
- `AC-02` published workspace 不再產生 candidate-controlled history-only action inventory；formal Drawing 依 lifecycle/permission顯示可適用動作。
- `AC-03` `rd_controlled/released` 的 viewer category 固定 usable；owner 相等不覆蓋客觀可用狀態。
- `AC-04` 真正 active review 有 exact request：reviewer=`current_user`、其他人=`other_user`；無 request 的 orphan=`unknown` 且 locked recovery reason可由 hover/focus/touch取得。
- `AC-05` 任一 `current_user` detail 至少有一個適用 domain responsibility action；`canAct=true` 時至少一個該 action enabled。
- `AC-06` legacy FFF terminal decision 後 canonical Drawing／Revision 同 transaction 收斂為 effective state；小數版 physical package仍 `Pending`，不新增決策或 active request。
- `AC-07` 稽核可偵測 canonical drift、orphan review及 viewer/action invariant；dry-run 前後來源 DB SHA-256 相同。
- `AC-08` local repair 有 backup、expected hash、before/after report；重跑冪等且不更動 package/event count。
- `AC-09` 1440×900、1024×768、390×844 真實 UI 無 visible/console/network unexpected error、overflow或失去恢復提示。

## 6. QA/QC 與完成門檻

QA authority：`.ai-doc/qa/qa-dev-073-status-actionability-capa-validation-plan-2026-08-14.md`。  
QC evidence：`.ai-doc/qc/qc-dev-073-status-actionability-capa-2026-08-14.md`（完成後建立）。

完成需同時具備：focused contract/data tests、TypeScript/affected lint、local dry-run與隔離 apply/idempotency、A0005 修復前後證據、三 viewport rendered UI、visible error sweep、spec drift convergence。單獨改文案、單獨讓按鈕出現或單獨把歷史塞回 inbox均不得結案。

完成結果（2026-08-14）：以上本機門檻全部通過；A0005-M01 canonical Drawing 與 0.2／0.3／0.5 revision 已由 hash-gated repair 收斂為 `rd_controlled`，physical package、review confirmation、request、decision、workflow筆數均未變。最終 browser run `DEV073-20260814T103234Z-bb1449b0` 以 disposable SQLite驗證 A0005 三 viewport、active inbox排除與 orphan recovery三種互動，P0/P1=0；共用明細查詢另以跨 SQLite／PostgreSQL 的小版次判斷及契約守門。正式／staging資料與release仍未授權。

ADR 判定：`Not required`。既有 canonical Drawing ADR、human-status ADR、unified detail ADR已選定架構；本 CAPA只補足它們之間遺漏的一致性 invariant 與 deterministic repair gate。
