#!/usr/bin/env node

import assert from "node:assert/strict";
import { PdmEntityDetailService } from "@/lib/pdm-entity-detail";

const companyId = "company-jenfu";
const rootId = "dev074-target-root";
const drawings = [
  { id: "drawing-m01", companyId, partRootId: rootId, drawingNumber: "A074-M01", purposeCode: "M", purposeDescription: "", sequenceNo: 1, isPrimaryManufacturing: true, recordStatus: "Active", ruleVersionId: "numbering-rule-v3-alpha-root" },
  { id: "drawing-m03", companyId, partRootId: rootId, drawingNumber: "A074-M03", purposeCode: "M", purposeDescription: "", sequenceNo: 3, isPrimaryManufacturing: false, recordStatus: "Active", ruleVersionId: "numbering-rule-v3-alpha-root" },
  { id: "drawing-m06", companyId, partRootId: rootId, drawingNumber: "A074-M06", purposeCode: "M", purposeDescription: "", sequenceNo: 6, isPrimaryManufacturing: false, recordStatus: "Active", ruleVersionId: "numbering-rule-v3-alpha-root" }
];
const parts = [
  { id: "part-p01", companyId, partRootId: rootId, partNumber: "A074-P01", sequenceNo: 1, sequenceCode: "01", partName: "Part 01", itemKind: "manufactured", isUniversal: false, customSpecification: null, seriesCode: null, recordStatus: "Active", universalReason: null, ruleVersionId: "numbering-rule-v3-alpha-root" },
  { id: "part-p03", companyId, partRootId: rootId, partNumber: "A074-P03", sequenceNo: 3, sequenceCode: "03", partName: "Part 03", itemKind: "manufactured", isUniversal: false, customSpecification: null, seriesCode: null, recordStatus: "Active", universalReason: null, ruleVersionId: "numbering-rule-v3-alpha-root" },
  { id: "part-p06", companyId, partRootId: rootId, partNumber: "A074-P06", sequenceNo: 6, sequenceCode: "06", partName: "Part 06", itemKind: "manufactured", isUniversal: false, customSpecification: null, seriesCode: null, recordStatus: "Active", universalReason: null, ruleVersionId: "numbering-rule-v3-alpha-root" }
];
const links = [
  { id: "link-01", drawingNumberId: "drawing-m01", partNumberId: "part-p01", drawingNumber: "A074-M01", partNumber: "A074-P01", linkType: "primary_manufacturing", createdAt: "2026-08-16T00:00:00.000Z" },
  { id: "link-03", drawingNumberId: "drawing-m03", partNumberId: "part-p03", drawingNumber: "A074-M03", partNumber: "A074-P03", linkType: "primary_manufacturing", createdAt: "2026-08-16T00:00:00.000Z" },
  { id: "link-06", drawingNumberId: "drawing-m06", partNumberId: "part-p06", drawingNumber: "A074-M06", partNumber: "A074-P06", linkType: "primary_manufacturing", createdAt: "2026-08-16T00:00:00.000Z" }
];
const root = {
  root: { id: rootId, companyId, rootCode: "A074", coreName: "DEV-074 target projection", itemKind: "manufactured", recordStatus: "Active", ruleVersionId: "numbering-rule-v3-alpha-root" },
  partNumbers: parts,
  drawingNumbers: drawings,
  links,
  variants: [],
  warnings: [],
  auditTrail: [],
  summary: { partCount: 3, drawingCount: 3, primaryManufacturingCount: 3, warningCount: 0, hasMainDrawingInvalid: false }
};
const header = {
  entityKind: "drawing",
  entityCode: "A074-M03",
  displayName: "DEV-074 target projection",
  humanStatus: {},
  viewerStatus: {},
  availabilityScope: {},
  stateFamily: "rd_controlled",
  actorResponsibility: "QC",
  lockedByReview: true
};
const service = new PdmEntityDetailService({});

const drawingRecord = {
  ...drawings[1],
  rootCode: "A074",
  coreName: "DEV-074 target projection",
  itemKind: "manufactured",
  linkedPartCount: 1,
  linkedPartNumbers: ["A074-P03"],
  sameRootParts: [],
  titleBlockVariantWarning: false,
  warningCount: 0,
  releaseStatusMismatch: null,
  lifecycle: null,
  updatedAt: "2026-08-16T00:00:00.000Z"
};
const drawingSource = { key: "drawing:revision-package-m03", drawing: drawingRecord, canonicalDrawing: null, candidate: null, part: null, root, attachments: [], revisionRecords: [] };
const drawingProjection = service.drawingProjection(drawingSource, header, "full");
const drawingPartProjection = service.partProjection(drawingSource, header, "full");

assert.equal(drawingProjection.drawingNumber, "A074-M03", "drawing review keeps the requested drawing instead of root M01");
assert.deepEqual(drawingProjection.linkedParts.map((part) => part.partNumber), ["A074-P03"], "drawing review lists only parts linked to M03");
assert.equal(drawingPartProjection.partNumber, "A074-P03", "drawing review projects the part linked to M03 instead of root P01");
assert.equal(drawingPartProjection.representativeDrawing?.drawingNumber, "A074-M03", "the part panel keeps M03 as its review context");

const partRecord = {
  ...parts[2],
  updatedAt: "2026-08-16T00:00:00.000Z",
  rootCode: "A074",
  coreName: "DEV-074 target projection",
  variant: null,
  primaryDrawingNumber: "A074-M06",
  drawingCount: 1,
  linkedDrawings: [links[2]],
  sameDrawingVariants: []
};
const partSource = { key: "part:part-p06", drawing: null, canonicalDrawing: null, candidate: null, part: partRecord, root, attachments: [], revisionRecords: [] };
const partDrawingProjection = service.drawingProjection(partSource, { ...header, entityKind: "part", entityCode: "A074-P06" }, "full");
const partProjection = service.partProjection(partSource, { ...header, entityKind: "part", entityCode: "A074-P06" }, "full");

assert.equal(partDrawingProjection.drawingNumber, "A074-M06", "part review projects its linked M06 instead of root M01");
assert.deepEqual(partDrawingProjection.linkedParts.map((part) => part.partNumber), ["A074-P06"], "linked drawing projection preserves the exact part relation");
assert.equal(partProjection.partNumber, "A074-P06", "part review keeps the requested part instead of root P01");
assert.equal(partProjection.representativeDrawing?.drawingNumber, "A074-M06", "part review representative drawing follows its primary relation");

console.log("QC DEV-074 target relation projection: PASS (drawing M03 maps P03; part P06 maps M06; root-first fallback is not used)");
