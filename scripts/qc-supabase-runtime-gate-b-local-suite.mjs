#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const root = process.cwd();
const npmDisplayCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const results = [];

const deniedPatterns = [
  /(^|\s)supabase(\.cmd|\.exe)?\s+/iu,
  /\bdb:postgres:guard\b/iu,
  /\bdb:postgres:compare\b/iu,
  /\bqc:db-provider-postgres\b/iu,
  /\bPDM_DB_PROVIDER=postgres\b/iu,
  /\bPDM_RUNTIME_SMOKE_APPROVED=true\b/iu,
  /\bPDM_POSTGRES_URL=/iu,
  /\bPDM_POSTGRES_SHADOW_URL=/iu,
  /--phase\s+compare/iu,
  /schema-rls/iu
];

const npmScripts = [
  "qc:doc-paths",
  "qc:supabase-secret-boundary",
  "qc:supabase-runtime-rollback-readiness",
  "qc:supabase-runtime-local-readiness",
  "qc:supabase-runtime-smoke-report",
  "qc:supabase-runtime-gate-plan",
  "qc:supabase-target-identity-receipt",
  "qc:supabase-runtime-smoke-preflight"
];

const commands = [
  ...npmScripts.map((scriptName) => {
    const npmExecPath = process.env.npm_execpath;
    return {
      name: scriptName,
      command: npmExecPath ? [process.execPath, npmExecPath, "run", scriptName] : [npmDisplayCommand, "run", scriptName],
      displayCommand: `${npmDisplayCommand} run ${scriptName}`,
      expectedStatuses: [0]
    };
  }),
  {
    name: "direct-api-route-db-import-scan",
    command: ["rg", "-n", "@/lib/db", "src/app/api", "--glob", "route.ts"],
    displayCommand: 'rg -n "@/lib/db" src/app/api --glob route.ts',
    expectedStatuses: [1],
    expectEmptyStdout: true
  }
];

function shellQuote(value) {
  return /\s/u.test(value) ? `"${value}"` : value;
}

function commandText(command) {
  return command.map(shellQuote).join(" ");
}

function record(name, passed, detail = {}) {
  results.push({ name, passed, ...detail });
}

function hasDeniedCommand(command) {
  const text = commandText(command);
  return deniedPatterns.find((pattern) => pattern.test(text));
}

function extractJson(stdout) {
  const first = stdout.indexOf("{");
  const last = stdout.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(stdout.slice(first, last + 1));
  } catch {
    return null;
  }
}

for (const item of commands) {
  const denied = hasDeniedCommand(item.command);
  if (denied) {
    record(item.name, false, {
      command: item.displayCommand,
      status: "not_run",
      reason: `Denied approval-gated command pattern: ${denied}`
    });
    continue;
  }

  const result = spawnSync(item.command[0], item.command.slice(1), {
    cwd: root,
    env: {
      ...process.env,
      PDM_SUPABASE_SKIP_MIGRATION_LIST: "true"
    },
    encoding: "utf8",
    windowsHide: true
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  let passed = item.expectedStatuses.includes(result.status);
  const detail = {
    command: commandText(item.command),
    displayCommand: item.displayCommand,
    status: result.status,
    expectedStatuses: item.expectedStatuses,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    error: result.error?.message ?? ""
  };

  if (item.expectEmptyStdout && stdout.trim() !== "") {
    passed = false;
    detail.reason = "Expected empty stdout.";
  }

  if (item.name === "qc:supabase-runtime-smoke-preflight") {
    const report = extractJson(stdout);
    const validBlockedPreflight =
      report?.status === "blocked_expected" &&
      report?.readyForRuntimeSmoke === false &&
      Array.isArray(report?.hazards) &&
      report.hazards.length === 0;
    passed = passed && validBlockedPreflight;
    detail.preflight = report
      ? {
          status: report.status,
          readyForRuntimeSmoke: report.readyForRuntimeSmoke,
          blockerCount: report.blockers?.length ?? 0,
          hazardCount: report.hazards?.length ?? 0
        }
      : null;
    if (!validBlockedPreflight) detail.reason = "Preflight must remain blocked_expected with zero hazards outside the approved smoke env.";
  }

  record(item.name, passed, detail);
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      mode: "local-only",
      note: "Does not run live Supabase CLI target commands, provider switching, Postgres compare, or runtime smoke.",
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
