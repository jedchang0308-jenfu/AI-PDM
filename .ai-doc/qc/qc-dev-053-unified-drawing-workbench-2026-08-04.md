# QC Report：DEV-053 單一圖號工作台

Status: `Independent Local QC Passed / P0=0 P1=0 P2=0 / Production Release Gated`
Date: 2026-08-05
Branch: `持續優化1`
Scope: DEV-053 Phase 1A、1C與1E local implementation；未連線、遷移、部署或修改 production。

## 1. Final Verdict

獨立QC對凍結commit `6ddd5759e22178b7004e5d5a9927b0dfbe11b706`判定`PASS`；P0=0、P1=0、P2=0。QC在乾淨detached worktree驗證，未修改產品、文件或正式資料。

## 2. Frozen RD/QA Evidence

| Command / check | RD/QA result | Evidence |
|---|---:|---|
| DEV-053 schema | 9/9 | nullable source context、additive/idempotent migration、zero backfill、provider parity、default-off flag |
| DEV-053 read model | 8/8 | stable disjoint row identities、server stage/action、bounded keyset、formal filters、same-root detail、zero-write、permission fail-closed |
| DEV-053 HTTP | 10/10 | GET-only BFF、permission/tenant、private no-store、query validation、bounded hydration、production allowlist closed |
| DEV-053 UI | 16/16 | 無雙頁籤、四欄決策表、舊URL正規化、單一primary CTA、CAP-01～14、production-slice visible-disabled、responsive |
| DEV-053 flow | 7/7 | source context、relationship-only append、fault rollback、retry exactly once、跨公司拒絕 |
| AI real operation | 27/27 | 真實Chromium、CAP-01～14、四viewport、file chooser、送審/撤回/再送審、reviewer核准、自動正式化、正式附件readback、reload冪等 |
| TypeScript | PASS | 全`src` 0 error；排除混合工作區既有`.next-*`產物 |
| scoped lint | PASS | 0 error；`master-attachment-panel.tsx`保留3個既有warning |
| isolated production build | PASS | 獨立QC以短路徑、`npm ci`、乾淨detached worktree執行`npm run build:isolated`，compile、TypeScript與static pages完整exit 0 |

## 3. AI Real-operation Evidence

- Run：`DEV053-20260805-033336-local-isolated`
- Frozen product snapshot：temporary clean-index commit `167199c6b13615d3b134009abb3ae4b87c73418d`；source hash `35868f50b3ca1451ed36757cdd80bac8357d280f6fb131582b9790863c668f8e`
- Root：`output/playwright/dev053-real-operation/DEV053-20260805-033336-local-isolated/`
- Environment：isolated local SQLite + isolated Next.js + real Chromium UI
- Safety：`productionConnected=false`、`productionWrites=false`、cleanup=`removed`
- Browser：console errors 0、failed 5xx responses 0
- Responsive：1440×900、1280×800、1024×768、390×844；document/main無水平overflow，mobile切換card layout。
- Lifecycle：既有reservation在原流程往前；candidate建立後正式master仍為0；真實檔案上傳後送審、撤回、再送審；reviewer核准後原子正式化；重複reload後business hashes不變。
- Capability：正式drawer恢復CAP-01～14，包含版次、送審、關係、影響、作廢、治理、同根料號、主資料、成本、主要圖與受控檔案摘要；`圖面進版`只有一個主控制。
- File authority：正式化後master drawer可見正式版`0.1`與1個受控檔案，upload/delete controls均為0。

## 4. QA Defects Closed Before QC Freeze

QA 視覺判讀曾發現 package file 建立後，底層 `file_assets` 仍指向 candidate revision，造成正式 master drawer讀不到附件。RD 修正 formalization transaction：

1. 驗證 asset 仍屬於該 candidate、未刪除；不符即 `APPROVAL_SNAPSHOT_STALE` 並rollback。
2. 同一 transaction 將 asset ownership 改為正式 `drawing_number`。
3. 再建立 package file reference。
4. 真實 UI 重新驗證檔名可見、master drawer唯讀與reload冪等。

Phase 1E另關閉兩項視覺缺口：formal drawer主CTA寬度在窄drawer被過度撐滿；revision入口同時出現在primary與secondary造成重複。修正後最新截圖確認主CTA可讀且`圖面進版`只出現一次，UI focused case `DEV053-UI-016`與真實操作均通過。

## 5. Existing-data and Production Boundary

- Migration只新增 `numbering_draft_workspaces.source_drawing_number_id`、`source_part_number_id`、`source_link_type` 三個nullable欄位與constraints/indexes；沒有business DML或backfill。
- 舊 rows 維持 NULL；純讀、搜尋、filter、drawer與舊URL不建立workspace、candidate、audit、receipt、outbox或sequence facts。
- `PDM_UNIFIED_DRAWING_WORKBENCH_V1`預設 off，且依賴DEV-052 lifecycle V2；production mutation allowlist未開放。
- 本報告與本次commit不授權production migration、feature activation、deploy、release或production smoke。

## 6. Independent QC Checklist and Result

- [x] 重新檢查SPEC/ADR/QA與DEV-053 diff一致性。
- [x] focused contracts 50/50、TypeScript、scoped lint與isolated build全部通過。
- [x] server-side projection、bounded hydration、read path zero-write通過。
- [x] 舊reserved URL、existing reservation、contextual append與direct-master closure通過。
- [x] formalization transaction的source relation與asset ownership轉移全有或全無。
- [x] CAP-01～14、formal drawer正式附件唯讀與無mutation controls通過。
- [x] default-off、production allowlist closed、zero backfill及production false evidence通過。
- [x] 凍結commit的`npm run build:isolated`完整exit 0；RD junction環境異常不可重現，非產品缺陷。
- [x] DEV-053 commit不含DEV-054的DVT刪檔、023/024 migration、專案狀態移除hunk或其文件。
- [x] 最終判定PASS；P0=0、P1=0、P2=0。

## 7. Independent Real-operation Evidence

- Frozen commit：`6ddd5759e22178b7004e5d5a9927b0dfbe11b706`
- Run：`DEV053-20260805-035048-local-isolated`
- Root：`output/playwright/dev053-real-operation/DEV053-20260805-035048-local-isolated/`
- Result：27/27 passed、failed 0、14 screenshots；1440×900、1280×720、1024×768、390×844。
- Coverage：舊`?tab=reserved`、既有保留號原地推進、建立與關聯、真實file chooser上傳、送審／撤回／再送審、reviewer核准、原子正式化、正式受控檔唯讀與reload冪等。
- Safety：`productionConnected=false`、`productionWrites=false`、cleanupStatus=`removed`；browserErrors=0、failedResponses=0、visibleErrors=0。
- Environment：前兩次runner失敗來自Windows長路徑與Turbopack拒絕跨根`node_modules` junction；使用真正短路徑clean detached worktree + `npm ci`後完整通過，未修改產品。

## 8. Protected Parallel-work Boundary

工作區另有DEV-054的並行變更。DEV-053 commit已由RD與獨立QC確認未包含DEV-054、DVT/phase-gate刪檔、023/024 migrations、project-status-removal程式或文件。DEV-054仍保留在主工作區的未暫存範圍，未被DEV-053修改、還原或提交。

## 9. Remaining Release Gate

DEV-053 implementation/QC gate已通過，但本報告不授權production migration、feature activation、deploy、release或production smoke；若要進正式環境，仍須取得明確指令並執行deployment release gate、backup/rollback與post-deploy smoke。
