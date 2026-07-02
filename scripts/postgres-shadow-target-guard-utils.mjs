import { spawnSync } from "node:child_process";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const forbiddenSupabaseTargets = [
  { name: "ProJED", ref: "knodlkxqpcqyrtgwpdst" },
  { name: "ProJED_TEST", ref: "fhisnnufoeulxqrchldf" }
];

export function extractTableNames(sql) {
  return [...sql.matchAll(/^CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gimu)].map((match) => match[1]);
}

export function getExpectedAiPdmTables(root) {
  return extractTableNames(readProjectFile(root, "db/schema.sql"));
}

export function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll("\"", "\"\"")}"`;
}

export function runPsql(postgresUrl, sql, root = process.cwd()) {
  const result = spawnSync("psql", [postgresUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "psql failed").trim());
  }
  return result.stdout.trim();
}

export function parseLineList(value) {
  return String(value ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function collectPostgresTargetSnapshot(postgresUrl, expectedTables, root = process.cwd()) {
  const publicTables = parseLineList(runPsql(
    postgresUrl,
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;",
    root
  ));
  const presentExpectedTables = expectedTables.filter((tableName) => publicTables.includes(tableName));
  const rlsRows = presentExpectedTables.length === 0
    ? []
    : parseLineList(runPsql(
        postgresUrl,
        [
          "select c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text",
          "from pg_class c",
          "join pg_namespace n on n.oid = c.relnamespace",
          "where n.nspname = 'public'",
          `and c.relname in (${presentExpectedTables.map((tableName) => `'${tableName.replaceAll("'", "''")}'`).join(", ")})`,
          "order by c.relname;"
        ].join(" "),
        root
      )).map((line) => {
        const [table, rowSecurity, forceRowSecurity] = line.split("|");
        return {
          table,
          rowSecurity: rowSecurity === "true",
          forceRowSecurity: forceRowSecurity === "true"
        };
      });

  return { publicTables, rlsRows };
}

export function evaluateSupabaseTargetIdentity(postgresUrl, env = process.env) {
  const rawUrl = String(postgresUrl ?? "");
  const configuredTargetName = env.PDM_SUPABASE_TARGET_NAME?.trim() ?? "";
  const loweredUrl = rawUrl.toLowerCase();
  const loweredTargetName = configuredTargetName.toLowerCase();
  const issues = [];

  for (const forbidden of forbiddenSupabaseTargets) {
    const ref = forbidden.ref.toLowerCase();
    const name = forbidden.name.toLowerCase();
    if (loweredUrl.includes(ref) || loweredTargetName === name) {
      issues.push({
        type: "forbidden_supabase_project",
        message: `Refusing to use existing non-AI_PDM Supabase project ${forbidden.name}.`,
        projectName: forbidden.name,
        projectRef: forbidden.ref
      });
    }
  }

  return {
    safe: issues.length === 0,
    configuredTargetName,
    forbiddenProjectRefs: forbiddenSupabaseTargets.map((target) => target.ref),
    issues
  };
}

export function evaluateShadowTarget({ publicTables, expectedTables, rlsRows = [], phase = "compare" }) {
  const publicSet = new Set(publicTables);
  const expectedSet = new Set(expectedTables);
  const unknownTables = publicTables.filter((tableName) => !expectedSet.has(tableName));
  const presentExpectedTables = expectedTables.filter((tableName) => publicSet.has(tableName));
  const missingExpectedTables = expectedTables.filter((tableName) => !publicSet.has(tableName));
  const issues = [];

  if (phase === "pre-migration") {
    if (publicTables.length > 0) {
      issues.push({
        type: "target_not_empty",
        message: "Pre-migration target must have no public base tables.",
        publicTables
      });
    }
  } else {
    if (unknownTables.length > 0) {
      issues.push({
        type: "unknown_public_tables",
        message: "Target contains public tables outside the generated AI_PDM schema.",
        tables: unknownTables
      });
    }

    if (presentExpectedTables.length > 0 && missingExpectedTables.length > 0) {
      issues.push({
        type: "partial_ai_pdm_schema",
        message: "Target contains only part of the generated AI_PDM schema.",
        present: presentExpectedTables,
        missing: missingExpectedTables
      });
    }

    if (phase === "compare" && publicTables.length === 0) {
      issues.push({
        type: "empty_target_for_compare",
        message: "Compare phase requires a migrated AI_PDM shadow schema."
      });
    }

    if (phase === "compare" && presentExpectedTables.length === expectedTables.length && unknownTables.length === 0) {
      const rlsByTable = new Map(rlsRows.map((row) => [row.table, row]));
      const rlsMissingOrWeak = expectedTables.filter((tableName) => {
        const row = rlsByTable.get(tableName);
        return !row || row.rowSecurity !== true || row.forceRowSecurity !== true;
      });
      if (rlsMissingOrWeak.length > 0) {
        issues.push({
          type: "rls_not_forced",
          message: "Compare phase requires RLS enabled and forced on every AI_PDM public table.",
          tables: rlsMissingOrWeak
        });
      }
    }
  }

  const mode = publicTables.length === 0
    ? "empty_public_schema"
    : unknownTables.length === 0 && missingExpectedTables.length === 0
      ? "ai_pdm_shadow_schema"
      : "non_ai_pdm_or_partial_schema";

  return {
    safe: issues.length === 0,
    phase,
    mode,
    expectedTableCount: expectedTables.length,
    publicTableCount: publicTables.length,
    presentExpectedTables,
    missingExpectedTables,
    unknownTables,
    issues
  };
}
