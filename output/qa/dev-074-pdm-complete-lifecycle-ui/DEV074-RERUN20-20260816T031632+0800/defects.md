# R20 defects

## DEV074-R20-P1-016 — approval completion raced a duplicate preview request into HTTP 500

- Path: B05
- Severity: P1
- Primary-run result: failed
- Symptom: while the reviewer approved A0032-M03, two browser reads targeted the same candidate 3D preview. The first returned 200; after the decision committed, the second returned 500 and produced a rendered-UI console error.
- Root cause: the review-scope resolver correctly rejected a no-longer-active decision context by throwing `PDM_REVIEW_NOT_ACTIVE`, but candidate media did not distinguish read-only review evidence from active decision authority and did not translate the domain error at the route boundary.
- RD repair: separated active-decision scope from read-only review-evidence scope; terminal approved/rejected/applied evidence remains company-, target-, and reviewer-scoped, while decision authority remains pending-only. Candidate, revision-package, and drawing media routes now translate scope failures instead of leaking server exceptions.
- Targeted rendered-UI retest: passed with new candidate A0032-M04. The reviewer approved from the UI while 3 pre-decision and 6 post-decision duplicate image nodes exercised the same controlled preview; including normal UI loads, all 11 media responses were HTTP 200, decision response was 200, no application console error occurred, and the pending row disappeared.
- Evidence: `screenshots/supplemental/r20-preview-transition-owner-submitted.png`, `screenshots/supplemental/r20-preview-transition-review-open.png`, `screenshots/supplemental/r20-preview-transition-approved.png`.
- Clean-run gate: R21 must rerun all 58 paths from zero.
