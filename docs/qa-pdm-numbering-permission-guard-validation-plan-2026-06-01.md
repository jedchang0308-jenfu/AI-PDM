# QA Validation Plan - PDM Numbering Role Permission Guard

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
範圍：角色權限矩陣套用到 numbering API 與 UI guard

## 驗證範圍

- 後台角色矩陣的 page/action permission 會由共用 guard 套用到 numbering API。
- 內建角色有預設權限，避免導入 guard 後既有流程被全部鎖死。
- 管理員取消某角色權限後，對應使用者 API 操作會回 403。
- 最高權限排序用於多角色權限判斷。
- Sidebar 會依 page permission 隱藏 numbering / 後台矩陣入口。

## 使用者關鍵流程

- Admin 進入 `/settings`，調整 RD 的頁面與動作權限。
- RD 嘗試進入或操作已被取消權限的功能，系統阻擋且不產生資料。
- Admin 還原權限後，RD 可恢復使用。
- RD / Manager / Admin 預設仍可使用原本被允許的流程。

## FMEA

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 導入 guard 後所有人都被擋 | 既有資料庫沒有 role_permissions seed | RD 無法領號、主管無法審核 | schema seed 與 API smoke test | 高 | `INSERT OR IGNORE` 補內建角色預設權限 |
| 矩陣取消勾選但 API 仍可操作 | route 未套用共用 guard | 權限矩陣形同無效 | static check + API 403 E2E | 高 | 所有主要 mutating route 改用 `requireNumberingAction` |
| UI 仍顯示無權限入口 | sidebar 未讀取權限 API | 使用者誤入無權限頁面 | Playwright 檢查 sidebar link | 中 | `/api/numbering/permissions` + sidebar page permission filter |
| 多角色衝突結果不一致 | 沒有使用 active role priority | 同人多角色時權限難以解釋 | static check priority path | 中 | `checkNumberingPermission` 依 active priority 排序後取第一個明確權限 |
| 代理權限越權 | 代理角色未比對 project/action scope | 代理人可審不屬於代理範圍的項目 | delegation scope static check | 高 | delegated role 僅在 project/action 符合時納入候選角色 |

## 測試案例

- API-01：`role_permissions` 預設 page/action 權限 seed 存在，且 RD 預設不能批次審核。
- API-02：`checkNumberingPermission` 使用 active role priority、explicit permission、system admin fallback。
- API-03：主要 numbering API route 均引用 page/action permission guard。
- API-04：Admin 將 RD `numbering.request` page 關閉後，RD 的 sidebar 不顯示領號入口。
- API-05：Admin 將 RD `numbering.create` action 關閉後，RD 呼叫 `/api/numbering/records` 回 403。
- API-06：Admin 還原 RD page/action 後，RD 權限 API 顯示恢復可用。
- UI-01：Admin 設定畫面可顯示新增的 operational action 權限欄位。
- UI-02：桌機與手機尺寸無 console error、無頁面層水平溢出。

## 通過標準

- `tsc --noEmit` 通過。
- `npm.cmd run lint` 通過，若有既有 warning 需註明。
- `npm.cmd run build` 通過。
- `npm.cmd run qc:pdm-numbering-core` 通過且覆蓋權限 guard。
- `npm.cmd run qc:pdm-numbering-permission-guard-ui` 通過。

## 證據收集方式

- 保存 QC JSON 輸出摘要到 QC report。
- 紀錄實際 API status code、sidebar link 顯示/隱藏、console error 與 overflow 結果。
- 若測試會修改矩陣權限，測試結束前需還原 RD 預設 page/action 權限。
