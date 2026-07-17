# DEV-046 Staging Principal Bootstrap Review Package

Status: proposal_only_not_approved_for_live_apply

## Scope

- Target: jenfu-ai-pdm-stg-361825 / ai-pdm-stg-postgres / ai_pdm
- Company: JENFU (company-jenfu)
- PDM user: stg-pdm-admin-001
- Google email: jedchang0308@jenfu.com.tw
- Firebase UID: qxEv2napjvMEmiqIUqwhTCf6gjg2
- Application password: forbidden and stored as NULL
- Privileged-role TOTP: required before a BFF session may be issued

## Package

- Canonical roles: 9
- Canonical permissions: 237
- Bootstrap: transactional, idempotent and collision-fail-closed
- Readback: read-only identity, membership, mapping and full permission-count verification
- Rollback: access revocation only; no business, audit, company or role deletion

## Approval Boundary

- Principal mapping approved: false
- Live SQL apply allowed: false
- Deployment approved: false
- Production approved: false

This local package does not connect to Cloud SQL, mutate Firebase, run Terraform, deploy Cloud Run or apply SQL.
