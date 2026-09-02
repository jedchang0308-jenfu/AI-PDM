# DEV-111 料號核准後 canonical state 與關聯矩陣導航 CAPA QC

## 結論

本 CAPA 已完成本機 corrective implementation、focused effectiveness verification、經使用者核准的地端 primary SQLite 修復，以及正式環境 Lane 3 release，判定：
`CAPA Closed / Local + Primary SQLite + Production Code/Schema Effectiveness Verified / Production Released`。

正式 release 僅發布阻止同類再發的 Part formalize hotfix；正式 Cloud SQL 唯讀盤點的 repair plan 為空，因此沒有對正式資料執行 INSERT／UPDATE／DELETE。正式 schema 上的 work-only approval transition 以可回滾交易演練，交易內達成 formal=1/work=0，隨即 ROLLBACK，前後資料指紋一致。

## 問題與根因

- 現象：主管核准 `A0044-P01` 後，Part list/detail 消失；Relation matrix 仍從 `part_numbers`／`drawing_part_links` 顯示該料號，但沒有 canonical row，`detailHref=null`，因此不可點開。
- 直接根因：migration 將 A0044 建成合法的 `part_work` only；Part `formalize` 更新 master、刪除 work state/work row，卻只 `UPDATE` 已存在的 `part_formal`，沒有 INSERT fallback，也沒有 postcondition/read-back。
- 系統性根因：list/detail 使用 canonical state 作唯一 current authority，matrix 卻以 master/link 作 axis authority；兩個讀模型沒有共享「可導航 state 必須存在」的不變量。
- 5-Why 結論：資料轉換允許 work-only → approve，但 formalize 契約未定義 promotion；測試只有 formal-backed Part fixture，未覆蓋 work-only approval；matrix 又未排除 no-state identity，故局部成功被誤判為整體完成。

## 矯正措施（Corrective Action）

1. `part-change-work-async-repository.ts`：formalize 在同一 transaction 先 `INSERT ... ON CONFLICT DO NOTHING` 建立 `part_formal`，再刪除 work；read-back 固定檢查 formal=1/work=0，失敗拋 `WORKBENCH_AUTHORITY_MISMATCH`（503）並 rollback。
2. `relation-formal-authority-async-repository.ts`：Drawing／Part axes 與 cells 僅投影兩端均存在 current canonical state 的 identity；legacy/cancelled/voided no-state master/link 不再產生 null navigation current axis。
3. 文件治理：主 SPEC 新增 `DEV-111 CAPA amendment`；DEV-111 QA plan 固定 10 個 acceptance case；`dev_task.md`、`documentation_map.md` 已同步 parent、資料閘門與 evidence path。

## 預防措施（Preventive Action）

- 將 migration work-only Part、Drawing first-work cancel、sole approved RD void 納入同一 state-transition regression inventory；禁止只用 formal-backed fixture。
- 所有 approve/formalize/cancel/void transition 必須有 transaction read-back；matrix projection 必須驗證每一個 current axis 都能解析 exact canonical row key。
- 保留「初建可只有 work」產品語意，不以預先補 formal placeholder 掩蓋問題；正式資料修復與程式修復分離，primary apply 需 backup/fingerprint/dry-run/人類選擇。

## 驗證證據

- focused runner：`scripts/qc-dev-111-canonical-state-transition-capa.mjs`
- current-source receipt：`output/qa/dev-111/DEV111-CAPA-2026-08-31T23-36-06-891Z/report.json`
- 結果：16/16 PASS；涵蓋 work-only Part promote、master payload、formal-backed approve/cancel、state-backed exact href、no-state Part/Drawing axis/cell hidden、wrong-company zero-write、FK invariant。
- primary repair preflight：`output/qa/dev-111-primary-repair/PRIMARY-PREFLIGHT-2026-09-01T07-29-00/manifest.json`；scope fingerprint=`996e6d4662d1b4186ffccc4587741cc51ab08d87ba219553cd4e141a4f9760e8`、plan hash=`5fa05c6fcf1697d047aed15ae07276cfb44b0e175cbbd68ddf0767e9048ae0be`、repairable=1、blocked=0、正式圖號缺 state=0。
- primary apply：`output/qa/dev-111-primary-repair/PRIMARY-APPLY-2026-09-01T07-29-00/manifest.json`；只新增 A0044-P01 的 `part_formal` state `5b207ad0-8fa9-5a3d-ab61-942cc5923d20`，rowVersion=2，來源 approved snapshot=`7e76ae87-9fc5-41d6-9d13-78fe408aaa50`、review cycle=`6302a734-776d-4820-a55d-dbe904b13526`；其餘受控資料表 transaction hash 零變動。修復前 SQLite backup 保留於同目錄 `backup/ai-pdm.sqlite`，SHA-256=`f390e776d933428cb8cc28fd8d782d8c4a43c0fdae4959c36b3aac0409b53e39`。
- primary replay：`output/qa/dev-111-primary-repair/PRIMARY-REPLAY-2026-09-01T07-29-00/manifest.json` 回傳 `NO_OP`、repairCount=0，證明不重複建 state。
- primary post-inventory：`scripts/qc-dev-111-primary-inventory.mjs` → `output/qa/dev-111/primary-inventory-2026-09-01.json`；59 Parts 中 formal=3、work=56、no-state=0；50 個正式圖號均有 state；non-navigable Part／Drawing axis/link=0；A0044-P01 list row 與 detail row key `cw_5b207ad0-8fa9-5a3d-ab61-942cc5923d20` 可解析；duplicate layer/orphan work/pending review without state/FK=0、quick_check=`ok`。
- 類似資料處置：同一缺陷判準下只有 A0044-P01 一筆可修，沒有其他 blocked Part 或正式圖號缺 state。另有 3 筆未編號、未核准的空白 Draft Drawing，不具 approved snapshot／正式 identity，屬排除項而非同類消失資料，未猜測補值。
- provider/isolation：task-owned in-memory SQLite；`productionConnection=false`、`primaryWrites=false`、`port=none`；temp data/repository runner 結束後已清除。
- engineering gates：`npm.cmd run typecheck:app` PASS；受影響檔案 ESLint PASS；`npm.cmd run build:isolated` PASS，artifact=true、primary invariant=true、cleanup=true；`git diff --check` PASS（僅既有 CRLF warnings）。

## 正式環境 effectiveness 與 release evidence

- clean hotfix：PR `#28`，merge commit=`221b25c1c0c777ed0b93e69c69db3bd51e7f9d1c`；Production Slice QC 與 production boundary 均 PASS。
- immutable candidate：Cloud Run revision=`ai-pdm-prod-gh-221b25c1-33457759159`；application image=`sha256:eb895005121db697d3cf14c097553f78bbb67e51c05466b363beab4665037667`；candidate smoke=14/14 PASS；candidate build run=`33457759159`。
- 正式資料 pre-release inventory：58 Parts 中 formal=1、work=57、no-state=0；repairable=0、blocked=0；正式 Drawing state gap、duplicate layer、orphan Part work、pending review without state、non-navigable relation axis/link 均為0。正式 A0044-P01 只有一筆，precondition 是 formal=0/work=1，並未在正式環境核准。
- production-bound transaction rehearsal：execution=`ai-pdm-prod-migration-runner-jxvdm`；交易內 postcondition formal=1/work=0/work-row=0；`ROLLBACK` 後 before/after fingerprint 同為 `12c9a4de7fb38eb1bcd5e0ef7e4e4607eeab400a4a97cb9ec593bd7abaf3653a`，持久狀態仍 formal=0/work=1。
- GO decision 與 promotion：release evidence ref=`production-candidate://ai-pdm-prod-gh-221b25c1-33457759159/221b25c1c0c777ed0b93e69c69db3bd51e7f9d1c/rollback-ai-pdm-prod-migration-runner-jxvdm`；promotion run=`33458882302` PASS；同一 revision／digest 承接100%正式流量，rollback未觸發。
- post-deploy：canonical smoke=14/14 PASS；post-inventory execution=`ai-pdm-prod-migration-runner-nzjwv`，所有 gap 維持0，plan hash=`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`；新 revision 上線後未觀察到 severity>=ERROR 或 HTTP 5xx。
- authenticated approval smoke 限制：正式 `/approvals` 目前由 `official-numbering-draft` production slice 明確顯示「未開放」，Chrome 也沒有可沿用的正式登入 session／專用 smoke fixture。故未以真實 A0044-P01 執行破壞性核准，也未把 unauthenticated smoke 冒充已登入 approval PASS；若未來開放 approval slice，release gate 必須提供專用可清理 fixture 或明確業務資料授權後重做 authenticated E2E。

## Release 結果與後續 gate

- 地端 `data/ai-pdm.sqlite` 修復已完成；rollback SQL 與修復前 backup 均保留於 primary apply evidence。既有 port 3000 服務由其他程序持續運行，本次沒有啟動、停止或接管該 runtime。
- 正式資料 repair 為 NO-OP；正式 code release 已完成，沒有 schema migration。production recurrence monitoring 仍由 `DEV-032`／deployment-release-gate 管理。
- `authenticated approval E2E` 不得標示 PASS；它是 approval slice 未開放期間的 feature-reachability gate。未來若開放該 slice，必須在當次 exact release 重新執行，不得沿用本次 transaction rehearsal 取代登入、權限、API、DB 四方證據。
