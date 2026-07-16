#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function listFiles(dir, predicate = () => true) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".next", ".git", "data", "output"].includes(entry.name)) continue;
        visit(fullPath);
        continue;
      }
      if (entry.isFile() && predicate(fullPath)) files.push(fullPath);
    }
  }
  if (fs.existsSync(dir)) visit(dir);
  return files;
}

try {
  const packageJson = readProjectJson(root, "package.json");
  const envExample = readProjectFile(root, ".env.example");
  const nextConfig = readProjectFile(root, "next.config.mjs");
  const dbAsyncProvider = readProjectFile(root, "src/lib/db-async-provider.ts");
  const fileStorage = readProjectFile(root, "src/lib/file-storage.ts");
  const supabaseSpec = readProjectFile(root, ".ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md");
  const supabaseAdr = readProjectFile(root, ".ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md");
  const handoff = readProjectFile(root, ".ai-doc/reports/pm/thread-handoff-supabase-connector-2026-06-11.md");

  record("SUPABASE-SECRET-001 package script is registered", packageJson.scripts?.["qc:supabase-secret-boundary"] === "node scripts/qc-supabase-secret-boundary.mjs");
  record("SUPABASE-SECRET-002 env example documents server-only Postgres runtime vars", includesAll(envExample, ["PDM_POSTGRES_URL=", "PDM_POSTGRES_ADMIN_URL=", "PDM_POSTGRES_POOLER_MODE=", "PDM_POSTGRES_MAX_CONNECTIONS="]));
  record("SUPABASE-SECRET-003 env example does not define public Postgres vars", !/NEXT_PUBLIC_.*POSTGRES/iu.test(envExample));
  record("SUPABASE-SECRET-004 env example does not define public service-role vars", !/NEXT_PUBLIC_.*(?:SERVICE_ROLE|SECRET|PASSWORD|TOKEN)/iu.test(envExample));

  record("SUPABASE-SECRET-005 next config does not expose env block", !/env\s*:/u.test(nextConfig));
  record("SUPABASE-SECRET-006 db async provider reads Postgres URL server-side only", includesAll(dbAsyncProvider, ["process.env.PDM_POSTGRES_URL", "POSTGRES_CONNECTION_STRING_REQUIRED"]) && !dbAsyncProvider.includes("NEXT_PUBLIC"));
  record("SUPABASE-SECRET-007 Postgres runtime signature never prints URL", includesAll(dbAsyncProvider, ["getRuntimeClientSignature", "PDM_POSTGRES_URL"]) && !dbAsyncProvider.includes("console.log(process.env.PDM_POSTGRES_URL"));

  record("SUPABASE-SECRET-008 storage rejects public Supabase service role key", includesAll(fileStorage, ["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "must never be exposed through NEXT_PUBLIC_* variables"]));
  record("SUPABASE-SECRET-009 storage reads service role only from server env", includesAll(fileStorage, ["PDM_SUPABASE_SERVICE_ROLE_KEY", "resolveSupabaseStorageConfig"]) && !fileStorage.includes("NEXT_PUBLIC_SUPABASE_URL"));
  record("SUPABASE-SECRET-010 storage rejects public S3 credentials", includesAll(fileStorage, ["NEXT_PUBLIC_S3_COMPATIBLE_SECRET_ACCESS_KEY", "NEXT_PUBLIC_S3_COMPATIBLE_ACCESS_KEY_ID", "S3-compatible credentials must never be exposed"]));

  record("SUPABASE-SECRET-011 spec documents server-only secret boundary", includesAll(supabaseSpec, ["server runtime", "server-side env", "不得進入 frontend bundle"]));
  record("SUPABASE-SECRET-012 ADR keeps runtime and admin URLs server-side", includesAll(supabaseAdr, ["PDM_POSTGRES_URL", "PDM_POSTGRES_ADMIN_URL", "server API"]));
  record("SUPABASE-SECRET-013 handoff forbids public service role", includesAll(handoff, ["service_role", "sb_secret_*", "NEXT_PUBLIC_*"]));

  const sourceFiles = listFiles(path.join(root, "src"), (filePath) => /\.(ts|tsx|js|jsx|mjs)$/u.test(filePath));
  const publicSecretReferences = [];
  const postgresRuntimeReferences = [];
  for (const filePath of sourceFiles) {
    const relativePath = path.relative(root, filePath).replace(/\\/g, "/");
    const content = readProjectFile(root, relativePath);
    if (/NEXT_PUBLIC_.*(?:SERVICE_ROLE|SECRET|PASSWORD|TOKEN|POSTGRES)/iu.test(content)) {
      publicSecretReferences.push(relativePath);
    }
    if (content.includes("PDM_POSTGRES_URL")) {
      postgresRuntimeReferences.push(relativePath);
    }
  }

  record(
    "SUPABASE-SECRET-014 only storage guard references public secret env names",
    publicSecretReferences.length === 1 && publicSecretReferences[0] === "src/lib/file-storage.ts",
    publicSecretReferences.join(", ")
  );
  record(
    "SUPABASE-SECRET-015 Postgres runtime URL is scoped to db provider",
    postgresRuntimeReferences.length === 1 && postgresRuntimeReferences[0] === "src/lib/db-async-provider.ts",
    postgresRuntimeReferences.join(", ")
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
