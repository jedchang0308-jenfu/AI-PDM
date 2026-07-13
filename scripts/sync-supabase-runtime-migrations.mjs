#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectPath, readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const sourceFiles = [
  {
    source: "db/postgres/001_initial_schema.sql",
    target: "supabase/migrations/20260608000100_initial_ai_pdm_schema.sql",
    description: "Initial AI_PDM public schema converted from SQLite"
  },
  {
    source: "db/postgres/002_supabase_rls_plan.sql",
    target: "supabase/migrations/20260608000200_force_rls_deny_direct_access.sql",
    description: "Force RLS and deny direct anon/authenticated public table access"
  },
  {
    source: "db/postgres/003_harden_set_updated_at_search_path.sql",
    target: "supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql",
    description: "Harden set_updated_at function search_path for Supabase"
  },
  {
    source: "db/postgres/004_numbering_v2_compact_identity.sql",
    target: "supabase/migrations/20260707000000_numbering_v2_compact_identity.sql",
    description: "Add compact PDM numbering v2 seed and allow M/R drawing purpose codes"
  },
  {
    source: "db/postgres/005_access_control_launch_governance.sql",
    target: "supabase/migrations/20260707010000_access_control_launch_governance.sql",
    description: "Add launch access-control governance role assignment metadata and seeded external roles"
  },
  {
    source: "db/postgres/006_account_invitations.sql",
    target: "supabase/migrations/20260710020000_account_invitations.sql",
    description: "Add one-time account invitations with hashed tokens and deny direct Data API access"
  },
  {
    source: "db/postgres/007_auth_identities_google_oauth.sql",
    target: "supabase/migrations/20260710030000_auth_identities_google_oauth.sql",
    description: "Add provider-neutral identities, account status, and deny direct Data API access"
  },
  {
    source: "db/postgres/008_erp_module_foundation.sql",
    target: "supabase/migrations/20260712034956_erp_module_foundation.sql",
    description: "Add ERP-ready platform mappings, command receipts, transactional outbox, and deny direct Data API access"
  },
  {
    source: "db/postgres/009_account_lifecycle.sql",
    target: "supabase/migrations/20260713010000_account_lifecycle.sql",
    description: "Add account lifecycle controls, session revocation cutoffs, and password recovery requests"
  }
];

const read = (relativePath) => readProjectFile(root, relativePath);

function write(relativePath, content) {
  const absolutePath = projectPath(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function detectSupabaseCli() {
  if (process.env.PDM_SUPABASE_SKIP_MIGRATION_LIST === "true") {
    return {
      available: false,
      version: "",
      error: "supabase CLI detection skipped by PDM_SUPABASE_SKIP_MIGRATION_LIST"
    };
  }

  const result = spawnSync("supabase", ["--version"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  return {
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : "",
    error: result.status === 0 ? "" : (result.stderr || result.stdout || "supabase CLI not found").trim()
  };
}

function redactCliOutput(value) {
  return String(value ?? "")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/\bsb_[a-z0-9_]+_[a-z0-9]{20,}\b/gi, "[REDACTED_SUPABASE_KEY]")
    .trim();
}

function runSupabaseMigrationList(cli) {
  const command = "supabase migration list";
  if (process.env.PDM_SUPABASE_SKIP_MIGRATION_LIST === "true") {
    return {
      command,
      attempted: false,
      passed: false,
      status: null,
      stdout: "",
      stderr: "",
      reason: "supabase migration list skipped by PDM_SUPABASE_SKIP_MIGRATION_LIST"
    };
  }

  if (!cli.available) {
    return {
      command,
      attempted: false,
      passed: false,
      status: null,
      stdout: "",
      stderr: "",
      reason: "supabase CLI not found"
    };
  }

  const result = spawnSync("supabase", ["migration", "list"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });

  return {
    command,
    attempted: true,
    passed: result.status === 0,
    status: result.status,
    stdout: redactCliOutput(result.stdout),
    stderr: redactCliOutput(result.stderr),
    reason: result.status === 0 ? "" : "supabase migration list failed"
  };
}

const cli = detectSupabaseCli();
const manifest = {
  generatedAt: "deterministic",
  generatedBy: "scripts/sync-supabase-runtime-migrations.mjs",
  supabaseCli: cli,
  localMigrationList: runSupabaseMigrationList(cli),
  note: "Generated mirror of db/postgres SQL for AI_PDM runtime migration planning. If Supabase CLI is available, validate migration history with `supabase migration list` before applying to a live project.",
  migrations: []
};

for (const item of sourceFiles) {
  const sourceSql = read(item.source);
  const targetContent = [
    `-- ${item.description}`,
    `-- Source: ${item.source}`,
    `-- Source SHA-256: ${sha256(sourceSql)}`,
    "-- This file is synchronized by npm.cmd run supabase:migrations:sync.",
    "",
    sourceSql.trim(),
    ""
  ].join("\n");

  write(item.target, targetContent);
  manifest.migrations.push({
    ...item,
    sourceSha256: sha256(sourceSql),
    targetSha256: sha256(targetContent)
  });
}

write("supabase/migrations/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify(manifest, null, 2));
