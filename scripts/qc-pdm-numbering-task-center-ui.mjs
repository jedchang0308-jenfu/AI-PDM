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
const sidebar = fs.readFileSync(path.join(root, "src/components/sidebar-nav.tsx"), "utf8");
record("Standalone numbering task center page is deleted", !fs.existsSync(taskPage), taskPage);
record("Sidebar no longer exposes 我的待辦", !sidebar.includes("我的待辦") && !sidebar.includes('href: "/numbering/tasks"'));

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results
}, null, 2));
