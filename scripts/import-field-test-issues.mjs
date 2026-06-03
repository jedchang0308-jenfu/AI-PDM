#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  CLOSED_STATUSES,
  VALID_PRIORITIES,
  VALID_STATUSES,
  getDefectRegisterPath,
  readDefectRegister,
  validateDefectRegister
} from "./defect-register-utils.mjs";
import { resolveUserPath } from "./pdm-paths.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const issuePath = resolveUserPath(root, args.issues);
const registerPath = args.register ? resolveUserPath(root, args.register) : getDefectRegisterPath(root);
const now = new Date().toISOString();

function parseArgs(argv) {
  const parsed = {
    issues: "",
    register: "",
    write: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--issues") parsed.issues = argv[++index] ?? "";
    else if (arg === "--register") parsed.register = argv[++index] ?? "";
    else if (arg === "--write") parsed.write = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!parsed.issues) {
    console.error("Missing required --issues <field-issues.json> argument.");
    process.exit(1);
  }

  return parsed;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeSteps(value) {
  if (Array.isArray(value)) {
    return value.map((step) => String(step).trim()).filter(Boolean);
  }
  if (isFilled(value)) {
    return String(value)
      .split(/\r?\n/u)
      .map((step) => step.trim())
      .filter(Boolean);
  }
  return [];
}

function validateIssueBundle(bundle) {
  const issues = [];

  if (!isObject(bundle)) {
    return [{ type: "invalid_issue_bundle", detail: "bundle must be an object" }];
  }

  if (!isFilled(bundle.schemaVersion)) {
    issues.push({ type: "missing_field", field: "schemaVersion" });
  }
  if (!isFilled(bundle.fieldTestId)) {
    issues.push({ type: "missing_field", field: "fieldTestId" });
  }
  if (!isFilled(bundle.source)) {
    issues.push({ type: "missing_field", field: "source" });
  }
  if (!Array.isArray(bundle.issues)) {
    issues.push({ type: "invalid_field", field: "issues", expected: "array" });
    return issues;
  }

  const ids = new Set();
  const defectIds = new Set();

  bundle.issues.forEach((issue, index) => {
    const prefix = `issues[${index}]`;
    if (!isObject(issue)) {
      issues.push({ type: "invalid_issue", index });
      return;
    }

    if (!isFilled(issue.id)) {
      issues.push({ type: "missing_issue_field", field: `${prefix}.id` });
    } else if (ids.has(issue.id)) {
      issues.push({ type: "duplicate_issue_id", id: issue.id });
    } else {
      ids.add(issue.id);
    }

    const defectId = isFilled(issue.defectId) ? issue.defectId.trim() : issue.id;
    if (isFilled(defectId) && defectIds.has(defectId)) {
      issues.push({ type: "duplicate_defect_id", id: defectId });
    } else if (isFilled(defectId)) {
      defectIds.add(defectId);
    }

    if (!isFilled(issue.title)) {
      issues.push({ type: "missing_issue_field", field: `${prefix}.title`, id: issue.id ?? null });
    }
    if (!VALID_PRIORITIES.has(issue.priority)) {
      issues.push({ type: "invalid_priority", field: `${prefix}.priority`, id: issue.id ?? null, actual: issue.priority });
    }
    if (!VALID_STATUSES.has(issue.status)) {
      issues.push({ type: "invalid_status", field: `${prefix}.status`, id: issue.id ?? null, actual: issue.status });
    }
    if (!isFilled(issue.owner)) {
      issues.push({ type: "missing_issue_field", field: `${prefix}.owner`, id: issue.id ?? null });
    }
    if (!isFilled(issue.evidence)) {
      issues.push({ type: "missing_issue_field", field: `${prefix}.evidence`, id: issue.id ?? null });
    }

    const activeBlocking = ["P0", "P1"].includes(issue.priority) && !CLOSED_STATUSES.has(issue.status);
    if (activeBlocking) {
      const reproductionSteps = normalizeSteps(issue.reproductionSteps);
      if (reproductionSteps.length === 0) {
        issues.push({ type: "missing_blocking_reproduction_steps", field: `${prefix}.reproductionSteps`, id: issue.id ?? null });
      }
      if (!isFilled(issue.expected)) {
        issues.push({ type: "missing_blocking_issue_field", field: `${prefix}.expected`, id: issue.id ?? null });
      }
      if (!isFilled(issue.actual)) {
        issues.push({ type: "missing_blocking_issue_field", field: `${prefix}.actual`, id: issue.id ?? null });
      }
    }
  });

  return issues;
}

function toDefect(bundle, issue, existingDefect = null) {
  const defectId = isFilled(issue.defectId) ? issue.defectId.trim() : issue.id.trim();
  return {
    ...(existingDefect ?? {}),
    id: defectId,
    title: issue.title.trim(),
    priority: issue.priority,
    status: issue.status,
    owner: issue.owner.trim(),
    evidence: issue.evidence.trim(),
    source: "field_test",
    sourceTask: issue.sourceTask ?? "DEV-FIELD-001",
    fieldTestId: bundle.fieldTestId,
    fieldIssueId: issue.id,
    reproductionSteps: normalizeSteps(issue.reproductionSteps),
    expected: issue.expected ?? "",
    actual: issue.actual ?? "",
    environment: issue.environment ?? "",
    relatedEvidence: Array.isArray(issue.relatedEvidence) ? issue.relatedEvidence : [],
    updatedAt: now,
    createdAt: existingDefect?.createdAt ?? now
  };
}

function comparableDefect(defect) {
  const { createdAt, updatedAt, ...rest } = defect;
  return rest;
}

function defectsEqual(left, right) {
  return JSON.stringify(comparableDefect(left)) === JSON.stringify(comparableDefect(right));
}

function mergeDefects(register, bundle) {
  const defects = Array.isArray(register.defects) ? [...register.defects] : [];
  const byId = new Map(defects.map((defect, index) => [defect.id, { defect, index }]));
  const imported = [];
  const updated = [];
  const unchanged = [];

  for (const issue of bundle.issues) {
    const defectId = isFilled(issue.defectId) ? issue.defectId.trim() : issue.id.trim();
    const existing = byId.get(defectId);
    const nextDefect = toDefect(bundle, issue, existing?.defect ?? null);

    if (!existing) {
      defects.push(nextDefect);
      byId.set(defectId, { defect: nextDefect, index: defects.length - 1 });
      imported.push(defectId);
      continue;
    }

    if (defectsEqual(existing.defect, nextDefect)) {
      unchanged.push(defectId);
      continue;
    }

    defects[existing.index] = nextDefect;
    byId.set(defectId, { defect: nextDefect, index: existing.index });
    updated.push(defectId);
  }

  return {
    register: {
      ...register,
      schemaVersion: register.schemaVersion ?? "1.0",
      updatedAt: imported.length > 0 || updated.length > 0 ? now : register.updatedAt,
      defects
    },
    imported,
    updated,
    unchanged
  };
}

function fatalRegisterIssues(validation) {
  const allowedReadinessIssues = new Set(["active_blocking_defect"]);
  return validation.issues.filter((issue) => !allowedReadinessIssues.has(issue.type));
}

if (!fs.existsSync(issuePath)) {
  console.error(`Field issue file not found: ${path.relative(root, issuePath)}`);
  process.exit(1);
}
if (!fs.existsSync(registerPath)) {
  console.error(`Defect register not found: ${path.relative(root, registerPath)}`);
  process.exit(1);
}

let bundle;
let register;
try {
  bundle = readJson(issuePath);
  register = readDefectRegister(registerPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const bundleIssues = validateIssueBundle(bundle);
if (bundleIssues.length > 0) {
  console.log(JSON.stringify({
    ready: false,
    dryRun: !args.write,
    issuePath: path.relative(root, issuePath).replaceAll(path.sep, "/"),
    registerPath: path.relative(root, registerPath).replaceAll(path.sep, "/"),
    imported: [],
    updated: [],
    unchanged: [],
    issues: bundleIssues
  }, null, 2));
  process.exit(1);
}

const merged = mergeDefects(register, bundle);
const validation = validateDefectRegister(merged.register);
const fatalIssues = fatalRegisterIssues(validation);

if (fatalIssues.length === 0 && args.write && (merged.imported.length > 0 || merged.updated.length > 0)) {
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });
  fs.writeFileSync(registerPath, `${JSON.stringify(merged.register, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  ready: validation.ready,
  dryRun: !args.write,
  written: args.write && fatalIssues.length === 0 && (merged.imported.length > 0 || merged.updated.length > 0),
  issuePath: path.relative(root, issuePath).replaceAll(path.sep, "/"),
  registerPath: path.relative(root, registerPath).replaceAll(path.sep, "/"),
  imported: merged.imported,
  updated: merged.updated,
  unchanged: merged.unchanged,
  summary: validation.summary,
  issues: validation.issues
}, null, 2));

if (fatalIssues.length > 0) {
  process.exitCode = 1;
}
