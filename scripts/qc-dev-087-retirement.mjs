import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, pass: Boolean(condition), detail });
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const entrypoints = [
  "src/app/numbering/drawings/page.tsx",
  "src/components/part-detail-content.tsx",
  "src/app/numbering/search/page.tsx"
];
const retiredImports = [
  "human-status-projection",
  "work-status-presentation",
  "responsibility-status-projection",
  "availability-scope",
  "drawing-workbench-status",
  "pdm-workbench-lane"
];
const bannedDtoFields = [
  "humanStatus",
  "responsibilityStatus",
  "viewerStatus",
  "viewerActionability",
  "availabilityScope",
  "laneLabel"
];

for (const entrypoint of entrypoints) {
  const source = read(entrypoint);
  check(`${entrypoint}:canonical-entry`, source.includes("CanonicalPdmWorkbench"));
  check(`${entrypoint}:no-legacy-projector`, retiredImports.every((token) => !source.includes(token)));
}

const contractSource = read("src/lib/pdm-canonical-workbench-contract.ts");
const dtoSource = contractSource.slice(
  contractSource.indexOf("export type CanonicalWorkbenchRowDto"),
  contractSource.indexOf("export const CANONICAL_HANDLING_LABELS")
);
const canonicalRuntimeSources = [
  "src/lib/pdm-canonical-workbench-state.ts",
  "src/lib/pdm-canonical-workbench.ts"
].map(read).join("\n");
check("canonical-dto-banned-fields-zero", bannedDtoFields.every((field) => !dtoSource.includes(field)));
check("canonical-runtime-no-legacy-table-read", !canonicalRuntimeSources.includes("numbering_draft_workspaces"));

const routeRoot = path.join(root, "src/app/api/numbering/draft-workspaces");
const routeFiles = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(full);
    else if (entry.name === "route.ts") routeFiles.push(full);
  }
}
visit(routeRoot);
check("retired-route-count", routeFiles.length === 15, `count=${routeFiles.length}`);
for (const routeFile of routeFiles) {
  const source = fs.readFileSync(routeFile, "utf8");
  check(`${path.relative(root, routeFile)}:410`, source.includes("retiredWorkbenchCommandResponse"));
}
const retiredResponse = read("src/lib/pdm-retired-workbench-route.ts");
check("retired-response-code", retiredResponse.includes("WORKBENCH_COMMAND_CONTRACT_RETIRED") && retiredResponse.includes("status: 410"));

const inventory = JSON.parse(read(".ai-doc/qa/dev-087-old-authority-inventory.json"));
check("inventory-owned", inventory.items.every((item) => item.owner === "DEV-087"));
check("inventory-closed", inventory.items.every((item) => item.status === "complete"));

function sourceGate(source) {
  return retiredImports.every((token) => !source.includes(token))
    && !source.includes("canonicalToLegacyFallback")
    && !source.includes("WORKBENCH_LEGACY_FALLBACK");
}
check("negative-control-baseline", sourceGate(entrypoints.map(read).join("\n")));
check("negative-control-injected-projector-rejected", !sourceGate(`${entrypoints.map(read).join("\n")}\nimport 'human-status-projection';`));
check("negative-control-injected-fallback-rejected", !sourceGate(`${entrypoints.map(read).join("\n")}\nconst canonicalToLegacyFallback = true;`));

const failed = checks.filter((item) => !item.pass);
for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
console.log(JSON.stringify({ devId: "DEV-087", status: failed.length ? "FAIL" : "PASS", passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
