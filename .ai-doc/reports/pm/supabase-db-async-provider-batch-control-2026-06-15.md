# PM Report: DEV-SUPABASE-DB-001 Async Provider Batch Control Correction

Date: 2026-06-15

Related task: `DEV-SUPABASE-DB-001`

## Problem

The remaining async provider migration was being executed under an open-ended goal: "complete the remaining development tasks." That goal shape made the work drift into a long-running sequence of route migrations, each with full verification and documentation overhead.

The technical direction remains valid: remove direct synchronous `@/lib/db` route coupling and move runtime paths toward provider-neutral async repositories. The PM method was not valid for the remaining scope because it lacked a hard batch boundary, a timebox, and an explicit stop point.

## Decision

From this point forward, the remaining API async provider work must be handled as bounded slices:

- One route group per turn by default.
- No automatic continuation into the next route group without user approval.
- Each turn starts with the remaining direct `@/lib/db` API route count and the selected slice.
- Each turn ends with verification evidence, remaining route count, and the next recommended slice.

## Verification Policy

Per-route verification is now layered instead of release-grade by default:

- Level A per route: `tsc --noEmit`, exact route sync scan, related QC script syntax check, and targeted QC.
- Level B after 3-5 route slices or shared repository changes: `lint -- --quiet` and `build`.
- Level C runtime smoke: only for user-visible, high-risk, or representative routes, using isolated `PDM_DATA_DIR` and temporary port cleanup.

## Current Cutline

Phase 3CH (`/api/parts` list async provider conversion) is already partially implemented with static and build verification from the prior work session. The only allowed continuation under the corrected PM method is to finish 3CH runtime smoke, documentation evidence, `qc:doc-paths`, temp cleanup, and route count confirmation.

After 3CH is completed, PM must stop and report. Phase 3CI or any next route group requires explicit user approval.

## Non-goals

- No Supabase production cutover.
- No provider pointer change.
- No broad "complete all remaining routes" continuation.
- No destructive cleanup of unrelated existing worktree changes.
