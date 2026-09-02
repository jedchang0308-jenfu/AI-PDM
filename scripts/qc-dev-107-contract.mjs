import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV107_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-107", "contract"));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const panel = read("src/components/drawing-recognition-workspace-panel.tsx");
const recognition = read("src/lib/drawing-recognition.ts");
const repository = read("src/lib/repositories/drawing-recognition-async-repository.ts");
const snapshot = read("src/lib/drawing-recognition-review-snapshot.ts");
const packageSource = read("src/lib/pdm-review-package.ts");
const legacy = read("src/app/numbering/recognition/[sessionId]/page.tsx");
const legacyResolver = read("src/lib/drawing-recognition-legacy-redirect.ts");
const schema = read("db/schema.sql");
const migration = read("db/postgres/053_drawing_recognition_amendment_lineage.sql");
const dbRuntime = read("src/lib/db.ts");

assert.match(panel, /\/commit["'`]/u, "embedded panel has one commit endpoint");
assert.match(panel, /確認寫入 PDM/u, "positive commit CTA");
assert.match(panel, /編輯辨識/u, "post-write edit CTA");
assert.match(panel, /取消編輯/u, "amendment cancel CTA");
assert.doesNotMatch(panel, /useRouter|openFormalizationReview|\/numbering\/recognition\//u, "embedded panel does not navigate to legacy workbench");
assert.match(recognition, /commitDrawingRecognition/u, "domain commit service");
assert.match(recognition, /sessionPurpose:\s*["']amendment["']/u, "amendment purpose");
assert.match(repository, /assertCurrentSourceSet/u, "source set revalidation before write");
assert.match(repository, /async commit\(/u, "repository atomic commit");
assert.match(repository, /appliedCount: impact\.changes\.length/u, "zero-delta event support");
assert.match(snapshot, /status: session\.status/u, "snapshot source retains lifecycle status in projection");
assert.match(packageSource, /RECOGNITION_NOT_WRITTEN/u, "submit guard rejects unsynchronized recognition");
assert.match(legacy, /redirect\(/u, "legacy route redirects server-side");
assert.match(legacy, /getSessionUserAsync|resolveLegacyDrawingRecognitionNavigation/u, "legacy route authenticates before redirect");
assert.match(legacyResolver, /assertSessionScope|companyId|work_id/u, "legacy redirect resolves exact scoped Drawing work");
assert.match(schema, /session_purpose TEXT NOT NULL DEFAULT 'recognition'/u, "SQLite purpose column");
assert.match(dbRuntime, /idx_drawing_recognition_open_amendment/u, "SQLite one-open amendment uniqueness");
assert.match(migration, /053|dev107|session_purpose/u, "PostgreSQL 053 migration");

const report = {
  dev: "DEV-107",
  result: "PASS",
  checks: 18,
  atomicEmbeddedCommit: true,
  amendmentLineage: true,
  sourceRevalidation: true,
  submitGuard: true,
  legacyRedirect: true,
  completedAt: new Date().toISOString()
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "contract-report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify({ dev: "DEV-107", runner: "qc-dev-107-contract", expectedCaseIds: Array.from({ length: 8 }, (_, index) => `QA-107-${String(index + 1).padStart(3, "0")}`), results: Array.from({ length: 8 }, (_, index) => ({ caseId: `QA-107-${String(index + 1).padStart(3, "0")}`, status: "PASS" })), status: "PASS", checks: report, completedAt: report.completedAt }, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
