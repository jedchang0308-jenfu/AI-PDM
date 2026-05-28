import fs from "node:fs";
import path from "node:path";

export const REQUIRED_DECISION_IDS = [
  "POL-001",
  "POL-002",
  "POL-003",
  "POL-004",
  "POL-005",
  "POL-006",
  "POL-007",
  "POL-008"
];

export const REQUIRED_SIGNOFF_ROLES = ["CTO", "PDM Owner", "QA/QC"];

export function getPolicyConfirmationPath(root = process.cwd()) {
  return path.join(root, "data", "quality", "pdm-policy-confirmation.json");
}

export function createBlankPolicyConfirmation(date = new Date()) {
  const updatedAt = date.toISOString();

  return {
    schemaVersion: "1.0",
    releaseTarget: "AI PDM MVP production readiness",
    policyDocument: "docs/pdm-management-policy-draft.md",
    policyVersion: "draft-2026-05-25",
    status: "pending",
    updatedAt,
    decisions: [
      {
        id: "POL-001",
        title: "正式圖號、料號與版次規則",
        status: "pending",
        decision: "確認 drawing_number、part_number、revision 的必填、唯一性與命名規則可作為正式管理辦法。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      },
      {
        id: "POL-002",
        title: "送審必填欄位與變更原因品質門檻",
        status: "pending",
        decision: "確認送審資料、檔案類型、檔案大小與變更原因長度/內容限制。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      },
      {
        id: "POL-003",
        title: "審核角色與權限矩陣",
        status: "pending",
        decision: "確認 Engineer、R&D Manager、Admin 的正式權限邊界與職責。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      },
      {
        id: "POL-004",
        title: "核准人數與發布流程",
        status: "pending",
        decision: "確認 approval_required=1 或 2 的適用條件，以及 Released / Rejected / ReleaseFailed 狀態規則。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      },
      {
        id: "POL-005",
        title: "Google Drive 資料夾與發布目的地",
        status: "pending",
        decision: "確認 Pending / Released folder 的正式管理責任、異動程序與發布目的地。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      },
      {
        id: "POL-006",
        title: "SolidWorks Add-in 現場作業規範",
        status: "pending",
        decision: "確認 Add-in 登入、屬性擷取、PDF/DWG 匯出、送審與錯誤處理流程可作為現場 SOP。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      },
      {
        id: "POL-007",
        title: "備份、還原與資料保留規則",
        status: "pending",
        decision: "確認每日單向快照、checksum、還原演練頻率與保留策略。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      },
      {
        id: "POL-008",
        title: "AI 助手使用邊界",
        status: "pending",
        decision: "確認 AI 助手僅可查詢與說明，不可代替使用者核准、駁回、刪除或修改受控資料。",
        approvedBy: "",
        approvedAt: "",
        evidence: ""
      }
    ],
    signoffs: REQUIRED_SIGNOFF_ROLES.map((role) => ({
      role,
      name: "",
      status: "pending",
      signedAt: "",
      evidence: ""
    })),
    summary: {
      finalResult: "not_ready",
      signedOffBy: "",
      signedOffAt: "",
      notes: ""
    }
  };
}

export function readPolicyConfirmation(confirmationPath = getPolicyConfirmationPath()) {
  return JSON.parse(fs.readFileSync(confirmationPath, "utf8"));
}

function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStatus(value, field, issues, allowed = ["pending", "approved", "rejected", "deferred"]) {
  if (!allowed.includes(value)) {
    issues.push({ type: "invalid_status", field, actual: value, allowed });
  }
}

export function validatePolicyConfirmation(confirmation, root = process.cwd()) {
  const issues = [];

  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) {
    return {
      ready: false,
      issues: [{ type: "invalid_confirmation", detail: "confirmation must be an object" }],
      summary: {
        totalDecisions: 0,
        approvedDecisions: 0,
        totalSignoffs: 0,
        approvedSignoffs: 0
      }
    };
  }

  if (!isFilled(confirmation.schemaVersion)) issues.push({ type: "missing_field", field: "schemaVersion" });
  if (!isFilled(confirmation.releaseTarget)) issues.push({ type: "missing_field", field: "releaseTarget" });
  if (!isFilled(confirmation.policyDocument)) issues.push({ type: "missing_field", field: "policyDocument" });
  if (!isFilled(confirmation.policyVersion)) issues.push({ type: "missing_field", field: "policyVersion" });
  if (!isFilled(confirmation.updatedAt)) issues.push({ type: "missing_field", field: "updatedAt" });
  validateStatus(confirmation.status, "status", issues);

  if (isFilled(confirmation.policyDocument)) {
    const policyPath = path.join(root, confirmation.policyDocument);
    if (!fs.existsSync(policyPath)) {
      issues.push({ type: "missing_policy_document", field: "policyDocument", path: confirmation.policyDocument });
    }
  }

  const decisions = Array.isArray(confirmation.decisions) ? confirmation.decisions : [];
  if (!Array.isArray(confirmation.decisions)) {
    issues.push({ type: "invalid_field", field: "decisions", expected: "array" });
  }

  const decisionsById = new Map();
  decisions.forEach((decision, index) => {
    const prefix = `decisions[${index}]`;
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      issues.push({ type: "invalid_decision", index });
      return;
    }

    if (!isFilled(decision.id)) issues.push({ type: "missing_decision_field", field: `${prefix}.id` });
    if (!isFilled(decision.title)) issues.push({ type: "missing_decision_field", field: `${prefix}.title`, id: decision.id ?? null });
    if (!isFilled(decision.decision)) issues.push({ type: "missing_decision_field", field: `${prefix}.decision`, id: decision.id ?? null });
    validateStatus(decision.status, `${prefix}.status`, issues);

    if (isFilled(decision.id)) {
      if (decisionsById.has(decision.id)) {
        issues.push({ type: "duplicate_decision_id", id: decision.id });
      }
      decisionsById.set(decision.id, decision);
    }

    if (decision.status !== "approved") {
      issues.push({ type: "decision_not_approved", id: decision.id ?? null, status: decision.status ?? null });
    } else {
      if (!isFilled(decision.approvedBy)) issues.push({ type: "missing_decision_approval", field: `${prefix}.approvedBy`, id: decision.id ?? null });
      if (!isFilled(decision.approvedAt)) issues.push({ type: "missing_decision_approval", field: `${prefix}.approvedAt`, id: decision.id ?? null });
      if (!isFilled(decision.evidence)) issues.push({ type: "missing_decision_approval", field: `${prefix}.evidence`, id: decision.id ?? null });
    }
  });

  for (const requiredId of REQUIRED_DECISION_IDS) {
    if (!decisionsById.has(requiredId)) {
      issues.push({ type: "missing_required_decision", id: requiredId });
    }
  }

  const signoffs = Array.isArray(confirmation.signoffs) ? confirmation.signoffs : [];
  if (!Array.isArray(confirmation.signoffs)) {
    issues.push({ type: "invalid_field", field: "signoffs", expected: "array" });
  }

  const signoffsByRole = new Map();
  signoffs.forEach((signoff, index) => {
    const prefix = `signoffs[${index}]`;
    if (!signoff || typeof signoff !== "object" || Array.isArray(signoff)) {
      issues.push({ type: "invalid_signoff", index });
      return;
    }

    if (!isFilled(signoff.role)) issues.push({ type: "missing_signoff_field", field: `${prefix}.role` });
    validateStatus(signoff.status, `${prefix}.status`, issues);

    if (isFilled(signoff.role)) {
      if (signoffsByRole.has(signoff.role)) {
        issues.push({ type: "duplicate_signoff_role", role: signoff.role });
      }
      signoffsByRole.set(signoff.role, signoff);
    }

    if (signoff.status !== "approved") {
      issues.push({ type: "signoff_not_approved", role: signoff.role ?? null, status: signoff.status ?? null });
    } else {
      if (!isFilled(signoff.name)) issues.push({ type: "missing_signoff_approval", field: `${prefix}.name`, role: signoff.role ?? null });
      if (!isFilled(signoff.signedAt)) issues.push({ type: "missing_signoff_approval", field: `${prefix}.signedAt`, role: signoff.role ?? null });
      if (!isFilled(signoff.evidence)) issues.push({ type: "missing_signoff_approval", field: `${prefix}.evidence`, role: signoff.role ?? null });
    }
  });

  for (const requiredRole of REQUIRED_SIGNOFF_ROLES) {
    if (!signoffsByRole.has(requiredRole)) {
      issues.push({ type: "missing_required_signoff", role: requiredRole });
    }
  }

  if (confirmation.summary?.finalResult !== "approved") {
    issues.push({ type: "summary_not_approved", field: "summary.finalResult", actual: confirmation.summary?.finalResult ?? null });
  }
  if (!isFilled(confirmation.summary?.signedOffBy)) issues.push({ type: "missing_summary_signoff", field: "summary.signedOffBy" });
  if (!isFilled(confirmation.summary?.signedOffAt)) issues.push({ type: "missing_summary_signoff", field: "summary.signedOffAt" });

  const approvedDecisions = decisions.filter((decision) => decision?.status === "approved").length;
  const approvedSignoffs = signoffs.filter((signoff) => signoff?.status === "approved").length;

  return {
    ready: issues.length === 0,
    issues,
    summary: {
      totalDecisions: decisions.length,
      approvedDecisions,
      totalSignoffs: signoffs.length,
      approvedSignoffs
    }
  };
}

export function evaluatePolicyConfirmation(root = process.cwd()) {
  const confirmationPath = getPolicyConfirmationPath(root);

  if (!fs.existsSync(confirmationPath)) {
    return {
      ready: false,
      confirmationPath,
      issues: [{ type: "missing_confirmation" }],
      summary: {
        totalDecisions: 0,
        approvedDecisions: 0,
        totalSignoffs: 0,
        approvedSignoffs: 0
      }
    };
  }

  try {
    const confirmation = readPolicyConfirmation(confirmationPath);
    return {
      ...validatePolicyConfirmation(confirmation, root),
      confirmationPath,
      status: confirmation.status ?? null,
      policyDocument: confirmation.policyDocument ?? null,
      policyVersion: confirmation.policyVersion ?? null,
      updatedAt: confirmation.updatedAt ?? null
    };
  } catch (error) {
    return {
      ready: false,
      confirmationPath,
      issues: [{
        type: "unreadable_confirmation",
        message: error instanceof Error ? error.message : String(error)
      }],
      summary: {
        totalDecisions: 0,
        approvedDecisions: 0,
        totalSignoffs: 0,
        approvedSignoffs: 0
      }
    };
  }
}
