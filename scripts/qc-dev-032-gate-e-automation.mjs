#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-gate-e-automation", "gate-e-automation-readback.json");
const humanPath = path.join(root, "output", "dev-032-gate-e-automation", "human-work-package.json");
const uiReadbackPath = path.join(root, "output", "dev-032-gate-e-automation", "production-ui-readback.json");
const screenshotPath = path.join(root, "output", "dev-032-gate-e-automation", "production-ui-readback.jpg");
const scriptPath = path.join(root, "scripts", "generate-dev-032-gate-e-automation.mjs");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const reportExists = existsSync(reportPath);
const humanExists = existsSync(humanPath);
const uiReadbackExists = existsSync(uiReadbackPath);
const screenshotExists = existsSync(screenshotPath);
const report = reportExists ? readJson(reportPath) : null;
const human = humanExists ? readJson(humanPath) : null;
const uiReadback = uiReadbackExists ? readJson(uiReadbackPath) : null;
const script = readFileSync(scriptPath, "utf8");
const reportText = report ? JSON.stringify(report) : "";
const checks = report?.checks ?? [];
const checkMap = new Map(checks.map((item) => [item.name, item]));

record("DEV032-GATEE-001 report exists and is machine/human bounded", reportExists && report?.schemaVersion === 1 && report?.dev === "DEV-032" && report?.readOnlyOrFailClosedOnly === true && report?.productionMutationPerformed === false);
record("DEV032-GATEE-002 all machine checks pass", report?.status === "machine_gate_e_passed_human_closure_pending" && report?.summary?.machineChecksPassed === true && report?.summary?.failed === 0 && report?.summary?.passed === report?.summary?.total);
record("DEV032-GATEE-003 target is production Firebase Hosting slice", report?.target?.projectId === "jenfu-ai-pdm-prod" && report?.target?.canonicalBaseUrl === "https://jenfu-ai-pdm-prod.web.app" && report?.release?.runtimeRevision === "ai-pdm-prod-00012-kaf");
record("DEV032-GATEE-004 existing post-traffic and Level 4 evidence are linked", checkMap.get("post-traffic smoke passed")?.passed === true && checkMap.get("authenticated Level 4 UI smoke passed")?.passed === true && report?.evidencePaths?.postTrafficSmoke?.includes("hotfix-3ab5cffa") && report?.evidencePaths?.level4UiSmoke?.includes("hotfix-3ab5cffa"));
record("DEV032-GATEE-005 Chrome UI readback and screenshot exist", uiReadbackExists && screenshotExists && uiReadback?.checks?.productionPageLoaded === true && uiReadback?.checks?.optionalSeriesCodeVisible === true && (uiReadback?.disabledButtons?.length ?? 0) >= 6);
record("DEV032-GATEE-006 anonymous protected reads fail closed", checks.filter((item) => item.name.startsWith("anonymous protected read ")).length === 4 && checks.filter((item) => item.name.startsWith("anonymous protected read ")).every((item) => item.passed === true));
record("DEV032-GATEE-007 unopened write endpoints fail closed", checks.filter((item) => item.name.startsWith("production-slice unopened mutation ")).length === 4 && checks.filter((item) => item.name.startsWith("production-slice unopened mutation ")).every((item) => item.passed === true && item.detail?.body?.error === "feature_not_open_in_production_slice" && item.detail?.body?.mode === "official-numbering-draft"));
record("DEV032-GATEE-008 direct Cloud Run session exchange remains denied", checkMap.get("direct run.app session exchange denied")?.passed === true);
record("DEV032-GATEE-009 no user or allowlist side effect is claimed", report?.notPerformed?.includes("No new production users were created.") && report?.notPerformed?.includes("No Wave 0 allowlist was expanded or guessed.") && report?.notPerformed?.some((item) => item.includes("No custom DNS")));
record("DEV032-GATEE-010 human work package is explicit and keeps five-day gate cancelled", humanExists && human?.fixedFiveBusinessDayObservationCancelled === true && human?.requiredHumanInputs?.some((item) => item.id === "wave0_named_users") && human?.requiredHumanInputs?.some((item) => item.id === "product_owner_go_no_go") && human?.explicitNonActions?.some((item) => item.includes("fixed five-business-day")));
record("DEV032-GATEE-011 current Wave 0 state is not overstated", Array.isArray(human?.currentNamedUsers) && human.currentNamedUsers.length === 1 && human.currentNamedUsers[0] === "jedchang0308@jenfu.com.tw" && human.missingNamedUserCount >= 2);
record("DEV032-GATEE-012 report does not persist secret values", !/client_secret|private_key|DATABASE_URL|BEGIN PRIVATE KEY|secretValue|AIza[0-9A-Za-z_-]{20,}/u.test(reportText));
record("DEV032-GATEE-013 generator has no destructive cloud or terraform action", !/terraform\s+apply|terraform\s+destroy|gcloud\s+run\s+services\s+delete|gcloud\s+sql\s+instances\s+delete|run",\s*"services",\s*"delete/iu.test(script));

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 Gate E automation QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
