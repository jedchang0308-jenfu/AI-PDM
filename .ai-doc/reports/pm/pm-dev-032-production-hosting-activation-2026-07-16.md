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

## Production Slice Runtime Activation

- A post-deploy readback found `/api/production-slice/status` returning
  `configured=false` and `active=false`. This was treated as a P0 release
  configuration defect; authenticated mutation smoke stopped before any data
  write.
- Production Terraform now fixes the server-only
  `PDM_PRODUCTION_SLICE_MODE=official-numbering-draft` value. Focused static
  evidence passed: production slice 29/29, production IaC 23/23 and Terraform
  validate 12/12. The IaC guard also confirms no `NEXT_PUBLIC_*` equivalent and
  no GCS/file authority resource or environment setting.
- Saved plan SHA-256
  `25f6f28a74d27e988e13301793488cf736fe0fedcc8ec72779cfc90b9497221e`
  contained 0 create, 1 Cloud Run in-place update, 0 delete and 0 replace. The
  application image index remained exactly
  `sha256:b4fb8e9ffd45da987cab42241811194b45556e4316bc52cbed04c7d0f768aaa3`.
- Apply created ready revision `ai-pdm-prod-00006-lx5` with 100% traffic. Its
  linux/amd64 runtime digest remains
  `sha256:570dd9f0fb268110d61aea3dd05d70e9e914c131f072a1928269cc10ddd2a779`.
- Direct Cloud Run and Firebase Hosting status readback both return HTTP 200,
  `configured=true`, `active=true`, mode `official-numbering-draft` and private
  no-store headers.
- Level 3 production-like smoke passed 14/14: login shell, Firebase BFF mode,
  protected GET 401/no-store, blocked roadmap pages, stable 403
  `feature_not_open_in_production_slice` for submission/file/CAD/BOM mutations,
  and direct `run.app` session denial.
- The outputs-only post-smoke plan changed zero resources and recorded rollback,
  Level 3 and `post_apply_ready` as true. Final credentialled Terraform plan
  reported no drift.

## Remaining Gate

The first interactive login created a verified production Firebase identity. Principal bootstrap and independent restore/reconciliation have since passed; see `pm-dev-032-production-principal-restore-reconciliation-2026-07-16.md`.

`jedchang0308@jenfu.com.tw` must now complete the open Google account chooser
after provisioning so authenticated Level 4 and named-user canary checks can
run. Gate D remains incomplete until that authenticated production evidence
passes.

DNS remains intentionally deferred.
