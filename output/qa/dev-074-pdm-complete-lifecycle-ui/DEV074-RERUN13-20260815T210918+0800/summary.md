# DEV-074 R13 QC full rerun

Status: `FAILED — STOPPED ON FIRST DEFECT`

- Scope: 58 rendered-UI journeys.
- Business mutations: rendered UI only.
- Direct API / DB mutations: 0.
- Result: **9 passed / 1 failed / 48 not run**.
- Passed: A01–A04, B01–B04, B07.
- Failed: B05 (`DEV074-R13-P2-009`).
- Stop reason: after B05 resubmission and one-time formalization succeeded, the default active reviewer inbox still displayed the superseded earlier `needs_info` request for A0024-M03. The old decision remains valid history, but it must not remain in the active queue after a newer request exists.
- Read-only diagnostics confirmed the old request `APR-8e32fbde-3478-4670-88f4-0ca7c622eb2d` remained `needs_info`, while the newer request `APR-6f17e19c-46a6-4d58-97d2-9d2d36c3e4e8` was approved and A0024-M03 was promoted exactly once.
