#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const confirmed = args.has("--confirm-local-platform-mapping");
const dataDir = path.resolve(root, process.env.PDM_DATA_DIR?.trim() || "data");
const dbPath = path.resolve(process.env.PDM_DB_PATH?.trim() || path.join(dataDir, "ai-pdm.sqlite"));

if (!fs.existsSync(dbPath)) {
  console.error(JSON.stringify({ status: "blocked", reason: "PDM_DB_NOT_FOUND", dbPath }, null, 2));
  process.exit(1);
}

if (apply && !confirmed) {
  console.error(
    JSON.stringify(
      {
        status: "blocked",
        reason: "LOCAL_PLATFORM_MAPPING_CONFIRMATION_REQUIRED",
        requiredFlag: "--confirm-local-platform-mapping"
      },
      null,
      2
    )
  );
  process.exit(1);
}

const db = new Database(dbPath, apply ? {} : { readonly: true, fileMustExist: true });

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

const requiredTables = [
  "users",
  "companies",
  "auth_identities",
  "user_company_memberships",
  "platform_principal_mappings",
  "platform_organization_mappings"
];
const missingTables = requiredTables.filter((table) => !tableExists(table));
if (missingTables.length > 0) {
  console.error(JSON.stringify({ status: "blocked", reason: "PLATFORM_MAPPING_SCHEMA_MISSING", missingTables }, null, 2));
  db.close();
  process.exit(1);
}

const duplicateEmails = db
  .prepare(
    `SELECT lower(email) AS normalized_email, count(*) AS count, group_concat(id) AS user_ids
     FROM users WHERE email IS NOT NULL AND trim(email) <> ''
     GROUP BY lower(email) HAVING count(*) > 1`
  )
  .all();
const duplicateProviderSubjects = db
  .prepare(
    `SELECT provider, provider_subject, count(*) AS count, group_concat(user_id) AS user_ids
     FROM auth_identities
     GROUP BY provider, provider_subject HAVING count(*) > 1`
  )
  .all();
const orphanIdentities = db
  .prepare(
    `SELECT ai.id, ai.user_id, ai.provider
     FROM auth_identities ai LEFT JOIN users u ON u.id = ai.user_id
     WHERE u.id IS NULL`
  )
  .all();
const usersWithoutMembership = db
  .prepare(
    `SELECT u.id, u.email, u.company_id
     FROM users u LEFT JOIN user_company_memberships m ON m.user_id = u.id
     WHERE m.user_id IS NULL`
  )
  .all();

const countsBefore = {
  users: db.prepare("SELECT count(*) AS count FROM users").get().count,
  companies: db.prepare("SELECT count(*) AS count FROM companies").get().count,
  principalMappings: db.prepare("SELECT count(*) AS count FROM platform_principal_mappings").get().count,
  organizationMappings: db.prepare("SELECT count(*) AS count FROM platform_organization_mappings").get().count
};

const collisions = duplicateEmails.length + duplicateProviderSubjects.length + orphanIdentities.length;
let applied = false;

if (apply) {
  if (collisions > 0) {
    console.error(
      JSON.stringify(
        {
          status: "blocked",
          reason: "PLATFORM_MAPPING_COLLISIONS_FOUND",
          duplicateEmails,
          duplicateProviderSubjects,
          orphanIdentities
        },
        null,
        2
      )
    );
    db.close();
    process.exit(1);
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO platform_principal_mappings (
        platform_principal_id, pdm_user_id, mapping_source, mapping_status, created_at, updated_at
      )
      SELECT 'pdm:' || id, id, 'current_pdm',
             CASE WHEN account_status = 'active' THEN 'active' ELSE 'suspended' END,
             datetime('now'), datetime('now')
      FROM users
      WHERE 1 = 1
      ON CONFLICT(pdm_user_id) DO NOTHING`
    ).run();
    db.prepare(
      `INSERT INTO platform_organization_mappings (
        platform_organization_id, pdm_company_id, mapping_source, mapping_status, created_at, updated_at
      )
      SELECT 'pdm-company:' || id, id, 'current_pdm', 'active', datetime('now'), datetime('now')
      FROM companies
      WHERE 1 = 1
      ON CONFLICT(pdm_company_id) DO NOTHING`
    ).run();
  })();
  applied = true;
}

const countsAfter = {
  principalMappings: db.prepare("SELECT count(*) AS count FROM platform_principal_mappings").get().count,
  organizationMappings: db.prepare("SELECT count(*) AS count FROM platform_organization_mappings").get().count
};
db.close();

console.log(
  JSON.stringify(
    {
      status: collisions === 0 ? "ready" : "blocked",
      mode: apply ? "apply" : "dry-run",
      applied,
      dbPath,
      countsBefore,
      countsAfter,
      collisions: {
        duplicateEmails,
        duplicateProviderSubjects,
        orphanIdentities,
        usersWithoutMembership
      },
      notes: [
        "Dry-run never changes the database.",
        "Apply only creates provider-neutral one-to-one mappings; it does not cut over sessions or rewrite PDM IDs.",
        "Shared IAM provider, MFA, offboarding and production cutover remain separately gated."
      ]
    },
    null,
    2
  )
);
