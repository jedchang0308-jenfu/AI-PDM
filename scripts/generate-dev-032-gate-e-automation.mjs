#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "output", "dev-032-gate-e-automation");
const reportPath = path.join(outputDir, "gate-e-automation-readback.json");
const markdownPath = path.join(outputDir, "gate-e-automation-readback.md");
const humanJsonPath = path.join(outputDir, "human-work-package.json");
const humanMarkdownPath = path.join(outputDir, "human-work-package.md");

function readJson(relativePath) {
  const filePath = path.join(root, ...relativePath.split("/"));
  if (!existsSync(filePath)) return { path: relativePath, exists: false, parsed: null, error: null };
  try {
    return { path: relativePath, exists: true, parsed: JSON.parse(readFileSync(filePath, "utf8")), error: null };
  } catch (error) {
    return { path: relativePath, exists: true, parsed: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function normalizeHeader(value) {
  return String(value ?? "").toLowerCase();
}

function noStore(response) {
  return normalizeHeader(response.headers.get("cache-control")).includes("no-store");
}

async function readJsonBody(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { unparsableTextSample: text.slice(0, 400) };
  }
}

function check(name, passed, detail = {}) {
  return { name, passed: Boolean(passed), detail };
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "AI_PDM_DEV032_GATE_E_AUTOMATION"
    },
    redirect: "follow"
  });
  return {
    pathname,
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: await readJsonBody(response)
  };
}

async function postJson(baseUrl, pathname, body = { smoke: true }, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "AI_PDM_DEV032_GATE_E_AUTOMATION",
      ...extraHeaders
    },
    body: JSON.stringify(body),
    redirect: "manual"
  });
  return {
    pathname,
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    productionSliceHeader: response.headers.get("x-ai-pdm-production-slice"),
    body: await readJsonBody(response)
  };
}

function writeMarkdown(report) {
  const lines = [
    "# DEV-032 Gate E Automation Readback",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: \`${report.status}\``,
    `Machine checks passed: \`${report.summary.machineChecksPassed}\``,
    `Remaining human closure required: \`${report.summary.requiresHumanClosure}\``,
    "",
    "## Checks",
    "",
    ...report.checks.map((item) => `- ${item.passed ? "PASS" : "FAIL"} ${item.name}`),
    "",
    "## Human Boundary",
    "",
    ...report.notPerformed.map((item) => `- ${item}`),
    "",
    "## Evidence",
    "",
    ...Object.entries(report.evidencePaths).map(([key, value]) => `- ${key}: \`${value}\``)
  ];
  return `${lines.join("\n")}\n`;
}

function buildHumanWorkPackage({ evidence, report }) {
  const namedUsers = Array.isArray(evidence.wave0?.namedUsers) ? evidence.wave0.namedUsers : [];
  const minimumNamedUsers = evidence.wave0?.minimumNamedUsers ?? 3;
  const maximumNamedUsers = evidence.wave0?.maximumNamedUsers ?? 5;
  const missingNamedUserCount = Math.max(0, minimumNamedUsers - namedUsers.length);
  return {
    schemaVersion: 1,
    dev: "DEV-032",
    generatedAt: report.generatedAt,
    target: evidence.target,
    currentNamedUsers: namedUsers,
    minimumNamedUsers,
    maximumNamedUsers,
    missingNamedUserCount,
    fixedFiveBusinessDayObservationCancelled: evidence.decisions?.fixedFiveBusinessDayObservationCancelled === true,
    machineEvidence: {
      status: report.status,
      gateEAutomationPath: "output/dev-032-gate-e-automation/gate-e-automation-readback.json",
      chromeUiReadbackPath: "output/dev-032-gate-e-automation/production-ui-readback.json",
      chromeUiScreenshotPath: "output/dev-032-gate-e-automation/production-ui-readback.jpg",
      productionLevel4Path: evidence.hotfix?.level4EvidencePath ?? null,
      postTrafficSmokePath: evidence.hotfix?.postTrafficSmokePath ?? null
    },
    requiredHumanInputs: [
      {
        id: "wave0_named_users",
        required: true,
        description: `Provide ${minimumNamedUsers}-${maximumNamedUsers} named Wave 0 users total. Current list has ${namedUsers.length}; add at least ${missingNamedUserCount}.`,
        replyFormat: "Wave0 users: user1@jenfu.com.tw, user2@jenfu.com.tw, user3@jenfu.com.tw"
      },
      {
        id: "named_user_ui_acceptance",
        required: true,
        description: "For each Wave 0 user, confirm production login, privacy acknowledgement if shown, create draft or formal numbering by role, optional series code for self-made non-shared item, relog persistence, and unopened UI remains disabled.",
        replyFormat: "UI acceptance: PASS for all named users / list exceptions"
      },
      {
        id: "non_allowlist_negative_access",
        required: true,
        description: "Use a Google account that is not allowlisted and confirm it cannot enter the production core app. If no safe test account exists, state that this remains pending.",
        replyFormat: "Non-allowlist test: PASS with account <email> / PENDING no account"
      },
      {
        id: "product_owner_go_no_go",
        required: true,
        description: "Product owner records final go/no-go for the official numbering / draft production slice only.",
        replyFormat: "Product owner decision: GO / NO-GO"
      },
      {
        id: "open_p0_p1",
        required: true,
        description: "Confirm there are no unresolved P0/P1 issues for the production slice.",
        replyFormat: "P0/P1: none / list issue"
      }
    ],
    explicitNonActions: [
      "Do not configure custom DNS in this closure; Firebase Hosting default URL remains canonical.",
      "Do not reintroduce the cancelled fixed five-business-day observation gate.",
      "Do not include GCS file authority, CAD, BOM or full PDM workflows in this release scope."
    ]
  };
}

function writeHumanMarkdown(workPackage) {
  const lines = [
    "# DEV-032 Human Work Package",
    "",
    `Generated: ${workPackage.generatedAt}`,
    `Target: \`${workPackage.target?.projectId}\``,
    `URL: \`${workPackage.target?.canonicalBaseUrl}\``,
    "",
    "## Reply Template",
    "",
    "```text",
    "Wave0 users: jedchang0308@jenfu.com.tw, <user2@jenfu.com.tw>, <user3@jenfu.com.tw>",
    "UI acceptance: PASS for all named users / list exceptions",
    "Non-allowlist test: PASS with account <email> / PENDING no account",
    "Product owner decision: GO / NO-GO",
    "P0/P1: none / list issue",
    "```",
    "",
    "## Required Inputs",
    "",
    ...workPackage.requiredHumanInputs.map((item) => `- \`${item.id}\`: ${item.description}`),
    "",
    "## Non-Actions",
    "",
    ...workPackage.explicitNonActions.map((item) => `- ${item}`)
  ];
  return `${lines.join("\n")}\n`;
}

const evidenceSource = readJson("config/platform/production-activation-evidence.json");
const liveSource = readJson("output/dev-032-production-live-readback/report.json");
const level4Source = readJson("output/dev-032-production-slice-activation/hotfix-3ab5cffa-level4-ui.json");
const postTrafficSource = readJson("output/dev-032-production-slice-activation/hotfix-3ab5cffa-post-traffic-smoke.json");
const uiReadbackSource = readJson("output/dev-032-gate-e-automation/production-ui-readback.json");

const evidence = evidenceSource.parsed ?? {};
const live = liveSource.parsed ?? {};
const level4 = level4Source.parsed ?? {};
const postTraffic = postTrafficSource.parsed ?? {};
const uiReadback = uiReadbackSource.parsed ?? {};
const canonicalBaseUrl = evidence.target?.canonicalBaseUrl ?? "https://jenfu-ai-pdm-prod.web.app";
const directBaseUrl = postTraffic.directBaseUrl ?? null;

const statusReadback = await getJson(canonicalBaseUrl, "/api/production-slice/status");
const anonymousProtectedReads = await Promise.all([
  getJson(canonicalBaseUrl, "/api/auth/me"),
  getJson(canonicalBaseUrl, "/api/admin/accounts?limit=1"),
  getJson(canonicalBaseUrl, "/api/numbering/permissions"),
  getJson(canonicalBaseUrl, "/api/numbering/draft-workspaces")
]);
const unopenedMutations = await Promise.all([
  postJson(canonicalBaseUrl, "/api/numbering/part-number-drafts/smoke-only/submit-review"),
  postJson(canonicalBaseUrl, "/api/files/upload"),
  postJson(canonicalBaseUrl, "/api/cad/preview"),
  postJson(canonicalBaseUrl, "/api/bom/publish")
]);
const directSessionExchange = directBaseUrl
  ? await postJson(directBaseUrl, "/api/auth/firebase/session", { idToken: "gate-e-smoke-only" }, { origin: directBaseUrl })
  : null;

const uiChecks = uiReadback.checks ?? {};
const protectedReadChecks = anonymousProtectedReads.map((item) => check(
  `anonymous protected read ${item.pathname}`,
  item.status === 401 && normalizeHeader(item.cacheControl).includes("no-store"),
  { status: item.status, cacheControl: item.cacheControl, body: item.body }
));
const unopenedMutationChecks = unopenedMutations.map((item) => check(
  `production-slice unopened mutation ${item.pathname}`,
  item.status === 403
    && item.body?.error === "feature_not_open_in_production_slice"
    && item.body?.mode === "official-numbering-draft",
  { status: item.status, productionSliceHeader: item.productionSliceHeader, body: item.body }
));
const checks = [
  check("evidence contract loaded", evidenceSource.exists && evidence.dev === "DEV-032", { path: evidenceSource.path }),
  check("live production readback passed", liveSource.exists && live.allChecksPassed === true && live.runtime?.productionSliceMode === "official-numbering-draft", { path: liveSource.path, revision: live.runtime?.latestReadyRevision }),
  check("post-traffic smoke passed", postTrafficSource.exists && postTraffic.failed === 0 && postTraffic.passed >= 14, { path: postTrafficSource.path, passed: postTraffic.passed, failed: postTraffic.failed }),
  check("authenticated Level 4 UI smoke passed", level4Source.exists && level4.failed === 0 && level4.uiAcceptanceResult?.seriesCode === "DEV032-HF", { path: level4Source.path, result: level4.uiAcceptanceResult }),
  check("Chrome UI readback shows production persisted item and disabled future controls", uiReadbackSource.exists
    && Object.values(uiChecks).every(Boolean)
    && Array.isArray(uiReadback.disabledButtons)
    && uiReadback.disabledButtons.length >= 6,
  { path: uiReadbackSource.path, checks: uiChecks, disabledButtonCount: uiReadback.disabledButtons?.length ?? 0 }),
  check("production slice status active", statusReadback.status === 200 && statusReadback.body?.active === true && statusReadback.body?.mode === "official-numbering-draft" && noStore({
    headers: new Map([["cache-control", statusReadback.cacheControl]])
  }), { status: statusReadback.status, cacheControl: statusReadback.cacheControl, body: statusReadback.body }),
  ...protectedReadChecks,
  ...unopenedMutationChecks,
  check("direct run.app session exchange denied", directSessionExchange?.status === 403, directSessionExchange ?? { skipped: true })
];

const failed = checks.filter((item) => !item.passed);
const report = {
  schemaVersion: 1,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  readOnlyOrFailClosedOnly: true,
  productionMutationPerformed: false,
  status: failed.length === 0 ? "machine_gate_e_passed_human_closure_pending" : "machine_gate_e_failed",
  target: evidence.target ?? {},
  release: {
    sourceRevision: evidence.artifact?.applicationSourceRevision ?? null,
    imageDigest: evidence.artifact?.applicationImageDigest ?? null,
    runtimeRevision: live.runtime?.latestReadyRevision ?? null,
    directBaseUrl
  },
  checks,
  summary: {
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    machineChecksPassed: failed.length === 0,
    requiresHumanClosure: true
  },
  evidencePaths: {
    evidenceContract: evidenceSource.path,
    liveReadback: liveSource.path,
    postTrafficSmoke: postTrafficSource.path,
    level4UiSmoke: level4Source.path,
    chromeUiReadback: uiReadbackSource.path,
    chromeUiScreenshot: "output/dev-032-gate-e-automation/production-ui-readback.jpg",
    humanWorkPackage: "output/dev-032-gate-e-automation/human-work-package.md"
  },
  notPerformed: [
    "No new production users were created.",
    "No Wave 0 allowlist was expanded or guessed.",
    "No custom DNS was configured.",
    "No GCS file authority, CAD, BOM or full PDM workflow was opened.",
    "No named non-allowlist Google sign-in was performed because that requires a real human-controlled account."
  ]
};

const humanWorkPackage = buildHumanWorkPackage({ evidence, report });

mkdirSync(outputDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, writeMarkdown(report), "utf8");
writeFileSync(humanJsonPath, `${JSON.stringify(humanWorkPackage, null, 2)}\n`, "utf8");
writeFileSync(humanMarkdownPath, writeHumanMarkdown(humanWorkPackage), "utf8");

console.log(JSON.stringify({
  outputPath: path.relative(root, reportPath).replaceAll("\\", "/"),
  markdownPath: path.relative(root, markdownPath).replaceAll("\\", "/"),
  humanWorkPackagePath: path.relative(root, humanMarkdownPath).replaceAll("\\", "/"),
  status: report.status,
  passed: report.summary.passed,
  total: report.summary.total,
  failed: report.summary.failed
}, null, 2));
