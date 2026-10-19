<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Outcome authorization and uninterrupted delivery

- Human authorization binds the named project, environment, outcome, allowed effects and continuing exclusions. Within that scope, corrections, exact-source rebinding, normal workflow stages and retries do not require another approval merely because SHA, digest, receipt or attempt changed. Reconfirm only a new responsibility/environment, excluded action or unapproved destructive/irreversible effect; source provenance and required CI remain machine-enforced.
- Keep one active PR per releasable slice through source convergence. Use the affected-slice runner's local checkpoints for interruptions, and existing sealed build/migration receipts for owner continuation; refresh live state before mutations. Never replay an uncertain write or reuse expired/corrupt/mismatched evidence. Required CI and owner workflows ignore local checkpoint reuse.
- Use the stable production diagnostics workflow for its closed RD-permission-state and service-state operations; do not add workflow-specific WIF grants for another instance of these reads. Service-state uses the existing verifier identity, RD Job readback its existing deployer identity. No arbitrary target/SQL/command or new IAM authority is implied.

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

- Only persistent services, workers, previews, or interactive browser sessions need a recorded project/purpose, port or process owner, and cleanup condition. Short-lived build and test commands may use their normal tool output unless a failure requires deeper runtime tracing.
- Only a process that can initialize schema or write data must use a task-owned isolated `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`, unless the user explicitly authorizes a fingerprint-gated primary-data repair. Never seed or clean the primary database as test setup.
- A successful `npm run build:isolated` result is sufficient evidence for its built-in primary SQLite snapshot and integrity checks when the runner, environment, data paths, and relevant inputs are unchanged. Refresh only the checks affected by a changed isolation boundary or new failure.
- A fixture may be seeded only after its required source invariants pass. Retain a fixture mutation ledger only when the change contract or formal QA requires mutation traceability.
- Stop and remove only the verified task-owned runtime and temporary paths. Never terminate an unrelated process or clear an unknown port.

## Task entry and change-scoped checks

- Use [.ai-doc/dev_task.md](.ai-doc/dev_task.md) and [documentation_map.md](.ai-doc/documentation_map.md) to locate the selected task; read only its relevant contract. Routine fixes do not require new DEV/CAPA/FMEA documents or task-index reformatting.
- Validate consequences, not file count. Route checks through `scripts/plan-production-slice.mjs`; shared release-control changes and unknown paths fail closed to the existing full gate. Reuse still-applicable evidence; documentation excluded from app/build/test inputs does not require rebuilding the app. Provider-required CI remains mandatory.
- RD catalog/permission work needs catalog/migration contracts, database-boundary checks when affected, allowed/denied behavior and consumer compatibility. Authentication failures and missing capabilities are distinct boundaries; local/API success is not real-actor production acceptance.
- For release-adapter changes, obtain affected evidence through `npm run test:dev-117:continuous`, `npm run qc:dev-117:continuous` and `npm run test:dev-117:abort`. Use `npm run typecheck:app` / `npm run build:isolated` for affected app/package/build inputs; refresh database checks for affected SQL/boundary logic.
- Historical fixtures pin their intended source, catalog/profile, manifest and policy; never feed current35 into closed33/34 implicitly. Preserve the first failure and stop dependent mutations, but continue safe diagnosis/repair. Missing unrelated history is not a new gate; existing executor requirements cannot be silently bypassed.
- Independent business slices may close separately without shrinking the original acceptance denominator. Current DEV-122 scope/status belongs in [its contract](.ai-doc/specs/DEV-122-ai-pdm-internal-function-issues.md), not this file; do not resume deferred supplier/native-CAD or other work from historical notes.

## Production boundary — DEV117_CONTINUOUS_RELEASE_V3_DIRECT_RUN_APP

Only load release-specific details when changing or executing that workflow. This file grants no production authority and changes no executor, CI or release policy.

- Use the existing app-owned owner workflow with clean exact merged main, recorded review/QC, required `DEV-012 Isolated PostgreSQL Cutover` and `Production Slice QC`, and provider-readback branch protection: PR required, zero human approvals, admin enforcement, zero bypass actors, no force-push/deletion. Owner prepare reads ruleset `24077878`; operator reads the admin-only fields. Keep one slice on one active PR until its known local source defects converge. After dispatch, keep the workflow/checkout/capsule pinned; a newer main tip does not invalidate that source when provider readback proves it is still a merged ancestor. This is not an arbitrary historical-source or downgrade override; see release spec §26.4.
- Own only AI-PDM source, `ai-pdm-prod`, `aipdm-release`, `jenfu-platform-prod-aipdm-release`, AI-PDM numeric Secret versions and `ai_pdm_core/ai_pdm_contract`. Never use sibling checkouts as release input or mutate sibling resources/data. Canonical entry is the provider-verified Cloud Run `run.app` URL; retained custom-domain/Hosting/LB assets are not the serving path and must not be deleted or have Billing unlinked.
- Protected owner execution accepts one immutable `releaseCapsuleRef`, service-wide concurrency and no actor target/stage/environment/SQL/command overrides. Unknown write results require provider readback before retry. Migration-only is `prepare → build → migrate`; full workflow replays the same capsule receipts before candidate/traffic.
- Ordinary candidate is template-only, zero general traffic, with one exact `PDM_RELEASE_CANDIDATE_ORIGIN`. Entrypoint may patch only `ingress,defaultUriDisabled,invokerIamDisabled` with fresh etag and no template/traffic drift. Activate/rollback name an exact revision and change traffic only; recovery order is traffic, tag, entry baseline. Mutable tags, `latest`, wildcard origins, broad IAM, local ADC, synthetic evidence and actor-entered GO are not release authority.
- Before release work, read the current amendments in [the release spec](.ai-doc/specs/SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md) §26 (ordinary path), §26.1 only for program-only, and §27 for the affected IAM boundary. Old S1/S2/S3, six-/nine-stage and B35 execution records are provenance, not a queue to replay. Program-only cannot substitute for a required catalog migration.
- Principal-only / migration 073 work additionally requires [DEV-121](.ai-doc/specs/DEV-121-target-authorization-boundary.md): source-bound DB-free maintenance recovery prepared at 0%, old UID revision drained at MANUAL0 with no tags and live fence before migration. Only that proven path may activate with `scaling,traffic`; never recover to the old UID-authorizing revision after traffic resumes. Without the special proof, do not run 073.
- IAM changes remain own-prefix/exact-resource only: SBOM storage authority limited to the encoded `aipdm-release` prefix; no project-wide Storage Admin/Object Admin. Additional SBOM/cleanup bindings belong in APP_INFRA_B, not a replay of completed Stage A. Migration override executor role is only on `ai-pdm-prod-migration-runner` for `aipdm-prod-deployer`; retain its existing exact-job invoker binding and create/no-op/read-only plans.

## Business storage — DEV-121

- Business bytes use `infra/google-cloud/dev-121-business-storage`, private `jenfu-platform-prod-aipdm-files` and separate `dev-121/business-storage/default.tfstate`; the release bucket/state is not business storage.
- Before storage work, read [DEV-121](.ai-doc/specs/DEV-121-target-authorization-boundary.md) and its [provider baseline](.ai-doc/qa/DEV-121-business-storage-provider-readback-2026-10-03.json). Preserve R74/R75 claims; never reapply saved binaries. Bucket-only create/get authority for the existing runtime is not project-wide/list/delete/update/signing or credential authority.
- Preserve soft delete and prevent_destroy; no destroy, lifecycle expiry, sibling/legacy resource changes or production mutation follows from this documentation cleanup.
