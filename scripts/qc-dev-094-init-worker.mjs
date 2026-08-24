#!/usr/bin/env node

import { getDb } from "../src/lib/db.ts";

const database = getDb();
const result = {
  pid: process.pid,
  roots: database.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
  parts: database.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count,
  foreignKeys: database.pragma("foreign_key_check").length,
  residue: database.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'
    AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration')`).get().count
};
console.log(JSON.stringify(result));
