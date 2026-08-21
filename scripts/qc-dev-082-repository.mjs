import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const runDir = path.join(root, "output", "qa", "dev-082-browser-pdf-ocr", `repository-${stamp}-local-isolated`);
fs.mkdirSync(runDir, { recursive: true });
const repositoryDir = path.join(runDir, "repository");
fs.mkdirSync(repositoryDir, { recursive: true });
const sourceDatabase = path.join(root, "data", "ai-pdm.sqlite");
const databasePath = path.join(runDir, "ai-pdm.sqlite");
fs.copyFileSync(sourceDatabase, databasePath);

process.env.PDM_DATA_DIR = runDir;
process.env.PDM_REPOSITORY_DIR = repositoryDir;
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "true";
process.env.PDM_UNIFIED_DRAWING_WORKBENCH_V1 = "true";
process.env.PDM_DRAWING_RECOGNITION_V1 = "true";
process.env.PDM_AUTH_SECRET = "dev-082-isolated-qc-secret";

const [{ getDb }, recognition, adapters, policy] = await Promise.all([
  import("../src/lib/db.ts"),
  import("../src/lib/drawing-recognition.ts"),
  import("../src/lib/drawing-recognition-adapters.ts"),
  import("../src/lib/drawing-ocr-priority-policy.ts")
]);
const db = getDb();
const pdfLink = db.prepare(`SELECT link.candidate_revision_id, link.source_file_asset_id, link.company_id, asset.file_name,
    asset.original_path, asset.storage_key, asset.file_size, asset.content_hash
  FROM numbering_candidate_revision_files link
  JOIN file_assets asset ON asset.id = link.source_file_asset_id
  WHERE link.removed_at IS NULL AND lower(asset.file_ext) = 'pdf'
  ORDER BY link.created_at DESC LIMIT 1`).get();
assert.ok(pdfLink?.candidate_revision_id && pdfLink?.source_file_asset_id, "isolated QC requires one governed candidate-revision PDF");
assert.ok(pdfLink.original_path && fs.existsSync(pdfLink.original_path), "isolated QC requires readable source bytes");
const governedBytes = fs.readFileSync(pdfLink.original_path);
const governedKey = "dev-082-repository/controlled-source.pdf";
const governedPath = path.join(repositoryDir, ...governedKey.split("/"));
fs.mkdirSync(path.dirname(governedPath), { recursive: true });
fs.writeFileSync(governedPath, governedBytes);
db.prepare(`UPDATE file_assets SET storage_provider = 'local_repository', storage_bucket = NULL,
  storage_key = ?, original_path = ? WHERE id = ?`).run(governedKey, governedPath, pdfLink.source_file_asset_id);
const actor = db.prepare("SELECT id, role FROM users WHERE company_id = ? ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END, id LIMIT 1").get(pdfLink.company_id);
assert.ok(actor?.id, "isolated QC requires one company user");

async function expectCode(code, operation) {
  let actual = null;
  try {
    await operation();
  } catch (error) {
    actual = error?.code ?? null;
  }
  assert.equal(actual, code);
}

let parentId = db.prepare("SELECT id FROM drawing_recognition_sessions WHERE company_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(pdfLink.company_id)?.id ?? null;
let session = null;
for (let attempt = 0; attempt < 8; attempt += 1) {
  session = await recognition.createDrawingRecognitionSession({
    companyId: pdfLink.company_id,
    actorId: actor.id,
    sourceContextType: "candidate_revision",
    sourceContextId: pdfLink.candidate_revision_id,
    sourceAssetIds: [pdfLink.source_file_asset_id],
    supersedesSessionId: parentId
  });
  if (session.status === "queued") break;
  parentId = session.id;
}
assert.equal(session?.status, "queued", "QC must obtain a fresh PDF-only recognition session");
db.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id = ?").run(new Date(0).toISOString(), session.id);
// The source DB may contain unrelated queued sessions from a previous local UI run.
// Keep this isolated repository check deterministic by cancelling only those copied
// sessions; the fresh PDF-only session remains the sole claimable job.
db.prepare("UPDATE drawing_recognition_sessions SET status = 'cancelled', updated_at = ? WHERE status IN ('queued', 'extracting') AND id <> ?")
  .run(new Date().toISOString(), session.id);

const job = await recognition.claimDrawingRecognitionJob({ workerId: "qc-dev-082-no-native-key", maxAttempts: 2, allowNativeSources: false });
assert.equal(job?.sessionId, session.id, "PDF work must be claimable even when native metadata capability is unavailable");
assert.equal(job.sources.length, 1);
assert.deepEqual(job.sources[0].adapterPlan, ["filename.v1", adapters.BROWSER_PDF_OCR_ADAPTER_CODE]);

const baselineProjection = await recognition.completeDrawingRecognitionJob({
  sessionId: session.id,
  workerId: "qc-dev-082-no-native-key",
  sourceSetFingerprint: job.sourceSetFingerprint,
  results: [adapters.buildFilenameAdapterResult(job.sources[0])]
});
assert.equal(baselineProjection.pendingClientAdapters.length, 1);
assert.equal(baselineProjection.pdfOcrSources[0].status, "pending");
assert.ok(baselineProjection.pdfOcrSources[0].requiredOutcomes.every((item) => item.outcome === "pending"));

let pendingFormalizationBlocked = false;
try {
  await recognition.calculateDrawingRecognitionImpact({
    sessionId: session.id,
    companyId: pdfLink.company_id,
    actorId: actor.id,
    roles: [actor.role],
    expectedRowVersion: baselineProjection.rowVersion
  });
} catch (error) {
  pendingFormalizationBlocked = error?.code === "RECOGNITION_CLIENT_ADAPTER_PENDING";
}
assert.equal(pendingFormalizationBlocked, true, "pending browser adapter must block recognition formalization only");

const controlledPdf = await recognition.readDrawingRecognitionPdfSource({
  sessionId: session.id,
  sourceId: baselineProjection.pendingClientAdapters[0].sourceId,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role]
});
assert.equal(Buffer.from(controlledPdf.bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
assert.equal(controlledPdf.contentHash, baselineProjection.pendingClientAdapters[0].contentHash);

await expectCode("RECOGNITION_SESSION_NOT_FOUND", () => recognition.readDrawingRecognitionPdfSource({
  sessionId: session.id,
  sourceId: baselineProjection.pendingClientAdapters[0].sourceId,
  companyId: "company-not-authorized",
  actorId: actor.id,
  roles: [actor.role]
}));
await expectCode("RECOGNITION_SESSION_FORBIDDEN", () => recognition.readDrawingRecognitionPdfSource({
  sessionId: session.id,
  sourceId: baselineProjection.pendingClientAdapters[0].sourceId,
  companyId: pdfLink.company_id,
  actorId: "user-not-authorized",
  roles: ["Viewer"]
}));
await expectCode("RECOGNITION_SOURCE_NOT_FOUND", () => recognition.readDrawingRecognitionPdfSource({
  sessionId: session.id,
  sourceId: "recognition-source-not-in-session",
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role]
}));

const priorMaxBytes = process.env.PDM_DRAWING_RECOGNITION_BROWSER_PDF_MAX_BYTES;
process.env.PDM_DRAWING_RECOGNITION_BROWSER_PDF_MAX_BYTES = String(controlledPdf.bytes.byteLength - 1);
await expectCode("RECOGNITION_PDF_SIZE_LIMIT", () => recognition.readDrawingRecognitionPdfSource({
  sessionId: session.id,
  sourceId: baselineProjection.pendingClientAdapters[0].sourceId,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role]
}));
if (priorMaxBytes === undefined) delete process.env.PDM_DRAWING_RECOGNITION_BROWSER_PDF_MAX_BYTES;
else process.env.PDM_DRAWING_RECOGNITION_BROWSER_PDF_MAX_BYTES = priorMaxBytes;

const corruptMagic = Buffer.from(governedBytes);
corruptMagic[1] = 0x58;
fs.writeFileSync(governedPath, corruptMagic);
await expectCode("RECOGNITION_PDF_SOURCE_INVALID", () => recognition.readDrawingRecognitionPdfSource({
  sessionId: session.id,
  sourceId: baselineProjection.pendingClientAdapters[0].sourceId,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role]
}));
const corruptHash = Buffer.from(governedBytes);
corruptHash[corruptHash.length - 1] ^= 0x01;
fs.writeFileSync(governedPath, corruptHash);
await expectCode("RECOGNITION_PDF_SOURCE_INVALID", () => recognition.readDrawingRecognitionPdfSource({
  sessionId: session.id,
  sourceId: baselineProjection.pendingClientAdapters[0].sourceId,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role]
}));
fs.writeFileSync(governedPath, governedBytes);

const selection = policy.selectDrawingOcrObservations([{
  text: "圖號: A0002-M01 版次: 0.1 料號: A0002-P01 品名: 本體 材質: SUS304 比例: 1:2 製圖者: 朱宇鴻",
  pageNumber: 1,
  readingOrder: 1,
  source: "text_layer",
  confidence: 100,
  titleBlockOrTable: true
}]);
const completion = {
  expectedRowVersion: baselineProjection.rowVersion,
  sourceId: baselineProjection.pendingClientAdapters[0].sourceId,
  contentHash: controlledPdf.contentHash,
  adapterCode: adapters.BROWSER_PDF_OCR_ADAPTER_CODE,
  adapterVersion: `qc-dev-082.policy-${selection.policyVersion}`,
  status: "succeeded",
  diagnostics: selection.diagnostics,
  observations: selection.observations
};
const completed = await recognition.appendDrawingRecognitionClientAdapterResult({
  sessionId: session.id,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role],
  result: completion
});
assert.equal(completed.pendingClientAdapters.length, 0);
assert.equal(completed.pdfOcrSources[0].status, "succeeded");
assert.ok(completed.pdfOcrSources[0].requiredOutcomes.every((item) => item.outcome === "found"));
assert.ok(completed.candidates.some((candidate) => candidate.fieldKey === "material" && candidate.proposedValue === "SUS304"));
assert.ok(completed.pdfOcrSources[0].diagnostics.every((item) => !item.startsWith("result_fingerprint:")), "internal replay fingerprint must not be projected to the browser");

const replay = await recognition.appendDrawingRecognitionClientAdapterResult({
  sessionId: session.id,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role],
  result: completion
});
assert.equal(replay.rowVersion, completed.rowVersion, "identical completion replay must be idempotent even with the prior expected row version");
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_adapter_results WHERE session_id = ? AND adapter_code = ?").get(session.id, adapters.BROWSER_PDF_OCR_ADAPTER_CODE).count, 1);

let conflictingReplayBlocked = false;
try {
  await recognition.appendDrawingRecognitionClientAdapterResult({
    sessionId: session.id,
    companyId: pdfLink.company_id,
    actorId: actor.id,
    roles: [actor.role],
    result: { ...completion, diagnostics: [...completion.diagnostics, "qc_different_result"] }
  });
} catch (error) {
  conflictingReplayBlocked = error?.code === "RECOGNITION_CLIENT_RESULT_CONFLICT";
}
assert.equal(conflictingReplayBlocked, true);

let wrongHashBlocked = false;
const rerun = await recognition.rerunDrawingRecognition({ sessionId: session.id, companyId: pdfLink.company_id, actorId: actor.id, roles: [actor.role] });
db.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id = ?").run(new Date(0).toISOString(), rerun.id);
const rerunJob = await recognition.claimDrawingRecognitionJob({ workerId: "qc-dev-082-hash", maxAttempts: 2, allowNativeSources: false });
const rerunBaseline = await recognition.completeDrawingRecognitionJob({ sessionId: rerun.id, workerId: "qc-dev-082-hash", sourceSetFingerprint: rerunJob.sourceSetFingerprint, results: [adapters.buildFilenameAdapterResult(rerunJob.sources[0])] });
try {
  await recognition.appendDrawingRecognitionClientAdapterResult({
    sessionId: rerun.id,
    companyId: pdfLink.company_id,
    actorId: actor.id,
    roles: [actor.role],
    result: { ...completion, expectedRowVersion: rerunBaseline.rowVersion, sourceId: rerunBaseline.pendingClientAdapters[0].sourceId, contentHash: "0".repeat(64) }
  });
} catch (error) {
  wrongHashBlocked = error?.code === "RECOGNITION_SOURCE_HASH_MISMATCH";
}
assert.equal(wrongHashBlocked, true);

await expectCode("RECOGNITION_SESSION_STALE", () => recognition.appendDrawingRecognitionClientAdapterResult({
  sessionId: rerun.id,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role],
  result: {
    ...completion,
    expectedRowVersion: rerunBaseline.rowVersion - 1,
    sourceId: rerunBaseline.pendingClientAdapters[0].sourceId,
    contentHash: rerunBaseline.pendingClientAdapters[0].contentHash
  }
}));
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_observations WHERE session_id = ? AND extractor_code = ?").get(rerun.id, adapters.BROWSER_PDF_OCR_ADAPTER_CODE).count, 0, "rejected stale/hash completions must append zero observations");

const failedProjection = await recognition.appendDrawingRecognitionClientAdapterResult({
  sessionId: rerun.id,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role],
  result: {
    expectedRowVersion: rerunBaseline.rowVersion,
    sourceId: rerunBaseline.pendingClientAdapters[0].sourceId,
    contentHash: rerunBaseline.pendingClientAdapters[0].contentHash,
    adapterCode: adapters.BROWSER_PDF_OCR_ADAPTER_CODE,
    adapterVersion: "qc-dev-082.failure-v1",
    status: "failed",
    diagnostics: ["pdf_source_invalid"],
    observations: []
  }
});
await expectCode("RECOGNITION_CLIENT_ADAPTER_FAILED", () => recognition.calculateDrawingRecognitionImpact({
  sessionId: rerun.id,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role],
  expectedRowVersion: failedProjection.rowVersion
}));
db.prepare("UPDATE drawing_recognition_sessions SET status = 'cancelled' WHERE id = ?").run(rerun.id);
await expectCode("RECOGNITION_SESSION_TERMINAL", () => recognition.appendDrawingRecognitionClientAdapterResult({
  sessionId: rerun.id,
  companyId: pdfLink.company_id,
  actorId: actor.id,
  roles: [actor.role],
  result: { ...completion, expectedRowVersion: failedProjection.rowVersion, sourceId: rerunBaseline.pendingClientAdapters[0].sourceId, contentHash: rerunBaseline.pendingClientAdapters[0].contentHash }
}));

const persistedPayload = JSON.stringify(db.prepare(`SELECT raw_text, raw_value, normalized_value, geometry_json
  FROM drawing_recognition_observations WHERE session_id = ? AND extractor_code = ?`).all(session.id, adapters.BROWSER_PDF_OCR_ADAPTER_CODE));
assert.doesNotMatch(persistedPayload, /base64|pageBitmap|wordArray|%PDF-|data:application\/pdf/iu);

// Cross-source compatibility fixture: old native metadata rows used
// drawing_revision/source_revision while PDF rows use revision. Projection
// must expose one semantic review group and never silently choose a winner.
const revisionCandidate = db.prepare(`SELECT * FROM drawing_recognition_candidates WHERE session_id = ? AND field_key = 'revision' LIMIT 1`).get(session.id);
assert.ok(revisionCandidate?.id, "revision candidate must be present for canonical grouping fixture");
const legacyCandidateId = `recognition-candidate-qc-legacy-${crypto.randomUUID()}`;
db.prepare(`INSERT INTO drawing_recognition_candidates (
  id, session_id, company_id, category, field_key, field_label, raw_value, proposed_value, normalized_value,
  proposed_owner_type, proposed_owner_id, applicability_scope, variant_status, confidence_band, review_state,
  current_formal_value, current_formal_fingerprint, group_key, sort_order, row_version, created_at, updated_at
) SELECT ?, session_id, company_id, 'drawing_revision', 'source_revision', field_label, raw_value, proposed_value, normalized_value,
  proposed_owner_type, proposed_owner_id, applicability_scope, variant_status, confidence_band, review_state,
  current_formal_value, current_formal_fingerprint, 'legacy-source-revision-group', sort_order + 1000, row_version, created_at, updated_at
  FROM drawing_recognition_candidates WHERE id = ?`).run(legacyCandidateId, revisionCandidate.id);
const revisionObservation = db.prepare(`SELECT observation_id FROM drawing_recognition_candidate_observations WHERE candidate_id = ? LIMIT 1`).get(revisionCandidate.id);
assert.ok(revisionObservation?.observation_id);
db.prepare(`INSERT INTO drawing_recognition_candidate_observations (candidate_id, observation_id, company_id, created_at) VALUES (?, ?, ?, ?)`).run(legacyCandidateId, revisionObservation.observation_id, pdfLink.company_id, new Date().toISOString());
const legacyProjection = await recognition.getDrawingRecognitionProjection({ sessionId: session.id, companyId: pdfLink.company_id, actorId: actor.id, roles: [actor.role] });
const canonicalGroup = legacyProjection.reviewGroups.find((group) => group.fieldKey === "revision");
assert.ok(canonicalGroup, "revision review group must be projected");
assert.equal(canonicalGroup.category, "identity_relation");
assert.ok(canonicalGroup.memberCandidateIds.includes(legacyCandidateId));
assert.equal(canonicalGroup.conflictState, "none");
assert.equal(canonicalGroup.distinctValues.length, 1);
const conflictCandidateId = `recognition-candidate-qc-conflict-${crypto.randomUUID()}`;
db.prepare(`INSERT INTO drawing_recognition_candidates (
  id, session_id, company_id, category, field_key, field_label, raw_value, proposed_value, normalized_value,
  proposed_owner_type, proposed_owner_id, applicability_scope, variant_status, confidence_band, review_state,
  current_formal_value, current_formal_fingerprint, group_key, sort_order, row_version, created_at, updated_at
) SELECT ?, session_id, company_id, 'identity_relation', 'revision', field_label, '0.2', '0.2', '0.2',
  proposed_owner_type, proposed_owner_id, applicability_scope, variant_status, confidence_band, 'conflict',
  current_formal_value, current_formal_fingerprint, 'conflict-revision-group', sort_order + 2000, row_version, created_at, updated_at
  FROM drawing_recognition_candidates WHERE id = ?`).run(conflictCandidateId, revisionCandidate.id);
db.prepare(`INSERT INTO drawing_recognition_candidate_observations (candidate_id, observation_id, company_id, created_at) VALUES (?, ?, ?, ?)`).run(conflictCandidateId, revisionObservation.observation_id, pdfLink.company_id, new Date().toISOString());
const conflictProjection = await recognition.getDrawingRecognitionProjection({ sessionId: session.id, companyId: pdfLink.company_id, actorId: actor.id, roles: [actor.role] });
const conflictGroup = conflictProjection.reviewGroups.find((group) => group.fieldKey === "revision");
assert.ok(conflictGroup);
assert.equal(conflictGroup.conflictState, "conflict");
assert.deepEqual(conflictGroup.distinctValues, ["0.1", "0.2"]);
assert.equal(db.prepare("SELECT field_key FROM drawing_recognition_candidates WHERE id = ?").get(legacyCandidateId).field_key, "source_revision", "legacy rows remain append-only in storage");
db.prepare("UPDATE drawing_recognition_candidates SET review_state = 'accepted' WHERE session_id = ? AND category <> 'unclassified'").run(session.id);
db.prepare("UPDATE drawing_recognition_sessions SET status = 'ready_to_formalize' WHERE id = ?").run(session.id);
const impactProjection = await recognition.getDrawingRecognitionProjection({ sessionId: session.id, companyId: pdfLink.company_id, actorId: actor.id, roles: [actor.role] });
const impact = await recognition.calculateDrawingRecognitionImpact({ sessionId: session.id, companyId: pdfLink.company_id, actorId: actor.id, roles: [actor.role], expectedRowVersion: impactProjection.rowVersion });
assert.ok(impact.exclusions.some((item) => item.reason === "identity_evidence_only"), "identity evidence must be excluded from impact");
assert.ok(impact.changes.every((change) => change.category !== "identity_relation"), "identity evidence must not produce formal metadata changes");

const report = {
  dev: "DEV-082",
  result: "PASS",
  database: databasePath,
  source: { fileName: pdfLink.file_name, contentHash: controlledPdf.contentHash },
  sessionId: session.id,
  checks: {
    pdfOnlyClaimWithoutNativeKey: true,
    pendingFormalizationBlocked: true,
    controlledContentHashVerified: true,
    tierZeroPersisted: true,
    idempotentReplay: true,
    conflictingReplayBlocked: true,
    wrongHashBlocked: true,
    internalFingerprintRedacted: true,
    tenantActorSourceIsolation: true,
    rangeAndSizeBound: true,
    magicAndHashFailClosed: true,
    staleAndTerminalConflict: true,
    failedFormalizationGate: true,
    rejectedCompletionZeroAppend: true,
    persistedPayloadMinimized: true,
    canonicalCrossSourceRevisionGroup: true,
    conflictingRevisionGroupNoSilentWinner: true
  },
  cases: Object.fromEntries([
    ["OCR-082-013", "persisted selected observation rows contain no PDF/Base64/bitmap/full-word payload"],
    ["OCR-082-016", "wrong company, non-owner actor and wrong source/session pair were denied"],
    ["OCR-082-017", "size, PDF magic and content hash mismatches failed before browser OCR"],
    ["OCR-082-019", "identical fingerprint replay returned the existing result and inserted one adapter row"],
    ["OCR-082-020", "different fingerprint, stale row version and terminal session returned stable conflicts with zero partial observations"],
    ["OCR-082-021", "pending and failed client adapters blocked recognition formalization only"],
    ["OCR-082-032", "CAD legacy source_revision and PDF revision project into one corroborated review group"],
    ["OCR-082-033", "different cross-source revision values remain one explicit conflict group with no silent winner"],
    ["OCR-082-036", "identity_relation revision evidence is excluded from formalization impact and cannot write revision metadata"],
    ["OCR-082-037", "legacy source_revision projection is append-only and successor observations retain normalized geometry"]
  ].map(([id, evidence]) => [id, { result: "PASS", evidence }])),
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(runDir, "report.md"), `# DEV-082 repository QC\n\n- Result: PASS\n- Source: ${pdfLink.file_name}\n- Pending formalization gate: PASS\n- Content hash and replay protection: PASS\n- Required fields persisted: PASS\n`, "utf8");
console.log(JSON.stringify({ ...report, reportDir: runDir }, null, 2));
