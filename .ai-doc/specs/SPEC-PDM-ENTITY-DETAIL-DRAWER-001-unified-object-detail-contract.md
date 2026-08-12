# SPEC-PDM-ENTITY-DETAIL-DRAWER-001 - 圖號 / 料號 / 主根號統一物件詳情抽屜

Status: Phase 1C Unified Drawing Workspace Implemented Locally / Independent QC Passed; `DEV-067 UnifiedPdmEntityDetailDrawer RD Implementation Ready / Human Confirmed / RD not started`; Local implementation eligible; Release Not Authorized
Date: 2026-07-09
Owner: Dev PM
Related DEV: `DEV-PDM-ENTITY-DETAIL-DRAWER-001` / `DEV-039`; `DEV-PDM-DRAWING-WORKBENCH-SIMPLIFICATION-001` / `DEV-057`; `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`
Related QA: `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`; `.ai-doc/qa/qa-dev-067-unified-pdm-entity-detail-validation-plan-2026-08-12.md`
Extends: `.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md`
Extends: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
Extends: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
Extends: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`

> **2026-08-11 Part-cost retirement amendment**
>
> The part-cost sections, cost status, cost redaction and cost-maintenance deep links are retired from the current drawer contract by `ADR-PDM-PART-COST-RETIREMENT-001`. This document's historical cost references must not be implemented or used as current acceptance criteria.

## 2026-08-12 DEV-067 Amendment - `UnifiedPdmEntityDetailDrawer`

Status: `RD Implementation Ready / Human Confirmed / RD not started / Local implementation eligible / Production release gated`.

### Fact finding and gap classification

The existing implementation has partial shell convergence, not one cross-state and cross-domain detail contract:

- Candidate and formal paths share `DrawingWorkspaceDrawer`, `DrawingDetailContent` and the low-level `PdmEntityDetailDrawer` shell.
- Candidate still composes `NumberingCandidateRevisionEditor`, `CandidateDrawingPreview`, `LifecycleV2PendingPanel` and `WorkspaceRelationsDetails`; formal composes `MasterAttachmentPanel`, `DrawingSubmissionPrerequisitePanel`, `SameRootPartPanel` and contextual entrypoints.
- Candidate preview currently maps file presence directly to `ready`, while formal preview uses the attachment/derivative queue, polling and richer ready/delayed/failed states. Sharing `DrawingDetailPreview` card markup does not make those behaviors equivalent.
- The flag-off branch in `src/app/numbering/drawings/page.tsx` still owns a separate `DrawingDetailDrawer` composition.
- Part candidate detail uses the shared workspace composition while formal Part detail directly composes `PdmEntityDetailDrawer` and `PartDetailContent`; the visible body still changes by source state.
- Relation root/candidate/child details use relation-specific composition and custom owner renderers. It reuses some owner content, but there is no single projection order or visibility contract shared with Drawing and Part.
- Existing static QC proves shared component references and a common section skeleton; it does not prove one preview orchestration, one section model or one real-browser behavior across every lifecycle state and reviewer role.

Therefore the earlier statement that all lifecycle variants use one visible detail module is only partially satisfied. A Drawing-only wrapper would also leave Part and Relation muscle memory split. `DEV-067` intentionally strengthens the contract below.

### Canonical visible component

Every covered Drawing, Part and Relation lifecycle state and actor context MUST mount one top-level `UnifiedPdmEntityDetailDrawer`:

```text
UnifiedPdmEntityDetailDrawer
├─ SharedIdentityStatusHeader
├─ ProjectionComposer（固定相對順序）
│  ├─ DrawingProjection
│  ├─ PartProjection
│  ├─ RelationProjection
│  └─ ReviewContextProjection
│     └─ ApprovalSnapshotProjection（scope/hash/diff evidence only）
└─ ContextActionBar
```

The fixed order is a sequence of available projection slots, not a requirement to render empty cards. A projection that is not applicable or not authorized is not hydrated and is omitted; the remaining slots keep their relative order. `PdmEntityDetailDrawer`, `DrawingWorkspaceDrawer` and `WorkspaceDrawer` may temporarily remain as low-level shell or compatibility wrappers, but they must not remain public APIs capable of independently assembling a covered domain body.

`UnifiedPdmEntityDetailDrawer` owns overlay geometry, shared header, one body scroll owner, focus/Escape behavior, safe return and one `ContextActionBar`. It MUST NOT contain a giant Drawing/Part/Relation status-role conditional render tree. A projection registry maps normalized projection models to domain-owned components. `DrawingProjection`, `PartProjection` and `RelationProjection` retain their domain data, preview and command authorities; they may consume facts, media identifiers, capabilities, disabled reasons and command references, but may not fetch or mutate a second object truth from inside the shared composer.

### Server-derived projection policy

The server derives `none | summary | full` for every projection from the canonical entity, surface, lifecycle state, actor capabilities, company and active review context. It returns only permitted projection data and fields. Fetching all data and hiding sections with client conditions or CSS is forbidden.

| Surface/context | DrawingProjection | PartProjection | RelationProjection | ReviewContextProjection |
|---|---|---|---|---|
| `/numbering/drawings` normal | `full`: shared 3D/2D, files/revisions, readiness | `summary`: linked part identity/summary only | `summary`: relation and traceability | `none` |
| `/parts` normal | `summary`: representative drawing identity/preview summary only; no drawing files or revision detail | `full`: part facts and permitted part documents | `summary`: linked drawings and traceability | `none` |
| `/numbering/search` relation | `full` | `full` | `full` | `none` |
| assigned active review | `full` inside exact request scope | `full` inside exact request scope | `full` inside exact request scope | `full` |

`full` means information is reachable, not that every section is expanded. Review opens decision-critical content first; secondary detail may be collapsed with a present-section navigation index. This prevents a full aggregate from becoming an unreadable long drawer.

Reviewer full visibility is an ephemeral, server-derived review-scope capability, not a global role bypass. It requires exact reviewer assignment/eligibility, active request, same company and target membership. Terminal, unassigned, tampered or cross-company context cannot obtain the full aggregate. If any required projection cannot be authorized or hydrated, decision commands fail closed and the drawer shows the recovery owner instead of silently omitting evidence.

### Projection ownership

1. **DrawingProjection** owns the existing Drawing six-section behavior in this internal order: identity/state context supplied by the shared header, automatic 3D/2D preview, attachments/revisions, readiness/next step, drawing-side relation/traceability, and its contribution to the context action model. Candidate, formal, review and history use the same preview resolver and section components.
2. **PartProjection** owns part identity facts, permitted part documents and part-side relation summaries. In Drawing context it is summary-only; in Part/Relation/review context policy may expose more. It never imports Drawing file mutation authority.
3. **RelationProjection** owns root/drawing/part topology, matrix/health/blockers and traceability. It does not duplicate Drawing or Part fields and forms that belong to their projections.
4. **ReviewContextProjection** owns request status, scope, reviewer responsibility, decision history/reason and integrity evidence. `ApprovalSnapshotProjection` is a narrow child that may show target IDs, scope, hash/diff/check result and mismatch status only. It MUST NOT render copied Drawing/Part/Relation facts, files or relationships. Snapshot drift fails closed; snapshot content never substitutes for locked owner data.
5. **ContextActionBar** is the sole primary-action owner. Projections contribute capability/action descriptors; they do not each render competing sticky footers. Candidate edit, controlled read, relation mutation and approval decision commands remain server-authorized by their existing domain owners.

### State and capability matrix

| State family | Same composer/projections | State-specific behavior allowed |
|---|---|---|
| `building`, `drawing_preparation` | same composer; policy-selected projections | editable draft facts/files; show missing requirements; one safe next action |
| `bundle_ready` | same composer; policy-selected projections | readiness complete; action bar exposes submit after risk/scope confirmation |
| `in_review`, `revision_in_review` | same composer; owner data locked | submitter may withdraw if permitted; exact reviewer gets scoped full projections and decision controls |
| `auto_finalizing` | same composer; read-only | action bar states progress/no action/retry destination |
| `correction_required` | same composer | editable only after returned state is effective; show correction reason and resubmit path |
| `recovery_required` | same composer; read-only evidence | explicit recovery owner/action |
| `rd_controlled`, `released` | same composer | controlled files remain immutable; action bar may offer revision/traceability actions |
| `history_only` / terminal | same composer; read-only | safe successor/return action; no mutation from terminal record |

This is **visible composition and interaction convergence**, not data-owner or command-authority convergence. The composer consumes server-derived projection models/capabilities and invokes domain commands without reimplementing policies.

### Shared behavior rules

1. **Identity/status**: one shared hierarchy for stable entity identity, human status, actor responsibility and validated return behavior. Domain labels may differ; header structure may not.
2. **Automatic preview**: one Drawing preview resolver/state vocabulary across every context. File presence alone is not `ready`; queued/running/ready/delayed/failed/unavailable/missing use the same polling/retry behavior.
3. **Projection order**: only present projections appear, always in canonical relative order. Surface context may set default expansion/focus but cannot create another body.
4. **Now What**: normal usable states avoid redundant teaching text; blocked/error/terminal states first identify next action and responsible owner.
5. **Action bar**: exactly one primary action. Secondary/destructive actions retain permission, impact preview, confirmation and disabled reason. Reviewer approve/return/reject is a capability in this bar, not a separate review body.

### UX and acceptance direction

- Status transitions refresh the same selected canonical entity and same drawer; they do not close one module and open another.
- The drawer body has one scroll owner. The action bar may be sticky but must not overlap preview/files/confirmation content or create a second ambiguous vertical scroll region.
- At 1440×900, 1024×768, 768×1024 and 390×844, validate every state family for overflow, crop, focus, Escape/nested-modal behavior and visible runtime errors.
- Real-browser evidence must compare Drawing, Part, Relation, candidate/formal/history, submitter and assigned-reviewer contexts at each supported viewport. Static source checks alone cannot close this brief.
- `data-component="unified-pdm-entity-detail-drawer"` (or the exact RD Contract equivalent) appears once for an open entity; legacy/candidate/formal/approval drawer body markers must not coexist.
- Network evidence proves omitted projections and prohibited fields are absent from responses, not merely hidden in the DOM. Review-scope elevation, expiry and cross-company denial require negative tests.

The implementation contract below closes the former readiness gaps. RD may execute Phase 1A through 1D locally in order without another product-design decision. Production/staging, live data, merge, PR, deploy and release remain separately gated.

## DEV-067 RD Implementation Contract（2026-08-12）

### 0. Readiness result and implementation invariant

`DEV-067` is `RD Implementation Ready`. This amendment is the executable contract for the next local implementation and intentionally replaces historical sections in this file wherever they still describe an optional read facade, an approval-owned detail body, lifecycle-specific visible bodies, or a frontend-only source-context projection.

The non-negotiable invariant is:

> One canonical entity key + one server-composed read snapshot + one `UnifiedPdmEntityDetailDrawer` + one domain projection implementation per domain + one context action bar.

The shared composer is not a new cross-domain data owner. Existing Drawing, Part, Relation and approval services remain authoritative for facts and commands. The new facade only resolves identity, authorizes projection depth, reads the existing authorities in one bounded snapshot and returns normalized view models.

No schema migration or backfill is required. Existing `approval_platform_requests`, `approval_platform_targets`, `approval_requests`, lifecycle reviewer rows and typed workbench row keys are sufficient. Existing indexes `idx_approval_platform_requests_status`, `idx_approval_platform_requests_action`, `idx_approval_platform_targets_request` and `idx_approval_platform_targets_target` are reused. If implementation requires a new table, global reviewer permission, RLS relaxation or data rewrite, RD must stop and return to Dev PM.

### 1. Exact public TypeScript contract

RD must create `src/lib/pdm-entity-detail-contract.ts` as a React/DB-free type module. The public envelope is versioned and discriminated; a `none` projection is represented by an omitted key, never by a hydrated payload that the client hides.

```ts
export type PdmEntityKey =
  | `candidate:${string}`
  | `drawing:${string}`
  | `part:${string}`
  | `root:${string}`;

export type PdmDetailSurface = "drawing" | "part" | "relation";
export type PdmProjectionLevel = "summary" | "full";
export type PdmDetailStateFamily =
  | "building" | "drawing_preparation" | "bundle_ready"
  | "in_review" | "auto_finalizing" | "correction_required"
  | "recovery_required" | "rd_controlled" | "released"
  | "history_only" | "terminal";

export type PdmProjectionEnvelope<Summary, Full> =
  | { level: "summary"; data: Summary }
  | { level: "full"; data: Full };

export type PdmEntityDetailResponse = {
  schemaVersion: "pdm-entity-detail.v1";
  entityKey: PdmEntityKey;
  surface: PdmDetailSurface;
  generatedAt: string;
  revisionToken: string;
  header: SharedIdentityStatusHeaderModel;
  projections: {
    drawing?: PdmProjectionEnvelope<DrawingProjectionSummary, DrawingProjectionFull>;
    part?: PdmProjectionEnvelope<PartProjectionSummary, PartProjectionFull>;
    relation?: PdmProjectionEnvelope<RelationProjectionSummary, RelationProjectionFull>;
    review?: PdmProjectionEnvelope<never, ReviewContextProjectionFull>;
  };
  actionBar: ContextActionBarModel;
  navigation: PdmDetailNavigationModel;
};
```

Required common models:

```ts
export type SharedIdentityStatusHeaderModel = {
  entityKind: "candidate" | "drawing" | "part" | "root";
  entityCode: string;
  displayName: string;
  humanStatus: HumanStatusProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  stateFamily: PdmDetailStateFamily;
  actorResponsibility: string;
  lockedByReview: boolean;
};

export type PdmDetailActionKind =
  | "edit" | "submit_review" | "withdraw_review"
  | "approve" | "return_for_correction" | "reject"
  | "retry_apply" | "retry_cleanup" | "create_revision"
  | "manage_relation" | "view_history" | "refresh" | "return";

export type PdmDetailActionDescriptor = {
  id: string;
  kind: PdmDetailActionKind;
  owner: "drawing" | "part" | "relation" | "approval" | "navigation";
  label: string;
  tone: "primary" | "secondary" | "danger";
  placement: "primary" | "secondary";
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
  commandRef: string | null;
  requiresConfirmation: boolean;
  idempotencyRequired: boolean;
};

export type ContextActionBarModel = {
  primary: PdmDetailActionDescriptor;
  secondary: PdmDetailActionDescriptor[];
};

export type PdmDetailNavigationModel = {
  ownerHref: string;
  returnTo: string;
  fallbackHref: "/approvals";
  targetAnchors: Array<{
    id: string;
    label: string;
    projection: "drawing" | "part" | "relation" | "review";
  }>;
};
```

Action priority is deterministic: actionable recovery first; assigned review decision second; owner lifecycle next step third; safe return last. Review context uses `approve` as the one primary action when decision-ready; return/reject/needs-information equivalents are secondary. If no mutation is legal, `return` is the primary action. Projection components may render local read links such as preview/download/section anchors, but may not render a second sticky footer or competing lifecycle CTA.

### 2. Exact domain projection fields

The domain models must not expose raw DB rows, `payload_json`, `snapshot_json`, storage keys, provider credentials, unscoped file IDs or arbitrary server errors.

`DrawingProjectionSummary` contains only `drawingId`, `rowKey`, `drawingNumber`, `displayName`, `purposeCode`, `purposeLabel`, `humanStatus`, `viewerStatus`, `availabilityScope`, `linkedPartCount` and a representative preview summary (`kind`, server state and non-download identity only). It contains no revision list, attachment list, source asset ID or file mutation capability.

`DrawingProjectionFull` contains the summary plus:

- canonical Drawing/revision identity and `stateFamily`;
- the same two-slot automatic preview model used by every context;
- current revision and allowed revision history summary;
- attachment/version rows, allowed media hrefs and per-row capabilities;
- readiness blockers and `Now What` owner;
- linked Part identity summaries and drawing-side traceability;
- command capabilities and disabled reasons, not callback functions.

The preview model is exact:

```ts
export type DrawingPreviewState =
  | "queued" | "running" | "ready" | "delayed"
  | "failed" | "unavailable" | "missing";

export type DrawingPreviewSlotModel = {
  kind: "three-d" | "two-d";
  title: string;
  fileName: string | null;
  state: DrawingPreviewState;
  stateTitle: string;
  stateText: string;
  mediaHref: string | null;
  downloadHref: string | null;
  retryCommandRef: string | null;
};
```

`PartProjectionSummary` contains `partId`, `rowKey`, `partNumber`, `rootCode`, `displayName`, `itemKind`, `humanStatus`, `viewerStatus`, `availabilityScope`, `linkedDrawingCount` and representative drawing identity only. `PartProjectionFull` adds allowed Part attributes, Part-owned documents, linked Drawing summaries, shared-model/variant summaries, lifecycle/readiness/traceability and Part command capabilities. Retired Part-cost fields remain absent.

`RelationProjectionSummary` contains `rootId`, `rowKey`, `rootCode`, relation health, counts, blockers and traceability summary. `RelationProjectionFull` adds batched Drawing/Part nodes, link topology/matrix, active changes, target anchors and relation command capabilities. It references Drawing/Part identities and anchors; it does not duplicate their file, revision, attribute or document bodies.

`ReviewContextProjectionFull` contains:

- `requestId`, source, action code/title, active status, requester, eligible reviewer responsibility and decision readiness;
- exact target index, target/section anchors and one atomic decision boundary;
- allowed decisions, reason policy, prior decisions allowed by the existing domain and recovery commands;
- `ApprovalSnapshotProjection` limited to `snapshotId`, target IDs, snapshot hash, current aggregate hash, check status, checked time, diff summary and mismatch reason;
- no copied Drawing/Part/Relation fields, file cards, raw JSON or snapshot body.

### 3. Server visibility policy and API

RD must create:

- `src/lib/pdm-entity-detail-policy.ts` for pure policy resolution;
- `src/lib/pdm-entity-detail.ts` for service orchestration;
- `src/lib/repositories/pdm-entity-detail-async-repository.ts` for one-snapshot reads;
- `src/app/api/pdm/entity-details/[entityKey]/route.ts` for the read facade.

Request:

```text
GET /api/pdm/entity-details/{encodeURIComponent(entityKey)}
    ?surface=drawing|part|relation
    [&reviewRequestId={requestId}]
```

The route requires authenticated user and company context and parses only the four typed entity-key prefixes. Without review context it requires the existing owner-page permission. With `reviewRequestId`, the server first resolves a valid `PdmReviewScopeReceipt`; that receipt is the only bounded alternative to normal owner-page read permission and exposes only its exact company/request/targets. `surface` and `reviewRequestId` are untrusted presentation inputs and never grant visibility by themselves. A failed receipt does not fall back to normal full-review data.

`resolveDetailSurfacePolicy()` takes canonical entity, requested surface, lifecycle state, company, actor capabilities and optional verified review receipt, and returns four levels. The hard matrix is:

| Effective context | Drawing | Part | Relation | Review |
|---|---:|---:|---:|---:|
| Drawing owner | full | summary | summary | omitted |
| Part owner | summary | full | summary | omitted |
| Relation owner | full | full | full | omitted |
| Verified active review | full | full | full | full |

The server serializes only fields allowed by the selected level. A summary serializer must be a separate allowlist mapper; it must not spread a full model and delete fields afterward. Network negative tests must prove that omitted fields are absent.

Response success is `200`, `Cache-Control: private, no-store`. `revisionToken` is a stable hash of canonical IDs, row versions, preview states and verified review status used to ignore stale client responses. The client must cancel/ignore superseded requests by entity key + request sequence.

### 4. One-snapshot read and query budget

`PdmEntityDetailService.detail()` owns exactly one `withPdmWorkbenchReadSnapshot()` boundary. PostgreSQL remains `REPEATABLE READ READ ONLY`; SQLite uses its transaction snapshot. The service must not call the three HTTP APIs or invoke repository methods that open nested snapshots.

RD must extract or add `...InClient(client, ...)` readers in:

- `src/lib/repositories/drawing-workbench-async-repository.ts`;
- `src/lib/repositories/part-workbench-async-repository.ts`;
- `src/lib/repositories/relation-workbench-async-repository.ts`;
- `src/lib/repositories/approval-platform-async-repository.ts`.

The new aggregate repository invokes those readers with the same snapshot client and performs batched `IN (...)` hydration for child Drawing, Part, relation, attachment and preview metadata. Projection React components do not fetch their own detail truth. Media bytes and explicit command calls are the only separate requests.

Hard local query budgets, excluding authentication/company lookup and binary media streaming:

| Context | Maximum queries | Growth rule |
|---|---:|---|
| Drawing owner detail | 16 | constant for 1/20/50 linked Parts/files |
| Part owner detail | 16 | constant for 1/20/50 linked Drawings/documents |
| Relation full detail | 24 | constant for 1/20/50 targets/nodes |
| Verified review full aggregate | 28 | constant for 1/20/50 targets; includes request, eligibility and evidence check |

No per-target, per-file or per-node query is allowed. Representative local fixture p95 is `<=500 ms` for normal owner detail and `<=800 ms` for verified review detail. These are focused local gates, not production SLOs.

All required projections are one logical response. A required full projection failure returns the aggregate failure; the server may not return partial success that looks complete. Preview derivative failure is represented in its slot and does not erase the verified original-file row. A missing or unreadable decision-required original evidence sets review decision readiness to false.

### 5. Review scope, exact owner route and multi-target aggregate

RD must create `src/lib/pdm-review-scope.ts`. It resolves a request-specific capability receipt by reusing the same domain decision authority, never by trusting a client role label:

```ts
export type PdmReviewScopeReceipt = {
  requestId: string;
  companyId: string;
  actionCode: string;
  actorId: string;
  entityKey: PdmEntityKey;
  ownerSurface: PdmDetailSurface;
  targetRefs: Array<{ type: string; id: string }>;
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  snapshotHash: string;
  currentAggregateHash: string;
  decisionReady: boolean;
};
```

Eligibility rules:

- drawing revision lifecycle uses the existing active workflow and `drawing_revision_lifecycle_reviewers` exact actor assignment;
- candidate bundle/publication uses existing `numbering.candidate.review.decide`, company and request-specific scope checks;
- legacy numbering actions use existing role/project/action/delegation decision eligibility;
- requester self-approval and separation-of-duties behavior remain whatever the existing decision command enforces; the read receipt cannot weaken it;
- request must be active for review (`pending`); `apply_failed` may expose recovery context only, not a new decision; terminal/unassigned/cross-company/tampered contexts never receive full-review projection data.

The owner resolver is keyed by `(source, actionCode, target type)`, not action label or the first target:

| Covered request | Canonical owner result |
|---|---|
| `numbering.candidate_bundle_review` | `/numbering/search`, `candidate:{workspaceId}` |
| existing `numbering.candidate_publication_review` | `/numbering/search`, `candidate:{workspaceId}` |
| `numbering.drawing_revision_lifecycle_review` | `/numbering/drawings`, `drawing:{drawingId}` resolved from package |
| `numbering.drawing_revision_impact_review` | `/numbering/drawings`, canonical `drawing:{drawingId}` |
| `numbering.same_drawing_variant_after_release` | `/numbering/search`, shared `root:{rootId}` resolved from Drawing/Part |
| `numbering.main_drawing_restore` | `/parts`, canonical `part:{partId}` |
| `numbering.obsolete_part_number` | `/parts`, canonical `part:{partId}` |
| `numbering.obsolete_ma_drawing` | `/numbering/drawings`, canonical `drawing:{drawingId}` |
| `numbering.obsolete_part_root` | `/numbering/search`, canonical `root:{rootId}` |
| `numbering.release` / `numbering.release_missing_ma_confirm` | route by stored primary entity type; root -> relation, drawing -> Drawing, part -> Part |

BOM, submission, drawing-package supplement, transfer-package and other approval domains remain out of DEV-067. Their inbox behavior stays unchanged.

Multi-target resolution follows this order: explicit workspace/root primary target; shared formal root of all Drawing/Part targets; single canonical Drawing; single canonical Part. Targets that span more than one root or cannot be joined to one canonical aggregate return `PDM_REVIEW_AGGREGATE_AMBIGUOUS` and are not actionable; the server never guesses the first target. Stable anchors use `target:{targetType}:{targetId}` and scroll within the same drawer. One request retains one atomic decision bar even when several targets are shown.

### 6. Active-review write lock and transaction boundary

RD must create `src/lib/pdm-review-lock.ts` with `lockPdmEntityScopeAsync(client, targetRefs)` and `assertPdmEntityWriteAllowedAsync(client, input)`. Both review submission and every covered mutation use the same coarse entity locks before reading/fixing the snapshot or changing reviewed content. PostgreSQL locks canonical rows with `FOR UPDATE`; SQLite uses the existing write transaction. The global lock order is `workspace -> root -> drawing -> part -> revision -> attachment/relation`, then lexical canonical ID inside each kind. Dependent rows are locked only after their canonical owner. Multi-target submit sorts/deduplicates the full target set first. This order is mandatory to prevent write-vs-submit races and cross-command deadlocks.

The write guard executes on the same transaction/client after `lockPdmEntityScopeAsync` and before any state/file-reference write. Review-request creation locks the same scope, recomputes the aggregate/hash in that transaction, then inserts the pending request/targets. A read-before-transaction check, inconsistent lock order or snapshot calculation before the common scope lock is insufficient.

Lock states:

- `pending`: reviewed fields are locked;
- `apply_failed`: approved scope remains locked; only existing retry/recovery commands are legal;
- `needs_info`, `rejected`, `cancelled`: candidate/editable scope is unlocked only after the existing domain command atomically transitions it to correction/draft state;
- `approved` / `applied`: review lock ends, but existing controlled/released immutability continues;
- drawing lifecycle follows its existing workflow state; `correction_required` is editable only through the current revision lifecycle contract.

The command matrix is:

| Command family | During active review | Integration point |
|---|---|---|
| workspace facts, candidate numbers, candidate revision metadata | reject `409 PDM_ENTITY_REVIEW_LOCKED` | number-state/lifecycle repository transaction |
| candidate file upload, verify, remove or replace | reject | candidate revision command transaction |
| Drawing/Part attachment upload, delete, restore or replace | reject | `master-attachments-async.ts` owner transaction |
| Drawing revision file/submission content change | reject | drawing revision/submission service transaction |
| Part variant/shared-model/document mutation | reject | Part/numbering repository transaction |
| Drawing-Part link, relation or root membership mutation | reject | numbering/relation repository transaction |
| preview derivative enqueue/poll/read/download | allow if source hash/owner link is unchanged | existing preview/media authority |
| Drive sync of unchanged bytes/hash | allow; reject if it changes reviewed content identity | master attachment service |
| withdraw, return/reject, approve, retry apply/cleanup | allow only through existing domain command | approval/lifecycle authority |
| audit, event, notification and read-only trace | allow | existing authority |

The UI disabled state mirrors the guard, but server rejection is the acceptance boundary. Direct HTTP tests must cover at least one route from every rejected family and concurrent `lock-vs-write` / `write-vs-submit` interleavings. No write may commit after the review snapshot hash has been fixed without causing the submit/decision transaction to fail.

### 7. Preview orchestration parity

`DrawingProjection` is the only visible owner of `DrawingDetailPreview`. Candidate, formal, relation and review adapters all produce `DrawingPreviewSlotModel`; none may translate file existence directly to `ready`.

Canonical behavior:

- server resolves `queued/running/ready/delayed/failed/unavailable/missing` from source hash, non-fake derivative and job heartbeat;
- while a slot is queued/running/delayed and the document is visible, the drawer controller revalidates the same unified detail endpoint every 2.5 seconds, with one in-flight request and cleanup on key change/unmount;
- media is fetched only when the slot is `ready`; an unexpected `409 PREVIEW_NOT_READY` keeps the existing two-second bounded media retry as race recovery;
- retry uses the existing owner preview command and then refreshes the same entity key;
- exact review media href carries `reviewRequestId`, and the existing owner file/preview route calls the same `PdmReviewScopeReceipt` validator before allowing scoped read; no approval-evidence preview body is used;
- `src/app/api/approvals/requests/[requestId]/evidence/[fileId]/route.ts` remains compatibility-only and is not called by enabled DEV-067 UI.

### 8. Navigation and return-state contract

`/approvals` inbox items receive a server-built `ownerHref`. The browser must not build it from title/action text. The href shape is:

```text
{ownerPath}?view={currentOwnerView}
  &detail={encodedEntityKey}
  &reviewRequestId={encodedRequestId}
  &returnTo={encodedSafeApprovalsPathAndQuery}
```

`returnTo` must start with one `/`, must not start with `//`, must contain no control characters and must resolve to `/approvals` for review entry. Put the validator in a shared exported helper; do not duplicate the current private helper. Invalid/missing values fall back to `/approvals`.

Close button and explicit return call `router.push(returnTo)`. Browser Back uses history naturally. After approve/return/reject/retry completion, the command result returns the safe destination; the owner route navigates there, and the inbox reloads while preserving status/domain/action/query and `requestId` selection if still present. A 401 routes to login with the current owner URL as login return; 403/404/stale review preserves a visible safe return without leaking cross-company identity.

### 9. Failure and recovery contract

| HTTP/code | Visible first answer | Required next action |
|---|---|---|
| 400 `PDM_ENTITY_KEY_INVALID` | 無法辨識這筆明細 | 回原清單重新選取 |
| 401 | 登入狀態已失效 | 重新登入後回目前 owner URL |
| 403 `PDM_REVIEW_NOT_ASSIGNED` | 你不是此案目前可處理的審核者 | 回審核工作台 |
| 404 `PDM_ENTITY_DETAIL_NOT_FOUND` | 找不到資料或目前無權查看 | 回來源清單；跨公司同樣回404 |
| 409 `PDM_REVIEW_NOT_ACTIVE` | 此案已不在待審狀態 | 回審核清單查看最新狀態 |
| 409 `PDM_REVIEW_AGGREGATE_AMBIGUOUS` | 此案範圍無法對應單一圖料明細 | 由 PDM Admin 修正送審範圍；禁止決策 |
| 409 `PDM_REVIEW_SNAPSHOT_DRIFT` | 送審完整性檢查不一致 | 禁止決策；撤回/退回後重新送審或交 Admin |
| 409 `PDM_ENTITY_REVIEW_LOCKED` | 此資料正在審核，現在不能修改 | 撤回/退回後再修改 |
| 409 `PDM_ENTITY_DETAIL_STALE` | 資料已更新 | 保留 entity key 並重新整理同一抽屜 |
| 503 `PDM_ENTITY_DETAIL_PROJECTION_FAILED` | 明細目前未完整載入 | 原地重試；禁止以部分 projection 決策 |

Raw SQL, stack trace, raw JSON, English transport error and `Failed to execute...` must never be the primary visible state. Every blocked/error/terminal state identifies the responsible owner and one next action.

### 10. Exact component ownership and compatibility retirement

RD must create:

- `src/components/unified-pdm-entity-detail-drawer.tsx`;
- `src/components/drawing-projection.tsx`;
- `src/components/part-projection.tsx`;
- `src/components/relation-projection.tsx`;
- `src/components/review-context-projection.tsx`.

`unified-pdm-entity-detail-drawer.tsx` owns the registry, header, fixed slot order, one body scroll owner, focus trap/restore, Escape, resize, safe return and action bar. It must contain no `actionCode === ...` or domain lifecycle render tree. Domain projection components receive only normalized models plus a closed command dispatcher supplied by their owner controller.

Existing components are migrated as follows:

- `pdm-entity-detail-drawer.tsx` remains the low-level non-modal overlay primitive;
- `drawing-workspace-drawer.tsx` becomes a compatibility wrapper/re-export that cannot accept arbitrary body section composition in the enabled path;
- `drawing-detail-content.tsx`, `DrawingDetailPreview` and relevant `MasterAttachmentPanel` presentation pieces move behind `DrawingProjection` without duplicating preview state resolution;
- `WorkspaceDrawer`, candidate editors and `PartDetailPanel` become section/command contributors, not top-level covered drawer owners;
- `RootDetailDrawer`, page-local Drawing/Part fallback drawers and `ApprovalDetailDrawer` are not mounted when DEV-067 is enabled;
- `/approvals` deletes the enabled-path `ApprovalImpactSummary`, `ApprovalResultBody`, `ApprovalDrawingPreview`, raw snapshot JSON and decision footer composition; it keeps inbox/filter/count plus owner navigation.

Open drawer DOM must contain exactly one `data-component="unified-pdm-entity-detail-drawer"`. No `approval-detail-drawer`, lifecycle-specific drawer body or second sticky action footer may coexist.

### 11. Exact implementation files

Required new product files are the contract/policy/service/repository/route and five components listed above, plus `src/lib/pdm-review-scope.ts`, `src/lib/pdm-review-lock.ts` and DEV-067 QC scripts.

Required existing product files to modify:

- feature/config: `src/lib/number-state-flow-feature.ts`, `src/app/api/numbering/state-flow/status/route.ts`, `.env.example`, `package.json`;
- read authority: Drawing/Part/Relation workbench services and their async repositories, `src/lib/repositories/approval-platform-async-repository.ts`, `src/lib/approval-platform.ts`;
- shared UI/controllers: `pdm-entity-detail-drawer.tsx`, `drawing-workspace-drawer.tsx`, `drawing-detail-content.tsx`, `drawing-workbench.tsx`, `part-workbench.tsx`, `relation-workbench.tsx`, `number-state-workspace.tsx`, `part-detail-content.tsx`, `master-attachment-panel.tsx`, `drawing-detail-preview.tsx`;
- owner pages: `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx` through `PartModule`, `src/app/numbering/search/page.tsx`;
- approval: `src/app/approvals/page.tsx`, inbox/request/decision routes and `src/lib/approval-workbench-legacy-redirect.ts` / drawing lifecycle owner href producers;
- scoped media: candidate revision file GET, Drawing/Part attachment GET and preview routes;
- lock integration: workspace/candidate revision commands, master attachment upload/delete/restore, Drawing revision file/submission, Part shared-model/variant/document and Drawing-Part/relation mutation service paths;
- style: `src/app/globals.css` for projection/index/action-bar/responsive states only.

RD must preserve unrelated dirty worktree changes and record the actual modified file list after every phase. Product implementation must use `apply_patch`; no live migration, stage, commit, merge, PR or release is part of this contract.

### 12. Feature flag and rollback

Add `PDM_UNIFIED_ENTITY_DETAIL_V1`. It defaults off and is effective only when both `PDM_UNIFIED_DRAWING_WORKBENCH_V1` and `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1` are effective. `/api/numbering/state-flow/status` exposes requested/effective/dependencies and phase `DEV-067`.

Local RD/QA sets the flag on. Production remains off until a separate release gate. Turning it off restores existing owner/inbox paths without schema or data rollback. In the enabled path there is no dual render or fallback to a second visible body after a projection error; the unified drawer shows the controlled recovery state. Legacy code removal after production stabilization is a later cleanup, not a condition for safe local rollback.

### 13. Ordered implementation phases and exit gates

| Phase | Product work | Exit gate before next phase |
|---|---|---|
| 1A Contract/policy/read facade | types, policy, one-snapshot readers, unified API, feature status | TypeScript; policy/payload/query tests; 1/20/50 constant counts; no hidden fields or partial response |
| 1B Composer/domain projections | unified drawer, Drawing/Part/Relation projections, preview parity, owner workbenches | one DOM drawer; same projection component IDs; state transition retains key/selection; focused UI + preview QC |
| 1C Review routing/scope/lock | ownerHref registry, `/approvals` inbox-only path, review receipt, review projection, actions, transaction lock, safe return | assigned/denied/terminal/cross-company/drift tests; direct write bypass tests; decision idempotency; return-state browser evidence |
| 1D Compatibility/regression | enabled-path legacy body retirement, all states/viewports, aggregate regressions, isolated build | complete QA plan PASS; no open P0/P1; isolated build; handoff to independent QC |

RD may start 1A immediately and continue locally only after each exit gate passes. A phase failure remains `RD in progress`; it is not skipped by hiding the feature or marking a test blocked without evidence.

## Human Decision Brief

Confirmed decisions from APP feedback and follow-up discussion:

- The same drawing number, part number or root number must not show different object truth depending on the entry page.
- Keep separate entry pages because their primary tasks differ:
  - `/numbering/search` is the root/drawing/part relationship inspection surface.
  - `/numbering/drawings` is the drawing master workbench.
  - `/parts` is the part master workbench.
- Unify the right-side detail drawer contract:
  - click drawing number -> drawing detail;
  - click part number -> part detail;
  - click root number -> root detail.
- Apply the same rule to part numbers, not only drawing numbers.
- Entry context may change the default expanded section, scroll focus and server-authorized projection depth, but must not create a second object truth or a second domain component.
- Detail drawers remain overlay-style but non-modal: no dark backdrop, no focus trap or body lock, and the underlying list remains directly clickable for rapid inspection.
- The shared header owns one inline close `X`; entity pages must not add floating, previous/next or duplicate close controls.
- Modal confirmation dialogs remain separate and modal; opening one must prevent its `Escape` event from also closing the underlying detail drawer.

Rejected options:

- Maintain two separate drawing detail modules that show different sections for the same drawing number.
- Maintain two separate part detail modules that show different sections for the same part number.
- Merge `/numbering/search`, `/numbering/drawings` and `/parts` into one huge page. This would reduce task clarity and make scanning worse.
- Keep the relation-tree drawer as root-detail-only when a user clicks a drawing or part.
- Build one giant conditional component that mixes root, drawing and part logic in one render path.

AI assumptions:

- First implementation should use existing local data contracts where possible; no DB schema change is required for Phase 1.
- Existing owner pages and APIs remain authoritative:
  - root detail: `GET /api/numbering/roots/[rootCode]` and relation aggregation data;
  - drawing list/detail: `/numbering/drawings`, drawing attachment/readiness routes and existing same-root part data;
  - part list/detail: `GET /api/parts/[partNumber]`, permitted part-document and shared-model routes.
- `src/components/numbering-contextual-entrypoints.tsx` remains the shared action surface for root/drawing/part add and obsolete actions.
- Attachment/document permissions, lifecycle policy and company scope must follow existing server-side guards.
- `DEV-067` requires a server-derived projection policy/envelope before implementation; frontend adapters may normalize presentation only and may not fetch full data then hide it.

Re-entry triggers:

- User wants page-specific object truth or domain projection implementations to diverge beyond the confirmed `none/summary/full` policy.
- User wants to merge the three entry pages into one module.
- Implementation requires schema migration, RLS/policy changes, live Supabase migration, provider pointer change, direct data repair/deletion, production deployment, merge, PR, rollback or release artifacts.
- Existing APIs cannot expose enough drawing or part detail without introducing new product semantics.
- Server policy cannot omit restricted attachments/fields from summary/none responses, or review full visibility cannot be bounded to exact active request/company scope.

## Problem

The current UI can open the same drawing number from two places:

- `/numbering/drawings`: the drawer behaves like a drawing-governance detail surface with attachments, submission readiness, same-root parts and operational actions.
- `/numbering/search`: the drawer behaves like a relation/lifecycle summary for the selected target.

This creates a trust problem. A user sees the same object ID but receives different information depending on where they clicked. The mental model should be:

```text
Object code -> object detail
Entry page -> task context
```

The entry page may explain why the user arrived there, but it must not redefine what the object is.

## UX Intent

使用思考習慣: `#目的`, `#批判`, `#效用理論`, `#設計思考`, `#心理成因`, `#內容組織`, `#可驗證性`

- Primary users: RD, RD Manager, QA/QC, manufacturing preparation, purchasing preparation and PDM administrators.
- User mental model: a code represents one object. Clicking that code should open that object's canonical detail.
- Main task: inspect the current object, understand status/readiness/relationships, then continue with the correct next action.
- Success state: from any supported entry page, clicking `A0001-M01`, `A0001-P01` or `A0001` opens the same composer and domain projections; the server returns the confirmed task-appropriate depth without changing object truth.
- Natural next step:
  - drawing: inspect attachments/readiness/linked parts, then submit, revise, trace or impact-analyze;
  - part: inspect attributes/permitted documents/status/linked drawings, then update part data, shared model or lifecycle action;
  - root: inspect family relationship health, counts and add/obsolete actions.
- Most likely misunderstanding: users think two modules disagree about the same drawing or part record.
- Must not happen: a part click shows root-only details; a Drawing full projection hides its attachments/readiness; a source page silently returns stale data; or a summary/none surface receives restricted full payloads and only hides them client-side.

## End-State Architecture

Separate entry pages stay. Object detail becomes a shared contract.

```text
Entry page
  /numbering/search        relation-first task context
  /numbering/drawings      drawing-list task context
  /parts                   part-list task context

UnifiedPdmEntityDetailDrawer
  SharedIdentityStatusHeader
  ProjectionComposer
    DrawingProjection
    PartProjection
    RelationProjection
    ReviewContextProjection
  ContextActionBar

Domain adapters
  own projection models, preview/read authority and commands

Server DetailSurfacePolicy
  controls none/summary/full, allowed fields and review scope
```

### Object Identity Rule

| Click target | Required drawer entity type | Forbidden result |
|---|---|---|
| Root code, for example `A0001` | `part_root` | drawing-only or part-only detail |
| Drawing number, for example `A0001-M01` | `drawing_number` | root-only detail |
| Part number, for example `A0001-P01` | `part_number` | root-only or drawing-only detail |

### Source Context Rule (`DEV-067` amendment)

`sourceContext` never changes identity, domain truth or permission. Under the historical Phase 1 contract it affected only emphasis; `DEV-067` intentionally extends it with server-authorized projection depth:

| Source context | Allowed default focus/depth | Invariant |
|---|---|---|
| `relation_tree` | relation first; Drawing/Part/Relation full | canonical identity, owner data, domain permission/commands |
| `drawing_module` | Drawing full; Part/Relation summary | canonical Drawing truth; Part details are not returned |
| `part_module` | Part full; Drawing/Relation summary; no Drawing files/revisions | canonical Part truth; Drawing file authority is not imported |
| `active_review` | exact request aggregate full plus ReviewContext | locked owner data; exact reviewer/request/company scope |
| `request_fallback` | create/append context highlighted | existing object core truth |

Projection reduction is explicit task policy, not another version of the object. The server omits unauthorized/not-needed fields; client-only hiding is forbidden.

## Drawer Information Architecture

### Shared Shell

`EntityDetailDrawerShell` owns only common drawer behavior:

- right-side drawer layout, close button, width clamp and persisted width;
- resize handle;
- outside click and `Escape` close behavior;
- direct row-to-row switching without close/reopen flicker, with detail scroll reset to the top for the newly selected entity;
- loading, not found, restricted and error states;
- source context hint;
- keyboard-safe focus behavior;
- `data-entity-type`, `data-entity-code`, `data-source-context` attributes for QC.

The shell must not contain object-specific business rules except dispatching to the correct panel.

### Root Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | root code, core name, status, phase |
| Summary | drawing count, part count, manufacturing/reference counts, blockers |
| Relationship health | complete, missing manufacturing drawing, missing part, ambiguous, blocked, draft |
| Primary actions | `新增圖號`, `新增料號`, draft delete or root obsolete action when allowed |
| Relationship view | child drawings, parts, link health and orphan states |

Required sections:

- `關係摘要`: drawings, parts, links, blockers.
- `新增相關資料`: reuse `NumberingContextualEntrypoints` root mode.
- `生命週期`: draft delete, formal obsolete request, pending request state.
- `送審 / 製造可用性`: concise readiness blockers that answer "現在要做什麼".
- `Audit / history`: collapsed or lower priority.

### Drawing Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | drawing number, root code, purpose `M/R`, core name/title if available |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | `進版`, `送審` or `檢查送審條件`, `追溯`, `影響分析`, contextual add/obsolete actions |
| Relationship summary | linked parts, same-root parts, manufacturing/reference semantics |
| Attachments | drawing-owned attachment library and deleted/recoverable data state |

Required sections:

- `Object lifecycle`: status, phase, why it can/cannot proceed.
- `圖號附件庫`: current attachments, deleted data section and refresh state.
- `送審檢查`: prerequisite blockers, missing attachment/data states and next CTA.
- `同主根號料號`: linked parts and same-root part cards.
- `關係 / 影響`: traceability and impact analysis entry.
- `新增相關資料`: drawing-context `NumberingContextualEntrypoints`.

The drawing detail panel must be the same whether opened from `/numbering/drawings` or `/numbering/search`. The relation page may default-scroll to `同主根號料號` or `關係 / 影響`, but it cannot omit attachments or readiness sections.

Candidate reservations that contain a drawing are members of the same `drawing_number` detail family, even though their canonical entity metadata remains `candidate_bundle`. Candidate and formal drawing drawers MUST therefore publish `data-detail-family="drawing_number"` and `data-drawing-detail-skeleton="true"`, and render this ordered section contract:

1. `drawing-overview`: purpose, linked-part summary and same-root/content summary;
2. `drawing-revision-files`: candidate first-revision editor or formal controlled revision files;
3. `drawing-preview`: real preview content, or a concise human empty state with the next step;
4. `drawing-pending`: review, missing-data, recovery or no-action guidance;
5. `drawing-more`: reference attachments, relationship/data maintenance, edit/cancel and other secondary actions.

Historical Phase 1C baseline (superseded by the 2026-08-12 `DEV-067` amendment wherever it is less strict): both lifecycle variants rendered `DrawingWorkspaceDrawer` and published `data-component="drawing-workspace-drawer"`. Candidate and formal adapters could provide different section content. The new authority is `UnifiedPdmEntityDetailDrawer` plus domain-owned projections; Drawing's six-section behavior is owned inside `DrawingProjection`, not an independently composed lifecycle body.

Candidate drawing preparation is an incomplete-data state inside the workspace, not a navigation destination. Opening a candidate MUST expose the existing first-revision editor, missing requirements and file work area inline. The visible UI MUST NOT render a `準備首版圖面` link/button that jumps to another layer, duplicate that action in header and body, or add a separate `下一步` card. When readiness becomes complete, the existing server-derived submit action becomes available in the same drawer; review, return and controlled states continue in the same component without a route change or drawer replacement.

This is component/view-model convergence, not lifecycle-authority convergence. Candidate mutation stays in `NumberingCandidateRevisionEditor` and candidate review/cancel actions; formal controlled files remain read-only in `MasterAttachmentPanel` and changes continue through the formal revision workflow. Candidate preview data is not invented. No API, schema, permission or lifecycle-authority change is introduced by this contract.

Historical Phase 1C content contract used `DrawingDetailContentModel`, `DrawingDetailSummary` and `DrawingDetailSection`, with the A0005 formal order. `DEV-067` intentionally places the human-confirmed Drawing six-section behavior inside `DrawingProjection` under the fixed cross-domain composer and further limits adapters to data/capability/command projection. These existing components may be reused internally only if they implement the new projection contract and cannot compose a second body.

Preview content is also a shared contract, not merely a shared shell. Candidate, formal and approval adapters MUST render `DrawingDetailPreview`. It always presents the same two cards—`3D 模型` and `2D 圖面`—in the same order and uses the adapter only for media, file identity, preview state and permitted actions. When a preview is unavailable, pending or missing, the same card remains visible with human-readable state and recovery guidance; a mode-specific preview grid or one-sided empty state is not permitted. Formal media may render directly, while candidate and approval may expose evidence preview/download actions, but the visual component and state vocabulary remain one source of truth.

Historical Phase 1C approval placement rendered the shared shell from `/approvals`. `DEV-067` intentionally replaces that placement: `/approvals` remains the inbox, selecting a covered request navigates to its canonical owner route and mounts `UnifiedPdmEntityDetailDrawer`. The assigned reviewer receives server-scoped full Drawing/Part/Relation projections plus decision capability and a safe return path. Approval snapshots remain integrity evidence inside `ReviewContextProjection`, not a separate visible body.

### Historical Part Detail Panel (`DEV-067` moves current behavior to `PartProjection`)

The following is retained as implemented Phase 1 history. Part-cost rows are retired by the 2026-08-11 amendment; current Part requirements are governed by the top-level `PartProjection` contract.

Required first screen:

| Area | Required content |
|---|---|
| Identity | part number, root code, part name/core name, item kind |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | part data update, cost action if permitted, shared model/MA baseline actions if applicable, contextual add/obsolete actions |
| Relationship summary | linked drawings, primary manufacturing drawing, reference-only links |
| Attributes | material, color, surface treatment, variant note |

Required sections:

- `Object lifecycle`: status, phase and action-first next step.
- `料號屬性`: material, color, surface treatment, variant note and missing-data state.
- `圖號關聯`: linked drawings, manufacturing/reference semantics, missing manufacturing blocker.
- `成本狀態`: standard cost status, pending cost request count and permitted amount visibility.
- `附件 / 模型`: part attachments, shared 3D model and MA baseline sections where current system supports them.
- `新增相關資料`: part-context `NumberingContextualEntrypoints`.

The part detail panel must be the same whether opened from `/parts` or `/numbering/search`. The relation page may default-scroll to `圖號關聯`; `/parts` may default-scroll to `料號屬性` or `成本狀態`.

## Data Contract

### Phase 1A-1B Implementation Note

The 2026-07-09 local implementation intentionally lands the user-visible parity first:

- `/numbering/search` keeps its relation-first drawer, but now dispatches by target entity and renders root/drawing/part core sections before the full relation context.
- Drawing targets reuse the existing drawing attachment component and expose drawing readiness / same-root part sections.
- Part targets load the existing part owner detail API for attributes, linked drawings and cost status.
- `/numbering/drawings` and `/parts` keep their owner workbench UI, but publish the same `data-detail-*`, `data-entity-*` and `data-source-context` metadata as the relation drawer.
- Phase 1B extracts `PdmEntityDetailDrawer` over the existing low-level `PdmDetailDrawer`. Drawing, part, relation-search and candidate/reservation details reuse the same non-modal shell, header, close control, width persistence, outside-click rule and entity metadata.
- Object-specific part/root bodies remain domain components. Candidate and formal drawing adapters both render `DrawingWorkspaceDrawer`; lifecycle-specific data and commands stay in adapters/child domain components so the shared workspace does not duplicate mutation authority.
- Human-status filters and drawer-width behavior now have shared sources instead of page-local copies.

### Historical Phase 1 Data Strategy (superseded for `DEV-067` composition/policy)

The following model records the implemented Phase 1 baseline. `DEV-067` replaces it with projection models and a server-derived `DetailSurfacePolicy`; frontend-only full-data normalization is not an allowed final contract.

```ts
type EntityDetailTarget = {
  entityType: "part_root" | "drawing_number" | "part_number";
  entityCode: string;
  rootCode?: string;
  sourceContext: "relation_tree" | "drawing_module" | "part_module" | "request_fallback";
  defaultSection?: "relationships" | "attachments" | "readiness" | "attributes" | "cost" | "actions";
  relationContext?: {
    drawingNumber?: string;
    partNumber?: string;
    relationType?: "primary_manufacturing" | "reference" | "none";
  };
};

type EntityDetailViewModel = {
  target: EntityDetailTarget;
  identity: {
    entityType: EntityDetailTarget["entityType"];
    entityCode: string;
    rootCode: string;
    displayName: string;
  };
  status: {
    recordStatus: string;
    developmentPhase: string;
    lifecycleMessage: string;
    nextStep: string;
  };
  sections: {
    relationships: boolean;
    attachments: boolean;
    readiness: boolean;
    attributes: boolean;
    cost: boolean;
    actions: boolean;
    audit: boolean;
  };
};
```

Existing sources:

| Entity | Existing source | Notes |
|---|---|---|
| Root | `GET /api/numbering/roots/[rootCode]`, relation view data | Must include drawings, parts, matrix/health where available |
| Drawing | `/numbering/drawings` list payload, drawing attachment/readiness APIs, relation data | Must include same-root parts and readiness sections from drawing module |
| Part | `GET /api/parts/[partNumber]`, part attachment/cost/shared-model APIs, relation data | Must preserve cost redaction rules |

### Historical Phase 2 Optional Data Facade（superseded by DEV-067）

This was the pre-DEV-067 option. It is retained only as history and must not be implemented as written. DEV-067 has made the unified, policy-enforced read facade mandatory and defines its exact route/types in the RD Implementation Contract above.

```text
GET /api/numbering/entities/[entityType]/[entityCode]/detail?sourceContext=
```

The facade must:

- be read-only;
- enforce existing page permission and company scope;
- reuse owner-domain services and redaction helpers;
- return no write side effects;
- avoid new identity semantics.

The optional decision is closed: `GET /api/pdm/entity-details/[entityKey]` is required in DEV-067 Phase 1A.

## Historical Phase 1A-1B Implementation Contract（implemented baseline; not DEV-067 handoff）

### Frontend

1. Create a shared shell component. Recommended path:
   - `src/components/pdm-entity-detail-drawer.tsx`
   - or a small folder under `src/components/entity-detail-drawer/`.
2. Extract object panels without changing product behavior first:
   - `RootNumberDetailPanel`
   - `DrawingNumberDetailPanel`
   - `PartNumberDetailPanel`
3. Move common drawer behavior out of page-local implementations:
   - width clamp and storage;
   - resize;
   - close/backdrop;
   - shell states;
   - QC `data-*` attributes.
4. Update `/numbering/search`:
   - relation-tree root click passes `entityType: "part_root"`;
   - drawing click passes `entityType: "drawing_number"`;
   - part click passes `entityType: "part_number"`;
   - matrix row/column identity clicks follow the same rule.
5. Update `/numbering/drawings`:
   - use the shared shell and `DrawingNumberDetailPanel`;
   - keep drawing-module source context.
6. Update `/parts`:
   - use the shared shell and `PartNumberDetailPanel`;
   - keep part-module source context.
7. Preserve `NumberingContextualEntrypoints` behavior and labels from `DEV-PDM-NUMBERING-004`.
8. Do not place cards inside cards. Drawer sections can use compact panels, rows and lists.
9. Use source context for default expanded section only.

### Backend / API

Phase 1:

- No schema migration.
- No write route required.
- Existing APIs remain owner-domain authority.
- Any new helper must be a read adapter or TypeScript view-model mapper.

Historical Phase 2 optional facade（superseded by the required DEV-067 facade）:

- Must be read-only.
- Must not bypass attachment or lifecycle permissions; historical cost references are retired.
- Must return 404/403 states in action-first Traditional Chinese when rendered.

### Permission Contract

| Data | Permission behavior |
|---|---|
| Root/drawing/part core identity | Existing page-level read permission |
| Drawing/part attachments | Existing master attachment permission path |
| Part cost amounts | Retired; no Part-cost projection or field is returned |
| Contextual add/obsolete actions | Existing `numbering.create`, `numbering.link_variant`, lifecycle/approval action guards |
| DEV-067 unified facade | Same or stricter than source APIs plus exact server summary/full allowlists |

## Failure And State Handling

| State | First visible answer |
|---|---|
| root not found | `找不到這個主根號，請重新查詢或確認權限。` |
| drawing not found | `找不到這個圖號，請重新查詢或確認是否已切換公司/資料範圍。` |
| part not found | `找不到這個料號，請重新查詢或確認是否已切換公司/資料範圍。` |
| restricted | `目前角色不能查看這項資料，請改用有權限的帳號或聯絡 Admin。` |
| partial relation context missing | `已開啟物件詳情，但來源關係不存在或已變更，請重新整理關係樹。` |
| API error | `明細讀取失敗，請重新整理；若仍失敗請請 Admin 檢查資料。` |

No drawer may show raw SQL, stack trace, `Internal Server Error`, route text, untranslated backend error or JSON payload as the primary visible state.

## Phase Roadmap

| Phase | Status | Purpose | Authorization |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture UX decision, architecture, RD contract, QA and PM control entry | Authorized by user request to write development documents |
| Phase 1A - Target-aware parity implementation | Implemented locally / Release Not Authorized | Unify visible root/drawing/part detail behavior across `/numbering/search`, `/numbering/drawings` and `/parts` using existing APIs and drawer metadata | Authorized by user `完成DEV-039開發 /goal`; release not authorized |
| Phase 1B - Shared shell extraction | Implemented locally / Release Not Authorized | Reuse one non-modal shell and shared interaction/metadata contracts while preserving domain-specific panels | Authorized by user instruction on 2026-08-07; release not authorized |
| DEV-067 - Unified entity composer/projections | RD Implementation Ready / Human Confirmed / RD not started | One composer, domain-owned projections, server `none/summary/full`, scoped review full view, one action bar and lock/return parity | Local Phase 1A～1D eligible; production/schema/release gated |
| Historical Phase 2 - optional detail facade | Superseded by DEV-067 | Previous optional normalized read API | Replaced by required DEV-067 unified facade |
| Phase 3 - Release / production | Release Authorization Required | Merge/deploy/production smoke/rollback | Requires explicit release authorization and deployment-release-gate |

## RD Handoff Contract

### Historical Phase 1 - Shared Drawer Shell And Canonical Panels

This handoff records completed Phase 1A/1B behavior. Wherever it conflicts with the `DEV-067` amendment, the amendment and ADR are authoritative; it is not the implementation contract for the next delivery.

Scope:

- Build shared drawer shell.
- Extract drawing detail panel so `/numbering/drawings` and `/numbering/search` use the same drawing detail information architecture.
- Extract part detail panel so `/parts` and `/numbering/search` use the same part detail information architecture.
- Keep root detail panel as canonical root relationship detail for root clicks.
- Implement `EntityDetailTarget` and source-context default focus.
- Preserve existing drawer width/resize/keyboard behavior.
- Add focused QC for same-object consistency.

Out of scope:

- Merging the three entry pages.
- Changing identity format.
- DB schema migration.
- Permission/RLS changes.
- Production deploy, Supabase live cutover, provider pointer changes.
- Direct data repair/deletion.
- New cost workflow or attachment workflow.

Implementation contract:

- Shared shell must dispatch by `entityType`.
- Page-local code may adapt existing payloads into shared view models.
- Historical rule: source context did not hide core sections. `DEV-067` intentionally replaces this with server-authorized `none/summary/full` projection depth while preserving one domain truth.
- Drawing panel must include attachment/readiness/same-root part sections even when launched from relation tree.
- Candidate and formal render paths must directly use `DrawingWorkspaceDrawer`, publish `data-component="drawing-workspace-drawer"`, and share the header hierarchy and ordered five-section skeleton while retaining separate lifecycle actions and mutation authority.
- Candidate preparation must render inline; `準備首版圖面` cannot be a visible navigation CTA, duplicated action or second drawer/page.
- Part full projection must include current permitted attributes/documents/relationships when launched from Relation; retired cost sections are not restored.
- Root panel must include relation health, child counts and contextual add/lifecycle action sections.

Acceptance:

- Clicking `A0001-M01` from `/numbering/drawings` and `/numbering/search` opens the same DrawingProjection; the Relation context may expose the full aggregate while Drawing context keeps Part details at summary.
- Clicking `A0001-P01` from `/parts` and `/numbering/search` opens the same PartProjection; the Relation context may expose the full aggregate while Part context receives Drawing summary without files/revisions.
- Clicking `A0001` opens `part_root` detail, not drawing or part detail.
- Relation matrix row/column clicks preserve entity type.
- Source context changes default focus and server-authorized projection depth, never identity, domain truth or command authority.
- Candidate title uses the primary reserved drawing code or `尚未產生圖號`; it never substitutes a root code.
- Candidate and formal drawers expose `drawing-overview → drawing-revision-files → drawing-preview → drawing-pending → drawing-more` in DOM order; preview empty states state a human next step.
- Both candidate and formal paths expose exactly one `data-component="drawing-workspace-drawer"`; candidate first-revision editing is present without an intermediate click.
- The same drawer remains open while readiness/action state changes; each state exposes at most one primary CTA.
- No page-level horizontal overflow or drawer text overlap at desktop/laptop/mobile widths.

Evidence required:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-system-detail-drawer-ui
npm.cmd run qc:part-number-module
npm.cmd run qc:pdm-entity-detail-drawer
```

Browser evidence:

- `/numbering/search` desktop `1440x900`, laptop `1024x768`, and current supported mobile/default narrow viewport.
- `/numbering/drawings` drawing drawer.
- `/parts` part drawer.
- Same drawing opened from two sources.
- Same part opened from two sources.

### Historical Phase 2 - Optional Read-Only Detail Facade（superseded）

This section is historical. DEV-067 Phase 1A now requires the normalized server-policy facade and its tests; do not wait for a new duplication-risk decision.

Historical scope:

- Add normalized read-only facade only if Phase 1 duplicates fetching or state mapping enough to create maintenance risk.
- Keep existing source APIs authoritative.
- Add facade QC for read-only/no-write-side-effect and redaction parity.

Out of scope:

- Write APIs.
- New data ownership.
- Schema/RLS changes unless separately authorized.

Acceptance:

- Facade response matches source APIs for identity/status/relationship/visibility.
- Unauthorized users do not see more through facade than through owner pages.
- Read call does not mutate audit, sequence, relation, attachment or cost records.

Evidence required:

- API facade no-write-side-effect QC.
- Cost redaction parity QC.
- Attachment permission parity QC.

## QA/QC Gate Summary

Primary QA plan:

- `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`

Minimum gates:

- 5-second object identity test: reviewer can identify whether drawer is root/drawing/part/candidate, its name, current status and next step.
- Drawing-family consistency test: candidate and formal variants share header/section grammar while candidate-only lifecycle work remains in `drawing-pending` / `drawing-more`.
- Same-projection consistency test: the same Drawing/Part projection implementation and owner data are reused across routes; only policy depth/focus/capabilities differ.
- Source-context test: server response contains only allowed `none/summary/full` data; DOM hiding cannot satisfy the gate.
- Visible error sweep.
- Keyboard and close/resize behavior regression.
- Responsive/no-overlap evidence.
- Permission/payload parity for attachments/documents and scoped reviewer full view.

## Stop Conditions

Stop and return to PM/user if:

- RD cannot reuse one Drawing/Part/Relation projection per domain without removing required full-projection content.
- Implementation needs schema migration, RLS changes, production/Supabase live changes or direct data repair.
- API sends full or restricted attachment/file data to a summary/none context and relies on client hiding.
- Assigned review full view cannot be bounded to exact active request, targets, eligibility and company, or remains accessible after terminal state.
- Source context changes data truth/command authority instead of only policy depth, focus and capability projection.
- Drawer implementation causes nested-card layout, text overlap, critical overflow or unclear scroll ownership.
- RD wants to merge entry pages or remove `/numbering/search`, `/numbering/drawings` or `/parts`.

## Deferred Scope Audit

| Deferred scope | Classification | Handling |
|---|---|---|
| Product implementation | Same Spec Phase 1 / Implemented Locally | Phase 1A parity and Phase 1B shared shell are implemented and locally verified; production release remains gated. |
| DEV-067 composer/projection implementation | Current Phase / RD Implementation Ready / Local implementation eligible | Execute Phase 1A～1D under the exact contract above and QA `UDD-001..050`; no new product decision is required. |
| Optional read-only detail facade | Same Spec Phase 2 / Not Authorized | Implement only if Phase 1 leaves unsafe duplication. |
| Merging the three modules/pages | No Tracking | Rejected because entry pages serve different user tasks. |
| Schema/RLS migration | Blocked Human Re-entry | Not expected; requires explicit authorization if discovered. |
| Production deploy, merge, PR, rollback, production smoke | Blocked Human Re-entry / Release Authorization Required | No release artifacts are created in this document. |
| Dedicated phone UI beyond current supported surface | No Tracking | Current product guidance uses desktop/default surface; narrow viewport remains a sanity check only unless separately requested. |
| Retired Part-cost workflow | No Tracking | Current product authority keeps Part cost retired; DEV-067 must not reintroduce it. |
| Bulk relation editing from drawer | New DEV later | Existing controlled relation maintenance remains authoritative. |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | SPEC, QA, dev_task, documentation_map | product implementation | user asked `寫成開發文件` | files created and indexed | git diff / file review |
| Phase 1 / shared drawer | Authorized locally | Implemented Locally / Release Not Authorized | shared shell, canonical root/drawing/part/candidate panels, source context, QC | schema/RLS, page merge, release | user instruction on 2026-08-07 | same object from multiple entry points shows same core sections and one non-modal interaction contract | tsc, lint, focused QC, authenticated browser evidence |
| DEV-067 / unified entity composer | Local Phase 1A～1D authorized | RD Implementation Ready / Human Confirmed / RD not started | Drawing/Part/Relation projections, server visibility, scoped review full view, lock/action/return parity | schema/RLS, production/staging, merge/PR/deploy/release | current exact contract and clean phase entry | one composer; no parallel body; no hidden restricted payload; review scope fail closed | `UDD-001..050`, focused contract/network/DB/query/multi-viewport browser |
| Historical Phase 2 / optional detail facade | Superseded | Replaced by DEV-067 Phase 1A | historical read-only option | current implementation | none | do not implement separately | DEV-067 evidence applies |
| Phase 3 / release | Not authorized | Release Authorization Required | merge/deploy/production smoke/rollback | unapproved production work | explicit release authorization | deployment-release-gate pass | release gate evidence |

## RD Readiness Review

DEV-067 P0/P1 readiness:

- DB schema: no change required.
- Migration: no change required.
- API: required unified GET facade, exact envelope and summary/full field allowlists are defined.
- Permissions: existing page/command permissions are retained; exact request/company/target reviewer receipt is defined and client parameters never elevate.
- Transaction boundary: one repeatable-read detail snapshot plus same-transaction write-lock guard is defined; no nested read snapshots or pre-transaction-only locks.
- Failure recovery: exact 400/401/403/404/409/503 codes, action-first Traditional Chinese copy and safe return are defined.
- State machine: no lifecycle transition change.
- Data mapping: typed keys, header, four domain/review projection models, preview state, action and navigation models are exact.
- Multi-target: canonical owner precedence, stable anchors, one atomic decision boundary and ambiguous-root fail-closed are exact.
- Performance: hard Drawing/Part/Relation/review query budgets and 1/20/50 no-growth rule are exact.
- QA/QC: FMEA and `UDD-001..050` contract/network/DB/browser plan are defined.
- Release: not authorized; release artifacts deferred.

Result: historical Phase 1A-1B remains `Implemented Locally / Release Not Authorized`; DEV-067 is `RD Implementation Ready / Human Confirmed / RD not started / Local implementation eligible` with no open P0/P1 readiness gap.

## Spec Governance

Cross-spec handling:

- Extends `SPEC-PDM-DETAIL-DRAWER-001` for shared drawer behavior.
- Extends `SPEC-PDM-MASTER-WORKBENCH-001` without changing the three-page responsibility split.
- Extends `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` by tightening click target semantics: root/drawing/part clicks must open matching entity detail.
- Extends `SPEC-PDM-NUMBERING-004` by preserving contextual add/obsolete entrypoints inside canonical object panels.
- Compatible with `SPEC-PDM-PART-COST-001`; part cost remains part-owned and redacted by permission.

ADR decision:

- New ADR is not required for Phase 1 because the decision is UI information architecture and shared component ownership, not identity, schema, lifecycle, audit, permission or release-gate policy.
- If Phase 2 introduces a cross-module backend detail facade that becomes an authoritative API surface, revisit ADR need before implementation.

Current authorization boundary:

- Documentation is complete.
- Product implementation is not authorized.
- Merge, PR, deploy, rollback, production smoke and release reports are deferred until explicit release authorization.

## 2026-08-09 Focused Amendment — DEV-059 QA-QC Reopen

This section supersedes only the previous PASS interpretation for the candidate bundle-submit confirmation layer; it does not repeal the shared `DrawingWorkspaceDrawer`, entity ownership, lifecycle, permission, schema or API contracts above.

- User field evidence on the current `/numbering/drawings` route shows `送交圖料與首版整包審核` cannot be dismissed by the visible `X`, `返回檢查` or re-entry, and the modal blocks the underlying workspace.
- The earlier Phase 1C browser evidence remains a historical baseline, but it does not prove current-route hard reload, back/forward or bfcache restore, runtime interruption, click-through prevention, and each close mechanism as an independent case.
- Parent status is therefore `Local RD Implemented / QA-QC Reopened by DEV-059 / Release Not Authorized` until focused AI real-operation evidence passes.

## 2026-08-10 Product Direction Amendment — A0005 Visual Baseline

The user has selected the A0005 formal drawing detail drawer as the only current visual baseline while the drawer family is redesigned. The candidate and approval detail drawer mounts are intentionally retired from the active UI, and their visible entry paths are paused. This amendment supersedes the active-rendering requirement for those two surfaces only; it does not delete or alter their API, data, lifecycle, permission, approval-command or evidence contracts. A future redevelopment task must explicitly reintroduce and validate the candidate/approval UI before those drawers are considered active again.
- The focused compatible-exception contract is `.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`; the executable validation authority is `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`.
- `DEV-059` may change local modal state ownership, focus/keyboard handling, navigation/runtime recovery and visible status copy. It may not change lifecycle/API/schema/permission/formal data or release scope without a new Spec Impact Preflight.
- No QA/QC PASS may be restored from static source inspection or old screenshots. The AI must operate the current route in a real browser, execute isolated fault cases and complete disposable mutation/readback/cleanup evidence.

Focused result (2026-08-09): DEV-059 completed the current-route modal recovery portion with AI browser evidence for X, 返回檢查, Escape, physical click, hard reload, back/forward, candidate switching and 1440/1024/390 viewport checks. The parent full PASS remains gated because the shared candidate was intentionally not mutated; isolated flow/integration evidence covers submit/withdraw/fault behavior, while an isolated disposable UI mutation run remains an extended gate.
