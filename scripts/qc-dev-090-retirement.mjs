import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
function sourceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(relative));
    else if (/\.(?:ts|tsx|mjs|cjs)$/u.test(entry.name)) result.push(relative);
  }
  return result;
}
const runtimeSource = sourceFiles("src")
  .filter((file) => !file.endsWith(path.join("lib", "pdm-canonical-workbench-contract.ts")) && !file.endsWith(path.join("lib", "db.ts")))
  .map((file) => ({ file, text: read(file) }));
const forbiddenRuntimeTerms = [
  "/numbering/relations",
  "relation-change-works",
  "RelationChangeWorkService",
  "圖料工作台",
  "圖料工作臺",
  "直接關聯",
  "relation_formal",
  "relation_work"
];
const checks = [
  ["legacy relation API files removed", !exists("src/app/api/numbering/relations/route.ts") && !exists("src/app/api/numbering/relations/[rowKey]/route.ts")],
  ["relation change API files removed", !exists("src/app/api/pdm/relations/[rootId]/change-works/route.ts") && !exists("src/app/api/pdm/relation-change-works/[workId]/route.ts") && !exists("src/app/api/pdm/relation-change-works/[workId]/submit/route.ts") && !exists("src/app/api/pdm/relation-change-works/[workId]/cancel/route.ts")],
  ["relation workspace page removed", !exists("src/app/numbering/relations/[rootId]/workspace/page.tsx")],
  ["relation change service retired", !fs.existsSync(path.join(root, "src", "lib", "relation-change-work.ts")) && !fs.existsSync(path.join(root, "src", "lib", "repositories", "relation-change-work-async-repository.ts"))],
  ["relation change routes are retired", !exists("src/app/api/pdm/relations/[rootId]/change-works/route.ts") && !exists("src/app/api/pdm/relation-change-works/[workId]/route.ts")],
  ["relation work URL is not generated", !read("src/components/canonical-change-workspace.tsx").includes("relation-change-works")],
  ["relation review decisions are retired", !read("src/app/api/pdm/review-requests/[requestId]/decisions/route.ts").includes("RelationChangeWorkService")],
  ["minimal search no matrix editor", !read("src/app/numbering/search/page.tsx").includes("RelationMatrixEditor")],
  ["canonical drawer has no direct relation section", !read("src/components/canonical-pdm-workbench.tsx").includes("直接關聯")],
  ["runtime has no retired Relation caller or visible copy", runtimeSource.every(({ text }) => forbiddenRuntimeTerms.every((term) => !text.includes(term)))]
];
let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS ${label}`);
  else { failed = true; console.error(`FAIL ${label}`); }
}
if (failed) process.exit(1);
if (!checks.at(-1)?.[1]) {
  for (const { file, text } of runtimeSource) {
    const hits = forbiddenRuntimeTerms.filter((term) => text.includes(term));
    if (hits.length) console.error(`FORBIDDEN ${file}: ${hits.join(", ")}`);
  }
}
console.log(`PASS DEV-090 retirement (${checks.length}/${checks.length})`);
