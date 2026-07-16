# QA Validation Plan: BOM Workbench Manager Diff Review UI

Task: `DEV-BOM-WORKBENCH-001`

## 驗證範圍

- 驗證研發主管可從 `/bom/reviews` 看到待審 BOM 清單。
- 驗證主管審核第一畫面以「與上一版 Released BOM 的差異」為主。
- 驗證差異包含新增、移除、數量、階層、版次與排序資訊。
- 驗證 diff API 使用同 parent item 的最新 Released Snapshot 作為 baseline。
- 驗證主管在同頁可核准 / 退回 PendingReview。
- 驗證核准後 Released Snapshot 匯出連結可下載 XLSX / CSV。
- 驗證桌面與手機 viewport 無 page-level horizontal overflow，桌面無 console error。

## 使用者關鍵流程

1. 工程師先發布一版 Released BOM 作為正式 baseline。
2. 工程師建立下一版 Draft，調整群組階層、子件數量並新增子件。
3. 工程師送主管審核。
4. 研發主管打開 BOM 審核頁，先看差異摘要與差異表，而不是整張 BOM 全量清單。
5. 主管確認變更後核准。
6. 系統建立 Released Snapshot，主管可直接下載正式 XLSX / CSV。

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| 主管看不到 pending review | API 未列出或權限錯誤 | 審核流程卡住 | manager pending route / UI list | High | 驗證 `/api/bom/reviews/pending` 與 `/bom/reviews` |
| diff baseline 選錯 | 未取同 parent 最新 Released Snapshot | 主管誤判變更幅度 | 建立 baseline + second draft | High | 驗證 `base_snapshot_id` 存在且 diff summary 正確 |
| 階層或數量變更未顯示 | diff 比對欄位不足 | 審核漏看製造 / 採購風險 | changed field assertion | High | 驗證 `changed_fields` 包含 `quantity`、`hierarchy` |
| 新增子件未顯示 | occurrence map 或 line identity 錯誤 | 主管漏核新增料 | added line assertion | High | 驗證新增子件出現在 API 與 UI |
| 匯出連結不可用 | snapshot id 未回填或 href 錯誤 | 核准後仍需人工找檔 | download HTTP status | Medium | 驗證 XLSX / CSV download HTTP 200 |
| 手機版水平溢出 | diff table / layout 未收斂 | 現場審核難操作 | viewport width check | Medium | 驗證 1440x900 與 390x844 |

## 測試案例

- `TC-BOM-REVUI-001`: static check 確認 sidebar 有 `BOM 審核` 入口。
- `TC-BOM-REVUI-002`: static check 確認 review page 使用 pending review API、approve/reject API 與 export links。
- `TC-BOM-REVUI-003`: static check 確認 diff route 與 repository diff 欄位存在。
- `TC-BOM-REVUI-004`: 建立 baseline Released BOM。
- `TC-BOM-REVUI-005`: 建立第二份 Draft，新增群組、調整子件階層、修改數量並新增子件。
- `TC-BOM-REVUI-006`: 呼叫 draft diff API，確認 baseline snapshot、added count、changed count 與 changed fields。
- `TC-BOM-REVUI-007`: 呼叫 pending reviews API，確認待審清單帶入 diff。
- `TC-BOM-REVUI-008`: 用研發主管登入 `/bom/reviews`，確認差異摘要、差異表、數量與階層欄位可見。
- `TC-BOM-REVUI-009`: 主管核准後確認 XLSX / CSV 匯出連結下載 HTTP 200。
- `TC-BOM-REVUI-010`: 桌面與手機 viewport 無 page-level horizontal overflow，桌面無 console error。
- `TC-BOM-REVUI-011`: TypeScript、lint、production build、release regression 與 diff whitespace check 通過。

## 資料需求

- Demo Engineer 與 R&D Manager 帳號。
- 本機 Next server 與 SQLite database。
- 測試用 parent assembly submission。
- 兩個已標記 `Released` 的 child submissions。
- 第一版 Released BOM Snapshot 作為 baseline。
- 第二版 PendingReview Draft 作為 diff target。

## 通過標準

- `npm.cmd run qc:bom-workbench-review-ui` 0 failed。
- `npm.cmd run qc:bom-workbench-review-release` 0 failed。
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exit 0。
- `npm.cmd run lint` exit 0。
- `cmd /c npm.cmd run build` exit 0。
- `git diff --check` 無實質 whitespace error；CRLF warning 可接受。
- 測試用 dev server 清理完成。

## 證據收集方式

- QC script summary：total / passed / failed。
- diff API 回傳的 `base_snapshot_id`、`summary`、`changes`。
- pending reviews API 回傳的待審 review 與 diff。
- `/bom/reviews` Playwright 畫面文字與 download response。
- build / lint / TypeScript command output。
- dev server port cleanup 結果。
