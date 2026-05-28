# RD Report - Light Check-out / 編輯預約

日期：2026-05-26

## 目標

以高效開發為優先，先建立「同一料號避免多人同時修改」的輕量協作能力。此版本不做完整 PDM Vault 檔案鎖，而是以 item-level reservation 提醒工程師目前由誰預約編輯。

## 已完成

- 新增 `item_locks` schema 與索引，記錄預約者、原因、到期時間與釋放時間。
- Submission detail 回傳目前 active lock，Dashboard 可直接看到預約狀態。
- 新增 `/api/submissions/[id]/checkout`：
  - `POST` 建立或重用本人預約。
  - `DELETE` 釋放本人預約，Admin 可強制釋放。
  - 其他工程師已預約時回傳 `409 ITEM_LOCKED` 與持有人資訊。
- 新增 audit log：
  - `CheckoutLockCreated`
  - `CheckoutLockReleased`
- Dashboard 新增「編輯預約」卡片與操作按鈕。
- API regression 補上未登入、角色拒絕、建立預約、重用預約、競爭衝突、釋放預約測試。

## 驗證

- `npm.cmd run lint`：通過。
- `npm.cmd run build`：通過。
- `npm.cmd run db:init`：通過。
- `PDM_BASE_URL=http://127.0.0.1:3010 npm.cmd run qc:api`：87 passed / 0 failed。
- Browser smoke：工程師登入後可看到「編輯預約」，點擊「預約編輯」後畫面顯示已預約/解除預約狀態。

## 尚未完成

- SolidWorks Add-in 送審前尚未查詢 lock 狀態。
- 目前不會鎖定 Windows 檔案，也不會阻止工程師在本機修改 CAD；它是 Web/PDM 層的協作提醒與衝突警示。
- 下一步建議接 Release package ZIP，讓核准後可一鍵交付製造端。
