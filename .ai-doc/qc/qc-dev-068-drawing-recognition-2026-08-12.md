# QC DEV-068 - 圖面／CAD 全項辨識與正式化事實驗證

Status: Independent Local Fact Check Passed / Production Release Gated
Date: 2026-08-12
Owner: QC
Authority: `.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`

## QC Conclusion

DEV-068 authorized local Phase 1A～1D is implemented and the focused critical path passed. Recognition output remains candidate/evidence until a human confirms the actual write impact. Formal PDM mutation is transactional, idempotent and traceable. This report does not certify OCR accuracy, a live provider, production migration or release readiness.

## Facts Verified

- A0005 3D/2D content hashes matched the fixture manifest; the fixture cannot activate by filename alone and is disabled in production mode.
- The session produced 21 candidates across all six review sections and resolved A0005-M01 to A0005-P01/P02/P03.
- Baseline was SUS304 material (2/3), surface finish 無 (3/3), color 無 (2/3), variant note 無 (3/3); P02 SUS301 and P03 黑 remained explicit differences.
- One unclassified OCR value was mapped to governed field `reference_motor_code` and stored as a row, not a database column.
- Explicit missing value was excluded as `missing_value_no_change`; it did not clear `REF-MOTOR-B`. Explicit N/A without a reason was rejected.
- Valid formalization applied once; same idempotency key returned the original receipt. Target drift returned stale, and a forced invalid target rolled back event and formal rows.
- SQLite/PostgreSQL DEV-068 schema parity was 14/14 tables; PostgreSQL 18.4 applied 001 + 033 in a disposable cluster. Three permission codes were assigned to four intended roles and eight audit/evidence tables had append-only triggers.
- Actual browser flow passed worker 401 guard, login, enqueue, claim, complete, six-section review, protected evidence, impact preview, return, Escape/Tab/focus behavior, 390px responsive cards and final write.
- `npm run typecheck:app`, aggregate focused QC and isolated Next.js production build passed; build included all DEV-068 APIs and `/numbering/recognition/[sessionId]`.

## Evidence

- Contract: `output/qa/dev-068-drawing-recognition/contract-20260812102916-local-isolated/report.json`
- A0005 core: `output/qa/dev-068-drawing-recognition/A0005-20260812102918-local-isolated/report.json`
- PostgreSQL schema: `output/qa/dev-068-drawing-recognition/schema-20260812101840-postgres-local-isolated/report.json`
- Browser: `output/qa/dev-068-drawing-recognition/browser-20260812103253-local-isolated/report.json`
- Desktop: `output/qa/dev-068-drawing-recognition/browser-20260812103253-local-isolated/impact-preview-1440x960.png`
- Mobile: `output/qa/dev-068-drawing-recognition/browser-20260812103253-local-isolated/impact-preview-390x844.png`

## Non-PASS Boundaries

- No real OCR or native SolidWorks provider was configured, purchased or benchmarked.
- Full legacy PostgreSQL migration chain has pre-existing migration 004 drift at `approval_rules.phase`; this is outside migration 033 and needs separate remediation before production migration packaging.
- Full DRR-001～060 actor/provider/distributed-production matrix is release evidence, not this local focused QC result.
- No staging/production mutation, deployment, commit, push or release was performed.
