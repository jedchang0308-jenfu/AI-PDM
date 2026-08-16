# R17 defects

## DEV074-R17-P1-013 — N/A still blocked formal-write preview

- Severity: P1
- Path: C08, exposed by the C07 explicit N/A decision.
- Expected: a human-confirmed explicit N/A with no formal target is excluded from writes and does not block formalization.
- Actual: the impact preview listed `受控備註` under `缺少正式寫入目標` and increased the blocker count.
- Evidence: `screenshots/C08/preview-zero-write.png`.
- Root cause: impact calculation checked target completeness before handling `explicit_not_applicable`.
- Repair: missing-target explicit N/A is now recorded as the exclusion `explicit_not_applicable_no_target`; target-backed N/A remains a governed not-applicable write.
- Repair evidence: `RD-FIX-DEV074-R17-P1-013/repair-verification.md` and `not-applicable-non-blocking-preview.png`.
