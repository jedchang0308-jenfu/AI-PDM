# DEV-032 Source Boundary Classification

Date: 2026-07-15
Owner: Dev PM / deployment-release-gate
Scope: DEV-032 production release gate pre-build source-control boundary
Production action: none

## Result

Status: source boundary classified by path family and followed by deterministic file-level manifest, but not releaseable.

This closes the earlier "unknown dirty worktree shape" analysis gap, but it does not close the DEV-032 pre-build gate. The repository still lacks an exact release commit or intentionally named release snapshot. Production build, deploy, migration, seed, restore, allowlist rollout and smoke remain blocked.

Follow-up manifest evidence:

- Manifest: `output/dev-032-release-source/manifest.json`
- Report: `.ai-doc/reports/pm/pm-dev-032-release-source-manifest-2026-07-15.md`
- Source snapshot SHA-256: recorded in the manifest, not repeated here to avoid self-referential source hashing.
- Unknown-risk paths: 0

## Current State Checked

- Branch: `codex/pdm-lifecycle-unified-history`
- HEAD: `ec68981 feat: implement DEV-046 phase 1 platform contracts`
- Dirty status: `128` modified, `162` untracked, `290` total entries.
- Bucket count:
  - `.ai-doc`: 43
  - `.firebase`: 1
  - `build-config`: 9
  - `config`: 7
  - `db`: 14
  - `firebase`: 3
  - `infra`: 2
  - `output`: 13
  - `scripts`: 63
  - `src`: 121
  - `supabase`: 14
- Product/source diff excluding `output` and `.firebase`: 124 files changed, 15,674 insertions, 5,611 deletions.
- Active Google Cloud account/project readback:
  - Account: `jedchang0308@jenfu.com.tw`
  - Project: `jenfu-ai-pdm-stg-361825`
  - `jenfu-ai-pdm-prod` remains inaccessible or not present for the active account.

## Classification

### Candidate Included Source

These files can be included only if the release owner explicitly chooses the current dirty snapshot as the DEV-032 release candidate and then creates one exact release commit/snapshot:

- `src/**`: application/runtime changes for Firebase BFF/session, privacy acknowledgement, account/security, numbering/draft, series code, transfer/package and staging dashboard compatibility behavior.
- `db/**` and `supabase/migrations/**`: schema, Cloud SQL grants, PostgreSQL/Supabase migration mirrors and Phase 046/048 additive migration artifacts.
- `scripts/**`: QC, migration package, provenance, readiness and inventory tooling used to verify the current candidate.
- `package.json`, `package-lock.json`, `Dockerfile`, `next.config.mjs`, `tsconfig.json`, `next-env.d.ts`, `.env.example`, `.dockerignore`, `.gitignore`: build/runtime/dependency and artifact-boundary inputs.
- `config/platform/**`: platform contracts and environment templates, with staging exceptions separated before any production plan.
- `.ai-doc/**`: authoritative decision, spec, QA/QC and PM evidence needed for handoff and release-gate audit.

### Generated Or Evidence Artifacts

These should not be treated as production deployment source. They may be retained as evidence according to project policy, but must not be required inside the production artifact:

- `output/**`, including DEV-046 Cloud SQL migration package, Terraform plan/apply evidence, Firebase Hosting evidence, live migration evidence, principal bootstrap evidence and DEV-047 local inventory output.
- `.firebase/**`.
- Playwright screenshots and local QC report outputs under `output/playwright/**` and `output/qc-*`.

### Staging-Only Inputs

These describe staging execution and must not become production provider config without a separate production contract:

- `.firebaserc` currently maps only staging.
- `firebase.json` currently targets Firebase Hosting site `jenfu-ai-pdm-stg-361825` and Cloud Run service `ai-pdm-stg`.
- `firebase-hosting/**`.
- `infra/google-cloud/staging/**`.
- `config/platform/staging-preflight.template.json`.
- DEV-046 staging evidence under `output/dev-046-*`.

### Unknown Release Intent / No-Go Items

The dirty worktree is now classified by path family, but release intent is still not decided:

- HEAD `ec68981` does not include the 290 dirty entries.
- The dirty snapshot combines multiple development families: DEV-045 account lifecycle, DEV-046 platform/auth/staging, DEV-047 local schema inventory, DEV-048 number-state flow and staging dashboard hotfix evidence.
- `src/app/globals.css` has a large global CSS diff and needs viewport/UI smoke if included.
- `package-lock.json` and runtime dependencies changed; any release must build from the exact committed lockfile.
- Staging AAL1 and Firebase Hosting/default-domain exceptions recorded in `config/platform/cloud-run.contract.json` must not be copied into production without explicit residual-risk acceptance.
- Production project, provider config, env/secret source, restore/reconciliation, clean seed, allowlist and rollback evidence are still absent.

## Release Path Options

1. Current dirty snapshot as release candidate: create one reviewed release commit/snapshot containing intended source/config/schema/script/docs, exclude generated artifacts from the production artifact, then rerun full pre-build evidence.
2. Clean release branch from `ec68981`: cherry-pick only required DEV-040/045/046/048 slices and rebuild evidence. Safer but more expensive because current features are interdependent.
3. Staging evidence cleanup first: separate staging evidence/generated files from product source before choosing the production release candidate.

## Updated DEV-032 Gate Meaning

The source-boundary blocker is no longer "unclassified dirty files exist." It is now:

- classified and hashable dirty source exists;
- no exact release commit/snapshot exists;
- release owner has not selected whether production will use the current dirty snapshot or a cleaner release branch.

Until that is resolved, DEV-032 must remain blocked before build.
