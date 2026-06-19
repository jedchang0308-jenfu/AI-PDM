# PM Git Boundary Handoff: DEV-SW-LICENSE-PDM-001

日期：2026-06-18  
Owner：PM-dev  
關聯 DEV：`DEV-SW-LICENSE-PDM-001`  
狀態：Git boundary deferred

## 1. 目的

本文件記錄 SW license / PDM 公司隔離交付點的提交邊界。功能與 QC 已完成，但目前 repository 內已有大量非本任務 dirty worktree 與既有 staged 檔案，不能直接用 `git add .` 或一般 commit 收斂。

## 2. 已完成交付內容

- 採用 `operational_shared`：SW license profile 不作為 PDM 公司資料邊界。
- 以 PDM company membership 控制上傳、查詢、下載、BOM、numbering、task、notification、metadata adapter profile。
- Admin 可選 PDM 目標公司；一般員工只能操作所屬 PDM 公司。
- SW Add-in 與 Web upload 均傳遞 `pdm_company_code`。
- Server 端重新驗證 company context，不信任 client 傳入值。
- Metadata adapter profile 依 PDM company 選擇 server-side extractor env，API 只回 redacted profile status。

## 3. 驗證證據

已通過：

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:sw-license-pdm-company-scope`
- `npm.cmd run qc:sw-license-pdm-numbering-company-scope`
- `npm.cmd run qc:sw-license-pdm-metadata-adapter-profile`
- `npm.cmd run qc:sw-license-pdm-git-boundary`
- `npm.cmd run qc:sw-addin-company-selection`
- `npm.cmd run qc:native-cad-extractor-contract`

注意：一次 `qc:native-cad-extractor-contract` 曾與 build 並行時失敗，原因是 `prebuild` 清除 `.next`；單獨重跑已通過 14/14。`npm.cmd run build` 仍顯示既有 Turbopack NFT tracing warning，非本交付點新增失敗。

`npm.cmd run qc:sw-license-pdm-git-boundary` 已通過，結果確認目前偵測到 9 個 unrelated Supabase staged files，因此直接 commit 仍應 deferred，直到 index cleanup 或 PM 明確同意分組。此 QC 也會用 temporary clean index 模擬候選分組，目前 clean-index candidate files 為 16，且未包含 Supabase staged files。

## 4. 目前不能直接 commit 的原因

目前 index 已有非本任務 staged 檔案：

- `.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md`
- `.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md`
- `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`
- `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`
- `scripts/qc-supabase-gate-b-staging-validation.mjs`
- `scripts/qc-supabase-runtime-gate-plan.mjs`
- `scripts/qc-supabase-runtime-local-readiness.mjs`
- `scripts/qc-supabase-runtime-smoke-report.mjs`
- `scripts/qc-supabase-target-identity-receipt.mjs`

此外 worktree 內還有大量 storage、Supabase、legacy docs、file storage、UX lifecycle、cost review 等非本任務變更。若直接提交，會混入多個交付點，違反 PM-dev 的 Task Exit Commit Boundary。

## 5. 建議提交分組

### Group A: SW/PDM 公司隔離文件

- `.ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md`
- `.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md`
- `.ai-doc/decisions/ADR-SW-LICENSE-PDM-001-operational-shared.md`
- `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`
- `.ai-doc/documentation_map.md`
- `.ai-doc/dev_task.md`

`dev_task.md` 目前同時包含 Supabase GATE-B 既有狀態與 SW/PDM 最新狀態。提交前需確認 PM 是否允許把該檔作為共同控制板一起提交。

### Group B: SW/PDM 公司隔離 source

候選範圍：

- `db/schema.sql`
- `src/lib/company-context.ts`
- `src/lib/numbering-company-context.ts`
- `src/lib/metadata-adapter-profile.ts`
- `src/lib/db.ts`
- `src/lib/types.ts`
- `src/lib/validation.ts`
- `src/lib/cad-extraction.ts`
- `src/lib/pdm-metadata.ts`
- `src/lib/pdm-metadata-adapter.ts`
- `src/lib/repositories/user-repository.ts`
- `src/lib/repositories/item-repository.ts`
- `src/lib/repositories/submission-repository.ts`
- `src/lib/repositories/numbering-repository.ts`
- `src/lib/repositories/numbering-async-repository.ts`
- `src/lib/numbering-async.ts`
- `src/lib/numbering-permission-guard.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/auth/token/route.ts`
- `src/app/api/file-metadata/detect/route.ts`
- `src/app/api/submissions/**/route.ts`
- `src/app/api/search/route.ts`
- `src/app/api/bom/**/route.ts`
- `src/app/api/numbering/**/route.ts`
- `src/app/api/parts/**/route.ts`
- `src/app/upload/page.tsx`
- `sw-addin/Config/AddinSettings.cs`
- `sw-addin/Models/SubmissionResult.cs`
- `sw-addin/Services/ApiClient.cs`
- `sw-addin/Views/SubmissionWindow.xaml`
- `sw-addin/Views/SubmissionWindow.xaml.cs`

提交前需用 `git diff -- <path>` 逐檔確認同一檔內沒有其他交付點的混入變更。

### Group C: SW/PDM 公司隔離 QC

- `scripts/qc-sw-license-pdm-company-scope.mjs`
- `scripts/qc-sw-license-pdm-numbering-company-scope.mjs`
- `scripts/qc-sw-license-pdm-metadata-adapter-profile.mjs`
- `scripts/qc-sw-license-pdm-git-boundary.mjs`
- `scripts/qc-sw-addin-company-selection.mjs`
- `package.json`

`package.json` 提交前需確認只包含本任務新增的 QC script entries，沒有混入其他任務 script。

## 6. 明確排除

下列範圍不應併入 `DEV-SW-LICENSE-PDM-001` commit：

- Supabase GATE-B staging evidence 與 `scripts/qc-supabase-*`
- file storage / storage governance scripts
- legacy `docs/` 大量搬移或刪除
- part cost review / cost approval workflow
- UX lifecycle repair
- production deployment / Supabase production cutover

## 7. 建議下一步

1. 先處理目前 index 中的 Supabase staged 檔案：由 owner 提交、移出 index，或明確授權 PM-dev 重整 index。
2. 對 Group A/B/C 逐檔檢查 diff，排除同檔混入的非本任務變更。
3. 建立獨立 commit，例如 `DEV-SW-LICENSE-PDM-001 company scope boundary`。
4. commit 後在 `.ai-doc/dev_task.md` 補上 branch、commit hash、驗證命令與 local/pushed 狀態。
