# QC-PDM-GCP-SECRET-MANAGER-SOLIDWORKS-WORKER - Local Phase 1A-1D Report

Date: 2026-08-07  
Task: `DEV-058`  
Verdict: `Local implementation passed / Live Google and native worker evidence remain release-gated`

## Scope and boundary

- Verified locally with fake/injected Google Secret Manager dependencies; no live Google resource, IAM, deploy or production migration was changed.
- No real API key, worker token or service-account JSON was written to this report or screenshots.
- Isolated browser instance used `http://localhost:3102`, disposable data directory `output/qa/dev058-browser-data-20260807-full`, and a synthetic Admin account.
- Existing port `3000` was left running and was not terminated.

## Implemented contract

- `google_secret_manager` is the formal provider; new Supabase Vault drafts are rejected as superseded.
- Google Secret Manager uses ADC, explicit read/write gates, exact numeric version references and redacted fault codes.
- Cloud SQL/SQLite metadata keeps the legacy physical columns but stores only the exact Secret Manager version reference.
- The worker broker accepts a scoped bearer token or compatibility header, uses constant-time comparison, and returns private/no-store responses.
- Worker-loaded credentials remain in process memory, refresh on a bounded interval, and clear after broker rejection/revocation.
- Settings UI distinguishes credential readiness from actual 2D claim/heartbeat presence; 3D health cannot satisfy 2D presence.
- Security status is automatically polled; the manual `重新整理` control was removed.
- Google Drive folder loading is limited to the integrations page, preventing unrelated 503 console noise on the security page.

## Executed evidence

| Command / check | Result |
|---|---:|
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run qc:pdm-gcp-secret-manager` | 36/36 |
| `npm.cmd run qc:pdm-gcp-secret-manager-runtime` | 9/9 |
| `npm.cmd run qc:pdm-settings-center-secret-lifecycle` | 28/28 |
| `npm.cmd run qc:pdm-sw-native-preview-worker` | 106/106 |
| `npm.cmd run qc:pdm-sw-native-preview-redaction` | 68/68 |
| `npm.cmd run qc:master-attachments` | 103/103 |
| `npm.cmd run qc:db-provider-contract` | 35/35 |
| `npm.cmd run qc:db-provider-postgres` | 9/9 |
| `npm.cmd run qc:doc-paths` | 23/23 |
| `npm.cmd run dev:local:check` | PASS; 2D worker correctly reported not configured in local environment |

## Browser hard gate

Route: `/settings/security`  
Viewports: 1440×900, 1024×768, 390×844  

- Visible error sweep: PASS; no unexpected error text.
- Console errors after cross-page loading fix: 0.
- Horizontal overflow: false; mobile `scrollWidth = 390` at `innerWidth = 390`.
- Manual refresh text/control: absent; visible status indicator: `自動更新`.
- `2D worker readiness` and `2D 預覽服務` are displayed as separate states; local fixture correctly shows credential `未就緒` and worker presence `待回報`.
- Evidence screenshots:
  - `output/playwright/dev058-security-final2-1440x900.png`
  - `output/playwright/dev058-security-final2-1024x768.png`
  - `output/playwright/dev058-security-final2-390x844.png`

## Release-gated re-entry

The following are intentionally not claimed as passed:

- Real Google Secret Manager staging add/read with Cloud Run ADC and least-privilege IAM.
- Real Cloud SQL metadata-only readback and Cloud Logging redaction evidence.
- Trusted Windows SolidWorks Document Manager worker claim/heartbeat and real `.SLDDRW` PNG output.
- Production deploy, migration apply, rollback and post-deploy smoke.

These require the deployment/release gate and must be rerun with real staging credentials and a real drawing fixture.
