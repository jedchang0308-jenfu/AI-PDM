# DEV-046 Phase 2B Live Cloud SQL Migration Evidence

Date: 2026-07-15  
Target: `jenfu-ai-pdm-stg-361825 / asia-east1 / ai-pdm-stg-postgres / ai_pdm`  
Result: PASS for admin bootstrap and schema migration; BLOCKED for staging runtime acceptance

## Approval Boundary

- Approved and executed: privileged admin bootstrap and live staging schema migration.
- Not approved or executed: runtime smoke, principal mapping, internal HTTPS entrypoint work, a fresh Terraform apply, production, DNS or GCS file authority.

## Recovery Point

- On-demand backup `1784085929277` completed successfully before any bootstrap or migration work.
- Backup window: `2026-07-15T03:25:29.278Z` to `2026-07-15T03:27:00.496Z`.
- The backup remains retained; PITR remains enabled.

## Admin Bootstrap

- Cloud SQL SQL import was used with managed `postgres`; no static database password, public IP or service-account key was introduced.
- Operation `5364853a-c19f-4b81-8729-ef7f00000025` failed because managed Cloud SQL PostgreSQL cannot change another role's default privileges. The transaction rolled back.
- The bootstrap SQL was corrected to rely on mandatory post-migration runtime grant refresh. Operation `e38bd90b-3ef7-4d2c-9f97-a69000000025` then succeeded.
- Temporary GCS object, IAM binding and bucket were removed after success.

## Migration

- A fresh PostgreSQL 17 disposable shadow applied the exact migration image and passed a second idempotence run before staging execution.
- Successful Cloud Run execution `ai-pdm-stg-migration-runner-k5pg9` applied 18 versions: `001`, `003` through `010`, and `012` through `020`.
- Immediate verification execution `ai-pdm-stg-migration-runner-nkrhj` returned `appliedVersions: []`, proving migration idempotence.
- The first live attempt timed out before SQL execution. The second hit an approval-rule foreign-key ordering defect; the migration transaction rolled back. Both failures are retained in the JSON evidence.
- Successful artifact: OCI index `sha256:e473f36a28d000bbb5982088a6a5755a76e686b366986cea339473085916ee90`; Cloud Run resolved manifest `sha256:67ba9509b21f06b0ef8a5b4139fa63eb3b94d661c88f812801338cb2d2c86070`.

## Posture After Execution

- The Cloud Run Job was restored to the reviewed dry-run image and `--dry-run` command.
- Live approval environment variables are absent; max retries remains zero and concurrency remains one.
- No runtime smoke or principal mapping test was performed.

## Remaining Gates

- `STAGING_INTERNAL_HTTPS_ENTRYPOINT_NOT_CONFIGURED`
- `STAGING_RUNTIME_SMOKE_NOT_EXECUTED`
- `STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING`

This evidence closes only the admin-bootstrap and schema-migration gates. It does not claim full staging acceptance, pilot readiness or production readiness.
