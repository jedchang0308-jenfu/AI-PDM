# DEV-032 Production Principal Bootstrap Review Package

Status: proposal_only_not_approved_for_live_apply

## Scope

- Target: jenfu-ai-pdm-prod / ai-pdm-prod-postgres / ai_pdm
- Company: JENFU (company-jenfu)
- PDM user: prod-pdm-admin-001
- Google email: jedchang0308@jenfu.com.tw
- Firebase UID: U57t2eIOzLdhAmNDUbFyOz3fdMm2
- Application password: forbidden and stored as NULL
- Privileged assurance: production remains fail-closed until verified Workspace MFA or an explicitly approved residual-risk exception exists

## Package

- Canonical roles: 9
- Canonical permissions: 237
- Bootstrap: transactional, idempotent and collision-fail-closed
- Readback: identity, membership, mapping and full permission-count verification
- Rollback: access revocation only; no business, audit, company or role deletion

This package does not create a Firebase user and cannot execute while the Firebase UID is the template value.
