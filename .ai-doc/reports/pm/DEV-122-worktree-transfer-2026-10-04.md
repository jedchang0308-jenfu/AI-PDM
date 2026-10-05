# DEV-122 獨立工作樹與候選移交

2026-10-04 使用者回覆 annotation 1「請執行這些」，授權建立 AI-PDM 獨立分支／工作樹並逐項移入既有 DEV-122 候選。此次出口是可審查的候選移交；功能修復、完整 QA/QC、合併與正式發布尚未完成。

- Canonical repository：C:/VIBE CODING/AI_PDM
- DEV-122 工作樹：C:/Users/user/.codex/worktrees/dev122-internal-functions/AI_PDM
- Branch：codex/dev122-internal-functions
- 最新遠端 main 起點：93b9b4cf67444d461aaa8934b8b1616537301b38（fetch 與 ls-remote 同步核對）
- 來源：AIPDM/DEV-121，codex/dev121-owner-ledger-floor，capture HEAD e09e3d42f37ebf405ce061be6a82922104216a97
- 候選狀態：19 個程式／測試／未套用 migration 檔案，未 stage／commit／merge／deploy。
- 機器清單：[移交收據](../../qa/DEV-122-worktree-transfer-2026-10-04.json)
- 下一入口：[DEV-122 同一問題列表](../../specs/DEV-122-ai-pdm-internal-function-issues.md)

## 選定與排除

Part 首次發行意圖、review basis v2、formal/master CAS、approval context、Drawing master lifecycle、UI/API lifecycle 資料與相應測試構成本輪選定候選。每個來源檔及移入結果的 SHA-256、原始／選定／排除／實際移入 patch 皆可由收據追溯。來源 snapshot 保存在 canonical output/dev-122/worktree-transfer-2026-10-04。

| 排除項 | 處置 |
| --- | --- |
| Production owner profile 的 077 append | 不移入 config/release/dev117-ai-pdm-independent-production-v3.json；保持 main 發布設定 |
| Shared selector 已合併測例的文字／格式差異 | 不移入 pdm-principal-reviewer-selector.test.ts；保留 main |
| Part 額外 Principal query guard | 依既有延期判定排除；保留首次發行 publish 重驗，verified! 僅補抽取後的型別縮窄 |
| 同 Principal／不同歷史 profile 的不可達 mock | 排除該測例及僅供此 guard 的 mock setup；原文保存在 excluded patch |

077 是尚未套用的本機候選，保留原 filename 與 DDL；只將 compatibility 標頭正規化為 additive、governance-review 對齊 AIPDM/DEV-122。未改任何 applied migration。合併前再核對編號與 isolated QA profile；此次未加入 Production release profile，未執行 migration。

## 驗證與下一步

移入 patch 預檢成功、19 個來源候選 hash 在 apply 前一致。DB boundary、whitespace 與最終 hash readback 以收據為準。歷史 native PG partial FAIL、58 focused 及 UI NOT_RUN 保留原證據層級；新 variant 尚未執行功能測試、typecheck、PG、UI 或 build。新工作樹未安裝 dependencies，未啟動 app／DB／browser。

下一步先在 DEV-122 同一文件收斂首次發行／Drawing lifecycle 切片的行為與驗收，修正既有 D122-QA-01 測例，規劃 AI-PDM 自有 isolated PG profile，再驗正常 UI→API→service→DB 路徑。OrgMaster／Jenfu-Platform 的程式、測試、執行器與遠端資源不在此次開發範圍；不得在此聊天直接執行其他專案 runner。

此工作樹依使用者要求保留供 DEV-122 接續。DEV-121 原工作樹、canonical 既有 dirty 文件及歷史受控證據不由本輪修改。
