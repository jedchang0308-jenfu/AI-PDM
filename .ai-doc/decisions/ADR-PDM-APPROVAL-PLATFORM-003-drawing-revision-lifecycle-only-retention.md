# ADR-PDM-APPROVAL-PLATFORM-003 - Drawing revision lifecycle-only retention

Status: Accepted product/data-policy exception; RD Implementation Ready; local implementation in progress
Date: 2026-08-06
Owner: Dev PM
Related DEV: `DEV-053` / `DEV-PDM-UNIFIED-DRAWING-WORKBENCH-001` Phase 1H
Related Specs: `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`; `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
Amends: `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`; `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md`

## Context

DEV-053 Phase 1H收斂成只有`圖號工作台`與`審核工作台`、單一生命週期狀態與單一主要下一步。既有approval platform以append-only decision/event/audit history為預設，但使用者明確選擇`4C`：新圖面進版流程完成後不保留前後端審核歷程，只保留正式PDM版次結果。

這不是移除審核控制。流程active期間仍需要exact request、assignment、quorum、snapshot、decision、idempotency與apply guard；差異只在完成後的資料生命週期。

既有已完成／未知production submission、approval與audit資料、其他approval領域及DEV-054均是受保護範圍。`HD-053-1H-08 / 8B`只例外允許啟用時仍進行中且通過全批次guard的圖面進版workflow被adopt；其既有PDM正式結果仍受保護，審核決策不得重播。

## Decision

採用drawing-revision-only的`lifecycle_only` retention class：

- active期間，shared approval authority仍唯一負責submit、assignment、decision、withdraw、apply與concurrency guard；不得建立第二套審核引擎或直接改revision status。
- terminal結果先固化為PDM-owned revision package、controlled files、multi-part scope與latest/history分類。這些是正式業務資料，必須永久依PDM政策保存。
- 必要通知送達後，以domain-scoped、idempotent cleanup transaction刪除該次新Phase 1H workflow的submission、approval request、targets、decisions、snapshots、business events與delivered outbox payloads。
- `5A`：退回理由選填；若有值，只是目前correction instruction，重新送審成功即刪除。未填不得阻擋退回。
- `6A`：revision apply與必要通知尚未完成前不得cleanup；apply、notification或cleanup失敗各自重試，不得重做已成功的前一步。
- `7A`：允許最長7天的technical idempotency/recovery token，只含one-way key hash、non-personal command scope、result fingerprint、status與expiry；禁止actor、reason、filename/content、snapshot與可重建審核歷程的payload。
- `8B`：activation前先對完整active set執行dry-run；只有`blocked=0`才可all-or-nothing adopt。adoption建立native request與transient sidecar、抑制legacy inbox但不複製／重播decision；既有completed/unknown仍permanent。
- `9B`：必要通知定義為durable drawing lifecycle與current-task projection已在同一transaction更新；Phase 1H不建立永久審核notification，外部通知不作cleanup前置條件。
- `10B`：完成後request/deep link導向該drawing最新版；不保留request-to-historical-revision tombstone。無法解析的pre-Phase-1H opaque bookmark回圖號工作台。
- 既有completed與unknown retention class一律fail closed為permanent。此例外只適用fresh或明確adopted-active的DEV-053 Phase 1H drawing-revision workflows，不適用candidate bundle、numbering、BOM、cost、obsolete、supplement或其他approval領域。

## Options Considered

### Option A - Hide audit UI but retain permanent backend history

Benefits:

- Lowest implementation risk.
- Preserves dispute investigation and existing platform invariants.

Rejected because the user explicitly does not want backend approval history retained for this flow.

### Option B - Retain a minimal permanent outcome receipt

Benefits:

- Keeps approver/time/result evidence with less data than a full audit trail.
- Simplifies idempotent recovery and support.

Rejected because even a minimal permanent actor/decision/timestamp receipt conflicts with the selected lifecycle-only result.

### Option C - Retain no durable approval history after guarded completion

Benefits:

- Matches the requested minimal product and data model.
- Removes stale submission status as a competing user-facing truth.
- Prevents completed drawing approvals from accumulating as a second history system.

Costs:

- The system cannot later answer who approved, when, why or which comments were entered for a cleaned workflow.
- Post-completion dispute investigation, individual accountability and review reconstruction are intentionally unavailable.
- Implementation is more complex because durable revision/file/part data must be detached from transient approval/submission foreign keys before cleanup.
- Existing append-only triggers and Postgres/Supabase mirrors require a narrow additive exception that must not weaken other domains.

Selected by the user as `4C`, with `5A／6A／7A／8B／9B／10B` guardrails.

## Consequences and Guardrails

- Reviewer and submitter UI never exposes a legacy submission/audit page. Active progress is operational state, not history.
- After cleanup, a request-only deep link cannot reconstruct its former review. New exact-review links therefore carry a server-validated drawing fallback and, under `10B`, return to that drawing's latest revision when the request is gone.
- Generic operational metrics may retain aggregate counts only. Logs, metrics and technical tokens must not become a shadow audit trail.
- Existing immutable triggers/RLS remain authoritative for permanent classes. Implementation must introduce an additive, request-scoped cleanup authorization; a global trigger drop, public delete grant or broad bypass role is prohibited.
- Any cleanup failure leaves the already-materialized PDM result intact and retries cleanup only. Any apply failure leaves the workflow active and deletes nothing.
- Production migration, live deletion, rollout and release require a separate release gate. This ADR authorizes documentation and later local/disposable implementation only.

## Implementation Boundary

The accepted implementation is the additive schema and command design in `SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001` section 0.10:

- Fresh Phase 1H uses one native `numbering.drawing_revision_lifecycle_review` request and a transient lifecycle sidecar; it does not create legacy `submissions` as a second authority.
- Durable `drawing_revision_packages.lifecycle_state`, controlled package files and `drawing_revision_package_part_scopes` survive cleanup. Transient workflow/reviewer rows and a payload-free seven-day token support active control and recovery.
- Existing immutable target/snapshot/decision/event/audit guards receive only an exact-workflow predicate requiring `cleanup_authorized_at`; all non-matching deletes still fail. `drawing_revision_package_review_approvals` remains immutable and is not written by Phase 1H.
- Active adoption is performed by an explicit dry-run/apply tool before `enforced` mode. A blocked candidate blocks the entire activation set; completed rows never enter the adopter.
- Terminal current-state apply is atomic. Cleanup is a second all-or-nothing transaction with ordered FK detachment and zero-row assertions. Cleanup failure retries cleanup only.

This boundary is intentionally irreversible after the first Phase 1H decision/cleanup because the selected product policy deletes history. Production release must record the point of no return and cannot claim a data rollback that reconstructs intentionally removed review records.

## Acceptance Boundary

- Disposable tests prove terminal cleanup leaves zero Phase 1H workflow business rows while revision package, controlled files and selected multi-part scope remain correct.
- Existing completed/permanent approval fixtures and production-like data hashes remain unchanged; only explicit active adoption fixtures may acquire transient bridges and later cleanup.
- Other-domain append-only/no-delete and row-access negative tests remain green.
- Optional reason, first-decision withdrawal cutoff, 9B current-state delivery, active all-or-nothing adoption, 10B latest redirect, cleanup retry and seven-day token expiry are independently verified.
- If RD cannot meet these conditions without weakening other domains or modifying existing data, implementation stops and returns to Dev PM.
