import { getStatusDisplay, type StatusDisplayContext, type StatusTone } from "@/lib/status-display";

export type StatusVisibilityLevel = "primary" | "exception" | "detail" | "hidden";

export type StatusSurface =
  | "list"
  | "card"
  | "drawer_header"
  | "detail"
  | "form"
  | "audit"
  | "public_readonly";

export type StatusSignalInput = {
  id: string;
  context: StatusDisplayContext;
  raw: string | null;
  isPrimaryAxis: boolean;
  duplicateOfPrimary?: boolean;
  affectsCurrentAction?: boolean;
  supportsComparison?: boolean;
  securityRelevant?: boolean;
  /** Server-owned flags may be supplied when the shared dictionary cannot infer the exact risk. */
  conflict?: boolean;
  missingRequired?: boolean;
  permissionLoss?: boolean;
  label?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
};

export type StatusVisibilityProjection = {
  id: string;
  context: StatusDisplayContext;
  raw: string | null;
  level: StatusVisibilityLevel;
  severity: "critical" | "blocking" | "action_required" | "informational" | "normal";
  label: string;
  description: string;
  reason: string;
  tone: StatusTone;
  actionable: boolean;
  actionHref?: string;
  actionLabel?: string;
};

export type StatusVisibilityAggregate = {
  primary: StatusVisibilityProjection | null;
  exception: StatusVisibilityProjection | null;
  exceptions: StatusVisibilityProjection[];
  details: StatusVisibilityProjection[];
  hidden: StatusVisibilityProjection[];
};

const severityRank: Record<StatusVisibilityProjection["severity"], number> = {
  critical: 5,
  blocking: 4,
  action_required: 3,
  informational: 2,
  normal: 1
};

const failureWords = /failed|failure|error|blocked|rejected|missing|conflict|forbidden|unauthori[sz]ed|expired|stale|invalid/i;
const normalWords = /complete|completed|valid|available|synced|uploaded|accepted|corrected|mapped|ignored|confirmed|success/i;

function unknownDisplay(display: ReturnType<typeof getStatusDisplay>) {
  return display.label === "未分類狀態";
}

function signalSeverity(signal: StatusSignalInput, display: ReturnType<typeof getStatusDisplay>): StatusVisibilityProjection["severity"] {
  if (signal.securityRelevant || signal.permissionLoss) return "critical";
  if (signal.conflict) return "critical";
  if (signal.missingRequired) return "blocking";
  if (display.tone === "critical" || failureWords.test(display.raw) || display.abnormal) return "blocking";
  if (signal.affectsCurrentAction || display.actionable) return "action_required";
  if (display.tone === "info" || display.tone === "warning") return "informational";
  return "normal";
}

function safeReason(signal: StatusSignalInput, display: ReturnType<typeof getStatusDisplay>, severity: StatusVisibilityProjection["severity"]) {
  if (unknownDisplay(display)) return "unregistered_status";
  if (signal.securityRelevant) return "security_relevant";
  if (signal.permissionLoss) return "permission_loss";
  if (signal.conflict) return "data_conflict";
  if (signal.missingRequired) return "missing_required_evidence";
  if (display.abnormal || failureWords.test(display.raw)) return "abnormal_or_failed";
  if (signal.duplicateOfPrimary) return "duplicate_of_primary";
  if (signal.isPrimaryAxis) return "primary_axis";
  if (severity === "action_required") return "action_required";
  if (display.terminal) return "terminal_result";
  if (normalWords.test(display.raw) || display.tone === "success") return "normal_or_success";
  return "supporting_detail";
}

/**
 * Projects one server-owned status signal into a display layer. This function
 * only controls visibility and copy; it never grants an action or changes a
 * domain state.
 */
export function projectStatusVisibility(signal: StatusSignalInput, surface: StatusSurface = "list"): StatusVisibilityProjection {
  const display = getStatusDisplay(signal.raw, signal.context);
  const severity = signalSeverity(signal, display);
  const label = signal.label?.trim() || display.label;
  const description = signal.description?.trim() || display.description;
  const effectiveRaw = signal.raw ?? "";

  // Unknown values fail closed. Raw machine codes are never emitted as UI copy.
  if (unknownDisplay(display)) {
    return {
      id: signal.id,
      context: signal.context,
      raw: signal.raw,
      level: "exception",
      severity: "blocking",
      label: "待確認",
      description: "系統收到尚未註冊的狀態，請管理員確認後再繼續。",
      reason: "unregistered_status",
      tone: "critical",
      actionable: true,
      actionHref: signal.actionHref,
      actionLabel: signal.actionLabel
    };
  }

  // Audit and public read-only surfaces keep explicit failures and security
  // messages visible; they may not be reduced to a hover-only detail.
  if (signal.securityRelevant || signal.permissionLoss || signal.conflict || signal.missingRequired) {
    return { id: signal.id, context: signal.context, raw: signal.raw, level: "exception", severity, label, description, reason: safeReason(signal, display, severity), tone: display.tone, actionable: true, actionHref: signal.actionHref, actionLabel: signal.actionLabel };
  }

  if (signal.isPrimaryAxis) {
    return { id: signal.id, context: signal.context, raw: signal.raw, level: "primary", severity, label, description, reason: safeReason(signal, display, severity), tone: display.tone, actionable: Boolean(display.actionable), actionHref: signal.actionHref, actionLabel: signal.actionLabel };
  }

  if (signal.duplicateOfPrimary) {
    return { id: signal.id, context: signal.context, raw: signal.raw, level: "hidden", severity: "normal", label, description, reason: "duplicate_of_primary", tone: display.tone, actionable: false, actionHref: signal.actionHref, actionLabel: signal.actionLabel };
  }

  if ((display.abnormal || display.actionable || failureWords.test(effectiveRaw)) && signal.affectsCurrentAction !== false) {
    return { id: signal.id, context: signal.context, raw: signal.raw, level: "exception", severity, label, description, reason: safeReason(signal, display, severity), tone: display.tone, actionable: true, actionHref: signal.actionHref, actionLabel: signal.actionLabel };
  }

  if (display.terminal && (surface === "audit" || surface === "public_readonly")) {
    return { id: signal.id, context: signal.context, raw: signal.raw, level: "detail", severity: "informational", label, description, reason: "terminal_result", tone: display.tone, actionable: false, actionHref: signal.actionHref, actionLabel: signal.actionLabel };
  }

  if (display.tone === "success" || normalWords.test(effectiveRaw)) {
    return { id: signal.id, context: signal.context, raw: signal.raw, level: signal.supportsComparison ? "detail" : "hidden", severity: "normal", label, description, reason: safeReason(signal, display, "normal"), tone: display.tone, actionable: false, actionHref: signal.actionHref, actionLabel: signal.actionLabel };
  }

  return { id: signal.id, context: signal.context, raw: signal.raw, level: "detail", severity, label, description, reason: safeReason(signal, display, severity), tone: display.tone, actionable: Boolean(display.actionable), actionHref: signal.actionHref, actionLabel: signal.actionLabel };
}

function compareProjection(a: StatusVisibilityProjection, b: StatusVisibilityProjection) {
  return severityRank[b.severity] - severityRank[a.severity] || a.label.localeCompare(b.label, "zh-Hant") || a.id.localeCompare(b.id);
}

/** Applies the one-primary plus one-representative-exception capacity rule. */
export function projectStatusSignals(signals: readonly StatusSignalInput[], surface: StatusSurface = "list"): StatusVisibilityAggregate {
  const projections = signals.map((signal) => projectStatusVisibility(signal, surface));
  const primary = projections.find((projection) => projection.level === "primary") ?? null;
  const exceptions = projections.filter((projection) => projection.level === "exception").sort(compareProjection);
  const details = projections.filter((projection) => projection.level === "detail").sort(compareProjection);
  const hidden = projections.filter((projection) => projection.level === "hidden");
  return { primary, exception: exceptions[0] ?? null, exceptions, details, hidden };
}

export function statusSeverityRank(value: StatusVisibilityProjection["severity"]) {
  return severityRank[value];
}
