# DEV-032 Production Human Handoff

Date: 2026-07-16
Status: final interactive login handoff; principal and restore gates are complete

## Completed Before Handoff

- Production project and region read back as `jenfu-ai-pdm-prod` / `asia-east1`.
- Terraform Gate B is applied with USD 210 monthly estimate, below the USD 240 stop; no delete, replace or GCS file authority was introduced.
- Cloud SQL backup, admin bootstrap, 18 schema migrations and idempotence rerun passed.
- Firebase Google provider is enabled; Email/Password remains enabled, Anonymous remains disabled and the default Firebase auth domain remains authoritative.
- The immutable application image is deployed. OCI index-to-linux/amd64 runtime manifest provenance is verified.
- Workspace pilot AAL1 exception is enabled exactly as previously approved; Workspace MFA is not represented as trusted or AAL2.
- Cloud Run v2 traffic-only rollback and restore passed without changing the service template; Terraform no-drift passed afterward.
- Production Firebase Hosting is live at `https://jenfu-ai-pdm-prod.web.app`. The reviewed gateway plan contained 1 create, 2 in-place updates, 0 deletes and 0 replacements; post-apply Terraform is no-drift.
- The production OAuth client now contains the `web.app` JavaScript origin and `/__/auth/handler` redirect URI. A popup smoke reaches the Google account chooser without `redirect_uri_mismatch`.
- The production Firebase user and Admin principal mapping are complete: `prod-pdm-admin-001`, 9 roles and 237 permissions.
- Pre-canary reconciliation and separate-target restore reconciliation passed with matching numbering snapshot SHA-256. The runner is back in dry-run and Terraform is no-drift.

## Human Actions

DNS action is cancelled. After Codex reports the production Hosting gateway ready:

1. In the production Google account chooser already opened by Codex, select `jedchang0308@jenfu.com.tw`.
2. Wait until the popup closes and the AI PDM page changes, then report `已登入`.
3. Provide the remaining 1-3 canary email addresses before Gate E. Known candidates are `jedchang0308@jenfu.com.tw` and `dani@jenfu.com.tw`; no other identity will be guessed or allowlisted.

Do not create a Firebase user manually, do not send a password and do not add DNS records for this pilot.

## Codex Resume Work

After the single human response, Codex will execute authenticated Level 4 HTTP/UI, allowlist, negative-access, numbering, draft, series-code, persistence and file fail-closed smoke. DEV-032 remains incomplete until those checks and final UI acceptance pass.
