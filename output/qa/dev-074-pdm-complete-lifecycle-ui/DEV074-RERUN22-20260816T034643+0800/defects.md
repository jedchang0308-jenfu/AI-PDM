# R22 defects

## DEV074-R22-P1-018 — same-content CAD reuse was blocked by filename-only released-file conflict

- Path: C02
- Severity: P1
- Primary-run result: failed
- Symptom: UI uploaded D-0007-MA1.SLDDRW and D-0007-MA1.SLDPRT for A0034-M06 revision 0.2, but disabled both checkboxes because A0030-M06 had formally used the same names; recognition could not start.
- Root cause: pre-submission and release conflict guards compared only normalized file role and filename, even though both current and released records carry SHA-256 content identity.
- RD repair: conflict evaluation now compares SHA-256 as well. Same role/name/content is reusable as one truth asset; same role/name with different bytes remains blocked; missing hashes remain fail-closed. Release-time and AI-risk checks use the same rule.
- Targeted rendered-UI retest: passed on the same A0034-M06 revision 0.2. Both repeated-content files were enabled and selectable, recognition started, and its evidence page visibly listed both source files.
- Evidence: `screenshots/C02/c02-targeted-retest-content-aware-unblocked.png`, `screenshots/C02/c02-targeted-retest-recognition-evidence.png`.
- Clean-run gate: R23 must rerun all 58 paths from zero.

No defect recorded.
