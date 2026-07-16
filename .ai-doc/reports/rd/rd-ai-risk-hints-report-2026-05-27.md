# RD Report - AI Risk Hints

Date: 2026-05-27

## Implemented

- Added deterministic AI risk hint builder.
- Added `AiRiskReport` / `AiRiskHint` types.
- Added `GET /api/submissions/[id]/ai-risks`.
- Added Dashboard `AI risk hints` panel near the AI submission summary.
- Added risk detection for:
  - missing PDF/DWG handoff files
  - same part number with newer visible revision
  - multiple parent BOM Where-used impact
  - Released filename conflict before approval
- Added API regression coverage `RISK-001` through `RISK-011`.

## Files

- `src/lib/types.ts`
- `src/lib/ai-risk-hints.ts`
- `src/app/api/submissions/[id]/ai-risks/route.ts`
- `src/components/dashboard.tsx`
- `src/app/globals.css`
- `scripts/qc-api-test.mjs`

## Notes

- Risk hints are read-only. The API does not approve, reject, release, or modify submission state.
- Released filename conflict uses the existing release conflict detector to align warning behavior with actual release blocking behavior.
