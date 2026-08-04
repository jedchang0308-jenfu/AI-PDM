# QC Report：DEV-052 圖料生命週期效率優先簡化

Status: `PASS - Independent Local QC / Production Release Gated`
Date: 2026-08-04
Branch: `持續優化1`
Scope: DEV-052 Phase 1A-1D local implementation；未連線、遷移或修改 production。

## 1. Independent QC Verdict

獨立 QC 已在 RD 凍結產品程式後重新執行全部 DEV-052 閘門、全專案 lint、隔離 production build與 AI 真實操作驗證。結果為 `PASS`：P0 0、P1 0、P2 0。

新流程為「建立料件並保留候選號 → 完成候選首版 → 整包送審 → 核准後系統原子正式化」。既有保留號使用 zero-write read-time compatibility projection直接往前推進；不做 bulk conversion、backfill、read-time lazy write、改號或舊審核重播。

正式環境維持關閉：`PDM_NUMBER_LIFECYCLE_V2`預設 off，DEV-052 mutation routes未加入 production-slice allowlist；未使用production資料庫、storage、credential、migration、deploy、release或production smoke。

## 2. Independent Automated Evidence

| Command / check | Result | Evidence |
|---|---:|---|
| `npm run qc:dev-052` | PASS | 181項可計數檢查，0 failed；獨立 QC clean rerun exit 0 |
| DEV-052 schema | 12/12 | provider parity、additive-only、RLS、immutable companion、physical status未擴張 |
| DEV-052 data protection | 4/4，重跑2次 | F2-F7 projection；change counter 433→433，baseline hashes相同，flag-off不查新表 |
| DEV-052 HTTP/idempotency | 10/10 | exact routes、permission、multipart/soft remove、payload mismatch、legacy-safe opt-in hash |
| DEV-052 UI contract | 15/15 | 原reserved route/tab、單一primary CTA、無manual publish、withdraw、legacy續接、responsive/focus與collapsed audit layer |
| DEV-052 bundle flow | 8/8 | canonical snapshot、fault rollback、retry、physical `Pending` + effective `ReviewApproved`、legacy addendum |
| AI real-operation | 41/41 | Chromium真實渲染、登入、表單、檔案上傳、送審、撤回、補件、核准、故障、管理員重試與資料核對 |
| DEV-050 revision release gate | 11/11 | minor revision仍不可成為physical `Released` |
| DEV-048 runtime regression | 7/7 | 舊create/acquire/cancel/recycle與receipt/outbox冪等語意維持 |
| Supabase migration QC | 69/69 | migration 021 mirror/hash/manifest/RLS通過；未執行live CLI apply |
| `npm run typecheck` | PASS | 0 TypeScript errors |
| `npm run lint` | PASS | 0 errors；4個既有非DEV-052 warnings |
| `npm run build:isolated` | PASS | Next.js 16.2.6 production build；123 pages與DEV-052 routes收錄 |

Build僅有既存Next.js `middleware` convention deprecation warning；無DEV-052 compile、type或lint error。

## 3. AI Real-operation Evidence

Independent QC run: `DEV052-20260804-045957-local-isolated`

Evidence root: `output/playwright/dev052-real-operation/DEV052-20260804-045957-local-isolated/`

- 四個獨立登入角色：Engineer operator、R&D Manager approver、Manufacturing viewer、Admin recovery。
- 真實操作涵蓋RO-00～RO-20：開啟／搜尋／重整／hard reload零寫入、雙擊防重、缺主要檔案阻擋、真實file input上傳、送審確認取消、整包送審、撤回、修改、重新送審、補資料、再次修正、故障注入、管理員UI重試、正式化後查找、歷史唯讀與跨公司防洩漏。
- 核准故障後formal root/part/drawing/link/package/file/companion皆為0；原決策保留一筆。重試後各正式資料只建立1份，3個reservation皆promoted，command receipts 11筆、outbox events 12筆。
- 小數研發版physical package保持`Pending`；effective狀態為`ReviewApproved`，`releasedMinorPackages=0`。
- browser console errors 0、failed requests 0、visible error/raw-state sweep 0；預期的viewer mutation 403與cross-company 404由獨立request context驗證，不是頁面故障。
- 1440x900、1024x768、390x844截圖皆經QC視覺判讀；無水平溢位、主CTA遮蔽、技術snapshot預設展開或狀態誤導。
- runner manifest明確記錄`productionConnected=false`、`productionWrites=false`；測試SQLite與local repository均為disposable target，cleanup=`removed`。

證據包包含`run-manifest.json`、`permissions.json`、`baseline.json`、`final.json`、`db-diff.json`、`case-results.md`、`ai-5-second-assessment.md`、`visible-error-sweep.json`、`console-and-failed-requests.json`、23張screenshots與receipts。

## 4. Transaction and Existing-data Safety

- Migration只新增`numbering_candidate_revision_drafts`、`numbering_candidate_revision_files`、`drawing_revision_package_review_approvals`與新approval action；不更新、刪除或回填既有reservation、workspace、approval或master rows。
- list/detail/bootstrap重複讀取後business hashes、row versions、audit、receipt、outbox與sequence facts不變。
- bundle submit固化候選號、版次政策、finalized檔案證據、圖料關係、actor/company與legacy baseline的canonical snapshot。
- approval decision保留在outer transaction；formalization使用savepoint。故障不留下部分正式資料，retry只使用原approved snapshot與原approver attribution。
- 同一DEV-052 idempotency key與相同payload重播同一receipt；不同payload fail closed；upload replay不建立孤兒storage object。
- 既有pending number-only approval保留原審核並可撤回／查看；既有approved number-only approval進入drawing addendum，不冒充圖面核准；cancelled/recycled資料僅顯示歷史，不復活。

## 5. UI Verdict

- `保留號`頁籤與`/numbering/drawings?tab=reserved`保留，不新增第二套V2頁面。
- 工作區標題為`保留號／首版準備`；一般生命週期只顯示一個主要下一步。
- 審核主畫面使用人類可讀的候選圖料號、版次、主要檔案、關係、核准後效果與使用效力；raw JSON只在`查看稽核明細`收合區。
- 正式化成功後保留原案件明細與成功訊息，不會跳到另一案件造成誤判。
- 正式狀態顯示「小數研發版仍未正式發行，不會成為量產現行版次」，不以raw English狀態誤導使用者。

## 6. Deferred Release Gate

本次PASS只涵蓋local implementation，不等於production release。另有明確release指令與target evidence前，不執行production migration/backfill、feature activation、真實GCS authority、live approval、deploy、release或production smoke。Release前仍須確認target identity、backup、rollback、recovery owner、old/new reader相容與staging smoke。
