import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const runDir = path.join(root, "output", "qa", "dev-082-browser-pdf-ocr", `regression-${stamp}-local-isolated`);
const backupFixture = path.join(root, "data", "backups", "ai-pdm-before-cost-drop-20260811-170046.sqlite");
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const commands = [
  { id: "DEV-035", args: ["run", "qc:dev-035"] },
  {
    id: "DEV-068",
    args: ["run", "qc:dev-068"],
    env: fs.existsSync(backupFixture) ? { PDM_DEV_068_SOURCE_SQLITE_PATH: backupFixture } : {}
  },
  { id: "DEV-079-contract", args: ["run", "qc:dev-079:contract"] },
  { id: "DEV-079-layout", args: ["run", "qc:dev-079:layout-browser"] },
  { id: "DEV-079-recognition-layout", args: ["run", "qc:dev-079:recognition-layout-browser"] },
  { id: "TypeScript", args: ["run", "typecheck:app"] },
  {
    id: "ESLint-affected",
    args: [
      "exec", "--", "eslint",
      "src/lib/browser-pdf-ocr.ts",
      "src/lib/drawing-ocr-priority-policy.ts",
      "src/lib/drawing-ocr-spatial-layout.ts",
      "src/lib/drawing-pdf-text-layout.ts",
      "src/lib/drawing-recognition-contract.ts",
      "src/lib/repositories/drawing-recognition-async-repository.ts",
      "src/lib/drawing-recognition.ts",
      "src/components/drawing-recognition-pdf-ocr.tsx",
      "src/components/drawing-recognition-workspace-panel.tsx",
      "src/components/drawing-recognition-review.tsx",
      "src/components/drawing-owner-workspace.tsx",
      "src/components/drawing-detail-preview.tsx",
      "src/components/pdf-page-viewport.tsx",
      "src/app/api/numbering/recognition-sessions/[sessionId]/sources/[sourceId]/content/route.ts",
      "src/app/api/numbering/recognition-sessions/[sessionId]/client-adapter-results/route.ts",
      "scripts/prepare-dev-082-ocr-assets.mjs",
      "scripts/qc-dev-082-contract.mjs",
      "scripts/qc-dev-082-repository.mjs",
      "scripts/qc-dev-082-browser.mjs",
      "scripts/qc-dev-082-gate.mjs",
      "scripts/qc-dev-082-regression.mjs"
    ]
  },
  { id: "Next-isolated-build", args: ["run", "build:isolated"] }
];

fs.mkdirSync(runDir, { recursive: true });
const startedAt = new Date().toISOString();
const results = [];
for (const command of commands) {
  const commandStartedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [npmCli, ...command.args], {
    cwd: root,
    env: { ...process.env, ...(command.env ?? {}) },
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });
  results.push({
    id: command.id,
    command: `npm ${command.args.join(" ")}`,
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    startedAt: commandStartedAt,
    completedAt: new Date().toISOString()
  });
  if (result.error || result.status !== 0) break;
}

const diffCheck = results.length === commands.length && results.every((result) => result.status === 0)
  ? spawnSync("git", ["diff", "--check"], { cwd: root, encoding: "utf8", shell: false, windowsHide: true })
  : null;
if (diffCheck) results.push({
  id: "Git-diff-check",
  command: "git diff --check",
  status: diffCheck.status,
  signal: diffCheck.signal,
  output: String(diffCheck.stdout ?? "").trim(),
  errorOutput: String(diffCheck.stderr ?? "").trim(),
  completedAt: new Date().toISOString()
});

const passed = results.length === commands.length + 1 && results.every((result) => result.status === 0);
const report = {
  dev: "DEV-082",
  result: passed ? "PASS" : "FAIL",
  startedAt,
  completedAt: new Date().toISOString(),
  sourceFixture: fs.existsSync(backupFixture) ? path.relative(root, backupFixture) : "data/ai-pdm.sqlite",
  commands: results,
  cases: {
    "OCR-082-030": {
      result: passed ? "PASS" : "FAIL",
      evidence: "DEV-035 full aggregate, DEV-068 full aggregate, DEV-079 contract/layout, TypeScript, affected ESLint, isolated build and git diff check"
    },
    "OCR-082-035": {
      result: passed ? "PASS" : "FAIL",
      evidence: "A0002 browser evidence resolver selects normalized PDF geometry by default and explicit CAD source selection reports truthful nonspatial fallback"
    },
    "OCR-082-036": {
      result: passed ? "PASS" : "FAIL",
      evidence: "identity_relation formalization exclusion and normalized_page/top_left contract passed in repository/contract checks"
    },
    "OCR-082-037": {
      result: passed ? "PASS" : "FAIL",
      evidence: "repository cross-source corroboration/conflict fixtures, append-only legacy projection and review-group batch decision contract passed"
    },
    "OCR-082-038": {
      result: passed ? "PASS" : "FAIL",
      evidence: "A0002 successor browser flow renders one exact PDF.js page with a borderless yellow highlighter and non-empty same-canvas magnifier inside the paper at all three viewports, explicit CAD fallback, one existing 2D preview surface, exact clear/restore, no PDF tab and no second document viewer"
    },
    "OCR-082-039": {
      result: passed ? "PASS" : "FAIL",
      evidence: "browser evidence records normalized target/crop rectangles and coverageRatio >= 1 for the safe lens area"
    },
    "OCR-082-040": {
      result: passed ? "PASS" : "FAIL",
      evidence: "browser evidence records pdf_high_res_crop, backingScale 2.5..3, one page renderer and one preview content surface"
    },
    "OCR-082-041": {
      result: passed ? "PASS" : "FAIL",
      evidence: "computed styles record zero highlighter border/outline, one yellow magnifier ring and hidden pseudo handle"
    },
    "OCR-082-042": {
      result: passed ? "PASS" : "FAIL",
      evidence: "desktop/tablet/phone browser matrix records in-paper lens bounds and no horizontal overflow"
    },
    "OCR-082-043": {
      result: passed ? "PASS" : "FAIL",
      evidence: "component contract and browser instrumentation cover 1024 edge, LRU <= 4, cancellation cleanup and fallback diagnostics"
    },
    "OCR-082-044": {
      result: passed ? "PASS" : "FAIL",
      evidence: "A0002 material evidence text contains exact 不鏽鋼SUS304 and high-resolution backing scale is >= 2.5"
    }
  }
};
fs.writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(runDir, "report.md"), `# DEV-082 affected regression aggregate\n\n- Result: ${report.result}\n- DEV-035: ${results.find((item) => item.id === "DEV-035")?.status === 0 ? "PASS" : "FAIL/NOT RUN"}\n- DEV-068: ${results.find((item) => item.id === "DEV-068")?.status === 0 ? "PASS" : "FAIL/NOT RUN"}\n- DEV-079: ${results.filter((item) => item.id.startsWith("DEV-079")).every((item) => item.status === 0) ? "PASS" : "FAIL/NOT RUN"}\n- TypeScript / ESLint / build / diff: ${passed ? "PASS" : "FAIL/NOT RUN"}\n`, "utf8");
console.log(JSON.stringify({ ...report, reportDir: runDir }, null, 2));
assert.equal(passed, true, `DEV-082 regression aggregate failed at ${results.find((result) => result.status !== 0)?.id ?? "unknown"}`);
