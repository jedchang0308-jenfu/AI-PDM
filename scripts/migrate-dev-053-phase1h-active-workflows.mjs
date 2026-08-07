#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import {
  applyDrawingRevisionLifecycleAdoption,
  planDrawingRevisionLifecycleAdoption,
  redactDrawingRevisionLifecycleAdoptionPlan
} from "../src/lib/drawing-revision-lifecycle-adoption.ts";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-local-phase1h-adoption");
const configuredPath = process.env.PDM_PHASE1H_ADOPTION_SQLITE_PATH || process.env.PDM_SQLITE_PATH || "data/ai-pdm.sqlite";
const databasePath = path.resolve(root, configuredPath);
const defaultDatabasePath = path.resolve(root, "data", "ai-pdm.sqlite");

if (String(process.env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase() !== "sqlite") {
  throw new Error("PHASE1H_ADOPTION_LOCAL_SQLITE_ONLY");
}
if (!fs.existsSync(databasePath)) throw new Error(`PHASE1H_ADOPTION_DATABASE_NOT_FOUND:${databasePath}`);
if (apply && (!confirmed || !process.env.PDM_PHASE1H_ADOPTION_SQLITE_PATH)) {
  throw new Error("PHASE1H_ADOPTION_APPLY_REQUIRES_EXPLICIT_LOCAL_PATH_AND_CONFIRMATION");
}
if (apply && databasePath === defaultDatabasePath) {
  throw new Error("PHASE1H_ADOPTION_DEFAULT_DATABASE_APPLY_FORBIDDEN");
}

const database = new Database(databasePath, { readonly: !apply, fileMustExist: true });
database.pragma("foreign_keys = ON");
const client = createAsyncDatabaseClient({ kind: "sqlite", database });

try {
  const plan = await planDrawingRevisionLifecycleAdoption(client);
  const report = redactDrawingRevisionLifecycleAdoptionPlan(plan);
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", database: "[LOCAL_SQLITE]", ...report }, null, 2));
  } else {
    if (plan.blockedCount > 0) {
      throw new Error(`DRAWING_LIFECYCLE_ADOPTION_BLOCKED blocked=${plan.blockedCount} candidates=${plan.candidateCount}`);
    }
    const result = await applyDrawingRevisionLifecycleAdoption(client);
    console.log(JSON.stringify({ mode: "apply", database: "[LOCAL_SQLITE]", ...report, result }, null, 2));
  }
} finally {
  await client.close();
  database.close();
}
