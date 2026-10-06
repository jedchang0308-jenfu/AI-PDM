# DEV-121 原工作樹草稿保存（2026-10-06）

狀態：WIP_NOT_RELEASE_READY。來源 codex/dev121-owner-ledger-floor，保存前 HEAD 為 46438028ade8d9ec93d4bdc7cec3ecc2a8ec584d。本次依人類「提交所有相關程式及開發文件」指示保存 Principal-only／system_admin／typed capability 原有草稿；不是新的修正驗收、PR、合併或正式發布。當前受保護主線與已發布 v6 結案證據仍是正式狀態的依據。

## 差異及使用限制

- 多數 capability／typed caller／async display snapshot 草稿已在後來 main 合併。保存至本分支只保留本地開發歷程，不把它們重算成新交付。
- release profile 的舊 migration 清單縮回 077；migration fence、080 v6 SQL 與 migration builder 使用舊 080 綁定。現行正式 v6 使用 081，080 已屬 DEV-122；本保存版本禁止直接作為發布輸入或執行 migration。已套用 SQL 沒有修改。
- role-capabilities API 與 mixed principal-work-review PostgreSQL 測試仍和後來 main 不同；其中測試減少狀態快照／錯誤回應斷言。此处仅保存，沒有宣稱更完整或已通過 QC。
- 三份原施工文件仍包含 Oct-5 執行中及舊 migration 編號，因此原始 bytes 另存 evidence 原文。它們是歷史草稿，不取代 Oct-6 正式結案；本地文件已加保存狀態提示。
- DEV-122 lifecycle／workbench 的 11 個 tracked 及 4 個 untracked 修改不暫存，原工作檔 bytes 保留；獨立 DEV-122 worktree、DEV-095 文件、output／cache 不混入。mixed principal-work-review 測試整檔僅作 WIP 保存，不因此認列一般业务完成。

## 驗證與原始內容

對應 JSON 列出提交範圍及排除範圍的保存前 SHA-256。只驗證保存原稿、精準暫存、JSON 可解析與 Git diff whitespace；本次沒有新的產品測試、建置或 Production 變更。已完成交付不撤回，歷史 NOT_RUN／DEFERRED_NOT_PASS 不改為 PASS。若未來採用本分支，必須先與 current protected main 收斂並清除上述過期差異，再按現行 owner 流程驗證，不能使用舊 UID 或 local ACL fallback。
