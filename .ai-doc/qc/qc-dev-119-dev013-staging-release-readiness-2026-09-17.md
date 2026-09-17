# DEV-119 / DEV-013 S4 AI-PDM shared-staging release readiness

- Slice: `013-S4-L3-AIPDM-ENV`
- Local terminal: `READY_FOR_NONPROD_APPLY`
- Provider execution: `NOT_RUN`
- L3 browser: `NOT_RUN`
- Production／legacy staging／sibling mutation: `0`
- Terraform apply／managed database migration／Secret payload read: `0`

## Frozen contracts

- Platform L3 manifest SHA-256: `7538ab12e02566eb9de107c592d6cbb43045f4a00bc94a969a84eae8a424d96c`
- `jenfu.sso-handoff.v1` SHA-256: `e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483`
- AI-PDM release-profile contract SHA-256: `6a982afe530a1488a45e5ab7ec48bff520e390e11574d251d8c74367c5d215de`

The canonical Platform contract sync returned the same handoff hash for both consumers before implementation. The profile is fixed to `jenfu-platform-nonprod / asia-east1 / ai-pdm-stg / jenfu_stg` and explicitly excludes `jenfu-ai-pdm-stg-361825` and production.

## Local evidence

| Gate | Result |
|---|---:|
| `node scripts/dev013-ai-pdm-managed-staging.mjs profile-check` | PASS |
| `node --test scripts/dev013-ai-pdm-managed-staging.test.mjs` | 7／7 PASS |
| Canonical Platform `assertOwnerReceipt` join | PASS |
| `npm run test:dev-013` | 3／3 PASS |
| `npm run check:db-boundary` | PASS |
| `npm run typecheck:app` | PASS |
| `npm run build:isolated` | PASS; artifact／primary invariant／cleanup=true |

Focused negative oracles reject dirty or unallowlisted source, legacy／wrong target, non-revision-pinned traffic, wrong attached identity or `uniqueId`, broker／target origin drift, callback drift, source／tree／digest／mode drift, network／protected-state drift, non-numeric Secret references and a pre-DEV-013／different-build rollback floor. Existing direct Firebase login, SSO start／callback, permission enforcement, logout revocation and startup readiness remain covered.

## Release and rollback evidence model

Revision publication is template-only (`labels,template`) and requires a fresh provider etag. The first immutable revision has SSO handoff `off` while Platform auth stays `on`; its exact provider hard join becomes the rollback security floor. The second same-source／same-digest revision has handoff `on` but is not owner-ready until a separate traffic-only activation and post-activation hard join prove 100% revision-pinned traffic.

Rollback can name only the exact `off` security-floor revision and uses update mask `traffic`. The floor and active receipt must share source revision, source tree, source-identity hash and artifact digest, and the floor must retain auth-state v2, assurance and original-auth-time guards. No pre-DEV-013 image is accepted.

The exact source revision／tree／`git ls-tree` identity is intentionally generated from clean committed HEAD after this receipt is committed and is reported in the delivery handoff; embedding that value here would create a self-referential source change. The image is not built or pushed in this slice, so its expected authority remains `asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev013-ai-pdm-staging/ai-pdm@sha256:<provider-build-digest>`.
