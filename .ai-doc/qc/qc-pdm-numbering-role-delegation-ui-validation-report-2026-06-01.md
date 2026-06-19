# QC Fact Report：PDM 圖料號角色權限與代理人設定

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
驗證依據：`.ai-doc/qa/qa-pdm-numbering-role-delegation-ui-validation-plan-2026-06-01.md`

## 驗證結論

初步 QC 通過。角色權限矩陣、最高權限排序、主管範圍、代理人建立與撤銷已由核心 static coverage 與 Playwright UI 流程驗證。

## 執行項目

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-role-delegation-ui`
- `npm.cmd run lint`
- `cmd /c npm run build`

## 實際結果

- TypeScript：通過。
- `qc:pdm-numbering-core`：190/190 通過。
- `qc:pdm-numbering-role-delegation-ui`：24/24 通過。
- `lint`：通過，保留既有 `src/app/numbering/tasks/page.tsx` hook dependency warning。
- `build`：通過，保留既有 Turbopack broad trace warnings。

## 證據

- 核心 QC 覆蓋 `role_scope_rules` schema、角色權限 API、最高權限排序、主管範圍、代理人 upsert/revoke、settings UI 控制與 package script。
- UI QC 實際完成：
  - Admin 登入。
  - 新增自訂角色。
  - 勾選頁面權限 `numbering.request`。
  - 勾選動作權限 `release`.
  - 儲存最高權限排序版本。
  - 新增 RD 主管專案範圍。
  - 建立代理人。
  - 撤銷代理人。
  - 桌機與手機無 console error、無頁面層水平溢出。

## 問題與阻塞

- 無本輪阻塞。
- 殘留非本輪問題：`src/app/numbering/tasks/page.tsx` 仍有既有 React Hook dependency warning；build 仍有既有 Turbopack broad trace warnings。
