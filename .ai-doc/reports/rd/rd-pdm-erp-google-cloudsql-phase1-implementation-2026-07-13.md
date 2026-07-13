# DEV-046 Phase 1 RD Implementation Report

Date: 2026-07-13
Scope: Phase 1A-1E local contracts and adapters
Result: Implemented and locally QC-accepted
Release state: Not deployed; Phase 2 staging and Phase 3 production remain gated

## Delivered boundary

Phase 1 establishes the portable production contracts without creating Google Cloud resources or activating a provider cutover. Formal production authority remains Cloud SQL for rows, direct GCS for controlled files and standard HTTP/BFF for business operations. Firestore, Firebase Storage, Firebase Functions, Callable Functions and Firestore triggers are rejected as business authorities.

| Slice | Delivered implementation |
|---|---|
| 1A runtime | Next.js standalone output, digest-pinned Node 24 LTS image, non-root Cloud Run port contract, `asia-east1`/ALB/serverless-NEG/cache/manual-promotion configuration and ephemeral compatibility paths outside `/app` |
| 1B identity | Firebase provider interfaces/fakes, revoked-token exchange to eight-hour BFF session v2, current/previous signing-key rotation, AAL2/TOTP, privileged nonce replay protection, deny-first offboarding, invitation setup compensation and clean reprovision/collision checks |
| 1C database | `cloud_sql_postgres` runtime selector over the provider-neutral Postgres port, localhost IAM proxy-only configuration, bounded pool/timeouts/capacity reserve, least-privilege grants and singleton advisory-lock/checksum migration contract |
| 1D files/continuity | Direct-GCS pointer/interface/fake/fail-close contracts, generation/hash/size finalize checks, quarantine/export states, additive schema/migration, signed numbering ledger and recovery-reservation reconciliation fixtures |
| 1E governance | Machine-readable location/retention inventory, cost/budget template, clean-production seed/archive template, support/SLO contract, privacy/logging redaction checks and portable-authority scanners |

## Engineering corrections found during verification

- PostgreSQL generation originally emitted `session_invalid_before` as `TEXT`. The generator and QC now require `TIMESTAMPTZ`, and the PostgreSQL/Supabase compatibility mirrors were regenerated.
- The first non-root container login failed because the legacy local repository default resolved under read-only `/app`. Runtime compatibility paths now resolve to `/tmp/ai-pdm/data` and `/tmp/ai-pdm/repository`; they are explicitly non-authoritative.
- Dynamic policy-file tracing pulled excess workspace content into the standalone image. The policy lookup path and Docker context were bounded; the final build no longer reports whole-project tracing and excludes runtime scripts.
- The ERP client-boundary QC treated TypeScript `import type` as a runtime import. The scanner now evaluates runtime imports only.

## Verification summary

- Focused DEV-046 assertions: 86/86 passed across Phase 1A-1E.
- Existing regressions passed: ERP foundation, managed auth, invitations, account lifecycle, production-slice numbering/drafts, PostgreSQL shadow generation, Supabase migration mirror, file-storage contract and local-provider regression.
- ESLint: zero errors; three pre-existing warnings in `master-attachment-panel.tsx`.
- TypeScript: `tsc --noEmit` passed.
- Docker: production build passed with Next.js 16.2.6 and Node 24.17.0; final local image ID `sha256:ffbd055cc4e5ff7de68cfce5dc01f6683016b81ea838b8a7542d5406da03223a`, approximately 103 MB, runtime user `nextjs`.
- Runtime smoke: `/login`, password login and `/api/auth/me` returned 200 on port 8080.
- Browser smoke: Playwright completed role fill, login submission, redirect to `/` and authenticated Engineer workbench rendering.

## Residual gates

Phase 1 does not authorize or prove Firebase/Identity Platform, Cloud Run, ALB/domain/TLS, Cloud SQL, GCS, Secret Manager/KMS, billing, budgets or live networking. Before staging, accountable IDs/owners, privacy notice, named backup responder, measured cost, alert recipients and credentials must be approved.

Before canary, Phase 2 must also prove regional HA/PITR, one separate-target Cloud SQL restore with numbering reconciliation, clean-production seed/archive, real Google and non-Google identity paths, production-like load/capacity, immutable promotion and rollback. Full PDM/GCS/offline restore remains deferred; live direct-GCS integration remains Phase 3B. ProJED was not modified.
