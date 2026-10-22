#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PRODUCTION_AUDIT_MAX_ATTEMPTS = 3;

const NETWORK_FAILURE_PATTERNS = [
  /network timeout at:/iu,
  /\b(?:EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|ETIMEDOUT)\b/u,
  /socket hang up/iu
];

export function isRetryableAuditNetworkFailure(output) {
  return NETWORK_FAILURE_PATTERNS.some((pattern) => pattern.test(String(output ?? "")));
}

function runNpmAudit() {
  const npmCli = process.env.npm_execpath?.trim();
  if (!npmCli) throw new Error("NPM_EXEC_PATH_REQUIRED");
  return spawnSync(process.execPath, [
    npmCli,
    "audit",
    "--omit=dev",
    "--audit-level=high",
    "--fetch-retries=0",
    "--fetch-timeout=60000"
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runProductionDependencyAudit({
  runAttempt = runNpmAudit,
  wait = delay,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  for (let attempt = 1; attempt <= PRODUCTION_AUDIT_MAX_ATTEMPTS; attempt += 1) {
    const result = runAttempt(attempt);
    stdout.write(result.stdout ?? "");
    stderr.write(result.stderr ?? "");
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error ?? ""}`;
    if (result.status === 0) return 0;
    if (!isRetryableAuditNetworkFailure(detail) || attempt === PRODUCTION_AUDIT_MAX_ATTEMPTS) {
      return Number.isInteger(result.status) ? result.status : 1;
    }
    const waitMilliseconds = attempt * 1000;
    stderr.write(`PRODUCTION_AUDIT_NETWORK_RETRY attempt=${attempt + 1}/${PRODUCTION_AUDIT_MAX_ATTEMPTS} waitMs=${waitMilliseconds}\n`);
    await wait(waitMilliseconds);
  }
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await runProductionDependencyAudit();
}
