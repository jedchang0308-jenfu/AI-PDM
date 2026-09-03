# DEV-032 Cloud SQL Backup Readiness

Generated: 2026-09-03T07:26:59.113Z
Status: `current_candidate_native_restore_rehearsal_verified`
Production action performed: `false`

## Candidate

- Manifest SHA-256: `02e07b51cc4d879088dfdf145ae189f8ddaff1f024be4b66daeb9ecfccc7c374`
- Schema migrations: `53`

## Result


## Stop Conditions

- This preflight performs read-only metadata discovery only.
- Do not create an on-demand backup, restore/clone instance, execute SQL, apply Terraform or delete a restore target without separate Lane 3 approval.
- A deleted restore target is the expected end state; its signed execution and cleanup receipts must match the current candidate and remain fail-closed.
- Do not activate production until the current candidate native restore rehearsal and rollback evidence pass.
