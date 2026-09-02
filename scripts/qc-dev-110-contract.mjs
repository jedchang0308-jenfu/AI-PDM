import assert from "node:assert/strict";
import {
  applyHandoffIntent,
  handoffDraftHash,
  parseHandoffDraft,
  resolveHandoffEvidenceOwner
} from "../src/lib/drawing-recognition-part-work-handoff-contract.ts";

const parts = [
  { id: "p1", partNumber: "A0006-P01", partName: "P01", partRootId: "root" },
  { id: "p2", partNumber: "A0006-P02", partName: "P02", partRootId: "root" },
  { id: "p3", partNumber: "A0006-P03", partName: "P03", partRootId: "root" }
];

assert.equal(resolveHandoffEvidenceOwner({ rawText: "材質 SUS304 A0006-P03", eligibleParts: parts }).partId, "p3");
assert.equal(resolveHandoffEvidenceOwner({ rawText: "材質 SUS304 P03", eligibleParts: parts }).kind, "unresolved");
assert.equal(resolveHandoffEvidenceOwner({ rawText: "A0006-P01 A0006-P02", eligibleParts: parts }).kind, "unresolved");
assert.equal(resolveHandoffEvidenceOwner({ rawText: "SUS304", applicabilityScope: "overall", eligibleParts: parts }).kind, "overall");
assert.equal(resolveHandoffEvidenceOwner({ rawText: "A0006-P99", candidateOwnerId: "p9", eligibleParts: parts }).kind, "unresolved");

const draft = parseHandoffDraft({ commonValues: [{ fieldKey: "material", intent: "value", value: "SUS304" }], overrides: [{ partId: "p3", fieldKey: "material", intent: "value", value: "SUS301" }] });
assert.equal(draft.commonValues[0].value, "SUS304");
assert.equal(draft.overrides[0].value, "SUS301");
assert.equal(handoffDraftHash(draft), handoffDraftHash(parseHandoffDraft({ common_values: draft.commonValues, overrides: draft.overrides })));
const payload = { partName: "P01", itemKind: "manufactured", customSpecification: null, isUniversal: false, bomUsagePolicy: "undecided", materialCode: "M304", materialLabel: "SUS304", colorCode: null, colorLabel: null, surfaceTreatment: null, variantNote: null };
assert.equal(applyHandoffIntent(payload, "material", "value", "SUS304").materialCode, "M304");
assert.equal(applyHandoffIntent(payload, "material", "value", "SUS301").materialCode, null);
assert.equal(applyHandoffIntent(payload, "material", "clear", null).materialLabel, null);
console.log("DEV-110 contract QC PASS (C01-C08)");
