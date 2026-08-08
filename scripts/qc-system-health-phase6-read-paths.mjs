#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baselineMode = process.argv.includes("--baseline");
const root = process.cwd();

const { AsyncReleaseRepository } = await import(
  pathToFileURL(path.join(root, "src", "lib", "repositories", "release-async-repository.ts")).href
);
const { AsyncDrawingRevisionPackageRepository } = await import(
  pathToFileURL(path.join(root, "src", "lib", "repositories", "drawing-revision-package-async-repository.ts")).href
);
const { AsyncNotificationRepository } = await import(
  pathToFileURL(path.join(root, "src", "lib", "repositories", "notification-async-repository.ts")).href
);

function databaseClient(overrides) {
  return {
    kind: "sqlite",
    async query() { return []; },
    async queryOne() { return null; },
    async execute() {},
    async transaction(fn) { return fn(this); },
    async close() {},
    ...overrides
  };
}

const releaseRows = [
  {
    submission_id: "released-pdf-new",
    drawing_number: "DRW-200",
    revision: "B",
    file_role: "pdf",
    original_filename: "Shared.PDF",
    sort_at: "2026-08-08T10:00:00.000Z"
  },
  {
    submission_id: "released-native",
    drawing_number: "DRW-300",
    revision: "A",
    file_role: "native",
    original_filename: "model.SLDPRT",
    sort_at: "2026-08-08T09:00:00.000Z"
  },
  {
    submission_id: "released-pdf-old",
    drawing_number: "DRW-100",
    revision: "A",
    file_role: "pdf",
    original_filename: "shared.pdf",
    sort_at: "2026-08-07T10:00:00.000Z"
  }
];

function releaseKey(role, filename) {
  return `${role}\u0000${filename.toLowerCase()}`;
}

function releasePairs(params) {
  return Object.entries(params)
    .filter(([key]) => /^fileRole\d+$/u.test(key))
    .map(([key, role]) => {
      const suffix = key.slice("fileRole".length);
      return releaseKey(String(role), String(params[`originalFilename${suffix}`]));
    });
}

function releaseClient() {
  const metrics = { query: 0, queryOne: 0 };
  const client = databaseClient({
    async query(sql, params = {}) {
      assert.match(sql, /FROM submission_files/u);
      metrics.query += 1;
      const selected = new Set(releasePairs(params));
      return releaseRows
        .filter((row) => selected.has(releaseKey(row.file_role, row.original_filename)))
        .map(({ sort_at: _sortAt, ...row }) => row);
    },
    async queryOne(sql, params = {}) {
      assert.match(sql, /FROM submission_files/u);
      metrics.queryOne += 1;
      const match = releaseRows.find(
        (row) => releaseKey(row.file_role, row.original_filename) === releaseKey(String(params.fileRole), String(params.originalFilename))
      );
      if (!match) return null;
      const { sort_at: _sortAt, ...row } = match;
      return row;
    }
  });
  return { client, metrics };
}

const releaseInput = {
  submissionId: "current-submission",
  files: [
    { file_role: "pdf", original_filename: "SHARED.pdf" },
    { file_role: "native", original_filename: "model.SLDPRT" },
    { file_role: "pdf", original_filename: "shared.PDF" },
    { file_role: "step", original_filename: "missing.step" }
  ]
};
const expectedReleaseConflicts = [
  releaseRows[0],
  releaseRows[1],
  releaseRows[0]
].map(({ sort_at: _sortAt, ...row }) => row);
const releaseTest = releaseClient();
const releaseResult = await new AsyncReleaseRepository(releaseTest.client).findReleasedFilenameConflicts(releaseInput);
assert.deepEqual(releaseResult, expectedReleaseConflicts, "release conflicts preserve input order, duplicates, and missing-row omission");
if (baselineMode) {
  assert.deepEqual(releaseTest.metrics, { query: 0, queryOne: releaseInput.files.length }, "release N-query baseline");
} else {
  assert.deepEqual(releaseTest.metrics, { query: 1, queryOne: 0 }, "release conflict batch query budget");
}
const emptyReleaseTest = releaseClient();
assert.deepEqual(
  await new AsyncReleaseRepository(emptyReleaseTest.client).findReleasedFilenameConflicts({ submissionId: "current-submission", files: [] }),
  [],
  "empty release input stays empty"
);
assert.deepEqual(emptyReleaseTest.metrics, { query: 0, queryOne: 0 }, "empty release input performs no query");
if (!baselineMode) {
  const chunkedReleaseTest = releaseClient();
  const chunkedReleaseResult = await new AsyncReleaseRepository(chunkedReleaseTest.client).findReleasedFilenameConflicts({
    submissionId: "current-submission",
    files: Array.from({ length: 401 }, (_, index) => ({ file_role: "pdf", original_filename: `missing-${index}.pdf` }))
  });
  assert.deepEqual(chunkedReleaseResult, [], "chunked release query preserves missing-row omission");
  assert.deepEqual(chunkedReleaseTest.metrics, { query: 2, queryOne: 0 }, "release conflict input is bounded to 400 pairs per query");
}

const assetRows = [
  { id: "file-1", file_name: "one.pdf", display_name: "One", description: null, document_category: "drawing", revision: "A" },
  { id: "file-2", file_name: "two.step", display_name: null, description: "Two", document_category: "model", revision: null }
];

function assetClient() {
  const metrics = { query: 0, queryOne: 0 };
  const client = databaseClient({
    async query(sql, params = {}) {
      assert.match(sql, /FROM file_assets/u);
      metrics.query += 1;
      const selected = new Set(Object.entries(params).filter(([key]) => /^fileId\d+$/u.test(key)).map(([, value]) => value));
      return [...assetRows].reverse().filter((row) => selected.has(row.id));
    },
    async queryOne(sql, params = {}) {
      assert.match(sql, /FROM file_assets/u);
      metrics.queryOne += 1;
      return assetRows.find((row) => row.id === params.fileId) ?? null;
    }
  });
  return { client, metrics };
}

const packageRow = { drawing_number_id: "drawing-1" };
const assetIds = [" file-2 ", "file-1", "file-2", "", "missing"];
const assetTest = assetClient();
const assetRepository = new AsyncDrawingRevisionPackageRepository(assetTest.client);
const assetResult = await assetRepository.loadPackageFileAssets(packageRow, assetIds);
assert.deepEqual(assetResult, [assetRows[1], assetRows[0]], "package assets preserve unique input order and omit missing rows");
if (baselineMode) {
  assert.deepEqual(assetTest.metrics, { query: 0, queryOne: 3 }, "package asset N-query baseline");
} else {
  assert.deepEqual(assetTest.metrics, { query: 1, queryOne: 0 }, "package asset batch query budget");
  const chunkedAssetTest = assetClient();
  const chunkedAssetRepository = new AsyncDrawingRevisionPackageRepository(chunkedAssetTest.client);
  const chunkedAssetResult = await chunkedAssetRepository.loadPackageFileAssets(
    packageRow,
    Array.from({ length: 401 }, (_, index) => `missing-${index}`)
  );
  assert.deepEqual(chunkedAssetResult, [], "chunked package asset query preserves missing-row omission");
  assert.deepEqual(chunkedAssetTest.metrics, { query: 2, queryOne: 0 }, "package asset input is bounded to 400 ids per query");
}

const notificationRows = {
  release: [{ id: "sub-release", submission_id: "sub-release", drawing_number: "D-REL", revision: "A", part_number: "P-REL", part_name: "Release", submitted_by: "eng-1", submitted_by_name: "Engineer", detail: "drive unavailable", created_at: "2026-08-08T05:00:00.000Z" }],
  pending: [{ id: "sub-review", submission_id: "sub-review", drawing_number: "D-REV", revision: "B", part_number: "P-REV", part_name: "Review", submitted_by: "eng-1", submitted_by_name: "Engineer", detail: "2", created_at: "2026-08-08T04:00:00.000Z" }],
  upload: [{ id: "file-upload", submission_id: "sub-upload", drawing_number: "D-UP", revision: "A", part_number: "P-UP", part_name: "Upload", submitted_by: "eng-1", submitted_by_name: "Engineer", detail: "drawing.pdf", created_at: "2026-08-08T03:00:00.000Z" }],
  package: [{ id: "sub-package", submission_id: "sub-package", drawing_number: "D-PKG", revision: "C", part_number: "P-PKG", part_name: "Package", submitted_by: "eng-1", submitted_by_name: "Engineer", detail: null, created_at: "2026-08-08T02:00:00.000Z" }],
  lock: [{ id: "lock-1", submission_id: "sub-lock", drawing_number: "D-LOCK", revision: "A", part_number: "P-LOCK", part_name: "Lock", submitted_by: "eng-1", submitted_by_name: "Engineer", detail: "editing", created_at: "2026-08-08T01:00:00.000Z" }]
};

function notificationKind(sql) {
  if (sql.includes("s.status = 'ReleaseFailed'")) return "release";
  if (sql.includes("s.status = 'Pending'")) return "pending";
  if (sql.includes("f.gdrive_status = 'failed'")) return "upload";
  if (sql.includes("p.id IS NULL")) return "package";
  if (sql.includes("FROM item_locks")) return "lock";
  throw new Error(`Unexpected notification SQL: ${sql}`);
}

function notificationClient(failingKind = null) {
  const metrics = { query: 0, inFlight: 0, maxInFlight: 0, params: [] };
  const errors = Object.fromEntries(Object.keys(notificationRows).map((kind) => [kind, new Error(`notification-${kind}-failed`)]));
  const client = databaseClient({
    async query(sql, params = {}) {
      const kind = notificationKind(sql);
      metrics.query += 1;
      metrics.inFlight += 1;
      metrics.maxInFlight = Math.max(metrics.maxInFlight, metrics.inFlight);
      metrics.params.push({ ...params });
      await new Promise((resolve) => setTimeout(resolve, 5));
      metrics.inFlight -= 1;
      if (kind === failingKind) throw errors[kind];
      return notificationRows[kind];
    }
  });
  return { client, metrics, errors };
}

const notificationTest = notificationClient();
const notifications = await new AsyncNotificationRepository(notificationTest.client, () => "2026-08-08T06:00:00.000Z")
  .listNotifications({ id: "eng-1", role: "Engineer" });
assert.deepEqual(
  notifications.map(({ id, kind, severity, created_at }) => ({ id, kind, severity, created_at })),
  [
    { id: "release_failed:sub-release", kind: "release_failed", severity: "critical", created_at: "2026-08-08T05:00:00.000Z" },
    { id: "drive_upload_failed:file-upload", kind: "drive_upload_failed", severity: "warning", created_at: "2026-08-08T03:00:00.000Z" },
    { id: "release_package_missing:sub-package", kind: "release_package_missing", severity: "warning", created_at: "2026-08-08T02:00:00.000Z" },
    { id: "awaiting_review:sub-review", kind: "awaiting_review", severity: "info", created_at: "2026-08-08T04:00:00.000Z" },
    { id: "active_lock:lock-1", kind: "active_lock", severity: "info", created_at: "2026-08-08T01:00:00.000Z" }
  ],
  "notification output and ordering characterization"
);
assert.equal(notificationTest.metrics.query, 5, "notification query count remains five read statements");
assert(notificationTest.metrics.params.every((params) => params.userId === "eng-1" && params.scopeEngineer === 1), "engineer scope is passed to every notification query");
assert.equal(notificationTest.metrics.maxInFlight, baselineMode ? 1 : 5, baselineMode ? "notification sequential-stage baseline" : "notification queries share one concurrent stage");

for (const kind of Object.keys(notificationRows)) {
  const failureTest = notificationClient(kind);
  await assert.rejects(
    () => new AsyncNotificationRepository(failureTest.client).listNotifications({ id: "admin-1", role: "Admin" }),
    (error) => error === failureTest.errors[kind],
    `${kind} notification query propagates the original error`
  );
}

console.log(
  baselineMode
    ? "QC System Health Phase 6 characterization: PASS (release 4 serial queries, assets 3 serial queries, notifications 5 serial stages)"
    : "QC System Health Phase 6 read paths: PASS (release/assets batched, notifications one concurrent stage, output/error parity preserved)"
);
