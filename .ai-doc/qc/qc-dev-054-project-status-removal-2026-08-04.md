# QC-DEV-054：PDM 專案狀態權威移除

狀態：PASS（2026-08-05 獨立重驗）/ Local Only / Production Release Gated  
日期：2026-08-04；重驗：2026-08-05  
對應：`DEV-054`、`SPEC-PDM-PROJECT-STATUS-BOUNDARY-001`

## 歷史退回結論

> 2026-08-05 QA 重新盤點後，發現 active PLM phase-gate schema/API/UI/approval blocker、第三品質階段語意與舊註冊測試殘留。本報告的 PASS 僅代表舊 exact-token 驗證結果，已不可作為 DEV-054 完成證據；待 RD 修正後於本報告追加獨立重驗結果。

## 2026-08-05 獨立重驗結論

RD 已完成退回項目，QA/QC 重新依語意型 absence、隔離 router、build manifest、registered regression 與真實瀏覽器證據驗收。R01～R12 全部 PASS，P0/P1/P2 為 0；DEV-054 本機產品範圍完成，正式 migration/deploy/release 仍受 release gate 管制。

AI PDM 的 active schema、runtime、API、權限、核准規則與 UI 已不再管理或顯示專案狀態。專案管理軟體是專案狀態唯一權威；PDM 保留研發／技術移轉、資料審核、發布、版次及 ECR/ECO/ECN 設計變更權威。

## 變更證據

- fresh SQLite schema移除三張master table的`development_phase`、`approval_rules.phase`及`EVTDisabled`。
- legacy SQLite compatibility rebuild保留stable ID、關聯與稽核，並將舊停用狀態映射為`Obsolete`。
- DVT page、API、permission、promotion action及phase-based approval rule退出正常流程。
- PostgreSQL source migration：`db/postgres/023_remove_project_status_authority.sql`。
- Supabase mirror：`supabase/migrations/20260804030000_remove_project_status_authority.sql`；未套用至live target。
- PLM phase-gate forward removal：`db/postgres/024_remove_submission_phase_gate.sql` 與 `supabase/migrations/20260805010000_remove_submission_phase_gate.sql`；未套用至 live target。
- 圖號工作台以「工作狀態」描述PDM資料工作，不再使用「目前階段」造成專案階段混淆。
- 品質階段僅保留「研發階段／技術移轉」；「變更管制」保留為獨立 control dimension。
- sidebar 已改為「圖料管理」，DVT 晉升入口退役；390px 行動導覽可完整展開，1024px finder 無水平 overflow。

## 驗證結果

| 驗證 | 結果 |
|---|---|
| `npm run qc:dev-054:project-status-removal` | 10/10 |
| 隔離 `npm run qc:api` | 396/396；舊 phase-gate API 404、退役 generic POST 410 |
| `npm run qc:pdm-approval-platform` | 125/125 |
| `npm run qc:pdm-access-control-async` | 245/245 |
| `npm run qc:pdm-db-repository-split` | 129/129 |
| `npm run qc:pdm-numbering-core` | 232/232 |
| 隔離 numbering API regression | 27/27 |
| `npm run qc:pdm-numbering-qc-isolation` | 40/40 |
| `npm run qc:pdm-submission-gate-phase1` | 15/15 |
| `npm run qc:pdm-technical-transfer-package` | 18/18 |
| `npm run qc:pdm-change-control` | 62/62 |
| `npm run qc:pdm-release-master-status-sync` | 31/31 |
| `npm run qc:supabase-runtime-migrations` | 72/72 |
| `npm run qc:pdm-status-scope-browser` | 83/83 |
| `npm run typecheck` | PASS |
| `npm run lint -- --quiet` | PASS |
| `npm run build:isolated` | PASS，122 routes；manifest 無退役 routes |
| 瀏覽器 R12 | 15/15；3 viewports × 5 routes；browser error/overflow 0 |

瀏覽器證據保存於 `output/playwright/dev-054-project-status-removal/evidence.md`。正式 slice 的全域 403/改寫只代表 perimeter policy，不能作為 route 存在證據；退役判定採 slice-disabled 隔離 router 404、manifest absence 與 active source absence 的交叉證據。

## Release boundary

本次沒有連線或修改正式Supabase、Cloud SQL或production資料，沒有deploy/release，也沒有刪除不可變audit、歷史migration或既有QC evidence。正式環境採用`023/024` migrations前，仍須依release gate完成target identity、backup、rollback及post-migration smoke。
