# DEV-013 AI-PDM consumer capsule

- Owner: AI-PDM
- Native task: DEV-013-S3；`013-S4-L3-AIPDM-ENV`
- Contract lock: `contracts/jenfu-sso-handoff/v1/contract-lock.json`
- Status: `013-S4-L3-AIPDM-ENV owner adapter complete / READY_FOR_NONPROD_APPLY / provider and L3 NOT_RUN`

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

## 013-S4-L3-AIPDM-ENV owner-native shared-staging release

### Fixed authority and target

- Machine authority: Platform `config/dev-013/l3-managed-staging.json`, SHA-256 `7538ab12e02566eb9de107c592d6cbb43045f4a00bc94a969a84eae8a424d96c`.
- Handoff contract: `jenfu.sso-handoff.v1`, SHA-256 `e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483`.
- Owner profile: `config/release/dev013-ai-pdm-managed-staging.json`, contract SHA-256 `6a982afe530a1488a45e5ab7ec48bff520e390e11574d251d8c74367c5d215de`.
- Exact shared-staging target: `jenfu-platform-nonprod / asia-east1 / ai-pdm-stg / jenfu_stg` with attached service account `dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com` plus provider-readback `uniqueId`.
- Artifact name is `asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev013-ai-pdm-staging/ai-pdm@sha256:<provider-build-digest>`. The legacy `jenfu-ai-pdm-stg-361825`, production, sibling services, custom domains and Firebase Hosting are excluded targets.

The adapter is owner-native and does not make Terraform an authority for an uncontrolled update of the existing service. It consumes fresh Cloud Run v2 service readback, Platform broker service readback and IAM service-account readback; it never reads Secret payloads. A source freeze requires an allowlisted clean committed branch, exact 40-character source revision and tree, and SHA-256 of `git ls-tree -r -z --full-tree <revision>` bytes.

### Ordered release and hard joins

1. Publish an immutable `off` revision with Cloud Run update mask `labels,template`, the exact provider etag and zero traffic mutation. `PDM_JENFU_PLATFORM_AUTH_MODE=on`; `PDM_JENFU_SSO_HANDOFF_MODE=off`.
2. Hard-join the created revision to exact target service, attached service-account email plus `uniqueId`, provider `run.app` target origin, Platform provider-readback broker origin, callback, image digest, source revision／tree／identity, mode and protected existing-state fingerprint. This receipt is the rollback security floor.
3. Publish the same source and same digest as an immutable `on` revision, again with `labels,template`, fresh etag and zero traffic mutation. It is only `ENABLED_REVISION_READY`, not yet L3 browser ready.
4. After the second hard join, activate only that exact `on` revision using a separate traffic-only plan and fresh etag. The post-activation hard join must show 100% revision-pinned traffic before an `OWNER_READY_FOR_L3_BROWSER` owner receipt can be produced.

Both `PDM_PUBLIC_BASE_URL` and the callback are derived only from the target Cloud Run provider-readback `run.app` origin. `PDM_JENFU_SSO_BROKER_ORIGIN` is derived only from the Platform Cloud Run provider readback. Wildcards, `latest` traffic targets and actor-supplied origins are rejected.

### Preserved state and rollback

The release fingerprint preserves entry policy, deletion protection, runtime identity, VPC and subnet, capacity, concurrency, application startup probe, Cloud SQL proxy digest and arguments, database settings, Firebase／session settings, numeric Secret references and revision-pinned traffic during each template publication. Secret values are never part of input or evidence.

Rollback is traffic-only to the exact prior `off` security-floor revision. It is accepted only when that revision has the same source revision／tree／identity and artifact digest as the active `on` revision and explicitly attests auth-state v2, assurance and original-auth-time guards. A pre-DEV-013 image, template rollback, sibling mutation or ambiguous provider result is fail-closed.

### Current execution boundary

This slice prepares the owner profile, pure release adapter, hard joins, activation plan, rollback plan and regression evidence. Cloud Run deploy／traffic, Terraform apply, managed database migration and L3 browser execution remain `NOT_RUN`. Local `READY_FOR_NONPROD_APPLY` means only that a separately authorized non-production operator can begin with fresh provider readbacks; it does not claim L3, production or DEV-013 completion.
