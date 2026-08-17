#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const contract = read("src/lib/pdm-entity-detail-contract.ts");
const resolver = read("src/lib/pdm-detail-action-resolver.ts");
const capabilities = read("src/lib/pdm-detail-action-capabilities.ts");
const service = read("src/lib/pdm-entity-detail.ts");
const route = read("src/app/api/pdm/entity-details/[entityKey]/route.ts");
const drawer = read("src/components/unified-pdm-entity-detail-drawer.tsx");
const control = read("src/components/pdm-detail-action-control.tsx");
const css = read("src/app/globals.css");
const approval = read("src/app/approvals/page.tsx");
const drawing = read("src/components/drawing-workbench.tsx");
const part = read("src/components/part-workbench.tsx");
const relation = read("src/components/relation-workbench.tsx");
const browser = read("scripts/qc-dev-072-browser.mjs");

assert.match(contract, /schemaVersion: "pdm-entity-detail\.v2"/);
for (const field of ["group", "order", "disabledReasonCode", "permissionCode", "contactRole", "execution"]) assert.match(contract, new RegExp(`${field}:`));
assert.match(contract, /primary: PdmDetailActionDescriptor \| null/);
assert.match(contract, /\| "manage_files"/);
assert.doesNotMatch(contract.slice(contract.indexOf("export type PdmDetailActionDescriptor"), contract.indexOf("export type ContextActionBarModel")), /href: string \| null|commandRef/);
assert.match(service, /resolvePdmDetailActions/);
assert.match(route, /resolvePdmDetailActionCapabilities/);
assert.match(capabilities, /Promise\.all/);
for (const permission of ["numbering.workspace.update", "numbering.draft.update", "numbering.candidate.review.submit", "numbering.candidate.review.withdraw", "numbering.publish", "post_release_change", "numbering.attachments.manage", "numbering.link_variant", "settings.admin_matrix"]) assert.match(capabilities, new RegExp(permission.replaceAll(".", "\\.")));
assert.match(resolver, /groupOrder/);
assert.match(resolver, /actions\.sort/);
assert.match(resolver, /execution: locked \? null : input\.execution/);
assert.match(resolver, /detail:\$\{input\.owner\}:\$\{input\.kind\}/);
assert.match(control, /aria-disabled/);
assert.match(control, /aria-describedby/);
assert.match(control, /data-action-id/);
assert.match(control, /data-action-group/);
assert.match(control, /data-action-order/);
assert.match(control, /setTimeout\(\(\) => setTooltipOpen\(true\), 300\)/);
assert.match(control, /pointerdown/);
assert.match(control, /event\.key === "Escape"/);
assert.doesNotMatch(control, /\sdisabled=/);
assert.match(css, /\.pdm-detail-action-control\.is-locked/);
assert.doesNotMatch(css, /\.pdm-detail-action-control[^{}]*\{[^}]*display:\s*none/s);
assert.doesNotMatch(drawer, /primaryContextAction|showOwnerNavigation|commandRef|action\.href/);
assert.doesNotMatch(drawing, /primaryContextAction|unifiedPrimaryAction/);
for (const source of [drawing, part, relation, approval]) {
  assert.match(source, /UnifiedPdmEntityDetailDrawer/);
  assert.doesNotMatch(source, /primaryContextAction=/);
}
assert.match(drawer, /detail\?\.actionBar/);
assert.match(drawer, /action\.execution\.type !== "command"/);
assert.doesNotMatch(drawer, /action\.kind === "approve"|action\.kind === "reject"|action\.kind === "return_for_correction"/);
assert.match(browser, /execFileSync\("git"/);
assert.match(browser, /gitText\(\["rev-parse", "HEAD"\]\)/);
assert.match(browser, /dirtyHashAlgorithm/);
assert.match(browser, /scopedSourceHash/);
assert.match(browser, /scopedFiles: provenanceSourceFiles/);
assert.match(browser, /transientNextEnvLock/);
assert.match(browser, /attempt <= 3/);

console.log("QC DEV-072 action contract: PASS (v2 server truth, stable inventory, no client override, accessible locked control)");
