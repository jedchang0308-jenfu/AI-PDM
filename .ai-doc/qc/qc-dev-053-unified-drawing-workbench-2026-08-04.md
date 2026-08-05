# QC Report：DEV-053 單一圖號工作台

Status: `Independent QC Pending / RD and AI QA Evidence Frozen / Production Release Gated`
Date: 2026-08-05
Branch: `持續優化1`
Scope: DEV-053 Phase 1A、1C與1E local implementation；未連線、遷移、部署或修改 production。

## 1. Pending Verdict

RD 實作與 AI QA 證據已凍結，等待獨立 QC 依規格、程式差異、focused regression 與真實瀏覽器 evidence 重新判定。QC 不得修改產品程式後自行判定通過。

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
| isolated production build | Baseline exception / Independent QC must classify | 乾淨DEV-053 staged worktree完成Webpack product compile，後續Next page contract被既有`src/app/settings/page.tsx`命名匯出`SettingsScreen`阻擋；該檔在基線HEAD已有同一問題，且未納入DEV-053 |

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

## 6. Independent QC Checklist

- [ ] 重新檢查SPEC/ADR/QA與DEV-053 diff一致性。
- [ ] 重跑focused contract、TypeScript、lint與必要build證據。
- [ ] 檢查server-side projection無client list拼接、bulk hydration無N+1、read path zero-write。
- [ ] 檢查舊reserved URL、existing reservation、contextual append與direct-master closure。
- [ ] 檢查formalization transaction的source relation與asset ownership轉移全有或全無。
- [ ] 逐項檢查CAP-01～14、formal drawer正式附件可見且沒有受控檔案mutation controls。
- [ ] 確認default-off、production allowlist closed、zero backfill及production false evidence。
- [ ] 在凍結SHA的乾淨worktree重跑isolated build，確認並分類既有`SettingsScreen` page export基線exception；不得沿用混合工作區產物。
- [ ] 確認DEV-053 commit不含DEV-054的DVT刪檔、023/024 migration、專案狀態移除hunk或其文件。
- [ ] 輸出獨立PASS/FAIL、P0/P1/P2與剩餘release gate。

## 7. Known External Workspace Exception

工作區另有DEV-054的並行變更。既有`qc:pdm-numbering-core` checker仍嘗試讀取DEV-054已退役的 `src/app/api/numbering/dvt-candidates/route.ts`，因此在未提交混合工作區會出現ENOENT；這是DEV-054 checker同步邊界，不是DEV-053產品路徑失敗。RD已另外建立只含DEV-053 staged tree的乾淨worktree，TypeScript、focused 50/50與真實Chromium 27/27通過；獨立QC仍須以最終DEV-053 commit判定，且不得把DEV-054檔案納入DEV-053 commit。
