# DEV-013 AI-PDM consumer capsule

- Owner: AI-PDM
- Native task: DEV-119；source slice `Jenfu-Platform / DEV-013 / 013-S4-L3-AIPDM-ENV`
- Contract lock: `contracts/jenfu-sso-handoff/v1/contract-lock.json`
- Status: `013-S4-L3-AIPDM-ENV complete / production owner profile guard off / L4 exact authorization gated`

## Boundary

AI-PDM consumes Platform `jenfu.sso-handoff.v1` for the fixed `ai-pdm` audience. It keeps the AI-PDM host-only Jenfu session, local account-session registry, assurance policy, and permission enforcement. It does not read Portal cookies, accept another app's session, create shared keys, or modify Platform or OrgMaster schemas.

## Implemented surface

- `src/lib/jenfu-sso-handoff.ts`: signed transaction cookie, exact callback／state／PKCE validation, attached service identity exchange, principal／assignment／auth-state recheck, assurance resolution, expiry cap, local session issuance, and failure cleanup.
- `src/lib/jenfu-platform-identity-contract.ts`／`jenfu-auth-epoch-repository.ts`: direct Firebase exchange and protected requests consume `authState v2`, preserve original `auth_time`, and fail closed on stale revocation state.
- `src/app/api/auth/jenfu-sso/*`／`src/app/login/page.tsx`／`src/app/api/auth/mode/route.ts`: owner start／callback routes and a single Platform login entry when explicitly enabled; existing demo／local modes remain unchanged.

## Runtime and release inputs

`PDM_JENFU_SSO_HANDOFF_MODE` is `off` by default. Enabling requires `PDM_JENFU_PLATFORM_AUTH_MODE=on`, the exact Platform broker origin, and provider-readback AI-PDM `run.app` callback in the owner release profile. The attached service account is obtained through Application Default Credentials; no key file or shared secret is accepted. Rollback is `target off` after `launch → accept` drain, retaining auth-state, assurance, and original-auth-time guards.

## Verification entrypoints

`npm run test:dev-013:l3`, `npm run test:dev-013`, `npm run check:db-boundary`, `npm run typecheck:app`, `terraform fmt -check -recursive infra/google-cloud/dev-013-l3-ai-pdm`, backend-disabled `terraform validate`, and `npm run build:isolated` are the owner-local checks. Local PASS does not close QA-013 or authorize managed non-production／production release.

## Production L4 owner readiness（2026-09-18）

The ordinary production owner profile `config/release/dev117-ai-pdm-independent-production-v3.json` now defaults `PDM_JENFU_SSO_HANDOFF_MODE=off`, permits only the controlled values `off／on`, and fixes the Platform broker origin to `https://jenfu-platform-prod-9536592944.asia-east1.run.app`. The owner runtime can add these fields safely to the prior production environment and rejects an unknown transition, missing legacy value, fixed-value drift, or alternate origin before a release capsule can proceed. No handoff-mode change, including initial default-off guard and rollback, can enter owner `prepare` unless `jenfu.dev013.l4-owner-transition-authorization.v1` and `jenfu.dev013.l4-owner-transition-readiness.v1` bind the exact owner, source revision, release ID, complete controlled environment, prior revision value and immutable predecessor receipt. Fresh DEV-117 owner tests, abort-controller tests, database-boundary check, application typecheck, and isolated Next.js build are required after this change.

This is a guard-capable production input, not a release receipt. Production Cloud Run template／traffic, IAM, database, Secret, retained edge, Billing, custom-domain, Hosting, and shared-load-balancer mutations remain zero. Activation remains owner-native and must follow Platform `accept` → AI-PDM `on` → Platform `launch`; rollback is the reverse drain to the retained guard-capable `off` revision. The exact production target still requires separate human authorization before L4 execution.

## 013-S4-L3-AIPDM-ENV owner-native shared-staging release

### Fixed authority and target

- Machine authority: Platform `config/dev-013/l3-managed-staging.json` schema `jenfu.dev013.l3-managed-staging.v2`, SHA-256 `eefcfbd8b5297a37f813401c3bbaf128ad0486ed59e5b53c11730125d6a5292d`.
- Handoff contract: `jenfu.sso-handoff.v1`, SHA-256 `e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483`.
- Owner profile: `config/release/dev013-ai-pdm-managed-staging.json`, contract SHA-256 `991966e7ae92ce703224fef4c6a27843e4c9e49572039716df3cece3c07a1f09`.
- Exact shared-staging target: `jenfu-platform-nonprod / asia-east1 / ai-pdm-stg / jenfu_stg` with attached service account `dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com` plus provider-readback `uniqueId`.
- Artifact name is `asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev013-ai-pdm-staging/ai-pdm@sha256:<provider-build-digest>`. The legacy `jenfu-ai-pdm-stg-361825`, production, sibling services, custom domains and Firebase Hosting are excluded targets.

The adapter is owner-native and does not make Terraform an authority for an uncontrolled update of the existing service. `infra/google-cloud/dev-013-l3-ai-pdm` owns only the missing Artifact Registry repository, evidence bucket and exact repository／bucket IAM members in the app-owned state prefix; its source-frozen plan must contain the complete eight-address set, exact variables and exact planned resource fields with only create／read／no-op actions. The CLI hashes the actual foundation receipt bytes and derives its `gs://` provider evidence URI, so a caller-supplied digest cannot become authority. Cloud Run remains owner-native and is absent from this Terraform root.

The runtime uses three separate existing Secret containers: `PDM_SESSION_CURRENT_SECRET → dev010-n1c-ai-pdm-session-current`, `PDM_SESSION_PREVIOUS_SECRET → dev010-n1c-ai-pdm-session-previous`, and `PDM_WORKBENCH_CONTRACT_SECRET → dev010-n1c-ai-pdm-workbench-contract`. Before any template update, the owner reads Cloud Run v2, pins the existing 100% `latest` allocation to the exact current ready revision, and enables deletion protection in the same etag-bound service-level patch when the provider default is false. The allowed update mask is exactly `traffic` or `traffic,deletionProtection`; template, labels, image, environment, identity and siblings remain unchanged and a separate provider hard join is mandatory. A baseline Secret `latest` alias is then accepted only by the explicit Secret-pinning migration planner with fresh Secret Manager metadata proving that each alias resolves to an enabled numeric version. It publishes a zero-traffic candidate revision, hard-joins unchanged protected state, then activates that exact revision through a traffic-only plan. Bootstrap, subsequent revision plans and receipts reject aliases and accept only the exact per-environment numeric references; payloads never enter input or evidence.

The owner release consumes fresh Cloud Run v2 service readback, Platform broker service readback and IAM service-account readback. A source freeze requires an allowlisted clean committed branch, exact 40-character source revision and tree, and SHA-256 of `git ls-tree -r -z --full-tree <revision>` bytes.

### Ordered release and hard joins

0. Apply the separately authorized `OWNER_INFRA_A` plan only after the source-freeze and exact plan gate pass. This creates the app-owned repository／evidence boundary and does not touch `ai-pdm-stg`.
1. Run `npm run plan:dev-013:l3:baseline-traffic`. It obtains a fresh Cloud Run v2 and attached-service-account readback without writing files or printing the provider token. The plan must identify the provider-deterministic origin, current ready revision, `latest=100%`, current etag and deletion-protection state. Apply only its exact service-level update mask, then hard-join the changed etag, pinned revision, enabled deletion protection and unchanged protected-state hash before any template mutation.
2. Before Platform exists, use the explicit owner-native Secret-pinning planner when the current baseline contains Secret `latest`. Fresh provider metadata must resolve all three exact Secret IDs to enabled numeric versions. Publish the numeric-pinned candidate with `labels,template` and zero traffic, hard-join it, activate only that exact revision with a traffic-only plan, and hard-join the active provider state.
3. `bootstrap-receipt` then reads only the exact existing `ai-pdm-stg` service, attached IAM identity and enabled Secret-version metadata. It requires numeric per-environment references, handoff mode `off`, required labels／entry policy／capacity, provider origin, immutable service-account `uniqueId`, deletion protection, etag and 100% revision-pinned traffic, then emits `jenfu.dev013.l3-target-bootstrap-receipt.v2 / TARGET_BOOTSTRAP_READY`. It does not read Platform and cannot satisfy the browser-ready gate.
4. After Platform exists, publish an immutable `off` revision with Cloud Run update mask `labels,template`, the exact provider etag and zero traffic mutation. `PDM_JENFU_PLATFORM_AUTH_MODE=on`; `PDM_JENFU_SSO_HANDOFF_MODE=off`.
5. Hard-join the created revision to exact target service, attached service-account email plus `uniqueId`, provider `run.app` target origin, Platform provider-readback broker origin, callback, image digest, source revision／tree／identity, mode, numeric Secret mapping and protected existing-state fingerprint. This receipt is the rollback security floor.
6. Publish the same source and same digest as an immutable `on` revision, again with `labels,template`, fresh etag and zero traffic mutation. It is only `ENABLED_REVISION_READY`, not yet L3 browser ready.
7. After the second hard join, activate only that exact `on` revision using a separate traffic-only plan and fresh etag. The post-activation hard join must show 100% revision-pinned traffic before a `jenfu.dev013.l3-owner-receipt.v2 / OWNER_READY_FOR_L3_BROWSER` receipt can be produced. The final receipt records the exact per-environment numeric Secret references, mode, active revision, provider etag, traffic percent and rollback-floor hash.

Both `PDM_PUBLIC_BASE_URL` and the callback are derived only from the target Cloud Run provider-readback `run.app` origin. `PDM_JENFU_SSO_BROKER_ORIGIN` is derived only from the Platform Cloud Run provider readback. Wildcards, `latest` traffic targets and actor-supplied origins are rejected.

### Preserved state and rollback

The release fingerprint preserves entry policy, deletion protection, runtime identity, VPC and subnet, capacity, concurrency, application startup probe, Cloud SQL proxy digest and arguments, database settings, Firebase／session settings, numeric Secret references and revision-pinned traffic during each template publication. Secret values are never part of input or evidence.

Rollback is traffic-only to the exact prior `off` security-floor revision. It is accepted only when that revision has the same source revision／tree／identity and artifact digest as the active `on` revision and explicitly attests auth-state v2, assurance and original-auth-time guards. A pre-DEV-013 image, template rollback, sibling mutation or ambiguous provider result is fail-closed.

### Current execution boundary

This slice prepares the app-owned Infra A root and exact plan gate, byte-bound foundation reference, provider-read baseline traffic／deletion-protection plan, three-Secret pinning migration, target bootstrap receipt v2, owner profile, hard joins, activation plan, rollback plan and regression evidence. Platform current source-bound exact read-only preflight confirms `ai-pdm-stg` and the attached runtime identity exist, but the service still has `dev_id=dev-010`, lacks the required `owner=ai-pdm` and `slice=013-s4-l3` labels, and its three Secret refs still use `latest`; the DEV-013 artifact repository and evidence bucket are also absent. A fresh owner read-only plan additionally proves the deterministic origin `https://ai-pdm-stg-1055054506544.asia-east1.run.app`, ready revision `ai-pdm-stg-00004-pvm`, `latest=100%`, and provider-default deletion protection `false`; it proposes only `traffic,deletionProtection` with zero template／label／sibling changes. Bootstrap remains fail-closed until a separately authorized non-production owner executes Infra A, the baseline service-level patch with hard join, and the numeric-pinning candidate／activation flow. Cloud Run revision／traffic mutation, Terraform apply, managed database migration and L3 browser execution remain `NOT_RUN`. Local `READY_FOR_NONPROD_APPLY` means only that the exact owner package is reviewable and executable after authorization; it does not claim L3, production or DEV-013 completion.
