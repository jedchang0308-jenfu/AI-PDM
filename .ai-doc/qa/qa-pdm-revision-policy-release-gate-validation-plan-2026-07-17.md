# QA Plan：版次發布閘門與建議版次決策引擎

Status: Executed Locally for Phase 1A/1B / Phase 1C Deferred / Release Gate Required
Date: 2026-07-17
Owner: QA / Dev PM
Related DEV: `DEV-050` / `DEV-PDM-REVISION-POLICY-002`
Related SPEC: `.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`

## 1. Purpose

Validate that the system aligns with the management policy:

- Major revisions can be formal `Released`.
- Minor revisions can be controlled RD/design-change/history records.
- Minor revisions cannot become formal production `Released`.
- Suggested revision is created server-side, stored in submission snapshot and cannot be used to bypass the release gate.

## 2. Test Scope

### Phase 1B Release Gate

In scope:

- Service-level policy decision.
- Final approval route before release side effects.
- Release workflow direct call.
- Retry-release route.
- Audit event for blocked release.
- Regression against existing drawing revision package behavior.

Out of scope:

- Production deploy.
- Historical data repair.
- Any conditional-use, trial-approved or emergency-use implementation.
- Live Cloud SQL/Firebase/GCS provider validation.

### Phase 1A Suggestion Snapshot

In scope:

- Server-created suggestion response.
- Submission snapshot persistence.
- Basis hash / stale response handling.
- Override reason and audit evidence.
- Suggestion by workflow intent.

Out of scope:

- AI/LLM-generated suggestion.
- Independent `revision_policy_decisions` table.
- Network-dependent policy lookup.
- Changing legacy read-only revision display.

## 3. Fixtures

Use disposable local data or QC-owned fixture records only.

Minimum fixture set:

| Fixture | Purpose |
|---|---|
| Drawing with no major release | Verify RD suggestion starts at `0.1`; release suggestion starts at `1`. |
| Drawing with Released major `1` | Verify design-change suggestion starts at `1.1`; next release suggestion is `2`. |
| Drawing with existing minors `1.1`, `1.2` | Verify next minor suggestion is `1.3`. |
| Pending minor submission `0.2` | Verify final approval/release blocks `Released`. |
| Pending major submission `1` | Verify major release path still works when existing gates pass. |
| Existing newer revision with lower backfill candidate | Verify out-of-order history behavior remains non-blocked outside `Released` minor gate. |

No test may mutate production or user-owned records.

## 4. Phase 1A Suggestion Snapshot Acceptance Matrix

| ID | Case | Expected |
|---|---|---|
| QA-050-1A-01 | RD workspace before first release | Server returns suggestion `0.1`. |
| QA-050-1A-02 | Release area before first release | Server returns suggestion `1`. |
| QA-050-1A-03 | Design-change workspace after Released `1` | Server returns suggestion `1.1` or next available `1.x`. |
| QA-050-1A-04 | Release area after Released `1` | Server returns suggestion `2`. |
| QA-050-1A-05 | Submission accepts suggestion | Submission snapshot stores suggested revision, selected revision, policy version and basis hash. |
| QA-050-1A-06 | Basis changes before submission consumes response | Submission create returns stale-suggestion recovery and does not create a submission. |
| QA-050-1A-07 | User override within allowed lane with reason | Snapshot stores selected revision and override reason. |
| QA-050-1A-08 | User override without reason | Rejects with actionable message. |
| QA-050-1A-09 | User override to minor then target `Released` later | Release gate still blocks in Phase 1B. |
| QA-050-1A-10 | Suggestion API unauthenticated or cross-company | Fail closed; no suggestion leakage. |
| QA-050-1A-11 | Schema inspection | No independent `revision_policy_decisions` table is required by Phase 1A. |

## 5. Phase 1B Release Gate Acceptance Matrix

| ID | Case | Expected |
|---|---|---|
| QA-050-1B-01 | `assertRevisionPolicyCanTransition` with `0.2 -> Released` | Block `minor_revision_cannot_be_released`. |
| QA-050-1B-02 | `assertRevisionPolicyCanTransition` with `1.1 -> Released` | Block `minor_revision_cannot_be_released`. |
| QA-050-1B-03 | `assertRevisionPolicyCanTransition` with `1 -> Released` | Allow if no other gate blocks. |
| QA-050-1B-04 | Final approval would complete release for minor `0.2` | 409, final approval not recorded, audit written. |
| QA-050-1B-05 | Retry-release for minor `1.1` | 409, no lifecycle/current pointer mutation. |
| QA-050-1B-06 | Direct workflow call for minor `0.2` | Throws/returns policy block before `Releasing`. |
| QA-050-1B-07 | Existing duplicate same drawing + same revision guard | Still blocks duplicate formal package. |
| QA-050-1B-08 | Lower non-duplicate backfill in allowed non-`Released` lane | Not blocked solely by chronological order. |
| QA-050-1B-09 | Audit repository fails during blocked release | Fail closed; no release. |
| QA-050-1B-10 | Error response UI/API wording | Chinese actionable message, no SQL/internal stack. |
| QA-050-1B-11 | Attempt to use `ConditionalUse` / `TrialApproved` | Not available in Phase 1. |

## 6. Regression Matrix

Must keep passing if touched:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run qc:pdm-change-control
npm.cmd run qc:pdm-drawing-submission-workbench-recovery
npm.cmd run qc:pdm-drawing-submission-review-only
npm.cmd run qc:pdm-drawing-revision-package-model
```

New focused command expected after implementation:

```powershell
npm.cmd run qc:pdm-revision-policy-suggestion
npm.cmd run qc:pdm-revision-policy-release-gate
```

The new command must be deterministic, local, and independent of production provider credentials.

Executed local evidence on 2026-07-17:

| Command | Result |
|---|---|
| `npm.cmd run qc:pdm-revision-policy-suggestion` | PASS 14/14 |
| `npm.cmd run qc:pdm-revision-policy-release-gate` | PASS 11/11 |
| `npm.cmd run qc:pdm-change-control` | PASS 62/62 |
| `npm.cmd run qc:pdm-drawing-submission-workbench-recovery` | PASS 27/27 |
| `npm.cmd run qc:pdm-drawing-submission-review-only` | PASS 14/14 |
| `npm.cmd run qc:pdm-drawing-revision-package-model` | PASS 59/59 |
| `npm.cmd run qc:pdm-release-master-status-sync` | PASS 31/31 |
| `npm.cmd run lint` | PASS with three existing warnings in `src/components/master-attachment-panel.tsx` |
| `npx.cmd tsc --noEmit --pretty false` | PASS after removing obsolete historical `.tmp/next-qc-numbering-request-ux-20260714` type include from `tsconfig.json` |

## 7. Browser / UI Evidence

Required only if UI copy or workbench behavior is changed.

Minimum browser checks:

- `/numbering/revisions` shows server-created suggestion for selected workflow intent.
- Minor release block shows recovery actions:
  - `建立下一個整數正式版`
  - `退回修改版次`
- Minor release block does not show `改走條件使用 / 試用核准` in Phase 1.
- No visible raw code, SQL, stack trace or English-only error.
- Desktop and current mobile sanity viewport have no overlap, clipping or horizontal overflow for the blocked-release message.

## 8. Audit Evidence

For every blocked minor release attempt, evidence must include:

- actor;
- company;
- drawing or subject identity;
- attempted revision;
- attempted lifecycle target;
- workflow intent;
- reason code;
- policy version;
- timestamp;
- basis hash when available.

For every suggestion snapshot, evidence must include:

- suggested revision;
- selected revision if consumed;
- override reason if different;
- policy version;
- basis hash;
- consumed submission/package id when applicable.

## 9. Pass / Fail Rules

Pass when:

- Minor revisions cannot be marked `Released` from all tested paths.
- Major release behavior is not broken by the new gate.
- Suggestion snapshots are server-created, stored on submission and stale-safe.
- Existing duplicate and out-of-order revision package guarantees remain intact.
- Error and recovery messages are actionable in Traditional Chinese.

Fail when:

- Any path can write minor revision as `Released`.
- Final approval is recorded before a blocked release decision and leaves the package in an unrecoverable state.
- Suggestion is only a UI default and is not stored in submission snapshot.
- Override bypasses release policy.
- `ConditionalUse` / `TrialApproved` is exposed or accepted in Phase 1.
- QC mutates production or non-QC-owned records.

## 10. Release Boundary

This QA plan does not authorize:

- production deploy;
- production migration;
- historical minor-`Released` data mutation;
- direct DB repair/deletion;
- merge, PR, rollback or release artifact.

Production or historical repair requires a separate release/data-repair gate with backup, dry-run and rollback evidence.
