# DEV-122 B54：RD 權限 migration ledger 唯讀 preflight（本機）

狀態：`LOCAL_QC_PASS / PR_REQUIRED_CI_PENDING / PRODUCTION_READBACK_PENDING`。本證據只涵蓋 DEV-122 優先項目 2 的正式 ledger readback gate；不代表 085 已套用或未套用，不代表正式 RD 驗收，也不改變 DEV-122 7 issues／29 groups 與 whole DEV `NOT_ACCEPTED`。

## 觸發原因與因果邊界

### 已證實事實

- PR #315 已合併為 `d9e7f07ba244b47928b4a0e8a77426109919c937`；本切片基底為其後 protected `main` `bde28d89ff401491274e5d55e37b548bc3fef8b7`，tree `5b46d08c13c66e7d404479644f7d7f17c881ab9d`。
- 正式 application readback 顯示 active catalog 仍為 v6 `bdc8d2b8f717e4af9d48cf882d1a564a5caaabaaaacdcf20bc5db36a5b6960af`。同一真實 RD session 的 workspace read/create/update/cancel 為 allow，`page:numbering.drawings.view` 為 deny；approval/publish/admin 仍為 deny。
- 最新 native migration receipt 是 2026-10-11 的 exact33：`applied=0`、`replayed=33`、`ledgerBootstrap.created=false`；provider inventory 顯示其後沒有 migration-runner execution。
- 上述資料強烈支持 085 未套用，但沒有直接排除「ledger 已記錄 085、active catalog 發布不一致」。依使用者條件，在直接 ledger readback 前不得 dispatch full35。
- Cloud SQL 是 private-IP only，現有人類身分沒有可用的 DB IAM user／migrator impersonation；Cloud SQL Studio 要求的是內建 PostgreSQL 密碼。未重設密碼、未改 IAM／Secret、未手動改資料。

### 推論、假設與未知

- 推論：目前 RD 工作台 deny 的共同失效機制是 production active catalog 尚未提供 v7 capability，而不是 UI/API 各自的判定差異。
- 假設：既有 generation23 migration Job、固定 runner digest與 app-owned owner workflow 是目前正式 migration identity 的唯一受控入口；本 slice 在執行前仍會重新讀回其 etag/template。
- 未知：`ai_pdm_core.schema_migrations` 現在是否包含 `ai-pdm-085`。本機或歷史 receipt 不能替代 fresh production ledger readback。

## 最小修正

- 新增 immutable readback capsule，綁 exact protected main source/tree/identity、current full35 profile、既有 Job etag/template、固定 runner digest，以及 current-source exact35／exact34／exact33 bundle refs。
- 既有 migration-only protected owner workflow 仍只有一個 `releaseCapsuleRef`，只在 capsule schema 驗證後分流：normal release 維持 `prepare → build → migrate`；readback capsule只執行 RD ledger readback。
- Readback probe 固定 `PGOPTIONS=-c default_transaction_read_only=on`，依 35→34→33 執行。第一個 native PASS 必須是 `applied=0`、bootstrap 未建立、ledger/replay/count/manifest 完全一致；35 PASS 必須停止並處理 catalog 不一致，34/33 PASS 才滿足「085 尚未套用」。
- 每次 submission 先保存 immutable intent，provider POST outcome unknown 時只做 execution inventory readback，不盲目重送。既有 intent、Job、execution、native、final receipt 只有 exact bytes 可重用。
- 沒有修改 catalog、085、產品權限判定、Job template、IAM、Secret、worker、Scheduler、service、traffic、OrgMaster grant或正式資料。

## 驗證

- 新增 RD01–RD07 與既有 continuous focused suite：30/30 PASS。
- 第一次 sandbox `npm run test:dev-117:continuous`：344 PASS、3 個環境型失敗；分別為 localhost bind `EACCES` 與兩個 Windows Temp `realpath EPERM`，沒有 assertion failure。三個 exact case 在核准的非 sandbox 環境重跑：3/3 PASS；原始失敗未覆寫。
- `npm run qc:dev-117:continuous`：PASS；owner report `DEV117-S1B-20261016T022605955Z-0D102419`，source snapshot `ff009a097821833fca1963642e3c252dd8fa488888b92d26713eabadd8c5f9f0`，evidence `59485eadd4ba2869861a43a78b4ede7906cb906cb2af72a96ba3c4a2452c3d29`。
- Aggregate continuous tests：415/415 PASS；catalog v7／085 contract、abort 6/6、`npm run check:db-boundary`、`npm run typecheck:app`、`npm run build:isolated` 全部 PASS。隔離建置的 artifact、primary database-absent invariant 與 cleanup 均為 true。
- Owner report 明確記錄 provider mutation：cloud 0、database 0、traffic 0、credentials 0、sibling 0。
- PR #330 required CI 兩項皆 PASS 後，第一次 exact-main publish 在 Node 載入階段因 CLI import/export 名稱不一致而失敗；此失敗發生於 `main()` 與任何 provider write 前，所以 GCS／Job／database／service／traffic mutation 均為 0。後續 corrective commit 統一名稱，並把實際 entrypoint module import 納入 RD07，避免只以 source text 測試而漏掉 ESM linkage。
- PR #331 合併後，R2 capsule 成功發布；protected workflow通過 source tests、official-source與 capsule classification，readback stage 隨即以 `RD_READBACK_PROFILE_DRIFT` fail closed。直接比對證實同一 profile 的 Windows working-tree raw SHA-256 為 `7eb3d437b13a9a2ce6ad21ef96517bbb190316b533fcebf0a6f6a118bdcd2c6a`，Git canonical bytes 為 `b8d39e0e519f5a88e67f068ce20eb611953af6ed20dd199f93a4c3551c45f4c4`；根因是 CRLF/LF，不是 profile semantics 漂移。失敗在 Job readback/submission前，沒有 migration execution或 DB mutation。corrective source改綁 canonical parsed profile semantic hash，仍由 exact source tree另行綁定 byte identity，並新增 LF/CRLF 等價測試。
- PR #332 合併後，R3 通過跨平台 profile/source binding並寫入 immutable `ledger-job-readback.json`，但在第一個 submission intent 前以 `RD_READBACK_PROBE_INVALID` 停止。根因是 runtime 使用含 `bundle/bytes` 的 source-enriched probe，validator卻與 capsule sealed projection做整個物件相等；provider inventory證明最新 execution仍是 2026-10-11 `ai-pdm-prod-migration-runner-8m5qq`。corrective source只比較 `ledgerCount/terminalVersion/manifestSha256/migrationBundleRef` sealed projection，並新增 sealed與enriched probe產生完全相同固定 arguments 的回歸測試；不放寬 target／SQL／command／environment guard。
- 本地摘要保存在 `output/qa/dev-122/rd-permission-repair/readback-preflight-local-qc-2026-10-16.json`；正式先前 readback保存在同目錄的 `production-readback-gate-2026-10-16.json` 與 `production-readback-partial-2026-10-16.json`。

## 下一個 gate

1. 透過 PR 與 required CI 合併本 corrective slice 至 protected main。
2. 由 exact merged main 發布 readback capsule，透過既有 app-owned migration-only owner workflow 取得 fresh ledger receipt。
3. 若 ledger35：因 active catalog 為 v6，停止所有正式變更並建立下一個可用本地 ID 的 forward-only corrective migration方案；不得修改 085。
4. 若 ledger34/33：才依原授權準備並執行既有 app-owned full35 owner release；其後仍須取得 active v7/catalog hash、真實 RD 正向與 approval／未授權角色負向證據。
