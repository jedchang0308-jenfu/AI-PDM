#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  createConfiguredFileStorageService,
  storagePointerFromRecord
} from "../src/lib/file-storage.ts";
import {
  DisabledDirectGcsStoragePort,
  FakeDirectGcsStoragePort,
  sha256ForGcsFixture
} from "../src/lib/gcs-storage-contract.ts";
import {
  HmacFixtureNumberingLedgerSigner,
  appendSignedNumberingLedgerEntry,
  reconcileRestoredNumberingState,
  verifySignedNumberingLedger
} from "../src/lib/numbering-continuity.ts";

const root = process.cwd();
const results = [];
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function record(name, passed, detail = "") { results.push({ name, passed: Boolean(passed), detail }); }
async function rejects(fn, expected) {
  try { await fn(); return false; } catch (error) { return error instanceof Error && error.message === expected; }
}

const pointer = storagePointerFromRecord({
  storage_provider: "google_cloud_storage",
  storage_bucket: "pdm-formal-files",
  storage_key: "company-jenfu/drawings/A0001.slddrw"
});
record("DEV046-1D-001 GCS pointer is additive and provider explicit", pointer.provider === "google_cloud_storage" && pointer.bucket === "pdm-formal-files" && pointer.key === "company-jenfu/drawings/A0001.slddrw");

const disabledService = createConfiguredFileStorageService({
  PDM_STORAGE_PROVIDER: "google_cloud_storage",
  PDM_GCS_PROJECT_ID: "jenfu-prod",
  PDM_GCS_BUCKET: "pdm-formal-files"
});
record("DEV046-1D-002 generic GCS runtime adapter fails closed", await rejects(() => disabledService.readObject("drawings/A0001.slddrw"), "GCS_LIVE_ADAPTER_NOT_AVAILABLE_PHASE_1:readObject"));
const disabledPort = new DisabledDirectGcsStoragePort();
record("DEV046-1D-003 direct GCS workflow port fails closed", await rejects(() => disabledPort.createExport({ companyId: "company-jenfu", actorId: "user-1", objects: [] }), "GCS_LIVE_ADAPTER_NOT_AVAILABLE_PHASE_1:createExport"));

const fake = new FakeDirectGcsStoragePort();
const bytes = Buffer.from("controlled-cad-fixture", "utf8");
const intent = await fake.createUploadIntent({
  companyId: "company-jenfu",
  actorId: "user-1",
  bucket: "pdm-formal-files",
  key: "company-jenfu/drawings/A0001.slddrw",
  expectedBytes: bytes.byteLength,
  expectedSha256: sha256ForGcsFixture(bytes),
  contentType: "application/octet-stream"
});
fake.uploadFixture(intent.id, bytes);
const finalized = await fake.finalizeUpload(intent.id);
record("DEV046-1D-004 upload intent finalizes only with hash size and generation", intent.status === "finalized" && finalized.generation === "1" && finalized.sha256 === sha256ForGcsFixture(bytes));
const exported = await fake.createExport({ companyId: "company-jenfu", actorId: "user-1", objects: [finalized] });
record("DEV046-1D-005 export produces a content-addressed manifest", /^[a-f0-9]{64}$/u.test(exported.manifestSha256));

const mismatchBytes = Buffer.from("tampered", "utf8");
const mismatchIntent = await fake.createUploadIntent({
  companyId: "company-jenfu",
  actorId: "user-1",
  bucket: "pdm-formal-files",
  key: "company-jenfu/quarantine/A0002.slddrw",
  expectedBytes: mismatchBytes.byteLength,
  expectedSha256: "0".repeat(64),
  contentType: "application/octet-stream"
});
fake.uploadFixture(mismatchIntent.id, mismatchBytes);
record("DEV046-1D-006 finalize mismatch quarantines and fails closed", await rejects(() => fake.finalizeUpload(mismatchIntent.id), "GCS_FINALIZE_INTEGRITY_MISMATCH") && mismatchIntent.status === "quarantined" && fake.quarantineEvents.at(-1)?.reasonCode === "HASH_OR_SIZE_MISMATCH");

const schema = read("db/schema.sql");
const migration = read("db/postgres/011_gcs_pointer_numbering_continuity.sql");
record("DEV046-1D-007 SQLite and PostgreSQL schemas include GCS generation pointers", [schema, migration].every((source) => source.includes("google_cloud_storage") && source.includes("storage_generation") && source.includes("storage_metageneration")));
record("DEV046-1D-008 historical Supabase migration files were not rewritten", !fs.existsSync(path.join(root, "supabase/migrations/20260713020000_gcs_pointer_numbering_continuity.sql")));

const db = new Database(":memory:");
db.exec(schema);
db.prepare(`INSERT INTO numbering_recovery_reservations (
  id, company_id, number_kind, number_value, reservation_reason, source_archive_ref, ledger_entry_hash
) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  "reservation-1", "company-jenfu", "drawing", "A0001-M01", "source_archive", "archive://ledger/1", "a".repeat(64)
);
let duplicateRejected = false;
try {
  db.prepare(`INSERT INTO numbering_recovery_reservations (
    id, company_id, number_kind, number_value, reservation_reason, source_archive_ref, ledger_entry_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    "reservation-2", "company-jenfu", "drawing", "A0001-M01", "source_archive", "archive://ledger/2", "b".repeat(64)
  );
} catch { duplicateRejected = true; }
db.close();
record("DEV046-1D-009 recovery reservation schema prevents number reuse", duplicateRejected);

const signer = new HmacFixtureNumberingLedgerSigner("fixture-key-2026-07", "fixture-ledger-signing-key-at-least-32-bytes");
const signers = new Map([[signer.keyId, signer]]);
const ledger = [];
const firstEntry = appendSignedNumberingLedgerEntry(ledger, {
  entryId: "ledger-1",
  companyId: "company-jenfu",
  numberKind: "drawing",
  numberValue: "A0001-M01",
  eventType: "official_number_issued",
  occurredAt: "2026-07-13T01:00:00.000Z"
}, signer);
const secondEntry = appendSignedNumberingLedgerEntry(ledger, {
  entryId: "ledger-2",
  companyId: "company-jenfu",
  numberKind: "part",
  numberValue: "A0001-P001",
  eventType: "recovery_reserved",
  occurredAt: "2026-07-13T01:01:00.000Z"
}, signer);
record("DEV046-1D-010 signed numbering ledger verifies chain and signatures", verifySignedNumberingLedger(ledger, signers).valid && secondEntry.previousEntryHash === firstEntry.entryHash);
const reconciled = reconcileRestoredNumberingState({
  ledger,
  signers,
  restoredOfficialNumbers: [{ companyId: "company-jenfu", numberKind: "drawing", numberValue: "A0001-M01" }],
  recoveryReservations: [{ companyId: "company-jenfu", numberKind: "part", numberValue: "A0001-P001", ledgerEntryHash: secondEntry.entryHash, sourceArchiveRef: "archive://ledger/2" }]
});
record("DEV046-1D-011 restore simulation reconciles official and reserved numbers", reconciled.valid && reconciled.ledgerHeadHash === secondEntry.entryHash);
const missing = reconcileRestoredNumberingState({ ledger, signers, restoredOfficialNumbers: [], recoveryReservations: [] });
record("DEV046-1D-012 missing restored reservations fail reconciliation", !missing.valid && missing.errors.filter((error) => error.startsWith("NUMBERING_RESTORE_MISSING")).length === 2);
const tampered = structuredClone(ledger);
tampered[0].numberValue = "TAMPERED";
record("DEV046-1D-013 ledger tampering is detected", !verifySignedNumberingLedger(tampered, signers).valid);
const packageJson = JSON.parse(read("package.json"));
record("DEV046-1D-014 Phase 1 has no live Google Storage SDK", !Object.hasOwn(packageJson.dependencies, "@google-cloud/storage") && !Object.hasOwn(packageJson.devDependencies, "@google-cloud/storage"));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 1D QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
