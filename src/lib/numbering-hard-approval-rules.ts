export type HardApprovalRuleInput = {
  actionCode: string;
  recordStatus?: string;
  itemKind?: string | null;
  riskFlags?: string[];
  ruleVersionId?: string;
};

export type HardApprovalRule = {
  code: string;
  message: string;
  requiresApproval: boolean;
  blocksUsage: boolean;
  blocksRelease: boolean;
  showsWarning: boolean;
  exportMarker: boolean;
};

export function evaluateHardApprovalRules(input: HardApprovalRuleInput, riskFlags: Set<string>): HardApprovalRule[] {
  const hardRules: HardApprovalRule[] = [];
  const addHardRule = (rule: HardApprovalRule) => hardRules.push(rule);

  if (riskFlags.has("duplicate_code")) {
    addHardRule({
      code: "DUPLICATE_CODE_HARD_BLOCK",
      message: "Root code, part number, and drawing number uniqueness cannot be overridden.",
      requiresApproval: false,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }

  if (riskFlags.has("multiple_primary_ma")) {
    addHardRule({
      code: "PRIMARY_MA_UNIQUENESS_HARD_BLOCK",
      message: "A part number can have only one primary MA drawing.",
      requiresApproval: false,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }

  if (riskFlags.has("released_document_unrevised") || riskFlags.has("released_document_blocker")) {
    addHardRule({
      code: "RELEASED_DOCUMENT_REVISION_REQUIRED",
      message: "Released affected documents must be revised before this action can be released.",
      requiresApproval: false,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }

  if (riskFlags.has("main_drawing_invalid")) {
    addHardRule({
      code: "MAIN_DRAWING_INVALID_REVIEW_REQUIRED",
      message: "A MainDrawingInvalid part must pass restore approval before it becomes usable.",
      requiresApproval: true,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }

  if (riskFlags.has("missing_primary_ma") && input.itemKind === "manufactured") {
    addHardRule({
      code: "PRIMARY_MA_REQUIRED_FOR_CONTROLLED_HANDOFF",
      message: "Technical transfer or release of drawing-made items requires a primary manufacturing drawing.",
      requiresApproval: true,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }

  if (input.actionCode.includes("override") || riskFlags.has("has_override")) {
    addHardRule({
      code: "OVERRIDE_AUDIT_MARKER_REQUIRED",
      message: "Every override must be audited and marked in UI/export output.",
      requiresApproval: input.actionCode.includes("override"),
      blocksUsage: false,
      blocksRelease: false,
      showsWarning: true,
      exportMarker: true
    });
  }

  if (riskFlags.has("high_similarity")) {
    addHardRule({
      code: "HIGH_SIMILARITY_WARNING_ONLY",
      message: "High-similarity numbering matches should warn users but not block numbering.",
      requiresApproval: false,
      blocksUsage: false,
      blocksRelease: false,
      showsWarning: true,
      exportMarker: false
    });
  }

  return hardRules;
}
