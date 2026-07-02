# PM 開發計畫：SW License 與 PDM 公司歸屬分離

日期：2026-06-18  
Owner：PM-dev  
關聯 DEV：`DEV-SW-LICENSE-PDM-001`  
節點類型：交付點  
狀態：Implemented / Git boundary closed locally
是否計入產品交付完成：是，已完成 RD/QC，且後續已建立 scoped local commit boundary

2026-06-29 PM consistency note: this plan originally recorded Git boundary as deferred. That status was superseded on 2026-06-19 after user-authorized index handling: Supabase staging evidence was committed separately as `be333eb`, then the scoped `DEV-SW-LICENSE-PDM-001` boundary was committed as `6f4dbab`.

## 1. 交付目標

建立 AI_PDM 的 PDM 公司資料邊界，讓系統可支援鉦富與久方資料歸屬，同時採用 `operational_shared` 策略，避免使用者因 PDM 公司切換而頻繁切換 SW license。

完成後應達到:

- Admin 可選擇鉦富或久方作為 PDM 目標公司。
- 一般員工只能操作自己所屬 PDM 公司。
- SW license profile 不阻擋 PDM 公司資料寫入。
- 既有資料預設歸屬鉦富。
- Secret 邊界不被破壞。

## 2. 原始需求邊界

本交付點來源為使用者確認:

- 技術上允許用久方 license 操作鉦富圖檔，再用 PDM Admin 上傳到鉦富 PDM。
- 不考慮稽核問題。
- 不希望因 SW 序號切換限制而頻繁切換。
- 使用 `hcs` 引導後確認:
  - 文件範圍為完整開發包。
  - 策略採 `operational_shared`。
  - 首版做到 PDM 公司隔離、使用者公司權限、Admin 目標公司選擇；Document Manager extractor profile resolver 列第二階段。

不在本交付點內:

- 法務或商務授權判斷。
- 自動切換 SW license。
- SW license key 儲存到 DB / repo / add-in。
- Supabase production cutover。

## 3. 交付拆解

| 階段 | 類型 | 內容 | 主要驗收 |
|---|---|---|---|
| Phase 1 | RD | 公司資料模型與 migration | `companies` / memberships 建立，既有資料歸 `JENFU` |
| Phase 2 | RD | Auth 與 company context | `/api/auth/me`、token API 回傳可操作公司 |
| Phase 3 | RD | PDM API company scope | 上傳、查詢、下載、BOM、numbering 套用公司過濾 |
| Phase 4 | RD | Web / Add-in company selection | Admin 可選 PDM 公司，一般員工自動套用 |
| Phase 5 | QA/QC | 權限、資料隔離、secret boundary 驗證 | 跨公司拒絕、Admin 成功、secret 不外洩 |

## 4. RD 執行計畫

- 新增 company domain helper，例如 `resolvePdmCompanyContext(user, requestedCompanyCode)`。
- 擴充 `DbUser` / async user repository / bootstrap user parser，支援 company memberships。
- 新增或調整 DB schema:
  - `companies`
  - `user_company_memberships`
  - `sw_license_profiles` metadata table
  - 核心 PDM tables 的 `company_id`
- 更新 submission、item、numbering、file download、BOM、attachment 等 repository 查詢，避免跨公司資料外洩。
- 更新 Web upload 與 settings / auth flow，讓 Admin 可選 PDM 目標公司。
- 更新 SW Add-in DTO:
  - `UserDto` 或 token response 加入可操作公司。
  - Submission payload 加入 `pdm_company_code`。
  - UI 顯示 PDM 目標公司。
- 新增 `sw_license_policy` system setting，首版預設 `operational_shared`。

## 5. QA 驗證計畫

使用者流程:

- Admin 使用目前啟用 SW license，上傳鉦富資料到鉦富 PDM。
- Admin 上傳久方資料到久方 PDM。
- 鉦富員工登入後只能上傳/查詢鉦富資料。
- 久方員工登入後只能上傳/查詢久方資料。

邊界情境:

- 一般員工傳入非所屬 `pdm_company_code` 回 403。
- 未傳 `pdm_company_code`:
  - 單公司使用者自動套用預設公司。
  - 多公司 Admin 回 400 或要求選擇公司。
- 同圖號/料號在不同公司可並存。
- 檔案下載不可跨公司用 submission/file id 猜測存取。

FMEA 風險:

- Migration 漏補 table `company_id` 導致跨公司查詢。
- Unique index 未納入 `company_id` 導致鉦富/久方圖號互相衝突。
- Add-in 舊版未傳公司時造成 Admin 上傳公司不明。
- Log 或 QC output 誤印 SW license key。

## 6. QC 驗證計畫

預期新增 QC script:

- `scripts/qc-sw-license-pdm-company-scope.mjs`
  - 驗證 schema、membership、API company filter、跨公司 403。
- `scripts/qc-sw-license-operational-shared.mjs`
  - 驗證 `operational_shared` 不因 license/company 不一致阻擋 PDM 寫入。
- `scripts/qc-sw-license-secret-boundary.mjs`
  - 掃描 source、env example、log/report fixture，確認不保存 license key value。
- `scripts/qc-sw-addin-company-selection.mjs`
  - 靜態驗證 add-in DTO 與 submission payload 包含 PDM company code，且未新增 license key setting。

必要回歸:

- `npm.cmd run qc:managed-auth`
- `npm.cmd run qc:api`
- `npm.cmd run qc:sw-addin-source`
- `npm.cmd run qc:native-cad-extractor-contract`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`

## 7. 驗收標準

- `DEV-SW-LICENSE-PDM-001` 的 SPEC、ADR、PM plan 已建立並連回 dev_task。
- Admin 可在不切 SW license 的前提下選擇 PDM 目標公司。
- 一般員工跨公司操作會被 server 拒絕。
- 主要 PDM read/write API 具備 company scope。
- 同一圖號/料號可依公司獨立存在。
- Secret boundary QC 通過，沒有 SW license key value 進入 repo、DB、log 或前端 response。

## 8. 已完成實作

- 公司資料模型與 membership：`companies`、`user_company_memberships`、`users.company_id`、核心 PDM table 的 `company_id`。
- Web / Add-in 公司選擇：`/api/auth/me` 回傳可操作公司，Web upload 與 SW Add-in submission/preflight 均傳遞 `pdm_company_code`。
- PDM read/write 邊界：submission、file download、release package、BOM/workbench、search、preflight 與 action routes 已套用 company context。
- Numbering 邊界：sequence、root、part、drawing、approval、import/export、monthly audit、DVT、impact、part detail、task、notification 均加入 company scope。
- Metadata adapter profile：依 PDM company 選擇 server-side extractor profile，回應只暴露 redacted profile status，不回傳 command/args 或 license secret。
- 資料唯一性：item、submission、numbering 相關唯一鍵已納入公司範圍，避免鉦富/久方圖號或料號互相衝突。

## 9. 已通過驗證

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:sw-license-pdm-company-scope`
- `npm.cmd run qc:sw-license-pdm-numbering-company-scope`
- `npm.cmd run qc:sw-license-pdm-metadata-adapter-profile`
- `npm.cmd run qc:sw-license-pdm-git-boundary`
- `npm.cmd run qc:sw-addin-company-selection`
- `npm.cmd run qc:native-cad-extractor-contract`

注意：`npm.cmd run build` 仍顯示既有 Turbopack NFT tracing warning，來源為既有 `next.config.mjs` / chat route；不是本交付點新增失敗。一次 `qc:native-cad-extractor-contract` 曾與 build 並行時被 `prebuild` 清除 `.next` 影響，單獨重跑已通過 14/14。

## 10. Git 邊界

Git boundary 已於 2026-06-19 關閉：

- Supabase staging evidence 先獨立提交為 `be333eb`。
- Scoped `DEV-SW-LICENSE-PDM-001` SW/PDM company boundary 後續提交為 `6f4dbab`。

本節下方 2026-06-18 的 deferred 判斷保留為歷史原因：當時 worktree 與 index 內已有大量非本任務變更，且 index 內已有 Supabase GATE-B staged 檔案。後續使用者已授權處理 index 並建立分組 commit，因此不得再把此交付點視為 Git boundary 未關閉。

## 11. 停止條件

以下情況需停下並回 PM / 使用者決策:

- 要改回 `strict_match` 或 `admin_override`。
- 要新增 Document Manager extractor profile resolver 為首版範圍。
- 要動 Supabase production target 或執行 production migration。
- 要把 SW license key 存 DB、存 add-in、或由前端管理。
- Migration 發現既有資料無法全數安全回填 `JENFU`。

## 12. 相關文件

- SPEC: `.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md`
- ADR: `.ai-doc/decisions/ADR-SW-LICENSE-PDM-001-operational-shared.md`
- PM control: `.ai-doc/dev_task.md`

## 13. 變更紀錄

- 2026-06-18: 建立 PM 開發計畫，採 `operational_shared`，首版範圍限定為 PDM 公司隔離與 Admin 目標公司選擇。
- 2026-06-18: 完成 RD/QC 實作，補記 Web/Add-in、PDM read/write、numbering、metadata adapter profile、task/notification company scope 與 Git boundary deferred 狀態。
- 2026-06-18: 新增並通過 `npm.cmd run qc:sw-license-pdm-git-boundary`，確認目前直接 commit 仍因 9 個 unrelated Supabase staged files 而應 deferred。
- 2026-06-19: 使用者授權處理既有 Supabase staged files、重整 index，先提交 Supabase staging evidence 為 `be333eb`，再提交 scoped SW/PDM company boundary 為 `6f4dbab`。
- 2026-06-29: PM consistency pass 將本文件狀態由歷史的 Git boundary deferred 更新為 Git boundary closed locally。
