# DEV-032 Production Hosting Activation

Date: 2026-07-16
Target: `jenfu-ai-pdm-prod` / `asia-east1`
Entrypoint: `https://jenfu-ai-pdm-prod.web.app`
Risk lane: Lane 3 production infrastructure and authentication configuration

## Scope

- Use the Firebase Hosting default domain for the bounded internal production pilot.
- Do not configure DNS or cut over `pdm.jenfu.com.tw`.
- Keep Cloud Run as the BFF runtime, Cloud SQL as relational authority and all Phase 3A file workflows fail-closed.

## Saved Plan And Apply

- Estimated monthly cost: USD 210; below the USD 240 stop and USD 300 cap.
- Saved plan: 1 create, 2 in-place updates, 0 delete, 0 replace.
- Changes: enable `firebasehosting.googleapis.com`, update `google_cloud_run_v2_service.pdm`, update `google_identity_platform_config.pdm`.
- Apply completed without an error. Post-apply Terraform plan reported no changes.
- Cloud Run latest ready revision: `ai-pdm-prod-00005-hfs`.
- Runtime image remained `asia-east1-docker.pkg.dev/jenfu-ai-pdm-prod/ai-pdm/ai-pdm@sha256:b4fb8e9ffd45da987cab42241811194b45556e4316bc52cbed04c7d0f768aaa3`.

## Hosting And OAuth

- Firebase Hosting deployment used only `config/platform/firebase-hosting.production.json` and site `jenfu-ai-pdm-prod`.
- The first deploy attempt stopped before upload because the config-relative public path was incorrect. The path was corrected to `firebase-hosting-production`; the second deploy finalized and released successfully.
- Hosting readback: release `sites/jenfu-ai-pdm-prod/releases/1784160101842000`, version `sites/jenfu-ai-pdm-prod/versions/07034b9c63cd54dd`, status `FINALIZED`.
- Identity Platform authorized domains include `jenfu-ai-pdm-prod.web.app`, `jenfu-ai-pdm-prod.firebaseapp.com` and `pdm.jenfu.com.tw`.
- Initial Google popup smoke exposed `redirect_uri_mismatch` for `https://jenfu-ai-pdm-prod.web.app/__/auth/handler`.
- The production OAuth client was updated through Google Auth Platform with the `https://jenfu-ai-pdm-prod.web.app` JavaScript origin and matching `/__/auth/handler` redirect URI. The console reported `OAuth client saved`.
- Popup re-test reached the Google account chooser. No redirect mismatch remained.

## Level 4 Unauthenticated Evidence

- `/login`: HTTP 200, nonblank AI PDM shell.
- `/api/auth/mode`: HTTP 200, `firebase_bff`, Google provider enabled.
- `/api/numbering/permissions`: HTTP 401 before login.
- `/__/auth/handler` and `/__/firebase/init.json`: HTTP 200.
- Login response: private/no-store, `nosniff`, same-origin referrer policy.
- Direct `run.app` POST to `/api/auth/firebase/session` with the direct origin: HTTP 403.
- Main login page browser smoke: zero console errors; one nonblocking unused-preload warning.
- Google popup emits existing COOP `window.closed` polling messages while open, but it reaches the account chooser and is no longer blocked by OAuth configuration.

## Remaining Gate

Production still has zero real Firebase users. `jedchang0308@jenfu.com.tw` must complete one interactive Google login. Only then may Codex read the verified Firebase UID, apply principal mapping, run independent restore/reconciliation and complete authenticated Level 4 and named-user canary checks.

DNS remains intentionally deferred.
