import fs from "node:fs";
import path from "node:path";
import { getQualityDir } from "./pdm-paths.mjs";

export const BLOCKING_PRIORITIES = new Set(["P0", "P1"]);
export const CLOSED_STATUSES = new Set(["closed", "verified"]);
export const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
export const VALID_STATUSES = new Set(["open", "in_progress", "reopened", "deferred", "closed", "verified"]);

export function getDefectRegisterPath(root = process.cwd()) {
  return path.join(getQualityDir(root), "defect-register.json");
}

export function readDefectRegister(registerPath = getDefectRegisterPath()) {
  return JSON.parse(fs.readFileSync(registerPath, "utf8"));
}

function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateDefectRegister(register) {
  const issues = [];

  if (!register || typeof register !== "object" || Array.isArray(register)) {
    return {
      ready: false,
      issues: [{ type: "invalid_register", detail: "register must be an object" }],
      summary: {
        total: 0,
        activeP0P1: 0,
        closedP0P1: 0,
        byPriority: {},
        byStatus: {}
      }
    };
  }

  if (!isFilled(register.schemaVersion)) {
    issues.push({ type: "missing_field", field: "schemaVersion" });
  }
  if (!isFilled(register.updatedAt)) {
    issues.push({ type: "missing_field", field: "updatedAt" });
  }
  if (!Array.isArray(register.defects)) {
    issues.push({ type: "invalid_field", field: "defects", expected: "array" });
  }

  const defects = Array.isArray(register.defects) ? register.defects : [];
  const ids = new Set();
  const byPriority = {};
  const byStatus = {};
  let activeP0P1 = 0;
  let closedP0P1 = 0;

  defects.forEach((defect, index) => {
    const prefix = `defects[${index}]`;

    if (!defect || typeof defect !== "object" || Array.isArray(defect)) {
      issues.push({ type: "invalid_defect", index });
      return;
    }

    if (!isFilled(defect.id)) {
      issues.push({ type: "missing_defect_field", field: `${prefix}.id` });
    } else if (ids.has(defect.id)) {
      issues.push({ type: "duplicate_defect_id", id: defect.id });
    } else {
      ids.add(defect.id);
    }

    if (!isFilled(defect.title)) {
      issues.push({ type: "missing_defect_field", field: `${prefix}.title`, id: defect.id ?? null });
    }

    if (!VALID_PRIORITIES.has(defect.priority)) {
      issues.push({
        type: "invalid_priority",
        field: `${prefix}.priority`,
        id: defect.id ?? null,
        actual: defect.priority
      });
    }

    if (!VALID_STATUSES.has(defect.status)) {
      issues.push({
        type: "invalid_status",
        field: `${prefix}.status`,
        id: defect.id ?? null,
        actual: defect.status
      });
    }

    if (!isFilled(defect.owner)) {
      issues.push({ type: "missing_defect_field", field: `${prefix}.owner`, id: defect.id ?? null });
    }

    if (!isFilled(defect.evidence)) {
      issues.push({ type: "missing_defect_field", field: `${prefix}.evidence`, id: defect.id ?? null });
    }

    byPriority[defect.priority] = (byPriority[defect.priority] ?? 0) + 1;
    byStatus[defect.status] = (byStatus[defect.status] ?? 0) + 1;

    if (BLOCKING_PRIORITIES.has(defect.priority)) {
      if (CLOSED_STATUSES.has(defect.status)) {
        closedP0P1 += 1;
      } else {
        activeP0P1 += 1;
        issues.push({
          type: "active_blocking_defect",
          id: defect.id ?? null,
          priority: defect.priority,
          status: defect.status ?? null,
          title: defect.title ?? null
        });
      }
    }
  });

  return {
    ready: issues.length === 0 && activeP0P1 === 0,
    issues,
    summary: {
      total: defects.length,
      activeP0P1,
      closedP0P1,
      byPriority,
      byStatus
    }
  };
}

export function evaluateDefectRegister(root = process.cwd()) {
  const registerPath = getDefectRegisterPath(root);

  if (!fs.existsSync(registerPath)) {
    return {
      ready: false,
      registerPath,
      issues: [{ type: "missing_register" }],
      summary: {
        total: 0,
        activeP0P1: 0,
        closedP0P1: 0,
        byPriority: {},
        byStatus: {}
      }
    };
  }

  try {
    const register = readDefectRegister(registerPath);
    return {
      ...validateDefectRegister(register),
      registerPath,
      updatedAt: register.updatedAt ?? null,
      releaseTarget: register.releaseTarget ?? null
    };
  } catch (error) {
    return {
      ready: false,
      registerPath,
      issues: [{
        type: "unreadable_register",
        message: error instanceof Error ? error.message : String(error)
      }],
      summary: {
        total: 0,
        activeP0P1: 0,
        closedP0P1: 0,
        byPriority: {},
        byStatus: {}
      }
    };
  }
}
