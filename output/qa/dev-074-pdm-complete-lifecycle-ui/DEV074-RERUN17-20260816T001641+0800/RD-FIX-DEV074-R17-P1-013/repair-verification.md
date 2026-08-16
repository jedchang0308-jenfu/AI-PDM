# DEV074-R17-P1-013 repair verification

- Root cause: impact calculation validated target mapping before interpreting `explicit_not_applicable`.
- Repair rule: explicit N/A with no formal target becomes `explicit_not_applicable_no_target` exclusion; explicit N/A with a valid target remains a governed not-applicable change.
- `npm run typecheck:app`: PASS.
- `npm run qc:dev-068:contract`: PASS.
- `npm run qc:dev-068:a0005-core`: PASS, including functional no-target N/A regression.
- Rendered UI: PASS. The same recognition session preview changed from 4 blockers to 3; `受控備註 / 不適用` no longer appears among target-mapping blockers.
- Evidence: `not-applicable-non-blocking-preview.png`.
