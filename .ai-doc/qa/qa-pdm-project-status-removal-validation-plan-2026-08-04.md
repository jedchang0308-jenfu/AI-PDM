# QA-PDM-PROJECT-STATUS-REMOVAL-001：專案狀態移除驗證計畫

狀態：QA Passed / Local Only / Production Release Gated  
對應：`DEV-054` / `SPEC-PDM-PROJECT-STATUS-BOUNDARY-001`

## 驗證範圍

- schema/migration、SQLite compatibility、repository/API、approval rule、permission、UI/status vocabulary。
- research/technical transfer、release、revision/change-control regression。
- 歷史 audit 保留與 runtime zero-dependency 邊界。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| UI 移除但 DB/規則仍依賴 phase | 只做表面刪除 | 雙重真相仍存在 | deterministic source/schema scanner | P0 | active runtime零依賴 gate |
| release 不再同步 master status | phase 與 status 一起誤刪 | 正式資料仍顯示未發布 | release focused QC + DB diff | P0 | assert record_status Released |
| 技轉資料完整性被放寬 | DVT gate直接刪除 | 不完整資料進技轉 | submission-gate regression | P0 | technical_transfer required fields fail closed |
| SQLite rebuild 遺失 ID/關係 | table copy欄位不完整 | 圖料關係或追溯中斷 | representative migration fixture | P0 | before/after row and FK counts |
| 舊 DVT 權限/動作仍可新建 | seed/runtime cleanup不完整 | 使用者仍看見舊流程 | permission/action scanner + API negative | P1 | action disabled、route retired |
| ECR change control被誤刪 | 把字串ECR全域清除 | 設計變更流程中斷 | ECR/ECO/ECN regression | P1 | change kind保留測試 |
| UI 欄位移除後破版 | 表頭與cell不同步 | 表格錯位或難讀 | 1440/1024/390 browser smoke | P1 | screenshot、overflow、visible error sweep |
| PLM phase-gate 以同義功能殘留 | absence gate 只掃 EVT/DVT/PVT | PDM 仍實質管制專案階段並阻擋核准 | semantic scanner + route/schema/UI/API negative | P0 | 移除全鏈路並驗證 approval 不再回 phase_gate_required |
| 變更管制被列為第三品質階段 | 資訊模型混用 workflow 與 quality stage | 使用者仍看到多重狀態軸 | rendered lifecycle + type/source assertion | P1 | 品質階段限兩值，change-control 獨立標示 |
| 舊註冊測試仍依賴已刪功能 | 測試未隨產品退役 | 回歸閘門失真或直接 ENOENT | 執行 package registered suites | P1 | 移除 positive fixture、保留 negative absence coverage |
| disabled DVT action 由 catalog 洩漏 | list query 未過濾 enabled | 正常 API 仍暴露退役資訊 | authenticated catalog API + repository SQL | P1 | 正常 catalog 只回 enabled，歷史 row 不刪 |

## 必要測試

1. Fresh SQLite schema與existing-schema rebuild均無`development_phase`、`approval_rules.phase`、`EVTDisabled`。
2. PostgreSQL source migration與Supabase mirror parity；migration history不可改寫。
3. `/parts`、`/numbering/drawings`、`/numbering/search` API payload沒有`developmentPhase`。
4. DVT page/API、DVT permissions與new approval actions不存在或停用。
5. release workflow仍將root/part/drawing的`record_status`同步為`Released`，terminal status保持保護。
6. `research`可單件送審；`technical_transfer`單件送審仍fail closed並導向package。
7. ECR/ECO/ECN change request仍可建立/解析。
8. 代表性UI在1440、1024、390無開發階段文字、無visible error、無水平overflow。
9. `phase_gate_checks` 不存在於 current schema/runtime，phase-gate routes 不存在，正常核准不再回 `phase_gate_required`。
10. 正常 action catalog 不回傳 disabled DVT action；歷史 action/audit/migration evidence 仍存在。
11. sidebar 不使用「專案 / 圖料」；lifecycle 品質階段只呈現研發階段／技術移轉，變更管制作獨立控制流程。
12. `qc:pdm-numbering-core` 與其他本次命中的 package registered regression 不再讀取已刪 DVT route/column，並能完成執行。

## QC 指令

- `npm run qc:dev-054:project-status-removal`
- `npm run qc:pdm-submission-gate-phase1`
- `npm run qc:pdm-release-master-status-sync`
- `npm run qc:pdm-change-control`
- `npm run qc:supabase-runtime-migrations`
- `npx tsc --noEmit --pretty false`
- scoped lint；通過後才跑 isolated production build。

UI QC 必須保存 route、viewport、操作、截圖、visible-error sweep、overflow量測與console/network failure摘要；缺一則判定未充分驗證。

### Route 退役判讀準則

- 正式 slice 的全域 middleware 可能把未知 mutation 遮罩成 403，或將 closed page 改寫成共用頁；此結果不能單獨證明 route 存在或不存在。
- R02/R09 的 route 退役驗收以 slice-disabled 隔離 router 的直接 404、isolated build manifest 不含 route，以及 active source absence 三者交叉判定。

## 2026-08-05 Reopen

- 2026-08-04 的 exact-token absence 結果不足以證明語意功能移除；QA 已以 active PLM phase-gate、第三品質階段與舊註冊測試失敗重新開啟 DEV-054。
- 新結果必須由 RD 凍結後的獨立 QC 重新產生；舊 PASS 不得直接沿用。

## 2026-08-05 修正後獨立重驗

- R01～R12：全部 PASS；沒有 waiver 或待修 P0/P1/P2。
- active schema/runtime/API/UI/approval 已無 PLM phase-gate；品質階段為兩值，變更管制為獨立維度；正常 action catalog 不洩漏 disabled DVT action。
- 隔離 router 直接驗證舊 phase-gate GET/POST/PATCH、DVT candidates 與 `/numbering/dvt` 全部 404；isolated build manifest 亦無上述 routes。
- 專項 QC 10/10、隔離全 API 396/396、approval platform 125/125、access control 245/245、DB repository split 129/129、numbering core 232/232、submission gate 15/15、transfer package 18/18、release sync 31/31、change control 62/62、status scope 83/83、Supabase runtime migration 72/72 全數通過。
- TypeScript、全專案 lint 與 122-route isolated production build 通過。
- 瀏覽器 R12：3 種 viewport × 5 個代表性 routes，共 15/15；console、failed request/response、visible error 與非預期水平 overflow 均為 0。證據：`output/playwright/dev-054-project-status-removal/evidence.md`。
- 未連線或修改 live Supabase、Cloud SQL、production data；未 deploy 或 release。

## 舊結果（已被 reopen 取代）

- 專項 absence、SQLite compatibility、fresh schema、migration mirror與歷史 action evidence：通過。
- technical-transfer gate 15/15、change control 62/62、release master status sync 31/31、migration mirror 69/69：通過。
- 狀態詞彙 89/89；8 routes × 5 viewports 瀏覽器 QC 40/40，browser error為0：通過。
- TypeScript、全專案 lint、122頁隔離 production build：通過。
- 未執行 live Supabase/Cloud SQL migration、production data rewrite、deploy或release。
