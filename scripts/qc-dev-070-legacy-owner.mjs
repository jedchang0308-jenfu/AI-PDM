#!/usr/bin/env node

import assert from "node:assert/strict";
import { closeAsyncDatabaseClient, getAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { buildPdmApprovalOwnerHref } from "../src/lib/pdm-approval-owner-route.ts";
import { PdmEntityDetailError, PdmEntityDetailService } from "../src/lib/pdm-entity-detail.ts";
import { assertPdmEntityWriteAllowedAsync, PdmReviewLockError } from "../src/lib/pdm-review-lock.ts";
import { AsyncApprovalPlatformRepository, decodeLegacyApprovalId } from "../src/lib/repositories/approval-platform-async-repository.ts";

process.env.PDM_DB_PROVIDER = "sqlite";

const client = getAsyncDatabaseClient();
try {
  const companyId = "company-jenfu";
  const actor = await client.queryOne(
    `SELECT id
       FROM users
      WHERE company_id = :companyId
        AND role IN ('R&D Manager', 'Admin')
        AND account_status = 'active'
        AND system_role_enabled = 1
      ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END, id
      LIMIT 1`,
    { companyId }
  );
  assert.ok(actor?.id, "fixture has an active PDM reviewer");

  const repository = new AsyncApprovalPlatformRepository(client);
  const inbox = await repository.listInbox({ companyId, status: "active", limit: 500 });
  const legacyReviews = inbox.items.filter((item) => item.source === "legacy_drawing_revision_review");
  assert.ok(legacyReviews.length > 0, "fixture has pending legacy drawing revision reviews");
  assert.ok(
    legacyReviews.every((item) => Boolean(buildPdmApprovalOwnerHref(item, "/approvals"))),
    "every legacy drawing review resolves to the shared owner drawer, including pre-package records"
  );
  const legacy = inbox.items.find(
    (item) => item.source === "legacy_drawing_revision_review" && item.primaryTarget?.type === "drawing_revision_package"
  ) ?? legacyReviews[0];
  assert.ok(legacy, "pending legacy drawing revision review resolves a canonical drawing target");
  const hasExactRevisionPackage = legacy.primaryTarget?.type === "drawing_revision_package";

  const returnTo = `/approvals?status=active&requestId=${encodeURIComponent(legacy.id)}`;
  const ownerHref = buildPdmApprovalOwnerHref(legacy, returnTo);
  assert.ok(ownerHref, "legacy PDM review receives an owner route");
  const ownerUrl = new URL(ownerHref, "http://localhost");
  assert.equal(ownerUrl.pathname, "/numbering/drawings");
  assert.equal(ownerUrl.searchParams.get("detail"), `drawing:${legacy.primaryTarget.targetId}`);
  assert.equal(ownerUrl.searchParams.get("reviewRequestId"), legacy.id);
  assert.equal(ownerUrl.searchParams.get("returnTo"), returnTo);

  const response = await new PdmEntityDetailService(client).read({
    entityKey: `drawing:${legacy.primaryTarget.targetId}`,
    surface: "drawing",
    companyId,
    actorId: actor.id,
    reviewRequestId: legacy.id,
    returnTo
  });
  assert.equal(response.projections.drawing?.level, "full", "review shows full DrawingProjection");
  assert.equal(response.projections.part?.level, "full", "review shows full PartProjection");
  assert.equal(response.projections.relation?.level, "full", "review shows full RelationProjection");
  assert.equal(response.projections.review?.level, "full", "review shows full ReviewContextProjection");
  assert.equal(response.projections.review?.data.source, "legacy", "legacy review remains traceable in the shared drawer");

  const drawing = response.projections.drawing?.level === "full" ? response.projections.drawing.data : null;
  const relation = response.projections.relation?.level === "full" ? response.projections.relation.data : null;
  if (hasExactRevisionPackage) {
    assert.ok(drawing && drawing.attachments.length > 0, "exact reviewed revision attachments are present");
    assert.ok(
      drawing.attachments.every((attachment) => attachment.href.includes("reviewRequestId=")),
      "review attachment URLs preserve the same scope receipt"
    );
  } else {
    assert.ok(drawing, "pre-package legacy review falls back to the canonical drawing master");
  }
  assert.ok(drawing.linkedParts.length > 0, "drawing projection includes linked parts");
  assert.ok(relation && relation.parts.length > 0, "relation projection includes all related parts");
  assert.deepEqual(
    drawing.linkedParts.map((part) => part.partNumber).sort(),
    relation.parts.map((part) => part.partNumber).sort(),
    "drawing and relation projections use the same root aggregate"
  );
  assert.equal(response.actionBar.primary.execution?.type, "command", "approval action exposes an executable command");
  assert.match(decodeURIComponent(response.actionBar.primary.execution?.href ?? ""), new RegExp(legacy.id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")), "approval action remains attached to the exact legacy request");
  assert.equal(response.actionBar.primary.kind, "approve", "approve is always visible for a pending review");
  assert.equal(response.actionBar.primary.enabled, true, "approve is available to the assigned human reviewer");
  assert.deepEqual(
    response.actionBar.secondary.filter((action) => action.owner === "approval").map((action) => action.kind).sort(),
    ["reject", "return_for_correction"].sort(),
    "return and request-information decisions remain visible regardless of FFF outcome"
  );
  assert.deepEqual(
    response.projections.review?.data.allowedDecisions,
    ["approved", "rejected", "needs_info"],
    "the review receipt no longer narrows human decisions from outcome data"
  );
  const reviewEventTable = await client.queryOne(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'review_confirmation_events'"
  );
  assert.match(String(reviewEventTable?.sql ?? ""), /request_more_information/, "existing SQLite databases accept the request-information decision");
  const decodedLegacy = decodeLegacyApprovalId(legacy.id);
  assert.equal(decodedLegacy?.source, "legacy_drawing_revision_review", "legacy review id decodes for decision projection");
  await client.execute("BEGIN IMMEDIATE");
  try {
    await client.execute(
      `INSERT INTO review_confirmation_events (
         id, company_id, review_id, action, reviewer_user_id, result, metadata_json
       ) VALUES (
         :id, :companyId, :reviewId, 'request_more_information', :actorId, :result, '{}'
       )`,
      {
        id: `qc-needs-info-${Date.now()}`,
        companyId,
        reviewId: decodedLegacy.legacyId,
        actorId: actor.id,
        result: "QC transient request for more information"
      }
    );
    const needsInfo = await repository.getRequestDetail(legacy.id, companyId);
    assert.equal(needsInfo?.status, "needs_info", "request-information remains distinct from rejection");
  } finally {
    await client.execute("ROLLBACK");
  }
  await assert.rejects(
    () => assertPdmEntityWriteAllowedAsync(client, {
      companyId,
      targetIds: [legacy.primaryTarget.targetId],
      targetRefs: [{ type: legacy.primaryTarget.type, id: legacy.primaryTarget.targetId }]
    }),
    (error) => error instanceof PdmReviewLockError,
    "the shared legacy review aggregate remains immutable until a decision is recorded"
  );

  const unrelated = inbox.items.find(
    (item) => item.id !== legacy.id
      && item.source === "legacy_drawing_revision_review"
      && item.primaryTarget?.targetId
      && item.primaryTarget.targetId !== legacy.primaryTarget.targetId
  );
  if (unrelated) {
    await assert.rejects(
      () => new PdmEntityDetailService(client).read({
        entityKey: `drawing:${legacy.primaryTarget.targetId}`,
        surface: "drawing",
        companyId,
        actorId: actor.id,
        reviewRequestId: unrelated.id,
        returnTo
      }),
      (error) => error instanceof PdmEntityDetailError && error.code === "PDM_ENTITY_DETAIL_NOT_FOUND",
      "a legacy receipt cannot open another reviewed aggregate"
    );
  }

  assert.equal(
    buildPdmApprovalOwnerHref({ actionCode: legacy.actionCode, id: legacy.id, primaryTarget: undefined }, returnTo),
    null,
    "unresolved legacy targets fail closed instead of opening an incomplete drawer"
  );
  const prePackage = legacyReviews.find((item) => item.primaryTarget?.type === "drawing_number");
  if (prePackage?.primaryTarget) {
    const prePackageDetail = await new PdmEntityDetailService(client).read({
      entityKey: `drawing:${prePackage.primaryTarget.targetId}`,
      surface: "drawing",
      companyId,
      actorId: actor.id,
      reviewRequestId: prePackage.id,
      returnTo
    });
    assert.equal(prePackageDetail.projections.relation?.level, "full", "pre-package legacy review still renders full relation data");
    assert.ok(
      prePackageDetail.projections.relation?.level === "full" && prePackageDetail.projections.relation.data.parts.length > 0,
      "pre-package legacy review does not lose related part information"
    );
  }
  console.log(`QC DEV-070 legacy owner: PASS (${legacy.targetSummary}, ${hasExactRevisionPackage ? "exact package" : "drawing fallback"}, ${drawing.attachments.length} attachments, ${relation.parts.length} related parts)`);
} finally {
  await closeAsyncDatabaseClient();
}
