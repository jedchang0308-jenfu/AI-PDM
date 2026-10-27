# DEV-124：OpenSWX metadata worker 獨立修復

狀態：`CLOSED_CANCELLED_REPLACED`（2026-10-27）；OpenSWX 修復取消、功能驗收未通過。實體退出已由 DEV-125 完成，不重開本任務或改判功能通過。

依使用者要求，後續只採 Windows SolidWorks 解析路徑。DEV-124 不再修復、重建或恢復 OpenSWX Scheduler；其安全退出盤點、程式及專用雲端資源移除由 [DEV-125](DEV-125-windows-solidworks-service-and-openswx-retirement.md) 承接。2026-10-27 DEV-125 cleanup 已把 2 筆 active rows 轉終態，provider readback 確認 active execution 0 且專用 Job／Scheduler／SA／Secret 均不存在；此結果只關閉退出責任，不將 DEV-124 改成 `COMPLETED` 或功能 PASS。

**下文完整保留為歷史修復計畫及證據，原 124-A／B／C 不再排程執行。** 只在 DEV-125 安全退出需要時重用既有唯讀能力與收據，不為拆除先把整套 OpenSWX 修好。

來源基準：`origin/main` `9d4881755bae7f6b77d77487e32e9d9bec9f50dd`（2026-10-27）；PR #499 已合併 OpenSWX active source／release dependency 退役，required CI run `40460654463` 通過。本輪安全退出 fixed readback 仍待其本身的 PR／required CI／merge、runner rollout 與正式 fresh operation。

## 1. 目的與責任邊界

DEV-124 只負責 OpenSWX metadata 工作的有限派送與 worker 鏈：worker profile、current／historical source reader、artifact reuse、Secret version IAM continuation、Cloud Run Job、Scheduler、dispatch recovery，以及 `openswx_metadata_jobs` 的 `claim → heartbeat → complete`。

本任務不負責 SolidWorks 3D 預覽、PDF viewer、drawing recognition consumer、角色／grant、migration 085 或 RD 工作台。`A0001-M01` 的 `preview_worker_unavailable` 仍屬 DEV-122 F-01B；不得以 OpenSWX Job 成功取代該預覽驗收，也不得讓 DEV-124 再成為 catalog → migration 085 → grant → API → UI 的前置條件。

## 2. 正式環境基線

2026-10-27 01:35Z 的[唯讀 provider baseline](../qa/DEV-124-openswx-provider-baseline-2026-10-27.json)已確認：

- `ai-pdm-prod-openswx-metadata` Job 存在且 Ready，resource generation 25；最近一次 execution 建立於 2026-10-18，終態為 `EXECUTION_FAILED / NonZeroExitCode`。
- `aipdm-prod-openswx-dispatch` Scheduler 目前為 `PAUSED`，排程仍為每 5 分鐘。
- OpenSWX worker image 與 AI-PDM app service 是不同產物；app service Ready 或 100% traffic 不代表 worker 通過。
- 兩個既有 Secret 的 version metadata 與限定讀取鏈可讀；本次沒有讀取 Secret payload，也沒有證據支持新增 IAM、Secret 或 service identity。

這些事實只建立修復起點。最近 execution 的安全錯誤原因、目前待處理 job、實際 API 往返及輸出內容仍需由下列交付流程取得，不得猜測或把歷史成功 execution 當成目前 PASS。

### 2.1 124-A 首次 current readback 結果（2026-10-27）

已建立 create-only operation `DEV124-A-READBACK-20261027-R1`，並由既有受保護的 production RD permission-state workflow 執行固定 read-only transaction。workflow run `40434430269` 已通過 source／CI、operation hash、WIF 與 runner 綁定，實際啟動 `ai-pdm-prod-migration-runner`；固定讀回階段其後以 `RD_PERMISSION_STATE_EXECUTION_FAILED` 終止。

此結果只證明 current readback execution 失敗，不證明 `openswx_metadata_jobs` 沒有 active row，也不證明 current consumer 不存在。因 operation 已產生一次明確失敗，不得在沒有辨識新原因前原樣重送。124-A 下一步固定為：

1. 讀取該 exact migration-runner execution 的 terminal condition 與去敏錯誤分類，並確認有無 immutable state／submission receipt。
2. 若失敗屬既有 RD actor／catalog 前置，而不是 OpenSWX query 本身，將 OpenSWX entry readback 拆成 actor-independent 的固定唯讀診斷；不得為此擴張 IAM、Secret 或 business grant。
3. DEV-124 其後已取消；current DB row／active row 與 consumer 判定改作 DEV-125 安全退出輸入，不再產生 `NEED_EXISTS`／`DEFERRED_NO_CURRENT_NEED` 或啟動 124-B。

### 2.2 R1 根因與 DEV-125 安全退出讀回（2026-10-27）

exact execution `ai-pdm-prod-migration-runner-v7t2n` 的 terminal condition 為 `Completed=False / NonZeroExitCode`，去敏 log code 為 `RD_PERMISSION_STATE_CATALOG_MISMATCH`；create-only `submission.json` 存在，對應 `state.json` 不存在。source execution order 證明 catalog guard 發生在 OpenSWX query 前，因此 R1 沒有讀到 `openswx_metadata_jobs`，不得由該失敗推論 active row 或 consumer 狀態。

DEV-124 取消後，本輪為 DEV-125 安全退出盤點本機實作 actor-independent fixed operation `preview-openswx-runtime-state`；它不是 124-A 復工，也不授權修復或恢復 OpenSWX：

- 與 RD actor、role catalog、grant 完全解耦；只重用既有 migration-runner Job、deployer WIF 與 receipt bucket，不新增 IAM、Secret、schema、任意 SQL、任意 target 或任意 command。
- DB 端在一個 `REPEATABLE READ READ ONLY` transaction 讀 OpenSWX status／dispatch counts、bounded active rows 與 pending count；app provider 端只讀唯一 100% serving revision 的 exact `PDM_OPENSWX_DISPATCH_ENABLED` 非敏感值，不輸出其他 env／Secret ref。
- final status 只指出 DB pending／serving app入口是否要求排空或停用；即使兩者皆無，也固定標示仍缺 Job／Scheduler／execution provider inventory，不得由此恢復 Scheduler、宣稱 no current need 或判定可刪除。
- 同一 operation 同步承載已移交 DEV-125 的 D122-05 指定圖檔唯讀 preview state，避免再新增一條相同權限的 production workflow；它只建立修復／退出基線，不是功能驗收。
- 整體流程不是零副作用：會建立一個 Cloud Run Job execution，並 create-only 寫 submission／database／final GCS evidence；但不得修改 business DB row、service configuration、Scheduler、Job template、IAM 或 Secret。

新程式已由 PR #500 經 protected PR／required CI 合併；仍須由既有 app-owned release 將 exact main `b7b0f4e…` 的 migration-runner image 安裝到正式 Job，之後才能建立 fresh immutable operation 並執行 DEV-125 退出前讀回。2026-10-27 的首次正式 attempt 使用較早 source，且在 activation 前因 Platform session smoke 失敗安全回滾，所以尚未完成此 runner rollout。舊 runner image 不支援新參數；不得把本機測試或舊 R1 operation 當正式 readback。

PR #499 的 source retirement 與雲端 resource retirement 是兩個證據層：前者已刪除 active UI／API、OpenSWX reader／worker、release profile 與相依測試；後者仍須對 exact Job、Scheduler、executions、service accounts、bindings 與 Secret references 做 fresh provider inventory，並依 DEV-125 的退出順序處理。沒有後者不得把 DEV-125 V125-11 標為 PASS。

## 3. 現行架構契約

### 3.1 固定元件

| 元件 | 現行責任 |
|---|---|
| `config/release/dev122-openswx-worker.json` | 唯一 worker profile；固定 project／region／Job／Scheduler、有限資源、零自動 retry、有限 deadline 及 `scheduler_only.v1`。檔名沿用歷史 DEV-122，不表示責任仍屬 DEV-122。 |
| `scripts/run-openswx-metadata-job.mjs`、`scripts/lib/openswx-reader/**` | 有限 worker entrypoint 與 OpenSWX reader artifact；只處理 OpenSWX metadata，不載入 preview 或 recognition worker。 |
| `scripts/lib/dev122-openswx-profile-context.mjs` | current／historical profile 與 source reader；current owner deadline 1200 秒，historical 600 秒只用於已封存證據相容讀取。 |
| `scripts/lib/dev122-openswx-worker-artifact-reuse.mjs` | 以 source revision、source lock、input manifest、recipe、provider build／image 與 security readback驗證 artifact；不得只依 tag、latest 或舊 receipt 重用。 |
| `scripts/lib/dev122-openswx-secret-version-iam.mjs` | 只驗既有兩個 Secret version metadata 及 closed IAM continuation；不讀 payload、不建立新 Secret、不擴張 project-wide 權限。 |
| `scripts/lib/dev122-openswx-owner-release.mjs` | Job／Scheduler template、descriptor、finite execution、provider readback、PAUSED repair 與 recovery 的權威狀態機。 |
| `src/lib/openswx-metadata-dispatch.ts`、`scripts/lib/dev122-openswx-dispatch-recovery.mjs` | provider dispatch unknown 的 bounded recovery；只以 provider readback 與 generation CAS 收斂，不重送未知寫入。 |
| `src/lib/openswx-metadata.ts`、`src/lib/repositories/openswx-metadata-async-repository.ts`、OpenSWX API routes | workload 身分、claim／heartbeat／complete、source bytes 與結果持久化；只接受既有 OpenSWX purpose／capability。 |

既有檔名與 receipt prefix 暫不改名，避免為名稱整理破壞封存來源與相容 reader。新實作不得把 DEV-124 判定重新耦合回 DEV-121／DEV-122 的 catalog、migration 或 app release continuation。

### 3.2 資料與 API

- 使用既有 `ai_pdm_core.openswx_metadata_jobs` 與 migration 082 契約；本任務預設沒有新 schema 或 migration。
- 現行 dispatch state 為 `due → requested → dispatched → terminal`，provider 結果不明時為 `dispatch_unknown`；business status 維持 `queued → running → completed|failed|cancelled`。
- 任何 `requested`／`dispatch_unknown` 的 provider 寫入結果，必須先讀 operation／execution，再以 exact job、generation、execution name 及 CAS 收斂。不得直接再送一次 Job。
- worker API 只接受固定 technical workload：id `openswx-metadata-reader`、purpose `openswx_metadata_jobs`、capability `openswx_metadata`。不得共用 SolidWorks preview 或 recognition credential。
- completion receipt、source fingerprint、reader commit、initiator provenance 與結果 digest 一旦成立即不可改寫；拒絕、timeout 或 recovery 不得製造假 completed。
- 若實際診斷證明 schema 必須變更，只能新增 `db/postgres` forward-only migration，維持 `ai_pdm_core`／`ai_pdm_contract` 邊界並執行 `npm run check:db-boundary`；不得修改 migration 082 或手動更新正式資料。

## 4. 實作順序

### Slice 124-A：失敗原因與來源讀回

1. 先讀回目前 `openswx_metadata_jobs` 的 `due／requested／dispatch_unknown／dispatched` 數量、exact active row／provider operation，以及產品目前是否仍有 OpenSWX metadata 消費入口；不讀來源 bytes、不改 row。
2. 以精確 Job／execution 讀取最近失敗的 bounded logs 與 provider condition，只保存去除 token、header、env、Secret payload 及業務檔案內容後的錯誤分類。
3. 讀回 current Job template、image digest、Scheduler 狀態、兩個 numeric Secret version metadata、exact IAM binding及 serving app 的 OpenSWX dispatch 設定。
4. 比對 current profile、descriptor、source lock、artifact manifest 與 provider resource；任何來源或 receipt 不一致先停止 mutation。

124-A 是執行 gate：若有 active row 或目前產品確實仍需要 OpenSWX metadata，標 `NEED_EXISTS` 並進入 124-B；若沒有 active row、沒有 current consumer 且功能未啟用，標 `DEFERRED_NO_CURRENT_NEED`，維持 Scheduler `PAUSED`，不為歷史相容鏈重建 worker；若 DB／consumer 狀態無法判定，標 `UNKNOWN` 並停止正式 mutation。需要修復時，輸出必須把 root cause 分為 entrypoint／reader、artifact/source、credential metadata／IAM、Job template、dispatch／DB state 或 provider transient；不以一般 `NonZeroExitCode` 直接選修法。

### Slice 124-B：最小修復

- 只修改 124-A 證明受影響的元件及其直接測試。
- 若是程式或 artifact 缺陷，建立由 exact reviewed source 產生的 immutable worker image；若既有 image 經 manifest、recipe、provenance 與 security readback完整相符，允許 reuse。
- 若是既有 Secret version metadata／binding 漂移，只能恢復本 profile 已定義的 exact resource／service identity；任何新增 IAM role、Secret、credential 或 project-wide 權限須另行取得人類確認。
- 若是 `dispatch_unknown`，使用既有 recovery 契約與 provider readback；不得手動把正式 job row 改成成功或重送 outcome unknown 的寫入。

### Slice 124-C：有限正式驗收與恢復排程

1. 保持 Scheduler `PAUSED`，先執行一個 exact-source finite Job。
2. 驗證 worker 對一筆合法工作完成 `claim → heartbeat → complete`，且 job／execution、attempt、source fingerprint、reader commit、result digest 與 terminal receipt 可相互對應；無工作時須是可判定的 no-work success，不得假造 business completion。
3. 驗證錯誤路徑不洩漏來源 bytes／credential，拒絕不改 business terminal state；所有 task／execution 都已終止。
4. 只有 finite success、provider readback 與資料終態均成立，才恢復既有 Scheduler；恢復後觀察至少兩個排程窗，無 active execution 重疊、無新的 terminal failure，且待處理工作依序收斂。
5. 任一步驟失敗即維持／恢復 `PAUSED`，保存第一個有效失敗與 recovery readback；不得以 app traffic、歷史 execution 或 CI 綠燈改判正式 PASS。

## 5. 預期修改面

依 124-A 結果選最小集合，不要求全部修改：

- `config/release/dev122-openswx-worker.json`
- `scripts/run-openswx-metadata-job.mjs`
- `scripts/lib/openswx-reader/**`
- `scripts/lib/dev122-openswx-profile-context.mjs`
- `scripts/lib/dev122-openswx-secret-version-iam.mjs`
- `scripts/lib/dev122-openswx-worker-artifact-reuse.mjs`
- `scripts/lib/dev122-openswx-owner-release.mjs`
- `scripts/lib/dev122-openswx-dispatch-recovery.mjs`
- `src/lib/openswx-metadata-dispatch.ts`
- `src/lib/openswx-metadata.ts`
- `src/lib/repositories/openswx-metadata-async-repository.ts`
- `src/app/api/openswx-metadata-*/**` 與 `src/app/api/numbering/openswx-metadata/**`
- 各模組既有相鄰測試、`scripts/production-slice-plan.test.mjs` 與必要 direct documentation

禁止修改 SolidWorks preview worker、drawing recognition worker、角色 catalog／grant、migration 085、OrgMaster 或 sibling project。除非 124-A 證明是既有契約本身的缺陷，不修改共同 release-control；若必須修改，共同路徑仍依 affected-slice planner 與既有 required CI 驗證。

## 6. 驗證與完成判定

### 6.1 本地／CI

至少執行受影響集合：

- OpenSWX profile、owner release、artifact reuse、Secret-version IAM、dispatch recovery 與 reader tests。
- `src/lib/openswx-metadata*.test.ts`、`src/lib/worker-service-auth.test.ts`、受影響 route／repository tests。
- `npm run plan:production-slice`，再以 `npm run test:production-slice:affected` 執行該計畫選出的 checks；unknown path 維持 full fail-closed。
- 觸及 app／package/build input 才執行 `npm run typecheck:app`、`npm run build:isolated`；觸及 SQL／boundary 才執行 `npm run check:db-boundary` 與 native PostgreSQL contract。
- PR 的 required `DEV-012 Isolated PostgreSQL Cutover` 與 `Production Slice QC` 必須通過 exact head。

### 6.2 正式完成條件

DEV-124 只有符合下列其中一條 terminal path 才可結案：

`DEFERRED_NO_CURRENT_NEED`：124-A 已證明沒有 active／unknown row、沒有 current consumer 且產品功能未啟用；Scheduler 維持 `PAUSED`，沒有重建／重播 Job，狀態記為 `NOT_APPLICABLE_CURRENT` 而不是功能 PASS。

`COMPLETED`：功能仍有 current need，且同時符合以下條件：

- 最近已驗收 execution 為 terminal success，沒有 active／unknown execution。
- worker image digest、source revision／lock、profile、Job template、numeric Secret metadata及 IAM readback一致。
- 合法工作或 no-work 的 API／DB／provider 結果一致；若有工作，`claim → heartbeat → complete` 與 completion digest／receipt成立。
- Scheduler 已恢復既有 policy，至少兩個排程窗沒有重疊或新失敗；若產品決定維持停用，必須另有明確決策，不能把 `PAUSED` 寫成健康運作。
- cleanup 只處理本任務建立的 execution／暫存資源；不刪正式業務 bytes、歷史 receipt、Secret version 或其他服務資源。

完成 DEV-124 不改寫 DEV-122 D122-05、管理員 recognition 或原生 CAD 的狀態；反之，DEV-122 preview 完成也不代表 DEV-124 通過。

## 7. Stop conditions

- provider 寫入結果未知且 readback 無法判定。
- source lock、artifact digest、profile、Job template 或 receipt 任一不一致。
- 需要新增／擴張 IAM、Secret、credential、billing 或跨專案責任。
- 需要手動正式資料 rewrite、down migration、刪除服務／Secret／歷史證據。
- 有其他 active execution、無法證明 Scheduler 已暫停，或 finite execution 可能和排程重疊。

上述只停止受影響 mutation；安全的唯讀診斷、本地修復與獨立測試可繼續。
