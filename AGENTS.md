<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Shared database boundary — DEV010_DB_RULESET_V1

- DEV-010 shared PostgreSQL DDL must be delivered as a forward-only migration under `db/postgres`; never edit the shared managed database by hand.
- This repository may create or alter only `ai_pdm_core` and `ai_pdm_contract`. Never reference another application's `*_core` schema.
- Cross-application access must use a versioned `*_contract` object. A breaking contract change requires a new version and a compatibility window.
- Never modify or delete an applied migration. Correct it with a new migration.
- Do not create application-owned objects in `public`.
- Runtime identities must never receive owner, DDL, or migrator privileges.
- Before completing a shared PostgreSQL database change, run `npm run check:db-boundary`.
- If schema ownership or contract impact is unclear, stop and record the decision in the relevant DEV or ADR before changing SQL.

# Local runtime and data isolation

- Every build, test, preview, worker, or browser runtime must declare its project, purpose, port, owning process tree, cleanup condition, `PDM_DATA_DIR`, and `PDM_REPOSITORY_DIR` mutation scope before start.
- Any process that can run schema initialization or write data must use a task-owned isolated data/repository directory unless the user explicitly authorizes a fingerprint-gated primary-data repair. Never seed or clean the primary database as test setup.
- An isolated build must prove the primary SQLite schema, canonical root/part/drawing identities, migration-residue inventory, and `PRAGMA foreign_key_check` are unchanged before and after the build.
- A fixture may be seeded only after an unmodified source snapshot passes the master-count, root-reference, migration-residue, and global foreign-key invariants. Retain a fixture mutation ledger in QA evidence.
- Stop and remove only the verified task-owned runtime and temporary paths. Never terminate an unrelated process or clear an unknown port.

## AI-PDM continuous production release — DEV117_CONTINUOUS_RELEASE_V3_DIRECT_RUN_APP

- Official-source review uses the single-maintainer contract: a clean exact `main` merge commit from one PR, recorded Codex review/QC, provider-enforced required `DEV-012 Isolated PostgreSQL Cutover` and `Production Slice QC`, and provider-readback branch protection requiring PR with zero human approvals, admin enforcement, and no force-push/deletion. Owner prepare reads exact active ruleset `24077878` through GitHub's metadata-read branch-rules API; the release operator separately reads admin enforcement and zero bypass actors because workflow tokens cannot read those admin endpoints. No second GitHub account or independent human approval is required. A PR, CI, production environment rule, or WIF alone is not protected-branch proof. Historical receipts are not retroactively upgraded.

- `CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP` is governed by `.ai-doc/specs/SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md` section 26 and Platform DEV-012 section 35. DEV-012 R78 is complete; its S1/S2/S3 gates and the six-stage/manual-GO and nine-stage/custom-domain workflows are historical provenance, not a current execution queue. Ordinary AI-PDM releases use the current app-owned release path.
- This repository may freeze, build, migrate, deploy, verify, activate, and roll back only AI-PDM source, `ai-pdm-prod`, `aipdm-release`, `jenfu-platform-prod-aipdm-release`, AI-PDM numeric Secret versions, and `ai_pdm_core/ai_pdm_contract`. Never read a sibling checkout as release input or mutate sibling service, state, schema, Secret, or traffic.
- Production execution accepts only one immutable `releaseCapsuleRef` in each protected owner workflow. DEV-121's migration-only owner workflow may execute only `prepare → build → migrate` with the same capsule and service-wide concurrency; the existing full workflow replays those receipts before candidate and traffic. Target, stage, project, service, environment, SQL, and command overrides are forbidden. Unknown write outcomes require provider readback before retry.
- Candidate mutation is template-only with zero general traffic and injects one exact `PDM_RELEASE_CANDIDATE_ORIGIN`. The app-owned `entrypoint` stage may patch only `ingress,defaultUriDisabled,invokerIamDisabled` with a fresh etag and zero template/traffic drift. Activation and rollback are traffic-only and name an exact revision; recovery order is traffic, tag, then entry baseline. `latest`, wildcard origins, mutable tags, broad IAM, local ADC, synthetic evidence, and workflow actor-entered GO are never release authority.
- DEV-121 Principal-only one-window activation is a narrowly source-bound exception to the ordinary activation sentence above: the owner may first build a static, database-free maintenance image from an official merged source and create a ready 0% recovery revision by template-only update while old traffic remains pinned at 100%; no recovery tag or traffic is allowed. The old revision must then be drained at service manual zero with no traffic tags; the immutable intent must bind that separately proven maintenance revision and a live migration fence. The new candidate may be tagged and smoke-tested only after migration. Its activation may patch `scaling,traffic` together with a fresh etag to set `AUTOMATIC` and 100% candidate traffic. Watchdog and rollback target only the maintenance revision; neither may route the old UID-authorizing revision after traffic resumes. If the special proof is absent, use the ordinary release rules and do not run migration 073.
- The production canonical entry is the provider-verified `ai-pdm-prod` Cloud Run `run.app` default URL. Do not use `pdm.jenfu.com.tw`, Firebase Hosting, or the shared Load Balancer as the current serving path. Existing edge assets remain `RETAINED_UNUSED_EDGE`; do not delete or unlink Billing in this DEV.
- Before completing a DEV-117 release-adapter change, run `npm run test:dev-117:continuous`, `npm run qc:dev-117:continuous`, `npm run test:dev-117:abort`, `npm run check:db-boundary`, `npm run typecheck:app`, and `npm run build:isolated`. New provider or production mutations require the current owner DEV/release authorization and fresh evidence; historical DEV-012 S2/S3 receipts are not reusable authority.
- Automated SBOM export may list bucket metadata and attach Container Analysis occurrences, but its object authority must be conditioned to the encoded `aipdm-release` prefix in the existing regional Artifact Analysis bucket; never grant project-wide Storage Admin/Object Admin or a sibling prefix. These bindings are `incident_runtime_enabled` APP_INFRA_B resources so an already-bootstrapped B state can add them without an unsafe A rollback plan. The own-prefix `data_cutover_cleanup` bucket IAM member is also APP_INFRA_B additional; never append it to completed Stage A or rerun A. Migration overrides require `roles/run.jobsExecutorWithOverrides` only on `ai-pdm-prod-migration-runner` for `aipdm-prod-deployer`; keep the older exact-job `roles/run.invoker` as a non-broadening additive compatibility binding so Terraform plans remain create/no-op/read.

## DEV-121 business storage source preparation

- AI-PDM business bytes belong to this repository's `infra/google-cloud/dev-121-business-storage`, dedicated `jenfu-platform-prod-aipdm-files`, and separate `dev-121/business-storage/default.tfstate` prefix. The existing DEV-117 state and release bucket remain release tooling/evidence only. No sibling or legacy-project resource is part of this slice.
- Current status is candidate source with usage-cost decision pending. The owner-local saved-plan/apply source is implemented, but no actual business-storage apply/readback receipt exists yet; effective inherited IAM and Production business L4 remain unverified. Do not init the Production backend, plan/apply or activate runtime storage merely because these source files exist. Reuse the existing authorized source-freeze/full-plan/verified-provider evidence boundary; do not treat variable equality, test fixtures or an old release infrastructure receipt as new resource proof.
- The only prepared resources are the exact private business bucket, the create/get custom-role definition, and that role's bucket-only binding to the existing `aipdm-prod-runtime` identity. No project-wide grant, object delete/list/update, signing, credential key, service, traffic or database mutation is included. Preserve bytes with soft delete and prevent_destroy; no destroy or lifecycle expiry is authorized.
