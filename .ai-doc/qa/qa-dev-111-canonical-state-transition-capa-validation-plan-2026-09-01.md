# DEV-111 Canonical State Transition CAPA — QA Plan

日期：2026-09-01
範圍：A0044-P01 核准後消失、關聯矩陣 null navigation，以及同類 Drawing／Part terminal transition。

## 1. CAPA 驗收契約

本 CAPA 不新增 schema、route、permission 或第二 authority。驗收以 canonical state 為唯一可導航來源：

1. Part approve/formalize 在同一 transaction 內將 work-only Part promoted 為一列 `part_formal`，再清除 `part_work`；read-back 必須為 formal=1、work=0。
2. Part list/detail 與 matrix 導航均能使用該 exact state row；任何失敗必須 rollback 並不得回傳成功。
3. 沒有 current canonical state 的 master/link 可作 domain evidence，但不得出現在關聯矩陣可操作 axes/cells，避免 null `detailHref`。
4. 既有 formal-backed Part approve/cancel、Drawing first-work cancel、approved RD void、company/FK invariant 不得回歸。

## 2. Fixed focused cases

| Case | 驗收 |
|---|---|
| QA-111-001 | migrated/work-only Part approve 建立恰一列 formal state |
| QA-111-002 | approve 後 work state、work row 清除且 master/variant payload read-back 正確 |
| QA-111-003 | formal-backed Part approve row version 遞增且不重複 formal |
| QA-111-004 | formal-backed Part cancel 只移除 work，formal 維持不變 |
| QA-111-005 | matrix state-backed Part 軸有 exact canonical `detailHref` |
| QA-111-006 | no-state Part master/link 不出現在 matrix axis/cell |
| QA-111-007 | Drawing first-work cancel 後不產生不可導航 matrix axis |
| QA-111-008 | approved RD branch void 後保留 approved identity/artifact，但 current matrix 不顯示 null navigation |
| QA-111-009 | cross-company / wrong-row command fail closed、zero-write |
| QA-111-010 | SQLite `foreign_key_check`、canonical duplicate layer 與 primary snapshot invariant 維持通過 |

## 3. Runner / evidence

- Focused runner：`scripts/qc-dev-111-canonical-state-transition-capa.mjs`。
- Primary 修復工具：`scripts/repair-dev-111-canonical-state.mjs`；預設 dry-run，apply 必須同時符合 exact database、使用者授權字串、primary confirmation、scope fingerprint、plan hash、repair count、backup 與 `BEGIN IMMEDIATE` transaction read-back。
- Primary post-inventory：`scripts/qc-dev-111-primary-inventory.mjs`；以 read transaction 驗證 coverage、A0044 list/detail projection、logical fingerprint、FK 與 quick check，不作 repair。整檔 SHA-256 在既有 runtime 可能有合法背景寫入，因此只作 informational evidence，不作唯一通過條件。
- 執行命令：`node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-111-canonical-state-transition-capa.mjs`。
- Provider：程式 regression 使用 task-owned in-memory SQLite；data repair 先在 online-backup rehearsal SQLite 實際 apply/replay，再以使用者授權修復地端 primary SQLite。本輪不新啟動 HTTP server、port=`none`、不連線 PostgreSQL／Cloud SQL。
- Fixture：由 `qc-dev-087-fixtures.mjs` 建立後，只在 fixture DB 模擬 work-only；primary `data/ai-pdm.sqlite` 不開啟、不寫入。
- Evidence 必須包含每案 PASS/FAIL、provider、productionConnection=false、primaryWrites=false、FK count、task temp cleanup；只有 runner exit code 不足以結案。

## 4. Stop conditions

若 formal read-back 不是 `1/0`、matrix 出現 null navigation current axis、transaction rollback 不完整、cross-company 非 zero-write、FK 不為零、approved snapshot/hash/review receipt 不完整、backup 與 preflight fingerprint 不一致，CAPA 保持 Open，不得標記 Effective／Closed；不得以未受控的手工 SQL 取代程式修正、隔離演練與 exact repair ledger。

## 5. Primary execution result（2026-09-01）

- Rehearsal apply=`PASS`、replay=`NO_OP`；primary preflight repairable=1、blocked=0、正式圖號缺 state=0。
- Primary apply 只新增 A0044-P01 一列 `part_formal` state；非 state 受控表 transaction hash 全部不變，backup 與 rollback SQL 已保留。
- Primary replay=`NO_OP`；post-inventory 為 Parts no-state=0、正式圖號 no-state=0、non-navigable relation links=0、duplicate layer=0、FK=0、quick_check=`ok`。
- 3 筆未編號且無核准證據的 Draft Drawing 為排除項，不屬正式 Drawing axis，也不以推測方式修復。
