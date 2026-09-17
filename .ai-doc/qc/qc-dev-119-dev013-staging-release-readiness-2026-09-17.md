# DEV-119 / DEV-013 S4 AI-PDM shared-staging release readiness

- Slice: `013-S4-L3-AIPDM-ENV`
- Local terminal: `READY_FOR_NONPROD_APPLY`
- Provider execution: `read-only exact preflight complete / mutation NOT_RUN`
- L3 browser: `NOT_RUN`
- Production／legacy staging／sibling mutation: `0`
- Terraform apply／managed database migration／Secret payload read: `0`

## Frozen contracts

- Platform L3 manifest schema／SHA-256: `jenfu.dev013.l3-managed-staging.v2`／`8d913f22b5ab15de62969ddbbd3951c9a819bbe0019688bcf8f99faa1ffc5df4`
- `jenfu.sso-handoff.v1` SHA-256: `e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483`
- AI-PDM release-profile contract SHA-256: `3de303aaff74658c0af5ab3ee6eaef840e52ae47a0047043066630698f33ac81`

The canonical Platform contract sync returned the same handoff hash for both consumers before implementation. The profile is fixed to `jenfu-platform-nonprod / asia-east1 / ai-pdm-stg / jenfu_stg` and explicitly excludes `jenfu-ai-pdm-stg-361825` and production.

Platform current source-bound provider preflight `output/dev-013/l3/DEV013-L3-PREFLIGHT-20260917T044050260Z-17270621/report.json` confirms the exact `ai-pdm-stg` service and attached runtime identity exist. It fails closed before bootstrap receipt because observed labels are `application=ai-pdm`, `environment=staging`, `managed_by=terraform`, `dev_id=dev-010`, with `owner` and `slice` absent; required DEV-013 values are `dev_id=dev-013`, `owner=ai-pdm`, `slice=013-s4-l3`. Read-only Secret metadata also confirms the three existing app-owned Secret containers each have enabled numeric version `1`, while current Cloud Run refs use `latest`; the DEV-013 artifact repository and evidence bucket are absent. The reads performed no Cloud, traffic, database or Secret mutation and never read payloads.

## Local evidence

| Gate | Result |
|---|---:|
| `node scripts/dev013-ai-pdm-managed-staging.mjs profile-check` | PASS |
| `npm run test:dev-013:l3` | 10／10 PASS |
| Canonical Platform `assertTargetBootstrapReceipt` and `assertOwnerReceipt` joins | PASS |
| Infra A complete address／exact-after／variable/action gate, wrong-resource and foundation-byte tamper oracles | PASS |
| `terraform fmt -check -recursive infra/google-cloud/dev-013-l3-ai-pdm` | PASS |
| `terraform init -backend=false -input=false` + `terraform validate` | PASS; temporary provider directory removed |
| `npm run test:dev-013` | 3／3 PASS |
| `npm run check:db-boundary` | PASS |
| `npm run typecheck:app` | PASS |
| `npm run build:isolated` | PASS; artifact／primary invariant／cleanup=true |

Focused negative oracles reject dirty or unallowlisted source, incomplete／updated／wrong-field Infra A plans, caller-asserted or tampered foundation hashes, legacy／wrong target, non-revision-pinned traffic, wrong attached identity or `uniqueId`, broker／target origin drift, callback drift, source／tree／digest／mode drift, network／protected-state drift, disabled／wrong／non-numeric Secret references and a pre-DEV-013／different-build rollback floor. `latest` is accepted only in the explicit migration planner with enabled metadata readback; its candidate revision pins the exact numeric versions and must pass separate hard joins and traffic-only activation before bootstrap receipt v2 is available. Existing direct Firebase login, SSO start／callback, permission enforcement, logout revocation and startup readiness remain covered.

## Release and rollback evidence model

Infra A is source-frozen against actual foundation receipt bytes and permits exactly three data-source reads plus five app-owned resource create／no-op actions. It creates only the `dev013-ai-pdm-staging` Artifact Registry repository, evidence bucket and their exact writer／reader IAM members. The current service is never imported or patched by Terraform.

Owner-native revision publication is template-only (`labels,template`) and requires a fresh provider etag. Before bootstrap, the dedicated Secret-pinning lane converts the three existing `latest` refs to enabled numeric refs through a zero-traffic candidate and traffic-only activation. The first source-bound application revision has SSO handoff `off` while Platform auth stays `on`; its exact provider hard join becomes the rollback security floor. The second same-source／same-digest revision has handoff `on` but is not owner-ready until a separate traffic-only activation and post-activation hard join prove 100% revision-pinned traffic.

Rollback can name only the exact `off` security-floor revision and uses update mask `traffic`. The floor and active receipt must share source revision, source tree, source-identity hash and artifact digest, and the floor must retain auth-state v2, assurance and original-auth-time guards. No pre-DEV-013 image is accepted.

The exact source revision／tree／`git ls-tree` identity is intentionally generated from clean committed HEAD after this receipt is committed and is reported in the delivery handoff; embedding that value here would create a self-referential source change. The image is not built or pushed in this slice, so its expected authority remains `asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev013-ai-pdm-staging/ai-pdm@sha256:<provider-build-digest>`.
