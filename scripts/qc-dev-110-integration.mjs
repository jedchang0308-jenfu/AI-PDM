#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV110_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-110"));
const browserReportPath = path.join(evidenceDir, "browser.json");
const checks = [];
function check(id, condition, detail) {
  checks.push({ caseId: id, result: condition ? "PASS" : "FAIL", detail });
  assert.ok(condition, `${id}: ${detail}`);
}
assert.ok(fs.existsSync(browserReportPath), `missing real browser evidence: ${browserReportPath}`);
const browser = JSON.parse(fs.readFileSync(browserReportPath, "utf8"));
check("I01", browser.status === "PASS" && browser.denominator === 16, "browser runner completed with the declared B01-B16 denominator");
const browserIds = new Set((browser.checks ?? []).filter((item) => /^B\d\d$/u.test(item.id)).map((item) => item.id));
check("I02", browserIds.size >= 16 && [...Array(16)].every((_, index) => browserIds.has(`B${String(index + 1).padStart(2, "0")}`)), "all B01-B16 real-browser checks are present");
check("I03", typeof browser.route === "string" && browser.route.includes("/numbering/drawings/") && browser.route.includes("workId="), "integration starts at the normal Drawing workspace entry with a work context");
check("I04", typeof browser.navigationPath === "string" && /\/parts\/[^/]+\/workspace\?workId=/u.test(browser.navigationPath), "handoff crosses to the canonical Part workspace route");
check("I05", browser.downstreamReadback?.status === 200, "downstream matrix API readback succeeded through the browser session");
const values = new Map((browser.downstreamReadback?.columns ?? []).map((column) => [column.partId, column.materialLabel]));
check("I06", values.get(browser.fixture?.linkedParts?.[0]) === "SUS304" && values.get(browser.fixture?.linkedParts?.[1]) === "SUS301", "common and per-Part exception values survive the downstream boundary");
const screenshots = ["recognition-desktop.png", "recognition-laptop.png", "recognition-tablet.png", "recognition-mobile.png", "downstream-matrix.png"];
check("I07", screenshots.every((file) => fs.existsSync(path.join(evidenceDir, "screenshots", file))), "responsive and downstream screenshots were captured by the real browser");
check("I08", browser.runtimeDeclaration?.cleanupVerified === true && browser.runtimeDeclaration?.PDM_DATA_DIR && browser.runtimeDeclaration?.PDM_REPOSITORY_DIR, "browser-owned runtime/data cleanup and isolation are recorded");
const report = { runner: "integration", status: "PASS", denominator: 8, checks, sourceBrowserReport: browserReportPath, route: browser.route, navigationPath: browser.navigationPath };
fs.writeFileSync(path.join(evidenceDir, "integration.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log("DEV-110 integration QC PASS (I01-I08)");
