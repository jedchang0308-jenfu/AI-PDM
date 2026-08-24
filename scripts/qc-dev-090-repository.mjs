import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "src", "lib");
const allowed = new Set([
  "relation-formal-authority-async-repository.ts",
  "relation-formal-authority-sync-repository.ts"
]);
const dml = /(?:INSERT|UPDATE|DELETE)\s+FROM?\s*drawing_part_links|(?:UPDATE|DELETE|INSERT\s+INTO)\s+drawing_part_links/gi;
const violations = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && file.endsWith(".ts")) {
      const text = fs.readFileSync(file, "utf8");
      if (dml.test(text) && !allowed.has(path.basename(file))) violations.push(path.relative(root, file));
      dml.lastIndex = 0;
    }
  }
}
walk(sourceRoot);
const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const migration = fs.readFileSync(path.join(root, "db", "postgres", "043_inline_relation_matrix.sql"), "utf8");
const checks = [
  ["no non-authority relation writers", violations.length === 0, violations.join(", ")],
  ["sqlite unique pair index", schema.includes("idx_drawing_part_links_unique_pair"), "db/schema.sql"],
  ["postgres duplicate guard", /DEV090_DUAL_TYPE_RELATION_PAIR/.test(migration), "db/postgres/043_inline_relation_matrix.sql"],
  ["authority has root replacement", fs.readFileSync(path.join(sourceRoot, "repositories", "relation-formal-authority-async-repository.ts"), "utf8").includes("replaceRootLinksInClient"), "authority"],
  ["authority has root deletion", fs.readFileSync(path.join(sourceRoot, "repositories", "relation-formal-authority-async-repository.ts"), "utf8").includes("removeRootLinksInClient"), "authority"]
];
let failed = false;
for (const [label, ok, detail] of checks) {
  if (ok) console.log(`PASS ${label}`);
  else { failed = true; console.error(`FAIL ${label}: ${detail}`); }
}
if (failed) process.exit(1);
console.log(`PASS DEV-090 repository (${checks.length}/${checks.length})`);
