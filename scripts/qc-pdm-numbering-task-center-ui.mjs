#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-task-center-ui" });

const taskPage = path.join(root, "src/app/numbering/tasks/page.tsx");
const taskComponent = path.join(root, "src/components/numbering-task-center.tsx");
const sidebar = fs.readFileSync(path.join(root, "src/components/sidebar-nav.tsx"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "src/components/dashboard.tsx"), "utf8");
const permissionMap = fs.readFileSync(path.join(root, "src/lib/numbering-permission-codes.ts"), "utf8");
const productionSlice = fs.readFileSync(path.join(root, "src/lib/production-slice.ts"), "utf8");
const taskContract = fs.readFileSync(path.join(root, "src/lib/numbering-task-center-contract.ts"), "utf8");
const taskApi = fs.readFileSync(path.join(root, "src/app/api/numbering/tasks/route.ts"), "utf8");
record("Standalone numbering task center page is deleted", !fs.existsSync(taskPage), taskPage);
record("Standalone numbering task center component is deleted", !fs.existsSync(taskComponent), taskComponent);
record("Sidebar no longer exposes 待辦與通知", !sidebar.includes("待辦與通知") && !sidebar.includes('href: "/numbering/tasks"'));
record("Dashboard no longer links to the retired page", !dashboard.includes('href="/numbering/tasks"'));
record("Retired page is absent from the permission navigation map", !/^\s*"\/numbering\/tasks":/mu.test(permissionMap));
record("Retired page is absent from the production open-page list", !/^\s*"\/numbering\/tasks",?\s*$/mu.test(productionSlice));
record("Stored task actions cannot target the retired page", !taskContract.includes('"/numbering/tasks"'));
record("Task backend API remains permission-protected", taskApi.includes('requireNumberingPageAsync(request, "numbering.tasks")'));

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results
}, null, 2));
