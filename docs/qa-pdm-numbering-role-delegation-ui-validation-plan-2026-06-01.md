# QA Validation Plan：PDM 圖料號角色權限與代理人設定

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
範圍：後台角色權限矩陣、最高權限排序、主管範圍、代理人設定、待辦/通知/審核可視範圍。

## 驗證範圍

- Admin matrix API 可讀取與更新角色、頁面權限、動作權限、角色排序、主管範圍、代理人。
- `/settings` 後台 UI 可操作上述設定，且桌機與手機寬度不產生頁面層水平溢出。
- 最高權限排序需建立版本與 audit，不覆蓋歷史。
- 主管範圍需支援部門、專案與動作代碼。
- 代理人需由管理員設定，可限定專案、動作、時間區間並可撤銷。
- 待辦、通知、審核清單需套用主管範圍與代理人規則。

## 使用者關鍵流程

1. 系統管理員進入 `/settings`。
2. 新增自訂角色。
3. 在角色 x 權限矩陣中勾選頁面權限與動作權限。
4. 調整最高權限排序並填寫原因。
5. 設定 RD 主管專案/動作可視範圍。
6. 設定代理人，確認代理審核範圍與期間。
7. 撤銷代理人設定。

## FMEA 風險表

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 驗證 |
|---|---|---|---|---|---|
| 權限矩陣未保存 | API dispatch 或 repository upsert 錯誤 | 管理員以為已授權但使用者不可操作 | UI 操作後讀回 matrix API | 高 | Playwright 建立角色與權限後讀 API 驗證 |
| 排序未版本化 | 直接覆蓋 active row | 無法追溯權限衝突判斷 | 檢查 `role_priority_versions` 與 audit action | 高 | 核心 QC static check + UI 操作驗證 |
| 主管看到超出範圍待辦 | 範圍設定未套用到 list query | 審核責任與資訊暴露錯誤 | 檢查 repository access context | 高 | 核心 QC 驗證 access helper 存在 |
| 代理人無法撤銷 | revoke 未寫入或 UI 未刷新 | 離職/休假代理持續生效 | UI 建立後撤銷並讀回 API | 高 | Playwright 驗證 revokedAt |
| 手機設定頁溢出 | 矩陣欄位太多造成頁面層水平滾動 | 設定頁不可用 | 量測 `documentElement.scrollWidth` | 中 | 桌機/手機 UI QC |

## 測試案例

- `TC-ROLE-001`：Admin 建立自訂角色，讀回 matrix API 有該角色。
- `TC-ROLE-002`：勾選頁面權限 `numbering.request`，讀回 `role_permissions.allowed = true`。
- `TC-ROLE-003`：勾選動作權限 `release`，讀回 `role_permissions.allowed = true`。
- `TC-ROLE-004`：儲存最高權限排序，讀回 active priority 含新排序。
- `TC-SCOPE-001`：新增 RD 主管專案範圍，讀回 `role_scope_rules`。
- `TC-DELEGATION-001`：建立代理人，讀回 active delegation。
- `TC-DELEGATION-002`：撤銷代理人，讀回 `revokedAt`。
- `TC-RESPONSIVE-001`：桌機與手機設定頁無 console error、無頁面層水平溢出。

## 通過標準

- `tsc --noEmit` 通過。
- `npm.cmd run lint` 通過或僅保留既有非本輪 warning。
- `npm.cmd run build` 通過。
- `npm.cmd run qc:pdm-numbering-core` 通過。
- `npm.cmd run qc:pdm-numbering-role-delegation-ui` 通過。

## 證據收集方式

- 指令輸出 JSON。
- Playwright UI 操作結果。
- matrix API 讀回資料。
- dev_task 勾選與 Update Log。
