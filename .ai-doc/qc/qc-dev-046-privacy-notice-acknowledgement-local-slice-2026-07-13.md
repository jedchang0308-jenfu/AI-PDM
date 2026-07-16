# DEV-046 employee privacy notice acknowledgement local slice QC report

Date: 2026-07-13
Verdict: PASS for the local slice; BLOCKED for live staging

## Facts verified

| Area | Result |
|---|---|
| Published notice authority | Exactly one current company version; deterministic content hash; published content immutable |
| Acknowledgement evidence | Exact version/hash/user/time/source/request ID; immutable and idempotent; cross-user request replay denied |
| First activation | Missing/write-failed acknowledgement cannot activate invitation or issue normal PDM session |
| BFF/API | Same-origin JSON/current-version checks; short-lived pending cookie; protected APIs recheck current acknowledgement |
| Version change | One new acknowledgement required; prior evidence retained; safe return path preserved |
| UI | Three-line summary, complete notice link, unchecked checkbox, disabled CTA, permanent route and visible expired-session error |
| Admin | Required/acknowledged version, time, status and hash visible; no impersonation or evidence-edit action |
| Storage boundary | No password, token, MFA code, recovery secret or browser fingerprint stored |
| Migration boundary | PostgreSQL migration forces RLS, revokes public/anon/authenticated access and has a synchronized compatibility mirror |

## Executed evidence

- Focused privacy QC: 20/20 passed.
- Supabase migration mirror QC: 56/56 passed; Supabase CLI was absent and no live migration was attempted.
- DEV-046 Phase 2A/2B regressions: 20/20 and 14/14 passed.
- Account lifecycle regression: 26/26 passed.
- Local Phase 2B preflight: 19/19 passed; result remains `blocked_external` with 13 blockers; resource creation remains false.
- Source-only TypeScript passed; direct workspace `tsc` remained blocked only by the active dev server's generated `.next/dev/types/validator.ts`, while the isolated production build TypeScript phase passed.
- Source-scoped ESLint: zero errors.
- Isolated production build: compile, TypeScript, page generation and route inventory passed.
- Browser evidence: `output/playwright/dev-046-privacy/privacy-desktop.png`, `privacy-mobile.png`, `activation-mobile-checked.png`, and `acknowledgement-expired-mobile.png`. Visual inspection first found and then verified the fix for a 390px min-content shrink defect on the acknowledgement panel. Final metrics showed a 358px panel inside the 390px viewport, no horizontal overflow or clipped checked text, and a complete 2,958px notice page. Dummy local-only Firebase client config proved the activation CTA stayed disabled before acknowledgement and became enabled after the visible checkbox was selected; the form was not submitted. The activation page had no console errors/warnings; the expired-session page produced only its expected API 401 and rendered the recovery message.

## Residual gates

- Migration `015` has not run on Cloud SQL and no real RLS/grant receipt exists.
- `effectiveAt` remains null until staging opens; no employee acknowledgement evidence exists yet.
- Real Google and controlled non-Google Firebase activation/re-acknowledgement, provider email/TOTP and principal mapping remain untested.
- Staging restore, migration/runtime smoke, payment/resource authorization, state/secrets and release gates remain open.

This QC result closes only `PRIVACY_NOTICE_UI_AND_ACKNOWLEDGEMENT_NOT_IMPLEMENTED`. It does not grant staging, deployment, production or internal-user readiness credit.
