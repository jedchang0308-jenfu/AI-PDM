# QC-DEV-076 候選關聯自動投影與 staging 對帳報告

- 日期：2026-08-17
- 結果：`PASS / RD-QA-QC Complete / Authenticated Staging Read-only Passed / Production Release Gated`
- 範圍：production snapshot 還原後的 candidate-first relation projection；A0002、A0003、A0004；tree／matrix／readiness／reconciliation
- 資料安全：只操作 staging；兩次 Cloud SQL reconciliation 都在 `BEGIN TRANSACTION READ ONLY` 內執行，`transaction_read_only=on`、`databaseWrites=false`；未執行 production deploy、traffic、migration 或 business write。

## 1. 結論

原始缺口已關閉。A0002／A0003／A0004 的既有候選圖號、料號與 primary manufacturing relation 不需使用者重建或確認，server 會由 candidate facts 自動投影到清單、關係樹與矩陣。三個目標在 authenticated staging 都顯示 `關係已建立（尚未生效）`，展開後為各自的 `M01 → P01`，矩陣交叉格皆為 `製造`。

DEV-076 目標範圍 P0/P1=0。production 仍受正式 release gate 管制，本報告不授權或代表 production 發布。

## 2. Release provenance

| 項目 | 證據 |
|---|---|
| Branch | `codex/dev-064-staging-rehearsal` |
| Source commit | `89e8023a7b44fcd08257f7ec226f25b24b6096ba` |
| Cloud Build | `8a7a2bb6-c8a7-43fd-96cb-0ff2ff15fe32` |
| App image | `sha256:60f42a30c3f094b7d6ea0ed46ce3345cf05fffcdc6b2ab55fdc8797bdfa03568` |
| Reconciliation image | `sha256:f63c05e09c6eb3f83688e80f91dbcf3c34c66bf54fe23d719e4e2480344311be` |
| Staging revision | `ai-pdm-stg-dev07689e802` |
| Hosting | `https://jenfu-ai-pdm-stg-361825.web.app/` |
| Traffic | staging 100%；上一版 `ai-pdm-stg-dev0641abf` 保留供 rollback |

## 3. RD／本機 gate

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-076 focused contract | PASS | `npm run qc:dev-076` |
| TypeScript | PASS | `npm run typecheck:app` |
| Affected lint | PASS | aggregate command 14/14 |
| Isolated production build | PASS | `npm run build:isolated` |
| DEV-062 aggregate browser | PASS | 33/33、console error 0、unexpected response 0 |
| Contract aggregate | PASS | 40/40 |
| Query budget | PASS | list/root/candidate cardinality invariant |
| Read navigation zero-write | PASS | before/after hash identical |
| Documentation paths | PASS | 23/23 |
| DEV completion audit | PASS | 8/8；無 local／unclassified open task |

完整本機證據：`output/qa/dev-062-unified-part-relation-workbench/DEV062-20260817-093521-local-isolated/`。

## 4. Authenticated staging UI／API

| Target | 清單 | 關係樹 | 矩陣 | API |
|---|---|---|---|---|
| A0002 | `關係已建立（尚未生效）` | `A0002-M01 → A0002-P01` | `製造` | HTTP 200，revision `ai-pdm-stg-dev07689e802` |
| A0003 | `關係已建立（尚未生效）` | `A0003-M01 → A0003-P01` | `製造` | HTTP 200，revision `ai-pdm-stg-dev07689e802` |
| A0004 | `關係已建立（尚未生效）` | `A0004-M01 → A0004-P01` | `製造` | HTTP 200，revision `ai-pdm-stg-dev07689e802` |

- 三個目標都沒有再顯示 `目前沒有可顯示的關係矩陣。`。
- Browser console warning/error：0。
- API 查詢使用 `projection=workbench_v1`、`history=exclude`、target query；Cloud Run request log 均為 HTTP 200。
- 未點擊建立、編輯、送審、取消或其他 mutation action。

## 5. Staging DB read-only reconciliation

| 項目 | 驗證前 | 驗證後 | 結果 |
|---|---:|---:|---|
| All candidate pair hash | `f6f061b1a8d75c885f3509b157bad811` | `f6f061b1a8d75c885f3509b157bad811` | PASS |
| A0002 active pair hash | `3d96a2b75c0ffcf3f8f4cf214e924da7` | 同左 | PASS |
| A0003 active pair hash | `38680d88d26d44b4fed162c3ccae69bb` | 同左 | PASS |
| A0004 active pair hash | `6fd61cd5a870818018f1f17d588cba0e` | 同左 | PASS |
| Target invalid scope | 0 | 0 | PASS |
| Target missing primary | 0 | 0 | PASS |
| Target duplicate primary | 0 | 0 | PASS |

驗證前 execution：`ai-pdm-stg-migration-runner-9rnrq`；驗證後 execution：`ai-pdm-stg-migration-runner-rntvj`。兩次均為 staging IAM 身分、DB `ai_pdm`、read-only transaction。臨時 job override 已還原為原 image `sha256:4efbae...`、source revision `f908881a...`、command／args 空值，狀態 Ready。

## 6. RWD 證據判定

同一 source commit 的 isolated Chromium 已通過 Relation 工作台 1440×900、1024×768、768×1024、390×844；各尺寸 `documentWidth == innerWidth`、`mainScrollWidth == mainClientWidth`，並保存對應 screenshots。

Authenticated staging Chrome 可直接驗證 live data、tree、matrix、API 與 console，但其 viewport override 回報後仍固定為實體 1536px；QA 因此不把該假尺寸列為 staging screenshot 證據。補償控制為：Cloud Build 與本機 RWD 都綁定同一 40 字元 commit，且 live staging revision 使用該 commit 建出的 digest。此差異不改變 client layout code，DEV-076 RWD gate 判定 PASS；後續若 release SOP 要求「每一 staging 尺寸都必須 authenticated screenshot」，應改用可真正控制 viewport 的隔離登入帳號／瀏覽器 runner。

## 7. 已知觀察與邊界

- 全 staging 尚有 1 個與 A0002／A0003／A0004 無關的 active draft part 缺 primary relation。DEV-076 契約刻意允許其他未完成草稿存在，並要求它們 fail closed；目標三筆 missing count 都是 0，因此不阻擋本次 rehearsal。正式 release 前若業務範圍要涵蓋所有 active drafts，應另列 data-quality 清單，不得猜測或自動補關聯。
- 兩次早期 job execution 因 CLI args 包裝錯誤，在進入 Node script／DB query 前即失敗；後續改為明確 command + args 後兩次 read-only execution 均成功。失敗 execution 沒有 DB 存取或寫入。
- 全域 `qc:dev-task-evidence-sync` 為 12/13，唯一失敗是 DEV-076 變更範圍外既有 `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` Supabase-shadow 項目已標完成、但本 worktree 沒有其歷史 evidence report，因而被工具列為 `unsafeCompleted`。本次 DEV-076 行號與狀態沒有命中該 sync target；`qc:dev-task-completion-audit` 8/8 PASS，故此既有外部平台 evidence 缺口不改變 DEV-076 verdict，仍不得被誤寫為 production-ready。
- 本次沒有 schema migration、資料回填、production write 或使用者手動轉換。

## 8. Evidence

- Staging evidence：`output/qa/dev-076-candidate-relation-reconciliation/DEV076-20260817-182941-staging-readonly/`
- Local aggregate：`output/qa/dev-062-unified-part-relation-workbench/DEV062-20260817-093521-local-isolated/`
- Implementation commit：`89e8023a7b44fcd08257f7ec226f25b24b6096ba`

最終 verdict：`PASS / DEV-076 Complete / Production Release Gated`。
