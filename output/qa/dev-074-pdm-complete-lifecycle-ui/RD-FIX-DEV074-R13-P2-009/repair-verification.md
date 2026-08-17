# RD repair verification — DEV074-R13-P2-009

Status: `TARGETED PASS`

- Source fix: active/needs-info native approval projection hides an older candidate-bundle needs-info request once a newer request exists for the same draft workspace.
- Audit preservation: `全部` still renders both A0024-M03 records: the earlier `待補資料` request and the later `已核准` request.
- Search correction: native approval search now covers request ID, target code/label/ID, and immutable impact snapshot text; UI search for `A0024-M03` returns both historical records.
- Rendered UI proof: default active inbox returns zero A0024-M03 rows; all/history returns two; drawing-number search returns two.
- Automated checks: `typecheck:app` PASS; approval inbox query budget PASS (3 queries).
- Business mutations during targeted proof: 0.

Evidence:

- `screenshots/active-inbox-superseded-hidden.png`
- `screenshots/all-history-preserved.png`
- `screenshots/search-by-drawing-number-history.png`

Next gate: start a new full clean-room R14 rerun from W0; targeted proof does not convert R13 into a pass.
