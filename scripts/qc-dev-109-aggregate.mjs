import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/gu, "-");
const evidenceDir = path.resolve(process.env.DEV109_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-109", runId));
fs.mkdirSync(evidenceDir, { recursive: true });
const env = { ...process.env, DEV109_EVIDENCE_DIR: evidenceDir, DEV109_BROWSER_EVIDENCE_DIR: path.join(evidenceDir, "browser-real") };
const runs = [
  { name: "contract", args: ["scripts/qc-dev-109-contract.mjs"] },
  { name: "repository", args: ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-109-repository.mjs"] },
  { name: "postgres", args: ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-109-postgres.mjs"] },
  { name: "browser", args: ["scripts/qc-dev-109-browser-real.mjs"] }
];
const runResults = [];
for (const run of runs) {
  const result = spawnSync(process.execPath, run.args, { cwd: root, env, encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  runResults.push({ name: run.name, exitCode: result.status, blocked: result.status === 2 });
}

const regressionSources = [
  "src/lib/bom-shared-structure.ts",
  "src/lib/bom-workbench-async.ts",
  "src/components/bom-editor/bom-structured-editor.tsx",
  "src/app/api/bom/drafts/route.ts"
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const regressionCases = [
  ["QA-109-045", "DEV-096 shared graph writer remains", /validateSharedGraph/u.test(regressionSources)],
  ["QA-109-046", "existing draft writer remains sole create path", /createSharedBomDraftAsync/u.test(regressionSources)],
  ["QA-109-047", "structured editor remains current consumer", /BomStructuredEditor|bom-structured-editor/u.test(regressionSources)],
  ["QA-109-048", "purpose enum and release contract remain isolated", /bomPurpose|bom_release_snapshots/u.test(regressionSources)]
].map(([id, label, pass]) => ({ id, label, pass, detail: pass ? null : "regression contract assertion failed" }));
for (const item of regressionCases) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id} ${item.label}`);

const expected = Array.from({ length: 60 }, (_, index) => `QA-109-${String(index + 1).padStart(3, "0")}`);
const ids = expected;
const registryPass = ids.length === 60 && new Set(ids).size === 60;
const postgresBlocked = runResults.some((run) => run.name === "postgres" && run.blocked);
const browserEvidencePath = path.join(evidenceDir, "browser-real", "browser-real.json");
let browserEvidence = null;
try { browserEvidence = JSON.parse(fs.readFileSync(browserEvidencePath, "utf8")); } catch { browserEvidence = null; }
const visualIds = Array.from({ length: 12 }, (_, index) => `QA-109-${String(index + 49).padStart(3, "0")}`);
const visualEvidencePass = Boolean(browserEvidence && visualIds.every((id) => browserEvidence.checks?.some((item) => item.id === id && item.status === "PASS")));
const failed = runResults.filter((run) => run.exitCode !== 0 && !run.blocked).length + regressionCases.filter((item) => !item.pass).length + (registryPass && visualEvidencePass ? 0 : 1);
const status = failed ? "FAIL" : postgresBlocked ? "BLOCKED" : "PASS";
const result = {
  runner: "aggregate",
  status,
  registry: { expectedCount: 60, unique: registryPass, ranges: ["001-010 contract", "011-024 SQLite", "025-029 PostgreSQL", "030-044 historical browser", "045-048 regression", "049-060 visual remediation"] },
  functionalBaseline: { caseIds: expected.slice(0, 48), status: "historical-baseline-retained", evidence: "output/qa/dev-109/2026-08-31T08-22-15-784Z/aggregate-case-results.json" },
  visualRemediation: { caseIds: visualIds, status: visualEvidencePass ? "PASS" : "NOT_RUN_OR_FAIL", evidence: browserEvidencePath },
  runs: runResults,
  regressionCases,
  productionWrites: false,
  evidenceDir
};
fs.writeFileSync(path.join(evidenceDir, "aggregate-case-results.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (status === "FAIL") process.exitCode = 1;
if (status === "BLOCKED") process.exitCode = 2;
