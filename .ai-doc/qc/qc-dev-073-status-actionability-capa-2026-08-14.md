# QC-DEV-073：狀態、責任與審核工作項一致性 CAPA

狀態：`PASS / Local RD-QA-QC Complete / Production Release Gated`  
日期：2026-08-14  
DEV：`DEV-073`  
SPEC：`SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001`

## 1. 結論

本機授權範圍 PASS，P0=0、P1=0。A0005-M01 不再顯示無工作項的「待你處理」：canonical Drawing與0.2／0.3／0.5小數版依既有terminal FFF evidence收斂為`rd_controlled`，UI顯示「研發可用」，並提供`建立新版次／查看歷史／返回`。active審核工作台仍不顯示已完成的歷史確認，這是正確行為，不需建立假工作項。

缺active request/workflow的真正`in_review`案例則fail closed為「負責人待確認」；鎖定「查看審核」在hover、focus、touch皆顯示「找不到有效的審核工作項；請聯絡 PDM 管理者確認流程」，不導航、不發mutation。

## 2. 根因與 CAPA

### 根因

1. published workspace仍被明細視為active candidate，遮蔽formal Drawing authority。
2. `rd_controlled`落入waiting projector，viewer責任又只以owner相等判定，形成phantom task。
3. legacy FFF terminal confirmation與physical Pending的effective-state規則未進入canonical synchronizer及所有reader。
4. `in_review`缺work item時沒有fail-closed恢復契約。

### 矯正措施

- 新增共用effective revision lifecycle projector，統一legacy terminal confirmation、active request、promoted evidence與monotonic controlled state。
- formal/published來源只以active candidate參與動作；entity detail改為先解action bar，再依責任action投影viewer狀態。
- `rd_controlled/released`客觀優先為usable；orphan review改為unknown並提供精確locked gateway。
- terminal FFF confirmation在同一domain transaction同步canonical Drawing／Revision。
- A0005本機資料以hash-gated、backup-protected synchronizer修復，不直接修改physical package或審核證據。

### 預防措施

- `current_user => applicable responsibility action`與`canAct => enabled responsibility action`納入focused contract gate。
- workbench、canonical synchronizer與detail不得再複製不同lifecycle優先序。
- repair預設copy dry-run；apply強制confirmation、expected SHA-256、repo內backup與idempotency。
- active inbox與lifecycle history明確分離；無work item不得合成request或reviewer。
- 三viewport A0005與orphan recovery列入`qc:dev-073`真實browser gate。

## 3. 資料修復證據

- apply前最後乾跑：`output/qa/dev-073-status-actionability/20260814100305/repair-report.json`。
  - Drawing：A0005-M01 `in_review -> rd_controlled` 1筆。
  - Revision：0.2／0.3／0.5 `in_review -> rd_controlled`各1筆。
  - package、confirmation event、request、decision、workflow count差異全0。
  - second pass Drawing／Revision state difference全0；來源SHA-256未變。
- guarded apply：`output/qa/dev-073-status-actionability/20260814100318/repair-report.json`。
  - apply前SHA-256：`549a6c97253e1cab8d6cd6ef07cb84883a4de0e2d6ec272b4e59a40898785559`。
  - 備份：`output/qa/dev-073-status-actionability/repair-backups/ai-pdm-20260814100318-549a6c97253e.sqlite`，建立後hash比對通過。
  - 實際變更僅上述4筆狀態；protected counts全0。
- 修復後最終語意乾跑：`output/qa/dev-073-status-actionability/20260814103232/repair-report.json`，Drawing／Revision state changes均0，second pass均0。
- negative apply：缺confirmation／expected hash／backup時exit 1=`DEV073_APPLY_REQUIRES_CONFIRMATION_EXPECTED_HASH_AND_BACKUP_DIR`；前後SHA-256同為`27da10d9f7b83f9ecd6a95478ffda0fb05c38e8f05e1542bcfa39fcc4eb043be`。

## 4. QA/QC 結果

| Gate | 結果 |
|---|---|
| `qc:dev-073:contract` | PASS，CAPA-001～012 |
| `qc:dev-073:data` | PASS，source hash不變、狀態差異0、protected counts 0、idempotent |
| DEV-072 action API/resolver regression | PASS，ACT-001～010、013、015 |
| DEV-055 projection | PASS 71/71 |
| DEV-055 contract | PASS 13/13 |
| affected ESLint | PASS，0 error |
| TypeScript | PASS |

最終real-browser evidence：`output/qa/dev-073-status-actionability/DEV073-20260814T103234Z-bb1449b0/`。

- 7/7 cases：A0005 desktop 1440×900、tablet 1024×768、mobile 390×844；orphan hover／focus／touch；active inbox exclusion。
- A0005三viewport皆為`rd_controlled / usable / 研發可用`，三個動作均enabled；document horizontal overflow=0，drawer均在viewport內。
- orphan三viewport皆為`unknown / 負責人待確認`，reason code=`PDM_ACTION_TARGET_UNAVAILABLE`，tooltip在viewport內。
- `consoleEvents=[]`、`networkEvents=[]`，visible error sweep=0；未連production、未對shared DB執行browser mutation。
- 人工截圖複核：desktop與mobile的狀態、CTA與固定footer可讀；orphan desktop tooltip與mobile locked control可達，未見遮擋或錯誤層。

## 5. RD 自檢與 Spec Drift

- 實作符合使用者「完成CAPA措施」與既有DEV-053小數版effective ReviewApproved政策；沒有把歷史塞回active inbox。
- 無schema/migration、新permission、新decision authority、新dependency或env。
- 已同步amend `SPEC-PDM-STATUS-UX-004`、`SPEC-PDM-ENTITY-DETAIL-DRAWER-001`、`SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001`、`SPEC-PDM-APPROVAL-PLATFORM-001`，與CAPA authority一致。
- dirty worktree中其他DEV內容保持原狀；本輪未stage、commit、merge、PR、deploy或release。

## 6. Gate 與後續

Local CAPA完成。正式／staging資料修復、production migration、deploy與release仍需獨立授權及deployment release gate；本報告不得作為production release證據。
