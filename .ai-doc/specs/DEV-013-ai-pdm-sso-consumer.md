# DEV-013 AI-PDM consumer capsule

- Owner: AI-PDM
- Native task: DEV-013-S3
- Contract lock: `contracts/jenfu-sso-handoff/v1/contract-lock.json`
- Status: `Local implementation complete / mode off / release gated`

## Boundary

AI-PDM consumes Platform `jenfu.sso-handoff.v1` for the fixed `ai-pdm` audience. It keeps the AI-PDM host-only Jenfu session, local account-session registry, assurance policy, and permission enforcement. It does not read Portal cookies, accept another app's session, create shared keys, or modify Platform or OrgMaster schemas.

## Implemented surface

- `src/lib/jenfu-sso-handoff.ts`: signed transaction cookie, exact callback／state／PKCE validation, attached service identity exchange, principal／assignment／auth-state recheck, assurance resolution, expiry cap, local session issuance, and failure cleanup.
- `src/lib/jenfu-platform-identity-contract.ts`／`jenfu-auth-epoch-repository.ts`: direct Firebase exchange and protected requests consume `authState v2`, preserve original `auth_time`, and fail closed on stale revocation state.
- `src/app/api/auth/jenfu-sso/*`／`src/app/login/page.tsx`／`src/app/api/auth/mode/route.ts`: owner start／callback routes and a single Platform login entry when explicitly enabled; existing demo／local modes remain unchanged.

## Runtime and release inputs

`PDM_JENFU_SSO_HANDOFF_MODE` is `off` by default. Enabling requires `PDM_JENFU_PLATFORM_AUTH_MODE=on`, the exact Platform broker origin, and provider-readback AI-PDM `run.app` callback in the owner release profile. The attached service account is obtained through Application Default Credentials; no key file or shared secret is accepted. Rollback is `target off` after `launch → accept` drain, retaining auth-state, assurance, and original-auth-time guards.

## Verification entrypoints

`npm run test:dev-013`, `npm run check:db-boundary`, `npm run typecheck:app`, and `npm run build:isolated` are the owner-local checks. Local PASS does not close QA-013 or authorize managed non-production／production release.
