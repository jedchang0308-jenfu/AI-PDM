import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/gu, "-");
const evidenceDir = path.resolve(process.env.DEV109_UNIFIED_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-109-unified", runId));
fs.mkdirSync(evidenceDir, { recursive: true });
const env = {
  ...process.env,
  DEV109_BROWSER_EVIDENCE_DIR: path.join(evidenceDir, "browser"),
  DEV109_UNIFIED_PROVIDER_EVIDENCE_DIR: path.join(evidenceDir, "provider")
};
const runs = [
  ["contract", ["scripts/qc-dev-109-unified-contract.mjs"]],
  ["migration", ["scripts/qc-dev-109-unified-migration.mjs"]],
  ["provider", ["scripts/qc-dev-109-unified-provider.mjs"]],
  ["repository", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-109-unified-repository.mjs"]],
  ["transaction", ["scripts/qc-dev-109-unified-transaction.mjs"]],
  ["browser", ["scripts/qc-dev-109-unified-browser.mjs"]]
];
const results = [];
for (const [name, args] of runs) { const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" }); process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? ""); results.push({ name, exitCode: result.status, stdout: result.stdout ?? "" }); }
const expected = [...Array.from({ length: 8 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 8 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 6 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 14 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 8 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 10 }, (_, i) => `B${String(i + 1).padStart(2, "0")}`)];
const browserEvidence = (() => { try { return JSON.parse(fs.readFileSync(path.join(evidenceDir, "browser", "browser.json"), "utf8")); } catch { return null; } })();
const providerEvidence = (() => { try { return JSON.parse(fs.readFileSync(path.join(evidenceDir, "provider", "postgres.json"), "utf8")); } catch { return null; } })();
const observedIds = results.flatMap((run) => [...run.stdout.matchAll(/PASS\s+([CMPRTB]\d{2})/gu)].map((match) => match[1]));
const allIds = expected; const observedSet = new Set(observedIds); const missing = allIds.filter((id) => !observedSet.has(id));
const registry = { expectedCount: 54, unique: new Set(allIds).size === 54, observedCount: observedSet.size, missing, ranges: ["C01-C08", "M01-M08", "P01-P06", "R01-R14", "T01-T08", "B01-B10"] };
const pass = registry.unique && missing.length === 0 && observedIds.length === 54 && results.every((r) => r.exitCode === 0) && browserEvidence?.status === "PASS" && providerEvidence?.status === "PASS" && providerEvidence?.productionConnection === false && providerEvidence?.primaryWrites === false;
const result = { runner: "unified-aggregate", status: pass ? "PASS" : "FAIL", registry, runs: results.map(({ name, exitCode }) => ({ name, exitCode })), productionWrites: false, evidenceDir, browserEvidence: browserEvidence ? "captured" : "not-captured", providerEvidence: providerEvidence ? "captured" : "not-captured" };
fs.writeFileSync(path.join(evidenceDir, "aggregate.json"), `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result, null, 2)); if (!pass) process.exitCode = 1;
