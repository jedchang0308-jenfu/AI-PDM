# QC-DEV-114：CAPA-001 核准結果與生命週期語意獨立事實驗證

日期：2026-09-02  
CAPA：`CAPA-001`  
DEV：`DEV-114`  
判定：`Local Effectiveness Verified / Local Formal Data Repair PASS / Production Activation Gated`

## 1. QC 範圍

QC 以獨立 runner 重新檢查 shared approval outcome projector、兩個 approval client/API wiring、native apply postcondition、Part `part_formal + Draft` projection/actionability，以及 task-owned clone 的 `apply_failed` persisted path。QC 不修改 primary SQLite，不授權 production repair、activation、deploy 或 release。

## 2. 通過證據

- Focused contract/state runner：`output/qa/capa-001-approval-outcome/2026-09-02T06-44-20-293Z/report.json`，`22/22 PASS`。
- Isolated fault runner：`output/qa/capa-001-approval-outcome/fault-path-20260902/report.json`，`7/7 PASS`；request=`APR-6166311d-e212-47f0-92a5-32a775594510`，`status=apply_failed`、`applyStatus=failed`、`applyAttempts=1`，mutation ledger 指向 task-owned isolated clone，`productionWrites=false`。
- Primary inventory：`output/qa/capa-001-approval-outcome/inventory/2026-09-02T06-45-19-969Z/manifest.json`；A0001-P01 exact part UUID=`0a81c6e6-089c-4881-926c-819ff141734c`，canonical row=`cw_8604a438-de47-41a3-af98-3adad9d8d9f8`，`record_status=Draft`、approval counts=0、`foreign_key_check=0`、disposition=`blocked_pending_release_authority`。
- Browser evidence：`output/qa/capa-001-approval-outcome/browser-20260902/`。Part 頁顯示「主檔 · 草稿（未發行）」與「資料可見」；`/approvals` 與 `/approvals/[requestId]` 對 fault fixture 均顯示「核准已保存，正式化未完成」並保留重試，不顯示「已核准」成功訊號。

## 3. Independence／integrity record

- QC 使用 `npm.cmd run qc:capa-001` 與 `npm.cmd run qc:capa-001:fault`，未採用 primary data repair 或既有 approval request 作為成功條件。
- 原始 fault-path QC 階段：fixture 只存在 disposable clone；clone 與 task-owned runtime 完成後移除，當階段 primary SQLite 未寫入。後續經人類授權的 exact repair另列 §5。
- `scripts/qc-capa-001-readonly-inventory.mjs` 以 SQLite readonly mode 盤點；未將同編號不同 UUID 或缺乏 release evidence 的資料自動合併。
- `part_formal + Draft` 被分類為合法 neutral navigation state，不是 anomaly，也不是自動 `Released` candidate。

## 4. 工程閘門與外部 gate

`typecheck:app` PASS；受影響 ESLint 為 0 errors、1 個既有 warning；`build:isolated` PASS（126 pages、primary invariant unchanged、cleanup PASS）；`qc:dev-087:contract` PASS（43 checks）。`qc:pdm-approval-platform` 仍有既有 drawing-list compact pending signal baseline failure，該 failure 不在 DEV-114 scope，相關檔案未被修改。

production approval slice 尚未開放；依 CAPA SPEC §10，需在 exact release revision 另行執行 production authenticated E2E、PA-05 monitor 與 release/data authorization。故本 QC 支持「本機效果確認」，不支持 production CAPA closed。

## 5. 使用者授權後的 local primary 正式資料修復

原 QC 的 primary read-only 邊界於 2026-09-02 被使用者對 exact A0001 case 明確覆寫；授權只涵蓋目前本機 `data/ai-pdm.sqlite`，不涵蓋 staging、cloud production、deploy 或 release。處置不重建不存在的歷史 approval request／decision，而以新的人類 CAPA 矯正授權寫入 append-only `capa.formal_data_repair.applied` audit。

- Repair tool：`scripts/repair-capa-001-a0001-formal-status.mjs`；預設 dry-run，primary apply 必須同時通過 exact DB、authorization、雙 confirmation、scope fingerprint、plan hash、expected count、SQLite backup、`BEGIN IMMEDIATE` locked recheck 與 transaction readback。
- Dry-run：`output/qa/capa-001-formal-data-repair/preflight-20260902-03/manifest.json`，`READY`；fingerprint=`8197792adce3b44b79f65f8b6de6adde680d53bdb674bc3e872a882e52f269b0`、plan hash=`837159480a5ba86311460b03ba0a40ccf78123e46c1196140f2e196503c68cb4`、repair count=4。
- Clone rehearsal：`output/qa/capa-001-formal-data-repair/rehearsal-20260902-02/manifest.json`，`PASS`；4 個 lifecycle updates＋1 audit，clone狀態=`Released|Released|Released|released`，source fingerprint unchanged，clone removed。
- Primary apply：`output/qa/capa-001-formal-data-repair/apply-20260902-01/manifest.json`，`PASS`；root／part／drawing number=`Released`，unified drawing=`released`，table counts僅`audit_logs +1`，schema version不變，FK=0、quick-check=`ok`。
- Recovery：`output/qa/capa-001-formal-data-repair/apply-20260902-01/backup/ai-pdm.sqlite`，SHA-256=`d23d1b95671c74d124b9d7c9bc9892c9da108a51fe49c30db88f64a2e7743b15`；restore必須另經授權並在已驗證maintenance window停止正確primary runtime後執行。
- Idempotency／post inventory：`output/qa/capa-001-formal-data-repair/replay-20260902-01/manifest.json`=`NO_OP`；`output/qa/capa-001-approval-outcome/inventory/post-repair-20260902-01/manifest.json`確認 A0001-P01=`Released`、approval rows仍為0、FK=0。
- UI readback：`output/qa/capa-001-formal-data-repair/ui-readback-20260902.md`；localhost:3000重新整理後，清單與詳情均為「主檔 · 已發布」，「更多操作」內有「申請作廢」，QC未送出申請。

QC 結論：exact local corrective action與效果確認 PASS；沒有把新 CAPA 矯正授權冒充成歷史核准證據。Production activation gate不變。
