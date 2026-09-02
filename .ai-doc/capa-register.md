# AI PDM CAPA Register

狀態：`Authoritative / Active`  
建立日期：2026-09-02  
適用專案：`AI_PDM`  
用途：本文件是 AI PDM 專案唯一的 CAPA 主案件編號來源。

## 編號治理

- 專案層級正式 CAPA ID 使用 `CAPA-NNN`，流水號至少三位且不因年度重置。
- 新增案件前必須重新讀取本 Register，確認 ID 無重複或矛盾，再使用目前最大流水號加一。
- 已取消、作廢或關閉的 CAPA 仍永久占用原編號，不得回收、轉移或重新指派。
- 正式 CAPA 文件必須同時記載 `CAPA ID`、顯示名稱與本 Register 的可查證連結。
- 本 Register 只收錄專案層級 CAPA 主案件；`CAPA-001～022`、`CAPA-L01～L08`、`CAPA-P01～P04` 等 QA/QC 測試或執行子案例，不占用本主編號序列。
- 建立本 Register 前既有文件中的歷史 CAPA 識別字串予以保留，不追溯改寫；其後新增或正式引用的專案 CAPA 必須回到本 Register。

## Registered CAPA

### CAPA-001

| 欄位 | 內容 |
|---|---|
| CAPA ID | `CAPA-001` |
| 顯示名稱 | `[CAPA-001] 核准結果、正式資料語意與生命週期證據一致性` |
| 狀態 | `Local Effectiveness Verified / Local Formal Data Repair PASS / Production Activation Gated` |
| 建立日期 | `2026-09-02` |
| Owner / route | PM → RD → QA → QC；local primary A0001 修復已由使用者授權並執行，production 仍須另行授權 |
| Canonical record | `.ai-doc/specs/SPEC-PDM-APPROVAL-OUTCOME-TRUTH-CAPA-001-domain-outcome-and-lifecycle-evidence.md` |
| 事件樣本 | `A0001-P01`；part id=`0a81c6e6-089c-4881-926c-819ff141734c`；canonical row=`cw_8604a438-de47-41a3-af98-3adad9d8d9f8` |
| 關聯 DEV | `DEV-114`／`DEV-PDM-APPROVAL-OUTCOME-TRUTH-001` |
| 來源與證據 | CAPA canonical record §2～§15；primary before/after inventory、focused contract QC、isolated apply-failed fault path、fingerprint-gated local repair、NO_OP replay 與 authenticated browser readback 已建立；production release／data action 仍受獨立 gate 管制 |

### CAPA-001 evidence index

- Primary before inventory：`output/qa/capa-001-approval-outcome/inventory/2026-09-02T06-45-19-969Z/manifest.json`；A0001-P01 exact UUID 原為 `Draft`，approval counts 為 0，`foreign_key_check=0`。
- Focused contract QC：`output/qa/capa-001-approval-outcome/2026-09-02T06-44-20-293Z/report.json`；22/22 PASS。
- Isolated apply-failed QC：`output/qa/capa-001-approval-outcome/fault-path-20260902/report.json`；7/7 PASS，僅寫入 task-owned clone，含 mutation ledger。
- Browser receipts：`output/qa/capa-001-approval-outcome/browser-20260902/a0001-part-lifecycle.png`、`approval-inbox-apply-failed.png`、`approval-workspace-apply-failed.png`；Part 顯示「主檔 · 草稿（未發行）／資料可見」，兩個審核介面顯示「核准已保存，正式化未完成」並保留重試。
- Authorized local repair：dry-run=`output/qa/capa-001-formal-data-repair/preflight-20260902-03/manifest.json`；rehearsal=`output/qa/capa-001-formal-data-repair/rehearsal-20260902-02/manifest.json`；apply=`output/qa/capa-001-formal-data-repair/apply-20260902-01/manifest.json`。固定 scope fingerprint=`8197792adce3b44b79f65f8b6de6adde680d53bdb674bc3e872a882e52f269b0`、plan hash=`837159480a5ba86311460b03ba0a40ccf78123e46c1196140f2e196503c68cb4`，4 個 lifecycle changes＋1 筆 append-only CAPA audit，PASS。
- Recovery／replay：apply backup=`output/qa/capa-001-formal-data-repair/apply-20260902-01/backup/ai-pdm.sqlite`，SHA-256=`d23d1b95671c74d124b9d7c9bc9892c9da108a51fe49c30db88f64a2e7743b15`；replay=`output/qa/capa-001-formal-data-repair/replay-20260902-01/manifest.json`，`NO_OP`。
- Post-repair evidence：`output/qa/capa-001-approval-outcome/inventory/post-repair-20260902-01/manifest.json` 確認 A0001-P01=`Released`、approval rows仍為 0、FK=0；`output/qa/capa-001-formal-data-repair/ui-readback-20260902.md` 確認清單／詳情顯示「主檔 · 已發布」且「申請作廢」可見但未送出。
