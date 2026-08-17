# QC DEV-072－PDM 四工作台明細動作可發現性與鎖定提示

Status: AI Real-browser QC Passed / Local RD-QA-QC Complete / Production Release Gated  
Date: 2026-08-14  
Owner: QC  
Authority: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`（DEV-072 amendment）

## QC Conclusion

DEV-072 本機 Phase 1A～1D 已完成。Drawing、Part、Relation 與 Approval owner route 共用 `pdm-entity-detail.v2` server action truth；適用但暫不可執行的動作固定顯示低色階鎖頭，不適用與 terminal mutation 不進 payload／DOM，enabled action 以固定 ID、order 與槽位原地解鎖。client 不再注入工作台專屬明細 action，也不自行把 action kind 映射成審核 decision。

AI 使用真實 Chromium、登入 session、隔離 Next.js 與 disposable SQLite copies 操作四種 viewport、三個 owner surface、Approval owner route、送審、撤回及三種審核決策。最終 focused run 21/21；P0/P1=0。production／staging、正式資料、deploy 與 release 未執行。

2026-08-14 follow-up revalidation 已針對 Approval owner drawer 的實際 UI 修正重跑：`review` receipt 存在時，`detail:<owner>:view_review`、`detail:<owner>:withdraw_review` 與 `detail:relation:manage_relation` 均不進 action payload／DOM；request 允許的 decision 與 `return` 保留。一般 owner 工作台的 action inventory 回歸仍通過。

## Facts Verified

- `GET /api/pdm/entity-details/[entityKey]` 回 `pdm-entity-detail.v2`；action descriptor 含 stable ID、group/order、reason code、permission/contact 與 typed execution。locked action `execution=null`。
- capability resolver 固定讀既有九項 permission；resolver 位於 server，Drawing client override、`primaryContextAction`、`showOwnerNavigation` 與 client decision mapping 已移除。
- Drawing building 顯示 edit、manage files 與 locked submit；完成必要 2D/3D evidence 後，同一 submit ID/order/x 位置解鎖並成為唯一 primary。
- review 中 edit／manage files 保持可見但鎖定；submitter 撤回後原地解鎖。Part 不顯示 Drawing file/revision/Relation mutation；Relation 不複製 Drawing／Part mutation；Obsolete Part 只保留 history／return。
- locked control 可由 mouse hover、keyboard focus、Enter/Space no-op 與 390px touch 取得同一人類化原因；tooltip 維持 viewport 內，沒有常駐重複 reason、水平 overflow 或第二個 drawer。
- 唯讀 Manufacturing owner 可讀 detail，但 edit 等適用動作顯示 permission lock；direct submit 回 403。stale row-version direct submit 回 409。兩個 expected-negative 各只有一個 request，前後 domain state 完全相同。
- 真實 submit confirmation cancel 為 0 write；確認後 exactly one request；withdraw exactly once。`needs_info`、`rejected`、`approved` 各使用全新資料副本、各寫入一次並依 `returnTo` 回審核清單。
- decision 成功採 return-only refresh policy，不再背景重讀已失效的 review detail，因此 final run 無 404/409 UI race。
- Approval owner follow-up：三個紅線入口由 server resolver 在 review context 省略；Chromium 實際打開 canonical owner route 後，三種 decision case 均未看到重複審核／撤回／關聯維護入口，決策仍各 exactly once。
- Visible detail cleanup follow-up：Chromium 實際打開圖料明細後，紅線標註的 `預覽狀態` fact 與 `自動預覽` 標題均不存在；`3D 模型`、`2D 圖面` preview card 仍存在，未刪除預覽內容或狀態。
- 補檔入口與操作整併 follow-up：根因確認為兩個 enabled navigate action 造成同一抽屜被拆成兩個入口，且原本的補檔控制需靠 `manage_files` 才能開啟。修正後圖面只輸出單一 `detail:drawing:edit`，標籤為 `圖面維護`；共用 handler 進入 `#drawing-data-maintenance` 並開啟 `MasterAttachmentPanel` 的受控上傳表單。Chromium 實際點擊合併後入口，確認錨點、維護內容與 `form[aria-label="上傳圖面資料"]` 可見；檔案類別仍由後端自動偵測，不增加 UI 類別選擇。
- desktop 1440×900、laptop 1024×768、tablet 768×1024、mobile 390×844 均無 tooltip 越界、裁切、重疊或水平 overflow。

## Evidence

- Final aggregate browser manifest：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T050039Z-113d57e2/run-manifest.json`。
- Final focused totals：21/21 cases、13 screenshots、12 visible-error sweeps、0 failed sweep、0 console/page error、0 unexpected 4xx/5xx、2 expected-negative responses、cleanup removed count 8、temporary root removed=true。
- Source provenance：HEAD `cc393e048b251fb1ea3356204de56bc4c9eacc45`、branch `持續優化1`、`dirtyWorktree=true`、`scopedDirty=true`；manifest含scoped dirty hash `0aaa8a5b75413d7f757f62b0d26615b3f8792e143b18883cf11469bb84b6efef`、scoped source hash `d5a6ce7d548a14e9cd98ff3c9a1106093f89ab5dfb49d05210f266368523dcb2`與19個來源檔清單。
- HTTP／DB bypass：`ACT-012-stale` = 409、`ACT-012-permission` = 403；兩者 `domainStateUnchanged=true`、mutation attempt count各1。
- Resolver／contract：`npm run qc:dev-072:contract` PASS；`npm run qc:dev-072:api` PASS。
- Full gate：`npm run qc:dev-072` PASS，包含 DEV-067 contract/policy/query/UI/preview/review/lock/navigation regressions、browser matrix、`typecheck:app` 與 `build:isolated`。
- DEV-067 query budget保持 candidate/formal Drawing/Part/Relation = 11/14/10/6。
- 相容回歸：`npm run qc:dev-070:contract` PASS，已改驗 server action resolver authority，不再要求被 DEV-072 退役的 client override。
- Approval owner follow-up focused run：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T053707Z-e58c6459/run-manifest.json`；21/21 cases、五個 action/display omission assertions、0 console/page errors、0 unexpected 4xx/5xx、cleanup complete。
- 補檔入口整併 follow-up commands：`npm run qc:dev-072:contract` PASS、`npm run qc:dev-072:api` PASS、`npm run typecheck:app` PASS。最新完整 browser rerun 已通過合併後 `圖面維護` 入口與補檔表單可見斷言，但在後段既有審核案例等待逾時，故本 follow-up 不宣告新的 aggregate 21/21；既有已通過 baseline evidence 仍保留作為 DEV-072 原始交付證據。

## Defects Found and Closed Before Final QC

- 審核 decision 成功後先 refresh 已失效 detail，再返回 inbox，造成背景 404/409；改為 `return_to_inbox` 不重讀 detail。
- locked→enabled 因鎖頭與 tone 改變寬度，submit x 位置漂移 22px；action control 改為桌面固定 140px slot、mobile 100%。
- 初版 terminal fixture 使用 cancelled candidate，但 owner workbench 已不再解析該 row；最終改用 disposable Obsolete Part 驗證真正 history-only surface。
- 初版 no-permission fixture同時缺 workspace read，無法區分可見範圍與 action permission；最終只補 Manufacturing `workspace.view`，其 mutation permissions維持拒絕。
- Completion re-audit先發現舊manifest只有branch ref與`dirtyWorktree=true`，不符合QA要求的commit／dirty hash；runner已改為自動記錄實際HEAD、branch、scoped dirty/content SHA-256與來源清單，contract script亦加入防回歸檢查。
- 第一次provenance重跑 `DEV072-20260814T045044Z-aca7a0c1` 在approve case啟動隔離Next時遇到Windows `next-env.d.ts` transient lock，該run明確FAIL並保留。runner只對`next-env.d.ts`且錯誤碼為`UNKNOWN/EBUSY/EPERM/EACCES`的啟動失敗做最多三次重試；後續focused run與final aggregate均PASS。

## Non-PASS Boundaries

- 本結論限於 local SQLite／isolated Next.js；未執行 PostgreSQL live、staging／production smoke 或正式資料 mutation。
- 沒有新增 schema、migration、permission code、domain mutation API、dependency、env 或 feature flag。
- production release仍受既有 release gate；未執行 stage、commit、push、merge、PR、deploy 或 release。
