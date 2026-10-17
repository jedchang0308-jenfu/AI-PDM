# DEV-122 Priority 2 — RD 圖號工作台測試帳號驗證計畫

## 本輪強制執行決策（2026-10-18）

本輪所有 production-shaped 驗證一律使用既有合成／測試 RD 帳號 `DEV014 Free Google（JFS9014）`。不得要求、等待或代入任何真實 RD 人員登入；不得以真人帳號取代測試帳號，也不得對真人帳號、OrgMaster grant、session 或資料做寫入、撤銷、重設或其他操作。若測試帳號 session 暫時不可用，該案例標記 `NOT_RUN`，不得改用真人補測或宣稱通過。

同一測試帳號必須貫穿唯讀 production readback、API 正向／負向與瀏覽器 UI 正向／負向；readback、API 與 UI 的 actor、issuer、catalog version/hash、grant snapshot 與決策結果必須可互相對照。這是本切片的正式驗證計畫，不以真實人員登入作為完成條件。

## 驗證對象

本切片以正式 `ai-pdm-prod` 的合成測試帳號 `DEV014 Free Google（JFS9014）` 作為 production-shaped actor。此帳號的用途是驗證已發布的 catalog、active account、effective grant、API 與 UI 是否共同遵守 RD 權限契約；不要求真實人員登入，也不對任何真人帳號做 grant 寫入或撤銷。

測試帳號的 actor 綁定只從該次 `/api/auth/me` session 讀取，並以固定 operation hash 綁定至唯讀 production readback。證據不保存 token、cookie、密碼、callback code 或任何原文 principal／employee／subject；operation 與 receipt 僅保存不可逆的 actor hashes 及 issuer。

## 正向與負向案例

1. 正向：測試 actor 的 active account、catalog v7/hash 與 effective grant 均通過同一個 `REPEATABLE READ READ ONLY` snapshot；`/api/numbering/permissions` 顯示 `numbering.drawings.view` 與 RD workspace capabilities 可用；圖號工作台可讀取被授權資料。
2. 負向：同一 actor 的 `numbering.approval.batch.decide` 與 review decide 維持拒絕；不得進入核准或決議 mutation path。
3. 負向：未授權角色或沒有 active grant 的 actor 仍收到明確 `permission_not_granted`／403，UI 與 API 使用同一拒絕結果。
4. 共享入口：至少驗證圖號工作台 route 與 `/api/numbering/permissions`；兩者須綁定相同 actor、catalog version/hash、grant snapshot 與決策結果。

## 允許與禁止的動作

- 允許：讀取測試帳號 session、唯讀 catalog／active account／grant readback、正常 UI/API GET、保存 immutable evidence、執行受影響測試與 release gate。
- 禁止：真人帳號登入要求、OrgMaster grant 寫入或撤銷、手動 production DB 修改、token/cookie/password 保存、核准／發行／批次決議 mutation。

## 證據分類

測試帳號正向結果屬於「production-shaped synthetic actor verification」，可證明正式部署的共同 evaluator、資料契約與拒絕邊界；本輪不執行也不要求真實 RD 人員業務簽收。任何日後獨立的真人業務驗收都必須另開明確授權，不得回寫或改造本輪 evidence，也不影響本切片依測試帳號完成工程驗證的判定。

