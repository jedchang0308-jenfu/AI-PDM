#!/usr/bin/env node

import assert from "node:assert/strict";
import { phaseMatchesFilter, projectRoleViewerHumanStatus, projectViewerHumanStatus, viewerStatusMatchesFilter } from "../src/lib/human-status-projection.ts";
import { projectPartHumanStatus } from "../src/lib/part-human-status.ts";
import { projectRelationHumanStatus } from "../src/lib/drawing-part-relation-status.ts";
import { projectDrawingHumanStatus, projectDrawingRecordHumanStatus } from "../src/lib/drawing-workbench-status.ts";
import { projectDrawingAvailability, projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "../src/lib/availability-scope.ts";

const results = [];

function check(id, actual, expected) {
  assert.equal(actual, expected, `${id}: expected ${expected}, got ${actual}`);
  results.push({ id, passed: true, actual, expected });
}

const partCases = [
  ["HS-PART-01", { recordStatus: "MainDrawingInvalid", itemKind: "manufactured", primaryDrawingNumber: "A-M01" }, "main_drawing_invalid"],
  ["HS-PART-02", { recordStatus: "Active", itemKind: "manufactured", primaryDrawingNumber: null }, "missing_manufacturing_drawing"],
  ["HS-PART-03", { recordStatus: "Rejected", itemKind: "purchased", primaryDrawingNumber: null }, "correction_required"],
  ["HS-PART-04", { recordStatus: "PendingReview", itemKind: "purchased", primaryDrawingNumber: null }, "waiting_review"],
  ["HS-PART-05", { recordStatus: "Draft", itemKind: "purchased", primaryDrawingNumber: null }, "preparing"],
  ["HS-PART-06", { recordStatus: "Released", itemKind: "purchased", primaryDrawingNumber: null }, "released"],
  ["HS-PART-07", { recordStatus: "Obsolete", itemKind: "purchased", primaryDrawingNumber: null }, "obsolete"]
];
for (const [id, source, expected] of partCases) check(id, projectPartHumanStatus(source).key, expected);

const relationCases = [
  ["HS-REL-01", { recordStatus: "Active", relationshipHealth: "missing_manufacturing_drawing", blockerCount: 1 }, "missing_manufacturing_drawing"],
  ["HS-REL-02", { recordStatus: "Active", relationshipHealth: "ambiguous", blockerCount: 1 }, "data_conflict"],
  ["HS-REL-03", { recordStatus: "Active", relationshipHealth: "complete", blockerCount: 0 }, "relation_complete"],
  ["HS-REL-04", { recordStatus: "Obsolete", relationshipHealth: "complete", blockerCount: 0 }, "obsolete"],
  ["HS-REL-05", { recordStatus: "Draft", relationshipHealth: "complete", blockerCount: 0 }, "preparing"],
  ["HS-REL-06", { recordStatus: "PendingReview", relationshipHealth: "complete", blockerCount: 0 }, "waiting_review"]
];
for (const [id, source, expected] of relationCases) check(id, projectRelationHumanStatus(source).key, expected);

const drawingBase = {
  rowKey: "drawing:A-M01",
  id: "drawing-1",
  drawingNumber: "A-M01",
  rootCode: "A",
  coreName: "Fixture",
  itemKind: "manufactured",
  purposeCode: "M",
  purposeLabel: "製造圖",
  recordStatus: "Draft",
  stage: "bundle_ready",
  stageLabel: "可送審",
  stageRank: 2,
  nextAction: null,
  primaryAction: null,
  warning: null,
  terminal: null,
  linkedPartNumbers: [],
  linkedPartCount: 0,
  sameRootPartCount: 0,
  releaseStatusMismatch: null,
  pendingApproval: null,
  titleBlockVariantWarning: false
};
check("HS-DRAW-01", projectDrawingHumanStatus(drawingBase).key, "ready_to_submit");
check("HS-DRAW-02", projectDrawingHumanStatus({ ...drawingBase, stage: "in_review" }).key, "waiting_review");
check("HS-DRAW-03", projectDrawingHumanStatus({ ...drawingBase, stage: "history_only", terminal: { kind: "cancelled", label: "取消" } }).key, "cancelled");
check("HS-DRAW-04", projectDrawingRecordHumanStatus({ recordStatus: "Released" }).key, "released");

check("HS-FILTER-01", phaseMatchesFilter("action_required", "needs_action"), true);
check("HS-FILTER-02", phaseMatchesFilter("usable", "needs_action"), false);
check("HS-FILTER-03", phaseMatchesFilter("terminal", "history"), true);
check("HS-FILTER-04", phaseMatchesFilter("waiting", "all"), true);

const noCapabilities = { canEdit: false, canManageRelations: false, canReview: false, canPublish: false, canRestoreMainDrawing: false, canSubmit: false };
const draftStatus = projectPartHumanStatus({ recordStatus: "Draft", itemKind: "purchased", primaryDrawingNumber: null });
const reviewerStatus = projectPartHumanStatus({ recordStatus: "PendingReview", itemKind: "purchased", primaryDrawingNumber: null });
const usableStatus = projectPartHumanStatus({ recordStatus: "Active", itemKind: "purchased", primaryDrawingNumber: null });
const currentDraft = projectRoleViewerHumanStatus(draftStatus, { ...noCapabilities, canEdit: true });
const otherDraft = projectRoleViewerHumanStatus(draftStatus, noCapabilities);
const currentReview = projectRoleViewerHumanStatus(reviewerStatus, { ...noCapabilities, canReview: true });
const systemStatus = projectViewerHumanStatus({ ...draftStatus, key: "finalizing" }, { responsibility: "system", basis: "system", canAct: false });
const assignedWithoutPermission = projectViewerHumanStatus(draftStatus, { responsibility: "current_user", basis: "assignee", canAct: false });

check("HS-VIEWER-01", currentDraft.label, "待你處理");
check("HS-VIEWER-02", otherDraft.label, "等他人處理");
check("HS-VIEWER-03", currentReview.label, "待你處理");
check("HS-VIEWER-04", systemStatus.label, "系統處理中");
check("HS-VIEWER-05", projectRoleViewerHumanStatus(usableStatus, noCapabilities).label, "可使用");
check("HS-VIEWER-06", assignedWithoutPermission.label, "待你處理");
check("HS-VIEWER-07", assignedWithoutPermission.canAct, false);
check("HS-VIEWER-FILTER-01", viewerStatusMatchesFilter(currentDraft, draftStatus, "needs_action"), true);
check("HS-VIEWER-FILTER-02", viewerStatusMatchesFilter(otherDraft, draftStatus, "needs_action"), false);
check("HS-VIEWER-FILTER-03", viewerStatusMatchesFilter(otherDraft, draftStatus, "waiting"), true);
check("HS-VIEWER-FILTER-04", viewerStatusMatchesFilter(systemStatus, draftStatus, "system"), true);

check("HS-AVAIL-01", projectDrawingAvailability({ stage: "official_controlled", usage: "rd_controlled" }).label, "研發可用");
check("HS-AVAIL-02", projectDrawingAvailability({ stage: "released", usage: "released" }).label, "生產可用");
check("HS-AVAIL-03", projectDrawingAvailability({ stage: "released", usage: "released", releaseStatusMismatch: true }).label, "可用範圍待確認");
check("HS-AVAIL-12", projectDrawingAvailability({ stage: "released", usage: "rd_controlled" }).label, "可用範圍待確認");
check("HS-AVAIL-04", projectDrawingRecordAvailability({ recordStatus: "Active" }).scope, "rd");
check("HS-AVAIL-05", projectDrawingRecordAvailability({ recordStatus: "Released" }).scope, "production");
check("HS-AVAIL-06", projectPartAvailability({ recordStatus: "Active", itemKind: "manufactured", primaryDrawingNumber: "A-M01", primaryDrawingRecordStatus: "Active", hasManufacturingDrawing: true }).label, "研發可用");
check("HS-AVAIL-07", projectPartAvailability({ recordStatus: "Released", itemKind: "manufactured", primaryDrawingNumber: "A-M01", primaryDrawingRecordStatus: "Released", hasManufacturingDrawing: true }).label, "生產可用");
check("HS-AVAIL-08", projectPartAvailability({ recordStatus: "Released", itemKind: "manufactured", primaryDrawingNumber: "A-M01", primaryDrawingRecordStatus: "Active", hasManufacturingDrawing: true }).label, "可用範圍待確認");
check("HS-AVAIL-09", projectRelationRootAvailability({ recordStatus: "Active", relationshipHealth: "complete", blockerCount: 0 }).label, "研發可用");
check("HS-AVAIL-10", projectRelationRootAvailability({ recordStatus: "Released", relationshipHealth: "complete", blockerCount: 0 }).label, "生產可用");
check("HS-AVAIL-11", projectRelationRootAvailability({ recordStatus: "Released", relationshipHealth: "missing_manufacturing_drawing", blockerCount: 1 }).scope, "none");
check("HS-AVAIL-13", projectRelationRootAvailability({ recordStatus: "Released", relationshipHealth: "complete", blockerCount: 0, dependencyReleaseReady: false }).label, "可用範圍待確認");

console.log(JSON.stringify({ suite: "DEV-055 human status projection", passed: results.length, failed: 0, results }, null, 2));
