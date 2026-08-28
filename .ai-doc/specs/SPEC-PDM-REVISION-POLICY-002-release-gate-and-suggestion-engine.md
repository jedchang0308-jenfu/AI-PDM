# SPEC-PDM-REVISION-POLICY-002：版次發布閘門與建議版次決策引擎

Status: Phase 1A/1B Implemented Locally / Phase 1C Deferred / Release Gate Required
Date: 2026-07-17
Owner: Dev PM
Related DEV: `DEV-050` / `DEV-PDM-REVISION-POLICY-002`
Related QA: `.ai-doc/qa/qa-pdm-revision-policy-release-gate-validation-plan-2026-07-17.md`

2026-08-04 implementation-readiness clarification：`DEV-052` 的整包核准可建立 formal drawing master；小數首版以 physical `drawing_revision_packages.status='Pending'` + immutable review-approval companion 投影 effective `ReviewApproved`，不擴張既有 physical status enum。不得把小數版標為 `Released`、更新 manufacturing current pointer 或進入正式交接。本規格的 minor release gate 完整保留。詳見 `.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`。

2026-08-25 DEV-098 amendment：canonical Drawing工作臺採使用者確認的`1C-bounded／2A／3A`。server suggestion仍是
預設推薦，但具正常Drawing work建立權限的RD可在exact non-stale source所屬整數主版次下，只輸入未占用且沿lineage
向前的minor suffix；major prefix與完整label由server固定。這是對本文件「偏離建議需override reason」的bounded
canonical exception：`manual_minor`不要求override reason，但server必須保存selection mode／policy evidence並在create
transaction重驗tuple、predecessor、branch base與claim。舊submission flow的完整revision override仍沿用原reason規則；
本amendment不開放canonical history backfill、manual major、跨major minor或minor Released。stale branch一律freeze，
major promotion稱`採用為量產版`，不得稱merge。現行release gate與out-of-order controlled history不變。current authority見
`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-unified-revision-and-branch-flow.md`與配對ADR。
2026-08-25 implementation-readiness closure：DEV-098沿用既有`drawing_revisions.policy_snapshot_json`保存typed target policy，
沿用`drawing_revision_claims`tuple unique constraint作唯一authority；schema／migration=`none`。stale freeze涵蓋既有work／review／
file／recognition user mutation，pre-production只允許canonical `0.x → 1`，所有basis-sensitive mutation採aggregate-first鎖序。
fixed QA為`QA-098-001..031`，full QA要求disposable PostgreSQL；本文件的minor release gate仍是mandatory regression。

Related authority:

- `.ai-doc/reference/pdm-management-policy-draft.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`
- `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`
- `.ai-doc/qa/qa-pdm-revision-manual-validation-plan-2026-06-22.md`

## 1. Human Decision Brief

Source: 2026-07-17 user critique and guided decisions.

Closed decisions:

- `HD-050-01 / 1C`：文件目標為 `RD Implementation Ready`，但採逐步確認到越來越細；可拆成多個小任務。
- `HD-050-02 / 2A`：第一範圍先處理 P0 發布閘門，阻止小數版從 `Released` 發行；同時加入系統自動建立建議版次。
- `HD-050-03 / 3A`：若未來處理小數版緊急使用，不得用 `Released` 包裝，只能另走受控 `ConditionalUse` / `TrialApproved` 路徑。
- `HD-050-04 / 1C`：實作順序改為先做系統自動建立建議版次，再接 P0 發布閘門。
- `HD-050-05 / 2B`：建議版次不新增獨立 policy decision table；先由 API response 產生，送審時寫入 submission snapshot。
- `HD-050-06 / 3C`：Phase 1 先不開放緊急使用情境；`ConditionalUse` / `TrialApproved` 保留為未來決策，不納入目前實作。

PM interpretation:

- 既有 drawing revision package 規格仍保留「可補登低版次、可有正式受控歷史、阻擋同圖號同版次重複」的原則。
- 本規格新增的是「生命週期語意」：`Released` 只代表正式量產有效版次，必須是整數版；小數版可以是受控研發、設變或歷史證據，但不能成為正式量產 `Released`。
- 使用者要求逐步確認，因此 Phase 1 拆成 1A suggestion snapshot、1B release gate、1C deferred emergency-use lane；目前不開放 `ConditionalUse` / `TrialApproved`。

## 2. Critical Gap

Pre-implementation state had partial policy helpers, but enforcement was incomplete:

| Layer | Current behavior | Gap |
|---|---|---|
| `src/lib/revision-policy.ts` | Can validate major/minor and has lifecycle-aware stage options. | Call sites do not consistently pass lifecycle stage when submission/release happens. |
| `src/lib/validation.ts` | `validateSubmissionInput()` checks revision format. | It does not know whether the revision is being released, trialed or used in RD workspace. |
| `src/lib/drawing-submission-workbench.ts` | Creates/validates submission inputs and suggestions. | Suggestion is advisory; a user override can still flow toward release if later gates do not re-check lifecycle. |
| `src/lib/submission-release-workflow.ts` | Executes approval/release workflow. | Release path can proceed without a central assertion that minor revisions are forbidden as `Released`. |
| `src/lib/repositories/submission-status-async-repository.ts` | Updates current Released revision and obsoletes old Released records. | It treats a successful release as lifecycle truth, but does not reject minor revisions before updating state. |
| `/numbering/revisions` and suggestion API | Display or return suggested revision. | Suggestion is not yet a server-derived policy snapshot with stale/override handling at submission time. |

Resulting risk:

```text
0.2 / 1.1 can be accepted by format validation and later become Released
even though management policy reserves formal production release for major revisions.
```

Phase 1A/1B local implementation closes this risk for the touched approval, retry-release and release workflow paths. Production deploy, live data repair and historical cleanup remain out of scope.

## 3. Product Rule

Authoritative rule:

```text
Major revision: 1, 2, 3...
  Formal production-effective revision.
  May become Released after normal review/release gates.

Minor revision: 0.1, 0.2, 1.1, 1.2...
  RD, design-change, trial, conditional-use or controlled history revision.
  Must not become Released.
```

Allowed states by revision kind:

| Revision kind | Allowed controlled outcomes | Forbidden outcome |
|---|---|---|
| Major | `Released`, historical Released, Obsolete after superseded, rejected/cancelled workflow states | None specific to kind |
| Minor | `Draft`, `Pending`, effective `ReviewApproved`（DEV-052 companion projection）, controlled history, rejected/cancelled workflow states | physical `Released`; Phase 1 also forbids emergency-use substitutes |

Vocabulary rule:

- `Released` means formal production-effective release.
- `TrialApproved` and `ConditionalUse` are reserved future vocabulary only. They are not enabled in Phase 1 because `HD-050-06 / 3C` excludes emergency-use scenarios.

## 4. Utility Theory Decision

Decision objective:

Maximize compliance and production correctness while preserving existing low-friction revision work.

Utility weights for this change:

| Utility factor | Weight | Reason |
|---|---:|---|
| Formal release correctness | 0.35 | A wrong `Released` minor revision creates high downstream manufacturing and audit cost. |
| Production safety | 0.25 | Manufacturing, handoff and default downloads must not silently consume trial/minor work. |
| Operator speed | 0.15 | RD still needs quick minor revisions and auto suggestions. |
| Audit/recovery quality | 0.15 | Overrides and blocked releases must leave explainable evidence. |
| Implementation reversibility | 0.10 | Phase 1 should be additive and testable before deeper lifecycle UI changes. |

Options considered:

| Option | Utility result | Decision |
|---|---|---|
| A. Server-create suggested revision, snapshot it on submission, then hard-block minor `Released` while keeping out-of-order history | Highest after `HD-050-04..06`: reduces operator error first, then closes the high-loss terminal state without adding an independent table. | Chosen |
| B. Warning-only when minor is released | Low. Human can still approve the unsafe state under pressure. | Rejected |
| C. Rewrite all revision/status machine before any gate | Medium. Cleaner long-term but delays the P0 prevention. | Rejected for Phase 1 |
| D. Reintroduce strict chronological approval | Low. Conflicts with accepted backfill/history behavior and does not solve minor-as-Released. | Rejected |

Chosen policy:

```text
Create server-derived revision suggestions first.
Snapshot accepted/overridden suggestions when submission is created.
Then block the catastrophic minor-as-Released terminal state.
Do not open emergency-use lanes in Phase 1.
```

## 5. Algorithm Contract

### 5.1 Inputs

Every revision policy evaluation must receive:

| Field | Required | Description |
|---|---|---|
| `companyId` | yes | Company boundary. |
| `drawingNumber` or controlled object identity | yes | Revision subject. |
| `targetRevision` | yes for gate, optional for suggestion | User-selected revision. |
| `targetLifecycleStatus` | yes for gate | Intended terminal or transition target, e.g. `Released`. |
| `workflowIntent` | yes | `rd_workspace`, `design_change_workspace`, `release_area`. |
| `actor` | yes | Server-derived principal, role and company context. |
| `policyVersion` | yes | Versioned policy identifier, initial value `revision-policy-002.1`. |
| `basisRecords` | yes | Existing packages/submissions/released history used to compute suggestion or gate result. |

### 5.2 Outputs

The policy engine returns a deterministic decision:

```ts
type RevisionPolicyDecision =
  | {
      allowed: true;
      decision: "allow";
      revisionKind: "major" | "minor";
      suggestedRevision?: string;
      reasonCodes: string[];
      policyVersion: "revision-policy-002.1";
      basisHash: string;
    }
  | {
      allowed: false;
      decision: "block";
      revisionKind: "major" | "minor";
      reasonCode:
        | "minor_revision_cannot_be_released"
        | "release_area_requires_major_revision"
        | "conditional_use_not_supported_in_phase_1"
        | "revision_policy_basis_stale";
      userMessage: string;
      policyVersion: "revision-policy-002.1";
      basisHash: string;
    };
```

### 5.3 Revision Classification

```text
major: /^[1-9][0-9]*$/
minor: /^(0|[1-9][0-9]*)\.[1-9][0-9]*$/
invalid: anything else, unless explicitly allowed by legacy read-only parser
```

New write paths must use numeric no-`V` revisions only. Legacy display/read-only compatibility can still parse older data where existing code already allows it.

### 5.4 Release Gate Algorithm

Pseudocode:

```ts
function assertRevisionPolicyCanTransition(input) {
  const kind = classifyRevision(input.targetRevision);

  if (input.targetLifecycleStatus === "Released" && kind !== "major") {
    return block("minor_revision_cannot_be_released");
  }

  if (input.workflowIntent === "release_area" && kind !== "major") {
    return block("release_area_requires_major_revision");
  }

  if (input.workflowIntent === "conditional_use") {
    return block("conditional_use_not_supported_in_phase_1");
  }

  return allow();
}
```

Where to enforce:

1. Approval route: before recording the final approval that would trigger release.
2. Release workflow: before marking submission `Releasing` or mutating lifecycle/current revision.
3. Retry-release route: before retrying a previously failed release.
4. Any future batch publish/handoff endpoint: before writing `Released` or production-effective current pointer.

Failure behavior:

- Return a human-readable Traditional Chinese 409 response.
- Do not record the final approval as completed if that approval would immediately create a forbidden release.
- Record an audit event `revision_policy.release_blocked` with actor, revision, workflow intent, policy version and reason code.
- Keep the package recoverable as `Pending` / `NeedsCorrection` or future minor-lane state; do not silently convert to `Released`.

### 5.5 Suggestion Algorithm

Purpose:

System must create the suggested revision server-side, not rely on a static UI default.

Suggestion rules:

| Intent | Suggestion |
|---|---|
| `rd_workspace` before first major release | Next `0.x`, starting at `0.1`. |
| `release_area` before first major release | `1`. |
| `design_change_workspace` after current major `N` | Next `N.x`, starting at `N.1`. |
| `release_area` after current major `N` | `N + 1`. |

Suggestion pseudocode:

```ts
function suggestRevision(input) {
  const currentMajor = maxReleasedMajor(input.basisRecords);
  const currentMinorBase = currentMajor ?? 0;

  if (input.workflowIntent === "release_area") {
    return currentMajor == null ? "1" : String(currentMajor + 1);
  }

  const minorBase = currentMajor == null ? 0 : currentMajor;
  const nextMinor = maxMinorSuffix(input.basisRecords, minorBase) + 1;
  return `${minorBase}.${nextMinor}`;
}
```

Out-of-order compatibility:

- The suggestion is the recommended next revision, not a chronological approval blocker.
- Users may still intentionally override within the allowed lifecycle lane.
- A minor override can never override the `Released` gate.

### 5.6 Suggestion Snapshot Persistence

Phase 1A does not add an independent `revision_policy_decisions` table.

Chosen persistence rule:

```text
Suggestion API response = ephemeral recommendation with policyVersion + basisHash
Submission snapshot = durable evidence of suggested revision, selected revision and override reason
Release gate/audit = durable evidence of blocked or allowed release transition
```

The API response must include enough data for the submission route to verify it:

```ts
type RevisionSuggestionResponse = {
  suggestedRevision: string;
  workflowIntent: "rd_workspace" | "design_change_workspace" | "release_area";
  policyVersion: "revision-policy-002.1";
  basisHash: string;
  reasonCodes: string[];
  generatedAt: string;
};
```

Submission snapshot fields:

```text
revision_policy_snapshot
- workflow_intent
- suggested_revision
- selected_revision
- override_reason
- policy_version
- suggestion_basis_hash
- suggestion_generated_at
- accepted_or_overridden_at
```

Snapshot rules:

- If selected revision equals suggested revision, store the suggestion snapshot as accepted.
- If selected revision differs from suggested revision, require a user-visible override reason and store it in the submission snapshot.
- Before submission creation, recompute the current basis hash. If it differs from the API response basis hash, reject with a stale-suggestion recovery message.
- Override can never bypass the release gate; a minor selected revision still cannot become `Released`.

## 6. Data / API Contract

### 6.1 New or changed services

Preferred implementation boundary:

| File | Change |
|---|---|
| `src/lib/revision-policy.ts` | Keep parser/comparator and low-level suggestion helpers. |
| `src/lib/revision-policy-engine.ts` | New central engine for lifecycle-aware decision, suggestion and gate result. |
| `src/lib/revision-policy-release-gate.ts` | Central release preflight that blocks minor `Released` and writes fail-closed audit evidence. |
| `src/lib/validation.ts` | Stop treating revision format validation as sufficient for lifecycle decisions. |
| `src/lib/drawing-submission-workbench.ts` | Consume server-created suggestion response, snapshot it on submission and pass lifecycle intent. |
| `src/lib/submission-release-workflow.ts` | Call release gate before any release side effect. |
| `src/app/api/submissions/[id]/approve/route.ts` | Preflight final approval against release gate. |
| `src/app/api/submissions/[id]/retry-release/route.ts` | Re-run release gate before retry. |
| `src/app/api/submissions/revision-suggestion/route.ts` | Return server-derived policy response, not just a UI default string. |

### 6.2 API behavior

`POST /api/submissions/revision-suggestion`:

- Input: subject and workflow intent.
- Output: `suggestedRevision`, `workflowIntent`, `policyVersion`, `basisHash`, `reasonCodes`, `generatedAt`.
- Side effect: none. This route must not create an independent policy decision table in Phase 1.

Submission create / controlled package create:

- Input includes the suggestion response fields when a suggestion was shown.
- Server recomputes basis hash.
- If selected revision differs from suggestion, require an override reason and store it in the submission snapshot.
- If stale, return 409 with recompute instruction and do not create the submission.

Final approval / release:

- If target is `Released` and revision is minor, return 409:

```json
{
  "code": "minor_revision_cannot_be_released",
  "message": "小數版是研發或設變中的版次，不能發行為正式 Released。請建立下一個整數正式版，或退回修改版次。"
}
```

## 7. RD Slices

### Phase 1A：Server-Created Suggested Revision Snapshot

Authorization state: Implemented locally in this branch.

Scope:

- Make suggestion route return a server-derived policy response with `policyVersion`, `basisHash` and `generatedAt`.
- Store accepted/overridden suggestion fields in the submission snapshot.
- Require override reason when selected revision differs from suggestion.
- Reject stale suggestion response when basis hash changes before submission creation.
- Do not add `revision_policy_decisions` or any independent suggestion table.

No schema migration is required unless the existing submission snapshot cannot store policy snapshot fields.

Acceptance:

- Opening/initializing a revision workbench receives a server-created suggestion response.
- Suggestion differs by intent: RD/design-change suggests minor; release area suggests major.
- Submission snapshot records suggested revision, selected revision, policy version, basis hash and override reason when applicable.
- Stale basis blocks submission creation and asks user to recompute.
- Override is stored with reason, but cannot bypass `Released` minor gate in Phase 1B.

### Phase 1B：P0 Release Gate

Authorization state: Implemented locally in this branch.

Scope:

- Add central `assertRevisionPolicyCanTransition`.
- Block minor revision when target status is `Released`.
- Hook gate into final approval, release workflow and retry-release.
- Add audit event for blocked release.
- Add focused tests for API/service/workflow paths.

Acceptance:

- `0.2` / `1.1` cannot become `Released`.
- Final approval that would release a minor revision is rejected before recording final approval.
- Retry-release of a minor revision is rejected.
- Direct release workflow call is rejected.
- Major revision `1` / `2` still follows existing release behavior if other gates pass.
- Existing duplicate same drawing + same revision blocker remains intact.
- Existing out-of-order formal history behavior remains intact for non-duplicate major revisions; minor revisions still cannot become `Released`.

### Phase 1C：Emergency Use Lane Deferred

Authorization state: Deferred by `HD-050-06 / 3C`; not open for implementation.

Scope:

- Do not add `ConditionalUse` or `TrialApproved`.
- Do not show an emergency-use recovery path.
- Do not allow any minor revision to become production-effective through an alternate terminal state.

Acceptance:

- Attempts to use `conditional_use`, `ConditionalUse` or `TrialApproved` in Phase 1 are rejected or hidden.
- Minor revision release recovery offers only controlled correction paths, not emergency-use approval.
- Any future request to open emergency use requires a new human decision and likely ADR/status-machine review.

### Phase 2：Transfer / Handoff Consumer Alignment

Authorization state: Future Phase Capsule.

Scope:

- Make manufacturing handoff, default downloads, transfer package and dashboards consume only major `Released` as production current.
- Display minor trial/conditional records separately.

### Phase 3：Historical Data Classification

Authorization state: Future Release/Data-Repair Gate.

Scope:

- Report existing minor records that are currently marked `Released`.
- No automatic mutation without backup, dry-run, human review and release/data-repair approval.

## 8. UX Contract

The UI must not teach users to "just release 0.2".

Required visible behavior:

- When workflow intent is RD/design-change, the suggestion pill should say `建議研發版次 0.x / N.x`.
- When workflow intent is release area, the suggestion pill should say `建議正式版次 N`.
- If user tries to release a minor revision, show a recovery path:
  - `建立下一個整數正式版`
  - `退回修改版次`
- Do not show `改走條件使用 / 試用核准` in Phase 1.
- Do not expose raw internal codes, SQL errors or English-only stack text.

## 9. Permission / Responsibility

| Action | Minimum responsibility |
|---|---|
| Create suggestion | Authenticated actor with access to drawing/revision workbench. |
| Accept suggestion | Submitter/RD role allowed to create the controlled package. |
| Override suggestion | Same as accept, plus reason. |
| Final release major revision | Existing release approver policy. |

Admin rule:

- Admin may operate the system and approve governance exceptions only where policy allows.
- Admin must not silently turn an engineering minor revision into formal `Released`.

## 10. Failure Modes

| Failure | Required handling |
|---|---|
| Minor release attempted | 409, no final approval consumed, audit `revision_policy.release_blocked`. |
| Suggestion basis stale | 409, recompute suggestion, do not create submission from stale response. |
| Missing suggestion snapshot | Server recomputes; if route requires a visible suggestion for the flow, return actionable recovery. |
| Override without reason | 400/422 with Chinese message. |
| Audit write unavailable | Fail closed for release gate; do not release. |
| Existing historical minor Released records found | Report only; no mutation in Phase 1. |

## 11. Stop Conditions

Stop and return to PM/user if:

- Implementation would allow any minor revision to become `Released`.
- Existing code requires production migration, live data repair, deletion or historical mutation.
- Any request would open `ConditionalUse`, `TrialApproved` or emergency-use manufacturing authority in Phase 1.
- The change would reintroduce strict chronological approval order and conflict with accepted out-of-order history behavior.
- Suggestion snapshot requires an independent policy table or non-additive schema change.
- Release gate cannot run before release side effects.
- Audit event cannot be written or fail-closed safely.
- Production deploy, production migration, direct DB mutation, merge, PR, rollback or release artifact is needed.

## 12. QA / QC Gate

Required QA plan:

- `.ai-doc/qa/qa-pdm-revision-policy-release-gate-validation-plan-2026-07-17.md`

Minimum focused evidence for Phase 1A:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run qc:pdm-revision-policy-suggestion
```

The new `qc:pdm-revision-policy-suggestion` should cover:

- server-derived suggestion by workflow intent;
- basis hash recomputation;
- stale response rejection on submission create;
- override reason required when selected revision differs;
- submission snapshot contains suggestion/selection/policy metadata;
- no `revision_policy_decisions` table requirement.

Minimum focused evidence for Phase 1B:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run qc:pdm-change-control
npm.cmd run qc:pdm-drawing-revision-package-model
npm.cmd run qc:pdm-revision-policy-release-gate
```

The new `qc:pdm-revision-policy-release-gate` should cover:

- service-level minor release block;
- approval route final-approval block;
- retry-release block;
- direct workflow block;
- major release unaffected;
- duplicate same-revision blocker still active;
- out-of-order non-duplicate history behavior not regressed.

Local implementation evidence captured on 2026-07-17:

```powershell
npm.cmd run qc:pdm-revision-policy-suggestion
npm.cmd run qc:pdm-revision-policy-release-gate
npm.cmd run qc:pdm-change-control
npm.cmd run qc:pdm-drawing-submission-workbench-recovery
npm.cmd run qc:pdm-drawing-submission-review-only
npm.cmd run qc:pdm-drawing-revision-package-model
npm.cmd run qc:pdm-release-master-status-sync
npm.cmd run lint
npx.cmd tsc --noEmit --pretty false
```

The TypeScript gate required removing an obsolete historical `.tmp/next-qc-numbering-request-ux-20260714` type include from `tsconfig.json`; that generated validator referenced routes no longer present in current source.

## 13. Spec Governance Result

Cross-spec handling:

- `Intentional replacement` for any older wording that implied every approved drawing revision package can become `Released` regardless of major/minor kind.
- `Compatible exception` for existing out-of-order/backfill behavior: it remains valid for controlled history, but no longer authorizes minor-as-production `Released`.
- `No conflict` with duplicate formal same drawing + same revision blocker; that blocker remains.
- `No conflict` with first-class package immutability; package core immutability applies after its allowed terminal lane.

ADR decision:

- ADR not required for Phase 1A/1B because the decision source is the management policy plus explicit user decisions, and Phase 1A uses existing submission snapshot rather than a new policy table.
- ADR likely required before any future emergency-use lane because `ConditionalUse` / `TrialApproved` would become a long-lived status machine shared across manufacturing, transfer and release consumers.

Implementation readiness:

- Phase 1A and Phase 1B are implemented locally after `HD-050-04..06`.
- Phase 1C is deferred and not open for implementation.
- Phase 2/3 are future capsules and must not block Phase 1B P0 release gate.
