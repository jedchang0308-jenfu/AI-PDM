# R24 defects

## DEV074-R24-P1-020 — 送件人看不到審核補件原因

- Severity: P1
- Path: B05
- Observed: 審核者透過 UI 選擇「要求補充資料」並輸入原因後，送件人重整工作區只看到可補件狀態，沒有審核原因。
- Root cause: 決策原因已保存在 `approval_platform_decisions`，但工作區資料只映射審核狀態；新版整包審核也未暴露為送件人回饋。
- Repair: 工作區新增 `latestReviewFeedback`，以新版整包審核優先、舊版審核為後援，從決策資料帶回狀態、原因與決策時間；UI 新增補件／退回原因面板。
- Targeted UI retest: PASS。
- Evidence: `screenshots/B05/targeted-reviewer-needs-info.png`, `screenshots/B05/targeted-owner-feedback-visible.png`, `screenshots/B05/targeted-approved.png`。
