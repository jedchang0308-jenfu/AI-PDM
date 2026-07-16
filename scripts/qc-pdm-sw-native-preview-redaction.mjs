#!/usr/bin/env node

import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

const readRequired = (relativePath) => readProjectFile(root, relativePath);

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const previewService = readRequired("src/lib/preview-derivatives.ts");
const drawingRoute = readRequired("src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts");
const partRoute = readRequired("src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts");
const claimRoute = readRequired("src/app/api/preview-jobs/claim/route.ts");
const completeRoute = readRequired("src/app/api/preview-jobs/[jobId]/complete/route.ts");
const drawingDownloadRoute = readRequired("src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts");
const partDownloadRoute = readRequired("src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts");
const sqliteSchema = readRequired("db/schema.sql");
const postgresSchema = readRequired("db/postgres/001_initial_schema.sql");
const packageJson = readProjectJson(root, "package.json");

const routeSources = [
  ["drawing preview route", drawingRoute],
  ["part preview route", partRoute],
  ["worker claim route", claimRoute],
  ["worker complete route", completeRoute],
  ["drawing download route", drawingDownloadRoute],
  ["part download route", partDownloadRoute]
];

for (const [label, source] of routeSources) {
  for (const forbidden of ["SolidWorks.Interop", "swdocumentmgr", "ISwDM", "ActiveXObject", "Shell.Application", "child_process", "execFile", "spawn("]) {
    assert(!source.includes(forbidden), `${label} does not import or run native CAD tooling`, forbidden);
  }
}

const previewSchema = [sqliteSchema, postgresSchema].join("\n").toLowerCase();
for (const forbiddenColumn of ["solidworks_api_key", "solidworks_license_key", "license_plaintext", "secret_plaintext", "secret_value"]) {
  assert(!previewSchema.includes(forbiddenColumn), `Preview schema does not define plaintext secret column: ${forbiddenColumn}`);
}
assert(previewSchema.includes("preview_jobs") && previewSchema.includes("file_derivatives"), "Preview schema is included in redaction scan");

assert(previewService.includes("sanitizePreviewErrorSummary"), "Preview service sanitizes worker error summaries");
assert(previewService.includes("[redacted-swdocmgr-token]"), "Preview service redacts swdocmgr token patterns");
assert(previewService.includes("[redacted-license-token]"), "Preview service redacts license-like token patterns");
assert(previewService.includes("[redacted-secret]"), "Preview service redacts generic secret assignments");
assert(!previewService.includes("process.env.PDM_SOLIDWORKS_API_KEY"), "Preview service does not read SolidWorks API key directly");
assert(!previewService.includes("NEXT_PUBLIC"), "Preview service does not expose preview credentials through NEXT_PUBLIC");

assert(claimRoute.includes("x-pdm-preview-worker-token") && completeRoute.includes("x-pdm-preview-worker-token"), "Worker API uses explicit service-token header");
assert(claimRoute.includes("PREVIEW_WORKER_TOKEN_NOT_CONFIGURED") && completeRoute.includes("PREVIEW_WORKER_TOKEN_NOT_CONFIGURED"), "Worker API fails closed when token is not configured");
assert(!drawingRoute.includes("PDM_PREVIEW_WORKER_TOKEN") && !partRoute.includes("PDM_PREVIEW_WORKER_TOKEN"), "Browser preview enqueue routes do not require or reveal worker service token");

const repositorySource = [previewService, drawingRoute, partRoute, claimRoute, completeRoute].join("\n");
for (const leaked of ["JENFUMACHINERYCOLTD:swdocmgr", "swdocmgr_general-", "swdocmgr_previews-", "11785-02051"]) {
  assert(!repositorySource.includes(leaked), `Preview implementation does not contain known license/key material: ${leaked}`);
}

assert(packageJson.scripts["qc:pdm-sw-native-preview-redaction"] === "node scripts/qc-pdm-sw-native-preview-redaction.mjs", "package script qc:pdm-sw-native-preview-redaction is registered");

console.log(`qc:pdm-sw-native-preview-redaction passed ${checks.length}/${checks.length} checks`);
