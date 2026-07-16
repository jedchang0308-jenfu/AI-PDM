# QA Validation Plan: Google Drive Folder Tree Settings

Task: `DEV-GDRIVE-001`

## 驗證範圍

- `/settings` Google Drive 區塊改為資料夾樹 + detail panel + 設定摘要。
- Admin-only children API：`GET /api/settings/gdrive/folders?parentId=...`。
- Admin-only verify API：`POST /api/settings/gdrive/folders/verify`。
- `/api/settings` 保存 pending / released Folder ID 與 name / path / verified_at snapshot。
- 保留舊版只 POST Folder ID 的相容性，避免既有 release folder selection 流程破壞。
- 未設定 service account 時，不自動打 Drive children API，不產生 console 503 noise。
- 桌面與手機 viewport 不產生 page-level horizontal overflow。

## 使用者關鍵流程

1. Admin 進入 `/settings`。
2. 系統顯示 Google Drive service account 狀態與資料夾樹。
3. Admin 展開 `Google Drive > AI_PDM`。
4. Admin 選取 `00_Pending`，驗證後指定為待審核暫存區。
5. Admin 選取 `10_Released`，驗證後指定為正式發布區。
6. Admin 儲存設定後，重新讀取仍可看到 folder name / path / verified_at snapshot。
7. 若未設定 service account，畫面顯示可處理錯誤，不暴露 key path 或 access token。

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| 非 Admin 可瀏覽 Drive | API role guard 缺失 | Drive 組織結構外洩 | Engineer request | High | children / verify route 需 `requireRole(["Admin"])` |
| 掃描整個 Drive | API 不用 parent lazy load | 成本與延遲失控 | request query check | High | 只查指定 parent，pageSize 100，不遞迴 |
| Shared Drive 看不到 | Drive API 參數缺失 | Admin 找不到共用雲端資料夾 | mock request query | High | 驗證 `supportsAllDrives`、`includeItemsFromAllDrives` |
| 選到非資料夾 | verify 未檢查 mimeType | 發布時才失敗 | non-folder fixture | High | verify API 對非 folder 回 400 |
| pending/released 指到同資料夾 | 保存時未檢查 | 待審與正式區混用 | settings POST | High | API/UI 阻擋 same folder |
| metadata snapshot 未保存 | POST 只存 ID | 設定頁無法追溯 name/path | settings GET | Medium | 保存 name/path/verified_at |
| 未設定 service account 產生 console error | UI 初次載入直接打 API | settings 頁 QC 失敗、使用者困惑 | browser console | Medium | service 未設定時不 lazy load |
| 敏感資訊外露 | 錯誤訊息直出 key path/token | 資安風險 | static / UI check | High | sanitize Drive errors，不顯示 access token/key path |

## 測試案例

- `TC-GDRIVE-001`: static check 確認 `gdrive.ts` 有 `listDriveFolders` 與 `verifyDriveFolder`。
- `TC-GDRIVE-002`: static check 確認 Drive list query 使用 Shared Drive flags。
- `TC-GDRIVE-003`: static check 確認 folder list / verify routes 只允許 Admin。
- `TC-GDRIVE-004`: mock Drive children API 回傳資料夾，確認只列 folder。
- `TC-GDRIVE-005`: Engineer 呼叫 children API 回 403。
- `TC-GDRIVE-006`: verify folder 回傳 path snapshot、canUpload/canMoveInto。
- `TC-GDRIVE-007`: verify non-folder 回 400。
- `TC-GDRIVE-008`: settings API 阻擋 pending/released 同 Folder ID。
- `TC-GDRIVE-009`: settings API 保存 verified metadata snapshot。
- `TC-GDRIVE-010`: `/settings` 桌面版可展開資料夾、指定 pending/released 並儲存。
- `TC-GDRIVE-011`: `/settings` 手機版渲染 tree/detail 且無 page-level horizontal overflow。
- `TC-GDRIVE-012`: 未設定 service account 時既有 settings UI 無 console 503 error。
- `TC-GDRIVE-013`: 舊版 `qc:release-folders` 仍可只 POST Folder ID 並正確覆蓋 env folders。

## 資料需求

- Demo Admin 與 Engineer 帳號。
- Mock Google Drive API：
  - `AI_PDM`
  - `00_Pending`
  - `10_Released`
  - `not-a-folder.pdf`
- Temporary `PDM_DATA_DIR` / `PDM_REPOSITORY_DIR`，避免污染正式本機 DB。

## 通過標準

- `npm.cmd run qc:gdrive-folder-tree-settings` 0 failed。
- `npm.cmd run qc:release-folders` 0 failed。
- `npm.cmd run qc:pdm-numbering-settings-ui` 0 failed。
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exit 0 或 production build TypeScript phase 通過。
- `npm.cmd run lint` exit 0。
- `cmd /c npm.cmd run build` exit 0。
- `git diff --check` 無實質 whitespace error；CRLF warnings 可接受。
- 測試 server 皆已停止，沒有本輪留下的 LISTENING port。

## 證據收集方式

- QC JSON summary：total / passed / failed。
- Mock Drive request query，確認 Shared Drive flags。
- API response：children、verify、same-folder reject、settings save。
- Playwright viewport 檢查：1440px、390px。
- Build route manifest 包含 `/api/settings/gdrive/folders` 與 `/api/settings/gdrive/folders/verify`。
