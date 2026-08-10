# QC 驗證報告：DEV-060 BOM 建立入口與物料身份／版次治理

對應任務：`DEV-060` / `DEV-PDM-BOM-MODULE-ENTRY-001`  
對應規格：`SPEC-BOM-WORKBENCH-001` 第17節  
對應ADR：`ADR-PDM-MATERIAL-IDENTITY-REVISION-001`  
日期：2026-08-10  
結論：PASS / Local RD-QA-QC Complete / Production Release Gated

## 1. 驗證範圍與隔離邊界

- 執行於random localhost port、temporary copied SQLite、temporary repository與獨立Next dist；未連接production。
- 實作／驗證包含Phase 1A canonical migration foundation、1B API/permission/idempotency、1C UI/handoff、1D review/release/export/read integration。
- `productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`。
- 未apply live PostgreSQL/Supabase migration，未修改production資料，未stage/commit/merge/PR/deploy/release。

## 2. 結果摘要

| Gate | 結果 | 主要證據 |
|---|---:|---|
| TypeScript | PASS | `npm.cmd run typecheck` |
| Affected ESLint | PASS | DEV-060 routes、repository、UI與QC script |
| Migration baseline | 21/21 | `npm.cmd run qc:bom-workbench-migration-path` |
| DEV-060 focused real-operation | 50/50 | `npm.cmd run qc:dev-060-bom-create` |
| UI viewport | PASS | 1440×900、1024×768、390×844，無水平overflow |
| Browser/runtime | PASS | console error 0、HTTP 5xx 0 |
| Isolation cleanup | PASS | temporary DB/repository/dist removed |

## 3. 核心事實驗證

- Part Number是無Revision物料身份；新Draft以`owner_part_number_id + bom_revision`為authority。
- Drawing Rev不會寫入BOM Rev或新BOM line；manual來源的submission為null。
- CAD、SolidWorks XLS、空白人工三種來源均由真實UI完成建立，成功交接`/bom/workbench?draftId=...`。
- 相同idempotency key與fingerprint回同Draft；不同payload回409；effect count維持1；unknown-result可authoritative readback。
- 已發行／已占用BOM Rev不可用新key重建；非forward revision被server拒絕，建議值跳過未封存Draft。
- canonical BOM可送審、核准、建立Released Snapshot並匯出CSV，不要求Drawing submission作owner。
- 具有子件且`line.revision=null`的canonical BOM，能依子件已存在Released工程定義通過release gate。
- Manufacturing/Procurement不取得建立候選；Manufacturing可讀canonical Released export。
- Engineer可為自己建立的料號建立BOM、跨公司context回403；R&D Manager可取得管理公司候選。
- workbench、review、release、export與read permission已改讀canonical owner/BOM Rev；legacy `parent_*`只保留相容讀取。

## 4. 視覺與操作證據

證據目錄：`output/playwright/dev-060-bom-create/`

- `desktop-step1.png`
- `compact-step1.png`
- `phone-step1.png`
- `desktop-step2-manual.png`
- `desktop-workbench-handoff.png`
- `report.json`

畫面複核確認：首屏不恢復`Current / Next / 5 steps`流程雜訊；步驟、料號身份、BOM Rev與三來源的任務層次清楚，手機CTA可達且無裁切。

## 5. QC中發現並關閉的缺口

1. canonical Released export原仍強制查Drawing submission：改為canonical owner/company權限，legacy才fallback submission。
2. 新key可重用已發行BOM Rev：新增occupied/non-forward server gate與建議值避讓。
3. manual來源可夾帶假submission：改為422拒絕。
4. create response缺少明確receipt/workbench handoff：補`draftId`、owner、BOM Rev、source、receipt與`workbenchUrl`。
5. 驗證曾只涵蓋空BOM release：補一筆有Released child identity且line revision為null的XLS BOM，review/release通過。

所有修正後均重新執行focused QC；最終50/50 PASS。

## 6. Spec Drift Check

判定：`Intentional replacement completed / no unresolved P0-P1 drift`。

舊submission-bound ownership與「料號版次」語意已由ADR取代；新create/read/review/release/export路徑皆採canonical Part Number owner與獨立BOM Rev。legacy欄位及舊submission selector僅保留相容讀取，不再是新write authority。

## 7. Release判定

本報告只證明local／isolated範圍PASS。commit、live migration、staging／production deploy、production smoke與release均未授權也未執行；若要推進，必須另走Git boundary與deployment release gate。
