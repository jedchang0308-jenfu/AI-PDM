#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createBlankPolicyConfirmation, getPolicyConfirmationPath } from "./policy-confirmation-utils.mjs";

const root = process.cwd();
const outputPath = getPolicyConfirmationPath(root);
const args = new Set(process.argv.slice(2));
const force = args.has("--force");

function buildMarkdown(confirmation) {
  const lines = [
    "# Formal PDM Policy Confirmation",
    "",
    `Release target: ${confirmation.releaseTarget}`,
    `Policy document: \`${confirmation.policyDocument}\``,
    `Policy version: \`${confirmation.policyVersion}\``,
    `Status: \`${confirmation.status}\``,
    "",
    "## Fill-In Instructions",
    "",
    "1. Review `.ai-doc/reference/pdm-management-policy-draft.md` with management, PDM owner, and QA/QC.",
    "2. For each decision, set `status` to `approved` only after the decision is accepted.",
    "3. Fill `approvedBy`, `approvedAt`, and `evidence` for every approved decision.",
    "4. Fill all required signoffs and set `summary.finalResult` to `approved` only after all required decisions are approved.",
    "5. Run `npm.cmd run qc:policy-confirmation` before production readiness review.",
    "",
    "## Decisions",
    "",
    "| ID | Title | Status | Decision | Approved By | Evidence |",
    "| --- | --- | --- | --- | --- | --- |"
  ];

  for (const decision of confirmation.decisions) {
    lines.push(`| ${decision.id} | ${decision.title} | ${decision.status} | ${decision.decision} | ${decision.approvedBy} | ${decision.evidence} |`);
  }

  lines.push(
    "",
    "## Signoffs",
    "",
    "| Role | Name | Status | Signed At | Evidence |",
    "| --- | --- | --- | --- | --- |"
  );

  for (const signoff of confirmation.signoffs) {
    lines.push(`| ${signoff.role} | ${signoff.name} | ${signoff.status} | ${signoff.signedAt} | ${signoff.evidence} |`);
  }

  lines.push(
    "",
    "## Final Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| finalResult | ${confirmation.summary.finalResult} |`,
    `| signedOffBy | ${confirmation.summary.signedOffBy} |`,
    `| signedOffAt | ${confirmation.summary.signedOffAt} |`,
    `| notes | ${confirmation.summary.notes} |`,
    ""
  );

  return lines.join("\n");
}

if (fs.existsSync(outputPath) && !force) {
  console.error(`Policy confirmation already exists: ${path.relative(root, outputPath)}`);
  console.error("Use --force to overwrite it.");
  process.exit(1);
}

const confirmation = createBlankPolicyConfirmation();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(confirmation, null, 2)}\n`, "utf8");
fs.writeFileSync(outputPath.replace(/\.json$/u, ".md"), buildMarkdown(confirmation), "utf8");

console.log(JSON.stringify({
  output: path.relative(root, outputPath).replaceAll(path.sep, "/"),
  markdown: path.relative(root, outputPath.replace(/\.json$/u, ".md")).replaceAll(path.sep, "/"),
  status: confirmation.status,
  decisions: confirmation.decisions.length,
  signoffs: confirmation.signoffs.length
}, null, 2));
