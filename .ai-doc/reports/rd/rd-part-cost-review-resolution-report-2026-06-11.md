# RD Report: Part Cost Review And Resolution

Date: 2026-06-11
Task: `DEV-PDM-PART-COST-001`

## Scope

Closed the local backend/UI slice for part cost profile review and cost resolution:

- Reject overlapping or invalid cost tiers when creating a part cost profile.
- Confirm same-root drawing/part linking behavior and primary/reference link typing.
- Block DVT/Release gate when a same-drawing multi-part record lacks material, color, or variant difference details.
- Resolve approved standard cost by part number, quantity and active tier.
- Resolve approved scenario cost by part number, quantity and cost type.
- Approve or reject pending part cost change requests.
- On approval, mark the profile approved, close the previous active standard cost, create the new active standard cost and write audit evidence.
- On rejection, mark the pending profile rejected and write audit evidence.
- Add cost review actions to the existing `/parts` detail panel.
- Add same-root part detail, standard cost status, primary MA link and title-block variant warning to `/numbering/drawings`.
- Guard revision history as read-only so drawing revision lookup does not create cost review requests or change standard cost.
- Add an executable part cost review E2E fixture covering procurement pending review, manager approval, rejection, standard cost resolution, audit evidence and revision lookup no-op behavior.

## Code Changes

- `src/lib/repositories/numbering-repository.ts`
  - Added tier validation, cost resolution and cost change request decision flow.
- `src/lib/db.ts`
  - Re-exported new cost functions and types.
- `src/app/api/parts/[partNumber]/cost-resolution/route.ts`
  - Added read endpoint for standard/scenario cost resolution with cost amount redaction.
- `src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts`
  - Added approval decision endpoint using `numbering.approval.batch.decide`.
- `src/app/parts/page.tsx`
  - Added cost review table and approve/reject actions.
- `src/app/numbering/drawings/page.tsx`
  - Added same-root part detail cards and a title-block variant warning for multi-part MA drawings with material/color/surface text.
- `scripts/qc-part-number-module.mjs`
- `scripts/qc-part-cost-review-e2e.mjs`
  - Added in-memory SQLite schema fixture for procurement submit and manager review lifecycle.
- `scripts/qc-part-number-module.mjs`
  - Expanded from 41 to 79 checks for cost review/resolution, drawing detail, revision read-only and E2E registration contracts.

## Verification

- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run qc:part-number-module`: passed 79/79.
- `npm.cmd run qc:part-cost-review-e2e`: passed 16/16.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; only existing Turbopack NFT trace warning remains.
- `npm.cmd run qc:file-storage-contract`: passed 81/81.
- `npm.cmd run qc:db-provider-postgres`: passed 9/9; live probe skipped because `PDM_POSTGRES_URL` is not configured.
- Browser smoke: `http://127.0.0.1:3100/parts` loaded with 0 console errors during logged-out smoke; follow-up smoke on `/` and `/numbering/drawings` returned HTTP 200 with expected unauthenticated/unauthorized states and expected 401 resource messages only.

## Residual Risk

- Full browser login cross-role E2E can be added after fixed test accounts and fixtures are available; the cost review data-flow E2E is covered by the in-memory schema fixture.
- Supabase live target, provider cutover and external storage provider validation remain blocked by external target/cost/provider decisions.
