import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const runDir = path.join(root, "output", "qa", "dev-068-drawing-recognition", `A0005-${stamp}-local-isolated`);
fs.mkdirSync(runDir, { recursive: true });
const sourceDatabase = path.resolve(process.env.PDM_DEV_068_SOURCE_SQLITE_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const databasePath = path.join(runDir, "ai-pdm.sqlite");
fs.copyFileSync(sourceDatabase, databasePath);

const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const startMarker = "-- DEV-068 drawing/CAD recognition candidate review and atomic formalization.";
const endMarker = "-- END DEV-068 drawing recognition schema.";
const start = schema.indexOf(startMarker);
const end = schema.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, "DEV-068 schema markers must exist");
const seedDb = new Database(databasePath);
seedDb.pragma("foreign_keys = ON");
seedDb.exec(schema.slice(start, end + endMarker.length));
seedDb.close();

process.env.PDM_DATA_DIR = runDir;
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "true";
process.env.PDM_UNIFIED_DRAWING_WORKBENCH_V1 = "true";
process.env.PDM_DRAWING_RECOGNITION_V1 = "true";
process.env.PDM_AUTH_SECRET = "dev-068-isolated-qc-secret";

const [{ getDb }, recognition, adapters, platform] = await Promise.all([
  import("../src/lib/db.ts"),
  import("../src/lib/drawing-recognition.ts"),
  import("../src/lib/drawing-recognition-adapters.ts"),
  import("../src/lib/platform-command.ts")
]);
const db = getDb();
const companyId = "company-jenfu";
const revisionId = "drawing-revision-package-DRP-2478790e-6f97-41b3-a735-d0cee48814ed";
const actor = db.prepare("SELECT id, role FROM users WHERE company_id = ? ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END, id LIMIT 1").get(companyId);
assert.ok(actor?.id, "A0005 fixture requires a company user");

const session = await recognition.createDrawingRecognitionSession({
  companyId,
  actorId: actor.id,
  sourceContextType: "drawing_revision",
  sourceContextId: revisionId
});
db.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id = ?").run(new Date(0).toISOString(), session.id);
const job = await recognition.claimDrawingRecognitionJob({ workerId: "qc-dev-068-a0005", maxAttempts: 2 });
assert.equal(job?.sessionId, session.id, "worker must claim the new session");
assert.equal(job.targetContext.drawingNumber, "A0005-M01");
assert.deepEqual(job.targetContext.parts.map((part) => part.partNumber), ["A0005-P01", "A0005-P02", "A0005-P03"]);

const results = job.sources.flatMap((source) => {
  const fixture = adapters.buildA0005FixtureResult(job, source);
  return [adapters.buildFilenameAdapterResult(source), ...(fixture ? [fixture] : [])];
});
const projection = await recognition.completeDrawingRecognitionJob({
  sessionId: job.sessionId,
  workerId: "qc-dev-068-a0005",
  sourceSetFingerprint: job.sourceSetFingerprint,
  results
});
assert.equal(projection.status, "review_ready");
assert.deepEqual(new Set(projection.candidates.map((candidate) => candidate.category)), new Set(["identity_relation", "part_attribute", "drawing_revision", "controlled_note", "engineering_evidence", "unclassified"]));
const baseline = new Map(projection.baseline.map((item) => [item.fieldKey, item]));
assert.deepEqual({ value: baseline.get("material")?.value, support: baseline.get("material")?.support, partCount: baseline.get("material")?.partCount }, { value: "SUS304", support: 2, partCount: 3 });
assert.deepEqual({ value: baseline.get("color")?.value, support: baseline.get("color")?.support, partCount: baseline.get("color")?.partCount }, { value: "無", support: 2, partCount: 3 });
assert.deepEqual({ value: baseline.get("surface_finish")?.value, support: baseline.get("surface_finish")?.support }, { value: "無", support: 3 });
const openFieldCandidate = projection.candidates.find((candidate) => candidate.category === "unclassified" && candidate.normalizedValue === "REF-MOTOR-B");
const p01 = job.targetContext.parts.find((part) => part.partNumber === "A0005-P01");
assert.ok(openFieldCandidate && p01, "A0005 must expose one unclassified OCR candidate and the P01 target");

const reviewed = await recognition.saveDrawingRecognitionDecisions({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  expectedRowVersion: projection.rowVersion,
  decisions: projection.candidates.map((candidate) => candidate.id === openFieldCandidate.id
    ? {
        candidateId: candidate.id,
        action: "create_field",
        category: "part_attribute",
        fieldKey: "reference_motor_code",
        fieldLabel: "參考馬達代碼",
        ownerType: "part_number",
        ownerId: p01.id,
        applicabilityScope: p01.partNumber,
        value: "REF-MOTOR-B"
      }
    : { candidateId: candidate.id, action: "accept" })
});
assert.equal(reviewed.status, "ready_to_formalize");

const impact = await recognition.calculateDrawingRecognitionImpact({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  expectedRowVersion: reviewed.rowVersion
});
assert.equal(impact.blockers.length, 0);
assert.equal(impact.changes.length, 5);
assert.equal(impact.exclusions.filter((item) => item.reason === "unchanged").length, 12);
assert.ok(impact.exclusions.length >= 5);
const platformActor = platform.createPlatformActorContext({
  pdmUserId: actor.id,
  organizationId: companyId,
  roles: [actor.role],
  scopes: ["numbering.recognition.formalize"],
  authProvider: "qc_dev_068",
  requestId: "qc-dev-068-a0005-request",
  correlationId: "qc-dev-068-a0005-correlation"
});
const metadata = { actor: platformActor, idempotencyKey: "qc-dev-068-a0005-formalize" };
const formalized = await recognition.formalizeDrawingRecognition({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  impactToken: impact.impactToken,
  reason: "DEV-068 isolated QC formalization may target an already released fixture.",
  metadata
});
assert.equal(formalized.appliedCount, 5);
const replay = await recognition.formalizeDrawingRecognition({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  impactToken: impact.impactToken,
  reason: "DEV-068 isolated QC formalization may target an already released fixture.",
  metadata
});
assert.equal(replay.reusedFromCommandReceipt, true);

const partValues = db.prepare(`SELECT part.part_number, value.material_label, value.color_label, value.surface_treatment, value.variant_note
  FROM part_variant_attributes value JOIN part_numbers part ON part.id = value.part_number_id
  WHERE part.company_id = ? AND part.part_number LIKE 'A0005-P%' ORDER BY part.part_number`).all(companyId);
assert.equal(partValues.length, 3);
assert.equal(partValues.find((row) => row.part_number === "A0005-P02")?.material_label, "SUS301");
assert.equal(partValues.find((row) => row.part_number === "A0005-P03")?.color_label, "黑");
const openFieldValue = db.prepare(`SELECT definition.stable_key, definition.display_label, value.value_text
  FROM pdm_part_attribute_values value
  JOIN pdm_attribute_definitions definition ON definition.id = value.attribute_definition_id
  WHERE value.company_id = ? AND value.part_number_id = ? AND definition.stable_key = ?`).get(companyId, p01.id, "reference_motor_code");
assert.deepEqual(openFieldValue, { stable_key: "reference_motor_code", display_label: "參考馬達代碼", value_text: "REF-MOTOR-B" });
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_formalization_events WHERE session_id = ?").get(session.id).count, 1);

let appendOnlyProtected = false;
try { db.prepare("UPDATE drawing_recognition_decisions SET reason = 'tamper' WHERE session_id = ?").run(session.id); }
catch (error) { appendOnlyProtected = String(error).toLowerCase().includes("append_only"); }
assert.equal(appendOnlyProtected, true, "decision audit rows must be append-only");

const rerun = await recognition.rerunDrawingRecognition({ sessionId: session.id, companyId, actorId: actor.id, roles: [actor.role] });
db.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id = ?").run(new Date(0).toISOString(), rerun.id);
const rerunJob = await recognition.claimDrawingRecognitionJob({ workerId: "qc-dev-068-a0005-rerun", maxAttempts: 2 });
assert.equal(rerunJob?.sessionId, rerun.id);
const rerunResults = rerunJob.sources.flatMap((source) => {
  const fixture = adapters.buildA0005FixtureResult(rerunJob, source);
  return [adapters.buildFilenameAdapterResult(source), ...(fixture ? [fixture] : [])];
});
rerunResults.push({
  sourceId: rerunJob.sources[0].id,
  adapterCode: "qc-missing-value.v1",
  adapterVersion: "1.0.0",
  status: "succeeded",
  observations: [{
    rawText: "參考馬達代碼欄位存在，但本次未辨識到值",
    rawValue: null,
    normalizedValue: null,
    locationKind: "qc_contract_probe",
    confidenceBand: "low",
    category: "part_attribute",
    fieldKey: "reference_motor_code",
    fieldLabel: "參考馬達代碼",
    proposedOwnerType: "part_number",
    proposedOwnerId: p01.id,
    applicabilityScope: p01.partNumber
  }]
});
const rerunProjection = await recognition.completeDrawingRecognitionJob({ sessionId: rerun.id, workerId: "qc-dev-068-a0005-rerun", sourceSetFingerprint: rerunJob.sourceSetFingerprint, results: rerunResults });
const changedCandidate = rerunProjection.candidates.find((candidate) => candidate.category === "part_attribute" && candidate.fieldKey === "material" && candidate.applicabilityScope === "A0005-P02");
const missingValueCandidate = rerunProjection.candidates.find((candidate) => candidate.category === "part_attribute" && candidate.fieldKey === "reference_motor_code" && candidate.variantStatus === "unrecognized");
assert.ok(changedCandidate && missingValueCandidate);
let notApplicableReasonRequired = false;
try {
  await recognition.saveDrawingRecognitionDecisions({
    sessionId: rerun.id,
    companyId,
    actorId: actor.id,
    roles: [actor.role],
    expectedRowVersion: rerunProjection.rowVersion,
    decisions: [{ candidateId: missingValueCandidate.id, action: "not_applicable" }]
  });
} catch (error) {
  notApplicableReasonRequired = error?.code === "RECOGNITION_DECISION_REASON_REQUIRED";
}
assert.equal(notApplicableReasonRequired, true, "explicit N/A must require a human reason");
const rerunReviewed = await recognition.saveDrawingRecognitionDecisions({
  sessionId: rerun.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  expectedRowVersion: rerunProjection.rowVersion,
  decisions: rerunProjection.candidates.filter((candidate) => candidate.category !== "unclassified").map((candidate) =>
    candidate.id === changedCandidate.id
      ? { candidateId: candidate.id, action: "correct", value: "SUS302" }
      : { candidateId: candidate.id, action: "accept" }
  )
});
const staleImpact = await recognition.calculateDrawingRecognitionImpact({ sessionId: rerun.id, companyId, actorId: actor.id, roles: [actor.role], expectedRowVersion: rerunReviewed.rowVersion });
assert.ok(staleImpact.changes.some((change) => change.candidateId === changedCandidate.id));
assert.ok(staleImpact.exclusions.some((item) => item.candidateId === missingValueCandidate.id && item.reason === "missing_value_no_change"));
assert.equal(db.prepare(`SELECT value.value_text FROM pdm_part_attribute_values value
  JOIN pdm_attribute_definitions definition ON definition.id = value.attribute_definition_id
  WHERE value.company_id = ? AND value.part_number_id = ? AND definition.stable_key = ?`).get(companyId, p01.id, "reference_motor_code").value_text, "REF-MOTOR-B");
db.prepare(`UPDATE part_variant_attributes SET material_label = 'SUS316', updated_at = ? WHERE part_number_id = (SELECT id FROM part_numbers WHERE company_id = ? AND part_number = 'A0005-P02')`).run(new Date().toISOString(), companyId);
let staleTargetProtected = false;
try {
  await recognition.formalizeDrawingRecognition({ sessionId: rerun.id, companyId, actorId: actor.id, roles: [actor.role], impactToken: staleImpact.impactToken, reason: "DEV-068 stale-target protection probe.", metadata: { actor: platformActor, idempotencyKey: "qc-dev-068-stale-target" } });
} catch (error) {
  staleTargetProtected = error?.code === "RECOGNITION_IMPACT_STALE";
}
assert.equal(staleTargetProtected, true, "formal target changes must invalidate the preview token");
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_formalization_events WHERE session_id = ?").get(rerun.id).count, 0);
db.prepare(`UPDATE part_variant_attributes SET material_label = 'SUS301', updated_at = ? WHERE part_number_id = (SELECT id FROM part_numbers WHERE company_id = ? AND part_number = 'A0005-P02')`).run(new Date().toISOString(), companyId);

const noTargetNotApplicable = await recognition.saveDrawingRecognitionDecisions({
  sessionId: rerun.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  expectedRowVersion: rerunReviewed.rowVersion,
  decisions: [{ candidateId: missingValueCandidate.id, action: "not_applicable", reason: "QC verifies N/A without a formal target remains non-blocking." }]
});
db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = NULL WHERE id = ?").run(missingValueCandidate.id);
const noTargetNotApplicableImpact = await recognition.calculateDrawingRecognitionImpact({
  sessionId: rerun.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  expectedRowVersion: noTargetNotApplicable.rowVersion
});
assert.ok(noTargetNotApplicableImpact.exclusions.some((item) => item.candidateId === missingValueCandidate.id && item.reason === "explicit_not_applicable_no_target"));
assert.ok(!noTargetNotApplicableImpact.blockers.some((item) => item.candidateId === missingValueCandidate.id));

db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = 'missing-drawing-revision' WHERE session_id = ? AND category = 'controlled_note'").run(rerun.id);
const rollbackImpact = await recognition.calculateDrawingRecognitionImpact({ sessionId: rerun.id, companyId, actorId: actor.id, roles: [actor.role], expectedRowVersion: noTargetNotApplicable.rowVersion });
const evidenceBeforeRollback = db.prepare("SELECT COUNT(*) AS count FROM pdm_engineering_evidence").get().count;
let atomicRollbackProtected = false;
try {
  await recognition.formalizeDrawingRecognition({ sessionId: rerun.id, companyId, actorId: actor.id, roles: [actor.role], impactToken: rollbackImpact.impactToken, reason: "DEV-068 atomic rollback protection probe.", metadata: { actor: platformActor, idempotencyKey: "qc-dev-068-atomic-rollback" } });
} catch {
  atomicRollbackProtected = true;
}
assert.equal(atomicRollbackProtected, true, "an invalid target must fail formalization");
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_formalization_events WHERE session_id = ?").get(rerun.id).count, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM pdm_engineering_evidence").get().count, evidenceBeforeRollback);

const report = {
  dev: "DEV-068",
  fixture: "A0005",
  database: databasePath,
  sessionId: session.id,
  sourceHashes: job.sources.map((source) => ({ fileName: source.fileName, contentHash: source.contentHash })),
  targetParts: job.targetContext.parts.map((part) => part.partNumber),
  categories: [...new Set(projection.candidates.map((candidate) => candidate.category))],
  candidateCount: projection.candidates.length,
  baseline: projection.baseline,
  impact: { changeCount: impact.changes.length, exclusionCount: impact.exclusions.length, blockerCount: impact.blockers.length },
  formalization: { appliedCount: formalized.appliedCount, eventId: formalized.eventId, idempotentReplay: replay.reusedFromCommandReceipt },
  openFieldFormalized: openFieldValue,
  missingValueNoChange: true,
  notApplicableReasonRequired,
  notApplicableWithoutTargetNonBlocking: true,
  appendOnlyProtected,
  staleTargetProtected,
  atomicRollbackProtected,
  checks: "PASS",
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(runDir, "report.md"), `# DEV-068 A0005 local isolated QC\n\n- Result: PASS\n- Session: ${session.id}\n- Candidates: ${projection.candidates.length}\n- Formal changes: ${impact.changes.length}\n- Idempotent replay: ${replay.reusedFromCommandReceipt}\n- Append-only protection: ${appendOnlyProtected}\n- Stale target protection: ${staleTargetProtected}\n- Atomic rollback: ${atomicRollbackProtected}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
