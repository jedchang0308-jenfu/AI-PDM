#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const runId = `DEV112-contract-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-112-three-view-modes", runId);
fs.mkdirSync(outputDir, { recursive: true });

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(id, condition, detail = "") {
  checks.push({ id, pass: Boolean(condition), detail });
}
function sha256(file) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"); }
  catch { return null; }
}

const preview = read("src/lib/pdm-canonical-preview.ts");
const switcher = read("src/components/pdm-workbench-layout-switch.tsx");
const gallery = read("src/components/canonical-pdm-preview-gallery.tsx");
const workbench = read("src/components/canonical-pdm-workbench.tsx");
const media = read("src/components/canonical-preview-media.tsx");
const css = read("src/app/globals.css");
const packageJson = JSON.parse(read("package.json"));

const { normalizeCanonicalWorkbenchLayout } = await import("../src/lib/pdm-canonical-preview.ts");
check("DEV112-C01 unique layout type has three values", preview.includes('CanonicalWorkbenchLayout = "list" | "list_3d" | "preview"') && !switcher.includes("type PdmWorkbenchLayout"));
check("DEV112-C02 normalizer accepts exactly three values", ["list", "list_3d", "preview"].every((value) => normalizeCanonicalWorkbenchLayout(value) === value) && normalizeCanonicalWorkbenchLayout("grid") === null);
check("DEV112-C03 storage keys remain module-specific", preview.includes("pdm-canonical-drawing-layout-v1") && preview.includes("pdm-canonical-part-layout-v1") && workbench.includes("readStoredLayout(storageKey)"));
check("DEV112-C04 invalid URL never reads storage", workbench.includes("rawLayout === null ? readStoredLayout(storageKey) : null") && workbench.includes('rawLayout === null ? storedLayout ?? "list" : urlLayout ?? "list"'));
check("DEV112-C05 result display bar is capability-gated", workbench.includes("data-canonical-result-display-bar") && workbench.includes("previewCapability ? <div className=\"canonical-result-display-bar\""));
check("DEV112-C06 switch is one accessible radiogroup", switcher.includes('role="radiogroup"') && switcher.includes('aria-label="顯示方式"') && switcher.includes('role="radio"') && switcher.includes("aria-checked") && switcher.includes("ArrowRight") && switcher.includes("Home") && switcher.includes("End"));
check("DEV112-C07 modes share table and inline thumbnail is not a new column", workbench.includes('layout === "list_3d"') && workbench.includes("CanonicalPreviewThumbnail") && workbench.includes("canonical-code-cell") && !workbench.includes("<th>3D</th>"));
check("DEV112-C08 gallery and inline share thumbnail wrapper", gallery.includes("export function CanonicalPreviewThumbnail") && gallery.includes('density: "gallery" | "inline"') && workbench.includes('density="inline"') && gallery.includes('density="gallery"'));
check("DEV112-C09 media failures are local and no-touch media stays fetch/blob", gallery.includes("mediaFailed") && gallery.includes("onErrorCapture") && media.includes("URL.createObjectURL") && !workbench.includes("fetch(preview.media.href"));
check("DEV112-C10 image-bearing poll gate covers both modes", workbench.includes('(layout !== "list_3d" && layout !== "preview")') && workbench.includes("previewPollState"));
check("DEV112-C11 current-page media bound is declared in source contract", workbench.includes('params.set("limit", "100")') && gallery.includes('preview.state === "ready"') && gallery.includes("data-preview-state"));
check("DEV112-C12 no viewport lazy implementation is introduced", !workbench.includes("IntersectionObserver") && !gallery.includes("IntersectionObserver"));
check("DEV112-C13 focus recovery targets selected row", workbench.includes("querySelectorAll<HTMLElement>(\"[data-row-key]\")") && workbench.includes("focus({ preventScroll: true })"));
check("DEV112-C14 protected media remains canonical same-origin fetch", media.includes('fetch(media.href, { credentials: "same-origin"') && preview.includes("pdmFileReadHref"));
check("DEV112-C15 existing API/schema/no-touch boundaries are not imported by view components", !switcher.includes("/api/") && !gallery.includes("/api/") && !gallery.includes("from \"@/lib/repositories"));
check("DEV112-C16 DEV-112 commands are registered", Boolean(packageJson.scripts?.["qc:dev-112:contract"]) && Boolean(packageJson.scripts?.["qc:dev-112:browser"]) && Boolean(packageJson.scripts?.["qc:dev-112:aggregate"]) && Boolean(packageJson.scripts?.["qc:dev-112:all"]));

const relevantFiles = [
  "src/lib/pdm-canonical-preview.ts",
  "src/components/pdm-workbench-layout-switch.tsx",
  "src/components/canonical-pdm-preview-gallery.tsx",
  "src/components/canonical-pdm-workbench.tsx",
  "src/app/globals.css",
  "scripts/qc-dev-065-canonical-preview-contract.mjs",
  "scripts/qc-dev-065-canonical-preview-gallery.mjs",
  "scripts/qc-dev-112-three-view-modes-contract.mjs",
  "scripts/qc-dev-112-three-view-modes-browser.mjs",
  "scripts/qc-dev-112-three-view-modes-aggregate.mjs",
  "package.json"
];
const dirtyFileSha256 = Object.fromEntries(relevantFiles.map((file) => [file, sha256(file)]));
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
const manifest = {
  devId: "DEV-112",
  runId,
  gitSha,
  branch,
  dirtyFileSha256,
  nextVersion: packageJson.dependencies?.next ?? packageJson.devDependencies?.next ?? null,
  nodeVersion: process.version,
  playwrightVersion: packageJson.devDependencies?.playwright ?? packageJson.dependencies?.playwright ?? null,
  flags: { productionConnected: false, productionWrites: false },
  sourceInvariant: { checked: false, status: "contract-only; browser runner owns primary invariant" },
  fixtureInvariant: { checked: false, status: "browser runner owns task-owned fixture" },
  runtimeDeclaration: { project: root, purpose: "DEV-112 contract self-check", port: null, owningProcessTree: process.pid, cleanup: "process exit" },
  caseResults: checks,
  p0Count: 0,
  p1Count: checks.filter((item) => !item.pass).length,
  cleanup: { runtimeStopped: true, portReleased: true, taskOwnedTempRemoved: true },
  passed: checks.every((item) => item.pass)
};
fs.writeFileSync(path.join(outputDir, "contract-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id}${item.detail ? ` — ${item.detail}` : ""}`);
console.log(`DEV-112 contract manifest: ${path.relative(root, path.join(outputDir, "contract-manifest.json"))}`);
if (!manifest.passed) process.exitCode = 1;
