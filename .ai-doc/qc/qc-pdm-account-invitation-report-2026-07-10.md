# QC-PDM-ACCOUNT-INVITATION-001 驗證報告

日期: 2026-07-10
結論: 本地邀請/首次密碼設定切片通過；production release 未執行。

## 結果

- `qc:pdm-account-invitations`: 25/25 passed，含 `local_password` + `invite` provider identities 與 provider audit redaction。
- `qc:managed-auth`: 21/21 passed。
- `qc:pdm-production-slice-numbering-draft`: 27/27 passed。
- `npx.cmd tsc --noEmit --pretty false`: passed。
- `npm.cmd run lint -- --quiet`: passed。
- isolated `npx.cmd next build` with `.tmp/next-build-account-invitations`: passed；只有既有 middleware deprecation 與 Turbopack NFT tracing warnings。
- `qc:postgres-shadow`: 26/26 passed，SQLite/Postgres 98 tables 一致且 RLS plan 覆蓋 `account_invitations`。
- `qc:supabase-runtime-migrations`: 33/33 passed，7 個 migration mirror/hash 一致；邀請與 identity 表 RLS/default-deny 通過。
- Playwright 1440/390: 管理員邀請頁、managed login、首次設密碼頁無重疊、裁切、不可操作或可見 API error；公開 auth 頁不再發出需登入的待辦/權限 API。

## 已證實

- 非 Admin 403；重複 pending 409；弱密碼 400；accepted/revoked 重用 410。
- 接受前沒有 user，接受後可用自行設定密碼登入並取得 session。
- DB 只保存 64 字元 token hash，API list 不回傳 token 或 hash。
- create/accept/revoke audit 存在，JENFU membership 與指定角色正確。

## 殘餘邊界

- 目前由管理員開啟預填郵件或複製連結完成交付，未配置自動寄信 provider。
- 正式部署前需設定 `PDM_PUBLIC_BASE_URL` 為 canonical HTTPS origin，並走 `DEV-032` release gate/live migration。
