# RD Report - AI Submission Summary

Date: 2026-05-27

## Implemented

- Added deterministic AI submission summary builder.
- Added `AiSubmissionSummary` types with section and source traceability.
- Added `GET /api/submissions/[id]/ai-summary`.
- Added Dashboard detail `AI review summary` panel before revision/BOM/file details.
- Summary covers:
  - change reason
  - submitted files
  - revision history
  - BOM diff
  - Where-used impact
  - missing PDF/DWG handoff files
- Added API regression coverage `SUMMARY-001` through `SUMMARY-012`.

## Files

- `src/lib/types.ts`
- `src/lib/ai-submission-summary.ts`
- `src/app/api/submissions/[id]/ai-summary/route.ts`
- `src/components/dashboard.tsx`
- `src/app/globals.css`
- `scripts/qc-api-test.mjs`

## Notes

- The first version is deterministic and local to keep reviewer workflow fast and avoid external LLM availability risk.
- Sources are explicit records from submission, files, revision history, BOM diff, and Where-used.
