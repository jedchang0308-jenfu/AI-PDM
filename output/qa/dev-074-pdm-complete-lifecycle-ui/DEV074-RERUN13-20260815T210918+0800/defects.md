# R13 defects

## DEV074-R13-P2-009 — superseded needs-info request remains in active reviewer inbox

- Path: B05
- Severity: P2 functional/UX consistency
- Reproduction: reviewer requests more information; owner adds PDF through UI and resubmits; reviewer approves the new request; reload the default `待處理` approval inbox.
- Expected: the earlier needs-info request remains available under history/all, while only the newest actionable request participates in the active queue; after approval, neither request remains active.
- Actual: A0024-M03 still appears as `待補資料` in the active queue even though the newer request is approved and the candidate is formally promoted.
- Mutation source: UI only. Read-only DB diagnostics used only to correlate request IDs and prove one-time formalization.
- Evidence: `screenshots/B05/stale-needs-info-active-after-resubmit-approved.png`.
- Disposition: R13 stopped; handoff to RD before a new full rerun.
