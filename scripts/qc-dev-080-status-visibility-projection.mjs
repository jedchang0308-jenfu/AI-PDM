#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  projectStatusSignals,
  projectStatusVisibility
} from "../src/lib/status-visibility-policy.ts";

const results = [];
function check(id, actual, expected) {
  assert.deepEqual(actual, expected, `${id}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  results.push({ id, passed: true });
}

const primary = projectStatusVisibility({ id: "primary", context: "masterRecord", raw: "Draft", isPrimaryAxis: true }, "list");
const missing = projectStatusVisibility({ id: "missing", context: "fileStatus", raw: "missing", isPrimaryAxis: false, affectsCurrentAction: true, missingRequired: true, label: "缺製造圖" }, "list");
const duplicate = projectStatusVisibility({ id: "complete", context: "readinessStatus", raw: "Ready", isPrimaryAxis: false, duplicateOfPrimary: true }, "list");
const unknown = projectStatusVisibility({ id: "unknown", context: "generic", raw: "future_machine_code", isPrimaryAxis: false }, "list");
const success = projectStatusVisibility({ id: "success", context: "fileSync", raw: "valid", isPrimaryAxis: false }, "list");
const comparable = projectStatusVisibility({ id: "comparable", context: "fileSync", raw: "valid", isPrimaryAxis: false, supportsComparison: true }, "list");

check("VIS-01-primary", primary.level, "primary");
check("VIS-01-primary-label", primary.label, "未發布");
check("VIS-02-critical-required", missing.level, "exception");
check("VIS-02-critical-label", missing.label, "缺製造圖");
check("VIS-03-duplicate-hidden", duplicate.level, "hidden");
check("VIS-04-unknown-fail-closed", unknown.level, "exception");
check("VIS-04-unknown-safe-label", unknown.label, "待確認");
check("VIS-04-no-raw-code", unknown.description.includes("future_machine_code"), false);
check("VIS-05-normal-hidden", success.level, "hidden");
check("VIS-05-comparable-detail", comparable.level, "detail");

const aggregate = projectStatusSignals([
  { id: "primary", context: "masterRecord", raw: "Draft", isPrimaryAxis: true },
  { id: "info", context: "reminderStatus", raw: "info", isPrimaryAxis: false, affectsCurrentAction: false },
  { id: "blocking", context: "readinessStatus", raw: "Blocked", isPrimaryAxis: false, affectsCurrentAction: true },
  { id: "critical", context: "fileSync", raw: "conflict", isPrimaryAxis: false, conflict: true, affectsCurrentAction: true },
  { id: "duplicate", context: "readinessStatus", raw: "Ready", isPrimaryAxis: false, duplicateOfPrimary: true }
], "list");

check("VIS-06-one-primary", aggregate.primary?.id, "primary");
check("VIS-06-severity-order", aggregate.exception?.id, "critical");
check("VIS-06-all-exceptions-retained", aggregate.exceptions.length, 2);
check("VIS-06-detail-retained", aggregate.details.length, 1);
check("VIS-06-hidden-retained", aggregate.hidden.length, 1);

console.log(JSON.stringify({ suite: "DEV-080 status visibility projection", passed: results.length, failed: 0, results }, null, 2));

