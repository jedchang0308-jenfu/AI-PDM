# Production Wave 0 Waiver / Risk Acceptance Record — Retired

Status: Retired and superseded by the 2026-08-29 lean internal release-governance decision
Original date: 2026-08-18
Retired date: 2026-08-29

This file is retained only as historical evidence. It is not an active QA plan, release authority, acceptance denominator, waiver form, or promotion input.

The production workflow no longer supports named-user Wave 0 testing, `wave0_mode`, Wave 0 waiver handling, or a candidate-bound waiver reference. Do not recreate or submit those inputs.

The active release path is:

1. Exact immutable `main` artifact and applicable migration/database-safety evidence.
2. Zero-traffic candidate and basic smoke.
3. Candidate-bound authenticated Level 4 login/core-flow evidence.
4. Zero open P0/P1 and rollback readiness.
5. Product Owner `go` and exact promotion token.
6. Traffic-only promotion and canonical post-promotion smoke.

The production identity allowlist remains a fail-closed security control. It is not proof of user acceptance and is maintained separately from the release workflow.
