# QA 驗證計畫：DEV-071 XMind 肌肉記憶 BOM 編輯器

對應任務：`DEV-071`  
對應規格：`SPEC-BOM-VISUAL-EDITOR-001` Phase 2  
狀態：Executed Focused Baseline / Superseded for Full-operation Gate  
日期：2026-08-13  
風險：High；正式 BOM 結構、權限或並行覆寫缺陷最高 P0

## 1. 驗證結論邊界

> 2026-08-13 QA 補充：使用者新增「每個功能必須由 AI 真實操作」硬性門檻。本文件保留既有 focused evidence，不再作為完整 UI 驗收依據；後續 QC 必須改依 `.ai-doc/qa/qa-dev-071-ai-full-operation-validation-plan-2026-08-13.md` 逐項執行。新計畫未完成前，不得引用本文件的 36/36 宣稱全功能通過。

- 驗證 Draft BOM editor 的 XMind 式工具列、快捷鍵、Map／Outliner、Floating Topic、拖放、復原、儲存、並行衝突與送審阻擋。
- 正式 authority 仍為 `bom_lines_tree`、review/release、Released Snapshot 與正式 export；Floating Topic 僅能存在 draft-only table。
- 必須同時取得 source contract、isolated API/DB readback 與真實 Chromium 操作證據；只有靜態 source assertion 不足以判 PASS。
- Production、live Cloud SQL、正式 migration apply、deploy 與 release 不在本次執行範圍；feature flag 預設保持關閉。

## 2. FMEA 與優先級

| 失效模式 | 影響 | 優先級 | 必要護欄／證據 |
|---|---|---:|---|
| Floating Topic 混入正式 BOM line 或 export | 發行資料污染 | P0 | 分表 schema、submit/approve/export fail closed、Released readback |
| stale tab 覆蓋新版 Draft | 使用者修改遺失 | P0 | `expectedEditorVersion`、409、winner DB readback |
| 拖放產生 cycle/orphan/depth > 10 | BOM 結構失真 | P0 | resolver + server validation + 零寫入負向案例 |
| Manufacturing／Procurement 可寫 Draft | 權限越權 | P0 | direct HTTP 403 與 DB count/hash 不變 |
| Ctrl+Delete／Delete 刪除語意混淆 | 整枝資料誤刪 | P1 | 單節點提升子件、整枝確認、單一步驟 Undo |
| input/modal 仍攔截畫布快捷鍵 | 誤建立、刪除或儲存 | P1 | focus boundary keyboard walk |
| mobile 仍以不可操作 Map 開場 | 任務阻斷 | P1 | 390×844 預設 Outliner 與 overflow check |
| Floating 未歸位但只在 UI 阻擋 | API 可繞過治理 | P0 | direct submit/approve 409 與 server code |

## 3. Gate 0：Provenance 與隔離

- 記錄 repo root、branch、HEAD、dirty boundary、runtime URL、random port、DB provider/path、actor/role、feature flags、migration artifact、timestamp。
- 所有 mutation 使用 temporary copied SQLite、temporary Next dist 與 disposable fixture；`productionConnected=false`、`productionWrites=false`。
- 不清除或覆寫既有 dirty changes；cleanup 只能處理本次明確建立的 temp target。

## 4. Gate 1：Schema、Repository 與 API

| ID | 案例 | 預期 |
|---|---|---|
| XMB-API-001 | 同時儲存 formal lines 與 Floating graph | 單一 transaction 成功，`editor_version + 1`，reload 一致 |
| XMB-API-002 | stale `expectedEditorVersion` 儲存 | 409 `BOM_DRAFT_EDITOR_VERSION_CONFLICT`，winner 不被覆寫 |
| XMB-API-003 | Floating 未歸位直接 submit／approve | 409 `BOM_FLOATING_TOPICS_UNRESOLVED`，review/release 零 effect |
| XMB-API-004 | Floating 歸位後儲存、送審、核准 | lifecycle 成功；Released Snapshot／export 無 floating schema 或內容 |
| XMB-API-005 | Manufacturing／Procurement PATCH | 403；lines、floating、version 與 audit 零非預期變更 |
| XMB-API-006 | cycle、orphan、cross-draft parent、depth > 10、非有限座標 | 4xx 人類可理解錯誤，transaction rollback |
| XMB-API-007 | feature flag 關閉的 legacy PATCH | floating=0 時保持 backward compatibility；不得丟失既有資料 |

PostgreSQL migration `035_bom_draft_floating_topics.sql`、SQLite schema、bootstrap 與型別必須一致；`parent_line_id = null` 不得被重用為 Floating Topic。

## 5. Gate 2：XMind 肌肉記憶與語意歷史

- 固定 52px toolbar，DOM/視覺順序：復原、重做、主題、子主題、插入、折疊、只看分支、儲存、明細、更多。
- `Enter` 同層、`Tab` 子層、`Ctrl+Enter` 父層、空白雙擊 Floating、`Space`／節點雙擊編輯。
- `Alt+Up/Down` 排序；`Ctrl+Delete` 只刪節點並提升子件；`Delete` 整枝確認；`Ctrl+Z`、`Ctrl+Shift+Z`／`Ctrl+Y` 是單一 semantic atom。
- `Ctrl+/` 折疊、`Ctrl+Alt+/` 全部折疊／展開、`Ctrl+;` 只看分支、`Esc` 退出暫態、`Ctrl+S` 儲存、`Home` 選 root。
- input、textarea、select、contenteditable、picker、drawer、modal focus 時不得攔截 mutation shortcut；`Ctrl+R` 與 browser `Ctrl +/-` 保留原生行為。
- semantic history 上限 100；formal↔floating 整棵 subtree 轉換與 Undo/Redo 不遺失 id、排序或後代。

## 6. Gate 3：空間 UI、拖放與狀態可見性

- Hover `+`、右鍵 menu 固定順序、右上明細、右側 inspector、右下 Map／Outliner 與 zoom controls 均可到達。
- before／child／after 三區在放開前以位置、形狀與短標籤辨識；invalid drop 不改資料。
- Floating stage 以虛線和 `未納入 BOM` 顯示；Map 與 Outliner 共用 selection、collapse、focus、dirty 與 graph state。
- branch-only 左上固定 `顯示完整內容`，退出後回原分支；刪除確認明示整枝影響與 `Ctrl+Z` 恢復方式。
- unresolved Floating 與 stale 409 使用 persistent recovery state，不只用短暫 toast。

## 7. Gate 4：Viewport、Accessibility 與可見雜訊

Browser matrix：`1440×900`、`1024×768`、`768×1024`、`390×844`。

- `1440/1024` Map 首屏可在 5 秒內辨識正式 BOM 與未納入區；`390` 預設 Outliner。
- 各 viewport 無水平 overflow、控制重疊、不可達 CTA、被 inspector 遮蔽的主內容。
- focus 可見、icon 有可及名稱；狀態與 drop zone 不只靠顏色。
- console error=0、非預期 4xx/5xx=0；錯誤文案不得洩漏 SQL、stack、table 或 secret。

## 8. Gate 5：證據與必要畫面

Evidence root：`output/qa/dev-071-xmind-bom-editor/<runId>/`。至少保留：

- 1440 toolbar + Map、Outliner、Floating stage、unresolved submit blocker。
- before／child／after 三個 drop preview。
- branch-only + `顯示完整內容`、右側 inspector／明細、delete confirm。
- stale version conflict recovery。
- 1024×768、768×1024、390×844 viewport。
- `manifest.json`，含 console/network、viewport、P0/P1、production boundary 與 cleanup 結果。

## 9. 最低執行命令

- focused TypeScript + affected diff check
- `npm run qc:dev-071-contract`
- `npm run qc:dev-071-api`
- `npm run qc:dev-071-browser`
- `npm run qc:bom-workbench-migration-path`
- PostgreSQL schema/shadow contract（若本機依賴可用）
- dev-task／documentation evidence synchronization checks

## 10. PASS／Stop Conditions

只有 XMB-001..016 全部有對應證據、P0/P1=0、四 viewport 通過、console/network 無非預期錯誤、cleanup removed、production connection/write 均為 false，才能標記 Local RD/QA/QC Complete。

遇到以下任一狀況立即停止 QC 並退回 RD：Floating 進入 Released data、stale save 覆寫 winner、API 可繞過權限或 unresolved gate、cycle/orphan 被接受、需要 production mutation 才能驗證，或真實 UI 無法復原可能造成資料破壞的操作。

## 11. 執行結果

結論：`PASS`。本機授權範圍內 P0=0、P1=0；XMB-001～016 具有自動化、API／DB readback 或真實瀏覽器證據。

| 驗證面 | 結果 | 證據 |
|---|---:|---|
| TypeScript | PASS | `npm run typecheck:app` |
| XMind／editor contract | 18/18 | `npm run qc:dev-071-contract` |
| 雙 graph API、權限、並行、review/release gate | 16/16 | `npm run qc:dev-071-api` |
| BOM migration path | 21/21 | `npm run qc:bom-workbench-migration-path` |
| PostgreSQL schema shadow／target guard | 27/27 | `npm run qc:postgres-shadow` |
| Affected ESLint | 0 errors、1 dependency warning | `bom-xmind-editor.tsx`／shortcut hook focused lint；warning 不改變 runtime 行為 |
| Browser matrix | 36/36 | 1440×900、1024×768、768×1024、390×844 |
| Browser diagnostics | PASS | console error 0；非預期 4xx/5xx 0；預期 stale PATCH 409 共 1 |

Browser evidence root：`output/qa/dev-071-xmind-bom-editor/20260813102707/`。共保留 13 張畫面，涵蓋 toolbar/Map、Floating stage、unresolved blocker、Outliner、branch recovery、delete confirm、before/child/after drop preview、stale conflict，以及三個較小 viewport。抽查 `01`、`02`、`08`、`10`、`13` 的視覺階層、可見狀態與 viewport 邊界均符合規格。

執行邊界：`productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`。本輪未連線 live PostgreSQL；PostgreSQL 結論限於 disposable schema shadow 與 fail-closed target guard，不宣稱 production migration 已通過。未執行正式資料寫入、flag activation、stage/commit/merge/PR/deploy/release。
