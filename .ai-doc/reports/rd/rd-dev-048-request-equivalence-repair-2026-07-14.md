# RD-DEV-048：領號申請等價修復報告

日期：2026-07-14  
狀態：`RD Implemented / Focused QC Passed`  
範圍：DEV-048 post-completion regression repair；恢復 048 前領號申請在「建立草稿」slice 中應保留的使用者規則與稽核欄位。不含 deployment、release、live Cloud SQL/Supabase migration apply 或正式資料修復。

## 1. 修復內容

- 建立草稿 modal 保留四種模式：新主根、既有主根加圖號、既有主根加料號、既有主根加圖號與料號。
- 既有主根追加改回使用者可理解的「正式主根號」輸入，再由 `/append-policy` 轉成 server `sourceRootId`，避免 UI 要求輸入內部 ID。
- 新主根建立恢復 `/api/numbering/duplicate-check` 查重提示；blocker 阻擋送出，warning 顯示需人工確認。
- 料號品名由主根名稱或既有主根 `coreName` 鎖定，不允許在料號層另行改名。
- 正式主根追加新增 `appendReason`，Active/Released/MainDrawingInvalid 主根必填，寫入 workspace、事件與 audit detail。
- 共用件/跨專案共用恢復 `universalReason` 必填，草稿與正式發布後都保留此欄位。
- 圖料關聯規則恢復防呆：只有 M/MA 圖號可建立 `primary_manufacturing`；R/OT 等非製造用途只能是 reference。
- 建立後維持兩段式流程：先儲存草稿，使用者再次確認後才取得候選號；modal 顯示關閉不寫入資料。

## 2. 主要檔案

- `src/components/number-state-workspace.tsx`
- `src/lib/number-state-flow.ts`
- `src/lib/repositories/number-state-flow-async-repository.ts`
- `db/schema.sql`
- `db/postgres/001_initial_schema.sql`
- `db/postgres/012_number_state_flow_phase1a.sql`
- `db/postgres/019_number_state_flow_request_equivalence.sql`
- `supabase/migrations/20260714020000_number_state_flow_request_equivalence.sql`
- `scripts/qc-pdm-number-state-flow-request-equivalence.mjs`

## 3. 本機驗證

| 驗證 | 結果 |
|---|---|
| `npx.cmd tsc --noEmit --pretty false` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd run qc:pdm-number-state-flow-request-equivalence` | PASS 6/6 |
| `npm.cmd run qc:supabase-runtime-migrations` | PASS 63/63 |
| `npm.cmd run qc:pdm-number-state-flow-contract` | PASS 19/19 |
| `npm.cmd run qc:pdm-number-state-flow-runtime` | PASS 7/7 |
| `npm.cmd run qc:pdm-number-state-flow-http` | PASS 21/21 |
| `npm.cmd run qc:pdm-number-state-flow-ui` | PASS 7/7 after restoring no-write close hint |
| `npm.cmd run qc:pdm-number-state-flow-phase1b` | PASS 14/14 |
| `npm.cmd run qc:pdm-numbering-core` | PASS 241/241 |
| `PDM_NUMBER_STATE_FLOW_V1=true` local browser smoke on `localhost:3000` | PASS；desktop new-root、desktop append-part、mobile new-root screenshots |
| `GET /api/auth/me` after account session schema fix | PASS 200 |

## 4. 未完成或未計入

- 未做 production deploy、staging smoke、正式 Supabase/Cloud SQL migration apply 或資料修復。
- 2026-07-14 依使用者授權重啟 3000，已用 `PDM_NUMBER_STATE_FLOW_V1=true` 與 `PDM_PRODUCTION_SLICE_MODE=official-numbering-draft` 完成實際 browser smoke。
- 重啟 smoke 時發現 `account-session-registry` 已被登入路徑使用但缺 `account_session_records` schema；已補 SQLite/PostgreSQL/Supabase additive migration 020，避免 `/api/auth/me` 500。
- Browser smoke 使用本機 active Admin session cookie 驗證畫面，不代表 staging/production login provider smoke。

## 5. RD 判定

領號申請等價修復已在 local code、migration mirror 與 flag-on local browser 層完成，並以 focused QC 防止 append reason、universal reason、主根號追加、查重、品名鎖定與製造圖關聯規則再次消失。正式上線前仍需在 staging/production target 依 release gate 重跑 provider smoke。
