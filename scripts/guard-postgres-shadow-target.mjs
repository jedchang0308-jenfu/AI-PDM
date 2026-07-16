#!/usr/bin/env node

import {
  collectPostgresTargetSnapshot,
  evaluateShadowTarget,
  evaluateSupabaseTargetIdentity,
  getExpectedAiPdmTables
} from "./postgres-shadow-target-guard-utils.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const postgresUrl = process.env.PDM_POSTGRES_SHADOW_URL?.trim() || "";
const expectedTables = getExpectedAiPdmTables(root);
const targetIdentity = evaluateSupabaseTargetIdentity(postgresUrl, process.env);

function parseArgs(argv) {
  const parsed = {
    phase: "compare",
    mockPublicTables: "",
    mockRlsTables: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--phase") parsed.phase = argv[++index] ?? "";
    else if (arg === "--mock-public-tables") parsed.mockPublicTables = argv[++index] ?? "";
    else if (arg === "--mock-rls-tables") parsed.mockRlsTables = argv[++index] ?? "";
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!["pre-migration", "compare"].includes(parsed.phase)) {
    console.error("Invalid --phase. Expected pre-migration or compare.");
    process.exit(1);
  }

  return parsed;
}

function parseCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildMockSnapshot() {
  const publicTables = parseCsv(args.mockPublicTables);
  const rlsTables = new Set(parseCsv(args.mockRlsTables));
  return {
    publicTables,
    rlsRows: publicTables
      .filter((tableName) => rlsTables.has(tableName))
      .map((table) => ({ table, rowSecurity: true, forceRowSecurity: true }))
  };
}

let snapshot = null;
let error = "";

try {
  if (args.mockPublicTables || args.mockRlsTables) {
    snapshot = buildMockSnapshot();
  } else if (!targetIdentity.safe) {
    error = targetIdentity.issues.map((issue) => issue.message).join(" ");
  } else if (!postgresUrl) {
    error = "PDM_POSTGRES_SHADOW_URL is not configured.";
  } else {
    snapshot = collectPostgresTargetSnapshot(postgresUrl, expectedTables, root);
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
}

const evaluation = snapshot
  ? evaluateShadowTarget({
      publicTables: snapshot.publicTables,
      expectedTables,
      rlsRows: snapshot.rlsRows,
      phase: args.phase
    })
  : {
      safe: false,
      phase: args.phase,
      mode: "unavailable",
      expectedTableCount: expectedTables.length,
      publicTableCount: 0,
      presentExpectedTables: [],
      missingExpectedTables: expectedTables,
      unknownTables: [],
      issues: targetIdentity.safe ? [{ type: "target_unavailable", message: error }] : targetIdentity.issues
    };

const report = {
  checkedAt: new Date().toISOString(),
  postgresShadowConfigured: Boolean(postgresUrl),
  targetIdentity,
  ...evaluation
};

console.log(JSON.stringify(report, null, 2));
if (!report.safe) process.exitCode = 1;
