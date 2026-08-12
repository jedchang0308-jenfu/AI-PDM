export type SubmissionMode = "research" | "technical_transfer";
export type SubmissionGatePhase = "phase1_local_slice" | "future_package_workflow";
export type SubmissionCaseType = "development_case" | "design_change_case" | "standard_review";
export type SubmissionReadinessFieldState = "required" | "warning" | "optional" | "not_applicable";
export type SubmissionGateOwnerRole = "RD" | "RD Manager" | "Manufacturing" | "Procurement" | "QA/QC" | "PDM Admin";

export type SubmissionGateFieldCode =
  | "submission_mode"
  | "package_context"
  | "source_identity"
  | "reviewable_attachment"
  | "material"
  | "procurement_signoff"
  | "prototype_notes";

export type SubmissionGateBlocker = {
  field: SubmissionGateFieldCode;
  fieldLabel: string;
  ownerRole: SubmissionGateOwnerRole;
  blockerCode: string;
  remediationRoute: string;
  message: string;
  state: "required";
};

export type SubmissionGateFieldResult = {
  field: SubmissionGateFieldCode;
  label: string;
  state: SubmissionReadinessFieldState;
  ownerRole: SubmissionGateOwnerRole;
  satisfied: boolean;
  blockerCode?: string;
  remediationRoute?: string;
  message: string;
};

export type SubmissionRuleSet = {
  id: string;
  version: string;
  status: "active";
  phase: SubmissionGatePhase;
  mode: SubmissionMode;
  caseType: SubmissionCaseType;
  states: SubmissionReadinessFieldState[];
  packageRequired: boolean;
  technicalTransferDirectSubmitAllowed: boolean;
  rules: Array<{
    field: SubmissionGateFieldCode;
    label: string;
    state: SubmissionReadinessFieldState;
    ownerRole: SubmissionGateOwnerRole;
    blockerCode?: string;
    remediationRoute?: string;
  }>;
};

export type SubmissionReadinessResolveInput = {
  mode?: string | null;
  phase?: string | null;
  caseType?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  facts?: Record<string, unknown> | null;
};

export type SubmissionReadinessResult = {
  ruleSet: SubmissionRuleSet;
  mode: SubmissionMode;
  phase: SubmissionGatePhase;
  caseType: SubmissionCaseType;
  sourceType: string;
  sourceId: string;
  packageRequired: boolean;
  technicalTransferDirectSubmitAllowed: boolean;
  transferPackageHref: string | null;
  fieldResults: SubmissionGateFieldResult[];
  blockers: SubmissionGateBlocker[];
  warnings: SubmissionGateFieldResult[];
  readinessPassed: boolean;
  submitAllowed: boolean;
};

const activeRuleSetVersion = "submission-gate-v1.2026-07-10.phase1";
const readinessStates: SubmissionReadinessFieldState[] = ["required", "warning", "optional", "not_applicable"];

const fieldLabels: Record<SubmissionGateFieldCode, string> = {
  submission_mode: "送審模式",
  package_context: "技術移轉包",
  source_identity: "來源物件",
  reviewable_attachment: "可審附件",
  material: "材質",
  procurement_signoff: "採購確認",
  prototype_notes: "研發備註"
};

export function normalizeSubmissionMode(value: unknown): SubmissionMode {
  return value === "technical_transfer" ? "technical_transfer" : "research";
}

export function normalizeSubmissionCaseType(value: unknown): SubmissionCaseType {
  if (value === "development_case" || value === "design_change_case") return value;
  return "standard_review";
}

export function getActiveSubmissionRuleSet(input: {
  mode?: string | null;
  phase?: string | null;
  caseType?: string | null;
} = {}): SubmissionRuleSet {
  const mode = normalizeSubmissionMode(input.mode);
  const caseType = normalizeSubmissionCaseType(input.caseType);
  const packageRequired = mode === "technical_transfer";
  return {
    id: activeRuleSetVersion,
    version: activeRuleSetVersion,
    status: "active",
    phase: "phase1_local_slice",
    mode,
    caseType,
    states: readinessStates,
    packageRequired,
    technicalTransferDirectSubmitAllowed: false,
    rules: [
      {
        field: "submission_mode",
        label: fieldLabels.submission_mode,
        state: "required",
        ownerRole: "RD",
        blockerCode: "submission_mode_required",
        remediationRoute: "submission_workbench_mode_selector"
      },
      {
        field: "package_context",
        label: fieldLabels.package_context,
        state: packageRequired ? "required" : "not_applicable",
        ownerRole: "RD Manager",
        blockerCode: "technical_transfer_requires_package",
        remediationRoute: "transfer_package_builder"
      },
      {
        field: "reviewable_attachment",
        label: fieldLabels.reviewable_attachment,
        state: "required",
        ownerRole: "RD",
        blockerCode: "reviewable_attachment_missing",
        remediationRoute: "drawing_attachment_library"
      },
      {
        field: "material",
        label: fieldLabels.material,
        state: mode === "technical_transfer" ? "required" : "optional",
        ownerRole: "RD",
        blockerCode: "material_missing_for_transfer",
        remediationRoute: "part_master_data"
      },
      {
        field: "procurement_signoff",
        label: fieldLabels.procurement_signoff,
        state: mode === "technical_transfer" ? "required" : "not_applicable",
        ownerRole: "Procurement",
        blockerCode: "procurement_signoff_missing_for_transfer",
        remediationRoute: "transfer_package_signoff"
      },
      {
        field: "prototype_notes",
        label: fieldLabels.prototype_notes,
        state: "optional",
        ownerRole: "RD",
        remediationRoute: "submission_workbench_note"
      }
    ]
  };
}

export function resolveSubmissionReadiness(input: SubmissionReadinessResolveInput): SubmissionReadinessResult {
  const mode = normalizeSubmissionMode(input.mode);
  const caseType = normalizeSubmissionCaseType(input.caseType);
  const sourceType = String(input.sourceType ?? "drawing").trim() || "drawing";
  const sourceId = String(input.sourceId ?? "").trim();
  const facts = input.facts ?? {};
  const ruleSet = getActiveSubmissionRuleSet({ mode, caseType });
  const directItemSource = sourceType === "drawing" || sourceType === "part" || sourceType === "root";
  const packageRequired = mode === "technical_transfer";
  const fieldResults: SubmissionGateFieldResult[] = [
    evaluateSourceIdentity(sourceId),
    evaluatePackageContext({ mode, sourceType, sourceId, directItemSource }),
    evaluateReviewableAttachment(facts),
    evaluateMaterial(mode, facts),
    evaluateProcurementSignoff(mode, facts),
    evaluatePrototypeNotes(facts)
  ];
  const blockers = fieldResults
    .filter((field) => field.state === "required" && !field.satisfied)
    .map((field) => ({
      field: field.field,
      fieldLabel: field.label,
      ownerRole: field.ownerRole,
      blockerCode: field.blockerCode ?? `${field.field}_required`,
      remediationRoute: field.remediationRoute ?? "submission_workbench",
      message: field.message,
      state: "required" as const
    }));
  const warnings = fieldResults.filter((field) => field.state === "warning" && !field.satisfied);
  const readinessPassed = blockers.length === 0;
  const technicalTransferDirectSubmitAllowed = mode === "technical_transfer" ? false : true;

  return {
    ruleSet,
    mode,
    phase: "phase1_local_slice",
    caseType,
    sourceType,
    sourceId,
    packageRequired,
    technicalTransferDirectSubmitAllowed,
    transferPackageHref: packageRequired ? buildTransferPackageHref({ sourceType, sourceId, caseType }) : null,
    fieldResults,
    blockers,
    warnings,
    readinessPassed,
    submitAllowed: mode === "research" ? readinessPassed : readinessPassed && !directItemSource
  };
}

export function buildTransferPackageHref(input: {
  sourceType?: string | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  caseType?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("sourceType", String(input.sourceType ?? "drawing").trim() || "drawing");
  const sourceId = String(input.sourceId ?? "").trim();
  if (sourceId) params.set("sourceId", sourceId);
  const sourceLabel = String(input.sourceLabel ?? "").trim();
  if (sourceLabel) params.set("sourceLabel", sourceLabel);
  params.set("caseType", normalizeSubmissionCaseType(input.caseType));
  return `/transfer-packages/new?${params.toString()}`;
}

function evaluateSourceIdentity(sourceId: string): SubmissionGateFieldResult {
  return fieldResult({
    field: "source_identity",
    state: "required",
    ownerRole: "RD",
    satisfied: Boolean(sourceId),
    blockerCode: "source_identity_missing",
    remediationRoute: "numbering_search",
    okMessage: "來源物件已帶入送審規則。",
    missingMessage: "缺少來源圖號或料號，請從圖號/料號模組重新開啟。"
  });
}

function evaluatePackageContext(input: { mode: SubmissionMode; sourceType: string; sourceId: string; directItemSource: boolean }): SubmissionGateFieldResult {
  if (input.mode !== "technical_transfer") {
    return fieldResult({
      field: "package_context",
      state: "not_applicable",
      ownerRole: "RD Manager",
      satisfied: true,
      okMessage: "研發送審不需要技術移轉包。"
    });
  }
  return fieldResult({
    field: "package_context",
    state: "required",
    ownerRole: "RD Manager",
    satisfied: !input.directItemSource && input.sourceType === "transfer_package",
    blockerCode: "technical_transfer_requires_package",
    remediationRoute: "transfer_package_builder",
    okMessage: "技術移轉包 context 已建立。",
    missingMessage: "技術移轉送審必須進入移轉包，不能從單一圖號或料號直接正式送審。"
  });
}

function evaluateReviewableAttachment(facts: Record<string, unknown>): SubmissionGateFieldResult {
  return fieldResult({
    field: "reviewable_attachment",
    state: "required",
    ownerRole: "RD",
    satisfied: factBoolean(facts, "hasReviewableAttachment"),
    blockerCode: "reviewable_attachment_missing",
    remediationRoute: "drawing_attachment_library",
    okMessage: "已存在可審附件。",
    missingMessage: "缺少可審附件，請先回圖號附件庫補齊。"
  });
}

function evaluateMaterial(mode: SubmissionMode, facts: Record<string, unknown>): SubmissionGateFieldResult {
  return fieldResult({
    field: "material",
    state: mode === "technical_transfer" ? "required" : "optional",
    ownerRole: "RD",
    satisfied: mode !== "technical_transfer" || factBoolean(facts, "hasMaterial"),
    blockerCode: "material_missing_for_transfer",
    remediationRoute: "part_master_data",
    okMessage: mode === "technical_transfer" ? "材質已可供移轉審查。" : "研發送審階段材質可先作為補充資料。",
    missingMessage: "技術移轉送審缺少材質，請回料號主資料補齊。"
  });
}

function evaluateProcurementSignoff(mode: SubmissionMode, facts: Record<string, unknown>): SubmissionGateFieldResult {
  if (mode !== "technical_transfer") {
    return fieldResult({
      field: "procurement_signoff",
      state: "not_applicable",
      ownerRole: "Procurement",
      satisfied: true,
      okMessage: "研發送審階段不要求採購確認。"
    });
  }
  return fieldResult({
    field: "procurement_signoff",
    state: "required",
    ownerRole: "Procurement",
    satisfied: factBoolean(facts, "hasProcurementSignoff"),
    blockerCode: "procurement_signoff_missing_for_transfer",
    remediationRoute: "transfer_package_signoff",
    okMessage: "採購確認已納入技術移轉包。",
    missingMessage: "技術移轉送審缺少採購確認，請回移轉包簽核區補齊。"
  });
}

function evaluatePrototypeNotes(facts: Record<string, unknown>): SubmissionGateFieldResult {
  return fieldResult({
    field: "prototype_notes",
    state: "optional",
    ownerRole: "RD",
    satisfied: factBoolean(facts, "hasPrototypeNotes") || !factBoolean(facts, "requiresPrototypeNotes"),
    remediationRoute: "submission_workbench_note",
    okMessage: "研發補充備註已符合目前規則。",
    missingMessage: "研發備註可補充測試或樣機背景，但 Phase 1 不作為硬性阻擋。"
  });
}

function fieldResult(input: {
  field: SubmissionGateFieldCode;
  state: SubmissionReadinessFieldState;
  ownerRole: SubmissionGateOwnerRole;
  satisfied: boolean;
  blockerCode?: string;
  remediationRoute?: string;
  okMessage: string;
  missingMessage?: string;
}): SubmissionGateFieldResult {
  return {
    field: input.field,
    label: fieldLabels[input.field],
    state: input.state,
    ownerRole: input.ownerRole,
    satisfied: input.satisfied,
    blockerCode: input.blockerCode,
    remediationRoute: input.remediationRoute,
    message: input.satisfied ? input.okMessage : input.missingMessage ?? input.okMessage
  };
}

function factBoolean(facts: Record<string, unknown>, key: string) {
  const value = facts[key];
  return value === true || value === "true" || value === 1 || value === "1";
}
