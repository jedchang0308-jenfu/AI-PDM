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
  },
  {
    source: "db/postgres/010_transfer_package_phase3a0.sql",
    target: "supabase/migrations/20260713020000_transfer_package_phase3a0.sql",
    description: "Add transfer package Phase 3A-0 draft workbench tables and controls"
  },
  {
    source: "db/postgres/011_gcs_pointer_numbering_continuity.sql",
    target: "supabase/migrations/20260713030000_gcs_pointer_numbering_continuity.sql",
    description: "Add GCS pointer metadata and numbering recovery reservations"
  },
  {
    source: "db/postgres/012_number_state_flow_phase1a.sql",
    target: "supabase/migrations/20260713040000_number_state_flow_phase1a.sql",
    description: "Add DEV-048 Phase 1A draft workspace and candidate reservation authority"
  },
  {
    source: "db/postgres/013_firebase_bff_identity_invitations.sql",
    target: "supabase/migrations/20260713050000_firebase_bff_identity_invitations.sql",
    description: "Add Firebase BFF invitation saga state and deny direct Data API access"
  },
  {
    source: "db/postgres/014_employee_login_aliases.sql",
    target: "supabase/migrations/20260713060000_employee_login_aliases.sql",
    description: "Add employee login aliases, short-lived intents, shared rate limits, and deny direct Data API access"
  },
  {
    source: "db/postgres/015_employee_privacy_notice_acknowledgements.sql",
    target: "supabase/migrations/20260713070000_employee_privacy_notice_acknowledgements.sql",
    description: "Add immutable employee privacy notice versions, acknowledgements, and deny direct Data API access"
  },
  {
    source: "db/postgres/016_number_state_flow_phase1c.sql",
    target: "supabase/migrations/20260713080000_number_state_flow_phase1c.sql",
    description: "Add DEV-048 Phase 1C approval registration, immutable targets, publication evidence, and permissions"
  },
  {
    source: "db/postgres/017_number_state_flow_phase1d.sql",
    target: "supabase/migrations/20260713090000_number_state_flow_phase1d.sql",
    description: "Add DEV-048 Phase 1D transfer review, batch publication, and published handoff authority"
  },
  {
    source: "db/postgres/018_part_number_series_code.sql",
    target: "supabase/migrations/20260714010000_part_number_series_code.sql",
    description: "Add optional series code to manufactured non-universal part drafts and official part numbers"
  },
  {
    source: "db/postgres/019_number_state_flow_request_equivalence.sql",
    target: "supabase/migrations/20260714020000_number_state_flow_request_equivalence.sql",
    description: "Add DEV-048 request-equivalence reasons to draft workspaces and parts"
  },
  {
    source: "db/postgres/020_account_session_records.sql",
    target: "supabase/migrations/20260714030000_account_session_records.sql",
    description: "Add server-owned account session records for managed auth session visibility"
  },
  {
    source: "db/postgres/021_number_lifecycle_simplification.sql",
    target: "supabase/migrations/20260804010000_number_lifecycle_simplification.sql",
    description: "Add DEV-052 candidate first-revision authority and immutable review-approval evidence"
  },
  {
    source: "db/postgres/022_unified_drawing_workbench.sql",
    target: "supabase/migrations/20260804020000_unified_drawing_workbench.sql",
    description: "Add DEV-053 source drawing and part context for candidate workspaces"
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
