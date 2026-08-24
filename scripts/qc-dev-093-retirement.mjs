import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(tsx?|mjs)$/u.test(entry.name)) files.push(file);
  }
}
walk(path.join(root, "src"));
const violations = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (relative === "src/lib/number-candidate-preview.ts") violations.push("retired candidate preview helper still exists");
  if (source.includes("@/lib/number-candidate-preview")) violations.push(`${relative}: imports retired candidate preview`);
  if (relative.includes("canonical-numbering-create") && (source.includes("draft-workspaces") || source.includes("create=new_bundle") || source.includes("tab=reserved"))) {
    violations.push(`${relative}: canonical entry references legacy workspace/query`);
  }
}
const action = fs.readFileSync(path.join(root, "src/components/canonical-numbering-create-action.tsx"), "utf8");
if (action.includes("canonical-modal") || action.includes("fetch(")) violations.push("canonical entry still owns modal or mutation");
const result = { task: "DEV-093", passed: violations.length === 0, checks: [{ id: "QA-093-071", ok: violations.length === 0, detail: violations.length ? violations : "active src caller scan is clean" }] };
console.log(JSON.stringify(result, null, 2));
if (violations.length) process.exitCode = 1;
