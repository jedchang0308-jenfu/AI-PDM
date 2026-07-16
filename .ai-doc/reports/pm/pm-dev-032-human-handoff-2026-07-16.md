# DEV-032 Production Human Handoff

Date: 2026-07-16
Status: superseded DNS handoff; production Firebase Hosting pilot activation is now the active path

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

## Human Actions

DNS action is cancelled. After Codex reports the production Hosting gateway ready:

1. Open `https://jenfu-ai-pdm-prod.web.app`.
2. Click Google sign-in and select `jedchang0308@jenfu.com.tw` once. A temporary "account not provisioned" or equivalent denial is acceptable at this point: the purpose is to create a verified production Firebase `google.com` identity so Codex can map its immutable UID.
3. Report the visible result and provide the remaining 1-3 canary email addresses. Known candidates are `jedchang0308@jenfu.com.tw` and `dani@jenfu.com.tw`; no other identity will be guessed or allowlisted.

Do not create a Firebase user manually, do not send a password and do not add DNS records for this pilot.

## Codex Resume Work

After the single human response, Codex will verify the real Firebase provider UID, run the principal bootstrap, pre-canary reconciliation, isolated Cloud SQL restore and restore reconciliation, then execute Level 3/4 HTTP/UI, allowlist, negative-access, numbering, draft, series-code, persistence and file fail-closed smoke. DEV-032 remains incomplete until those checks and final UI acceptance pass.
