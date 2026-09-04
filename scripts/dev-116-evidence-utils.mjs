import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", windowsHide: true, ...options });
}

export function dev116SourceIdentity() {
  const sourceRevision = git(["rev-parse", "HEAD"]).trim();
  const diff = git(["diff", "--binary", "HEAD", "--", "."]);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = crypto.createHash("sha256").update(sourceRevision).update("\0").update(diff);
  for (const relativePath of untracked) {
    hash.update("\0").update(relativePath).update("\0");
    hash.update(fs.readFileSync(path.resolve(relativePath)));
  }
  return {
    sourceRevision,
    sourceFingerprint: hash.digest("hex"),
    dirtyInventory: git(["status", "--short", "--untracked-files=all"]).split(/\r?\n/u).filter(Boolean)
  };
}

export function cliValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

export function dev116RunId() {
  const runId = cliValue("run-id", process.env.DEV116_RUN_ID?.trim() || "");
  if (!runId) throw new Error("DEV116_RUN_ID_REQUIRED");
  if (!/^[A-Za-z0-9._-]{8,120}$/u.test(runId)) throw new Error("DEV116_RUN_ID_INVALID");
  return runId;
}

export function dev116EvidenceDir(runId) {
  return path.resolve(process.env.DEV116_EVIDENCE_DIR?.trim() || path.join(process.cwd(), "output", "qa", "dev-116-production-smoke-tenant", runId));
}

export function writeProducerManifest({ runId, producer, cases, detail = {} }) {
  const evidenceDir = dev116EvidenceDir(runId);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const source = dev116SourceIdentity();
  const normalizedCases = cases.map((item) => ({
    ...item,
    sourceRevision: item.sourceRevision ?? source.sourceRevision,
    runner: item.runner ?? producer,
    artifacts: item.artifacts ?? [],
    assertions: item.assertions ?? [{ name: "case_result", passed: item.status === "PASS" }]
  }));
  const manifest = {
    schemaVersion: "dev-116-producer-evidence/v1",
    devId: "DEV-116",
    runId,
    producer,
    generatedAt: new Date().toISOString(),
    sourceRevision: source.sourceRevision,
    sourceFingerprint: source.sourceFingerprint,
    status: normalizedCases.every((item) => item.status === "PASS") ? "PASS" : normalizedCases.some((item) => item.status === "FAIL") ? "FAIL" : "BLOCKED",
    cases: normalizedCases,
    detail
  };
  const target = path.join(evidenceDir, `${producer}.json`);
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, target };
}

export async function runCase(cases, id, title, callback) {
  const startedAt = new Date().toISOString();
  try {
    const detail = await callback();
    cases.push({ id, title, status: "PASS", startedAt, finishedAt: new Date().toISOString(), detail: detail ?? null });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    cases.push({ id, title, status: "FAIL", startedAt, finishedAt: new Date().toISOString(), message });
    console.error(`FAIL ${id} ${title}: ${message}`);
  }
}
