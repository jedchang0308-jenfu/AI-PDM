import crypto from "node:crypto";
import type { NumberingStructureType, StoredPartStructureType } from "@/lib/numbering-structure-type";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { assertPdmReviewScopeWritableAsync, lockPdmEntityScopeAsync } from "@/lib/pdm-review-lock";
import { buildApprovalRuleSummary, withPredictedApprovalControls } from "@/lib/approval-rule-summary";
import {
  NUMBERING_RULE_V1_ID,
  NUMBERING_RULE_V2_ID,
  NUMBERING_RULE_V3_ID,
  assertPurposeAllowedForRule,
  displayDrawingPurposeLabel,
  formatDrawingNumberForRule,
  formatDrawingSequenceForRule,
  formatPartNumberForRule,
  formatPartSequenceForRule,
  formatRootCodeForRule,
  isCompactNumberingRule,
  isManufacturingDrawingPurpose,
  isReferenceDrawingPurpose,
  isV2DrawingNumber,
  isV2PartNumber,
  isV2RootCode,
  isV3DrawingNumber,
  isV3PartNumber,
  isV3RootCode,
  rootCodeToV3Ordinal
} from "@/lib/numbering-identity";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { normalizeProductSeries, productSeriesOptionsFromCoreNames } from "@/lib/numbering-product-series";
import { evaluateHardApprovalRules as evaluateHardApprovalRulesShared } from "@/lib/numbering-hard-approval-rules";
import { lowestAvailableSequence } from "@/lib/numbering-sequence-utils";
import { buildNumberingPartRootLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";
import { UnifiedDrawingAsyncRepository } from "@/lib/repositories/unified-drawing-async-repository";
import { RelationFormalAuthorityRepository } from "@/lib/repositories/relation-formal-authority-async-repository";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import type {
  ApprovalHardRule,
  ApprovalRuleEvaluation,
  AddDrawingAndPartToRootInput,
  AddDrawingAndPartToRootResult,
  AddDrawingNumberInput,
  AddDrawingNumberToRootResult,
  AddPartNumberInput,
  AddPartNumberToRootResult,
  ApplyNumberingRuleTemplateInput,
  DrawingPurposeCode,
  DuplicateCheckInput,
  DuplicateCheckMatch,
  DuplicateCheckResult,
  EvaluateApprovalRuleInput,
  EvaluateNumberingGateInput,
  CreateNumberingApprovalBatchInput,
  DeleteDraftNumberingRecordInput,
  DeleteDraftNumberingRecordResult,
  CreateNumberingRecordInput,
  CreateNumberingExportJobInput,
  DecideNumberingApprovalBatchInput,
  DecideNumberingApprovalInput,
  GenerateMonthlyNumberingAuditReportInput,
  ListNumberingApprovalBatchesInput,
  ListMonthlyNumberingAuditReportsInput,
  ListNumberingNotificationsInput,
  ListNumberingExportJobsInput,
  ListNumberingTasksInput,
  MainDrawingImpactAnalysis,
  MainDrawingImpactInput,
  MarkOverdueDraftNumberingInput,
  MarkOverdueDraftNumberingResult,
  MatchedApprovalRule,
  MonthlyAuditReportRecord,
  DrawingNumberRecord,
  DrawingModuleLinkedPartRecord,
  DrawingModulePendingApprovalSummary,
  DrawingModuleReleaseStatusMismatch,
  DrawingModuleListInput,
  DrawingModuleListRecord,
  NumberingAttentionMarkerRecord,
  NumberingApprovalActionCode,
  NumberingApprovalBatchItemRecord,
  NumberingApprovalBatchItemStatus,
  NumberingApprovalBatchRecord,
  NumberingApprovalBatchStatus,
  NumberingApprovalDecisionRecord,
  NumberingApprovalEntitySummaryRecord,
  NumberingApprovalRecord,
  NumberingApprovalReviewBatchRecord,
  NumberingApprovalReviewRequestRecord,
  NumberingApprovalStatus,
  NumberingAdminAuditEventRecord,
  NumberingAdminApprovalRuleRecord,
  NumberingAdminMatrixRecord,
  NumberingAdminPermissionRecord,
  NumberingAdminRoleRecord,
  NumberingAdminRoleScopeRecord,
  NumberingAdminRuleTemplateRecord,
  NumberingAdminUserRecord,
  NumberingApprovalDelegationRecord,
  NumberingApprovalHardRuleCatalogItem,
  NumberingObsoleteApprovalResult,
  LinkPartNumberToDrawingInput,
  MaintainDrawingPartRelationInput,
  MaintainDrawingPartRelationResult,
  NumberingAuditTrailRecord,
  NumberingExportJobRecord,
  NumberingExportMode,
  NumberingItemKind,
  NumberingLinkRecord,
  NumberingNotificationRecord,
  NumberingRecordStatus,
  NumberingGate,
  NumberingGateEvaluation,
  NumberingGateIssue,
  NumberingRolePriorityVersionRecord,
  NumberingRoleScopeKind,
  NumberingRootDetailRecord,
  NumberingRuleVersionRecord,
  NumberingSearchEntityType,
  NumberingSearchInput,
  NumberingSearchResultRecord,
  NumberingTaskRecord,
  NumberingTaskStatus,
  NumberingUserRoleAssignmentRecord,
  NumberingUserScope,
  NumberingVariantRecord,
  NumberingWarningRecord,
  PartNumberRecord,
  PartModuleDetailRecord,
  PartModuleListInput,
  PartModuleListRecord,
  PartVariantAttributesRecord,
  RevokeNumberingApprovalDelegationInput,
  RevokeNumberingUserRoleAssignmentInput,
  RequestMainDrawingRestoreApprovalInput,
  RequestNumberingApprovalInput,
  RequestNumberingObsoleteApprovalInput,
  RequestRootObsoleteApprovalInput,
  RootObsoleteApprovalResult,
  RootObsoleteImpactLink,
  RootObsoleteImpactResult,
  RootObsoleteImpactTarget,
  RootObsoleteDependencySummary,
  RequestSameDrawingVariantApprovalInput,
  ResubmitRejectedNumberingApprovalBatchItemsInput,
  SaveNumberingRolePriorityInput,
  ObsoleteDraftNumberingRecordInput,
  PartRootRecord,
  UpsertNumberingAdminRoleInput,
  UpsertNumberingApprovalDelegationInput,
  UpsertNumberingApprovalRuleInput,
  UpsertNumberingRolePermissionInput,
  UpsertNumberingRoleScopeInput,
  UpsertNumberingUserRoleAssignmentInput,
  UpsertPartVariantAttributesInput,
  UpdateDraftNumberingRecordInput,
  UpdateNumberingNotificationStateInput,
  UpdateNumberingTaskStatusInput
} from "@/lib/repositories/numbering-repository";

type PartRootRow = {
  id: string;
  company_id: string;
  root_code: string;
  core_name: string;
  item_kind: NumberingItemKind;
  record_status: NumberingRecordStatus;
  rule_version_id: string;
  updated_at?: string;
};

type PartNumberRow = {
  id: string;
  company_id: string;
  part_root_id: string;
  part_number: string;
  sequence_no: number;
  sequence_code: string;
  part_name: string;
  item_kind: NumberingItemKind;
  structure_type: StoredPartStructureType;
  is_universal: number;
  custom_specification: string | null;
  series_code: string | null;
  record_status: NumberingRecordStatus;
  universal_reason: string | null;
  rule_version_id: string;
  updated_at?: string;
};

type RootAppendPartProfile = {
  itemKind: NumberingItemKind;
  structureType: StoredPartStructureType;
  isUniversal: boolean;
  seriesCode: string | null;
  customSpecification: string | null;
};

type PartNumberMasterDataRow = PartNumberRow & {
  material_code: string | null;
  material_label: string | null;
  surface_treatment: string | null;
};

type NumberingRootDetailWithPartMasterDataGaps = NumberingRootDetailRecord & {
  partMasterDataGaps?: Record<string, boolean>;
};

function partMasterDataGapForRow(row: PartNumberMasterDataRow) {
  return !(row.material_label?.trim() || row.material_code?.trim()) || !row.surface_treatment?.trim();
}

function buildPartMasterDataGaps(rows: PartNumberMasterDataRow[]) {
  return Object.fromEntries(rows.map((row) => [row.id, partMasterDataGapForRow(row)]));
}

type DrawingNumberRow = {
  id: string;
  company_id: string;
  part_root_id: string;
  drawing_number: string;
  purpose_code: DrawingPurposeCode;
  purpose_description: string;
  sequence_no: number;
  is_primary_manufacturing: number;
  record_status: NumberingRecordStatus;
  rule_version_id: string;
};

type DrawingModuleListRow = DrawingNumberRow & {
  root_code: string;
  core_name: string;
  item_kind: NumberingItemKind;
  linked_part_count: number | string | null;
  warning_count: number | string | null;
  updated_at: string;
};

type DrawingModuleLinkedPartNumberRow = {
  drawing_number_id: string;
  part_number: string;
};

type DrawingModuleLinkedPartRow = {
  id: string;
  part_root_id: string;
  part_number: string;
  part_name: string;
  record_status: NumberingRecordStatus;
  material_code: string | null;
  material_label: string | null;
  color_code: string | null;
  color_label: string | null;
  surface_treatment: string | null;
  variant_note: string | null;
  primary_drawing_number: string | null;
};

type DrawingModuleReleaseStatusMismatchRow = {
  drawing_number_id: string;
  submission_id: string;
  revision: string;
  released_at: string | null;
};

type DrawingModulePendingApprovalRow = {
  drawing_number_id: string;
  assessment_id: string;
  revision: string;
  assessed_at: string;
};

type PartVariantAttributesRow = {
  id: string;
  part_number_id: string;
  material_code: string | null;
  material_label: string | null;
  color_code: string | null;
  color_label: string | null;
  surface_treatment: string | null;
  variant_note: string | null;
  updated_at: string;
};

type ApprovalRuleRow = {
  id: string;
  rule_version_id: string;
  rule_name: string;
  action_code: string;
  record_status: string | null;
  item_kind: string | null;
  risk_flag: string | null;
  requires_approval: number;
  approver_role: string | null;
  blocks_usage: number;
  blocks_release: number;
  shows_warning: number;
  export_marker: number;
};

type NumberingAdminRoleRow = {
  id: string;
  role_code: string;
  title: string;
  system_defined: number;
};

type NumberingAdminUserRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: string;
};

type NumberingAdminPermissionRow = {
  id: string;
  role_id: string;
  permission_kind: "page" | "action";
  permission_code: string;
  allowed: number;
};

type NumberingAdminRoleScopeRow = {
  id: string;
  role_id: string;
  scope_kind: NumberingRoleScopeKind;
  scope_code: string;
  allowed: number;
};

type NumberingUserRoleAssignmentRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  user_system_role: string;
  role_id: string;
  role_code: string;
  role_title: string;
  reason: string;
  scope_template: string;
  named_scope: string;
  sponsor_user_id: string | null;
  starts_at: string | null;
  review_due_at: string | null;
  hard_ends_at: string | null;
  assigned_by: string;
  assigned_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

type NumberingAdminAuditEventRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  detail_json: string;
  created_at: string;
};

type NumberingRolePriorityVersionRow = {
  id: string;
  version_code: string;
  priority_json: string;
  status: NumberingRolePriorityVersionRecord["status"];
  created_by: string | null;
  created_at: string;
};

type NumberingApprovalDelegationRow = {
  id: string;
  delegated_from: string;
  delegated_from_name: string;
  delegated_from_role: string;
  delegated_to: string;
  delegated_to_name: string;
  delegated_to_role: string;
  project_code: string | null;
  action_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  reason: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

type NumberingAdminRuleTemplateRow = {
  id: string;
  template_code: ApplyNumberingRuleTemplateInput["templateCode"];
  title: string;
  description: string;
  system_defined: number;
};

type NumberingRuleVersionRow = {
  id: string;
  rule_code: string;
  title: string;
  status: NumberingRuleVersionRecord["status"];
  effective_at: string;
  retired_at: string | null;
};

type PartModuleListRow = PartNumberRow & {
  root_code: string;
  core_name: string;
  primary_drawing_number: string | null;
  primary_drawing_record_status: NumberingRecordStatus | null;
  drawing_count: number | string | null;
  variant_id: string | null;
  material_code: string | null;
  material_label: string | null;
  color_code: string | null;
  color_label: string | null;
  surface_treatment: string | null;
  variant_note: string | null;
  variant_updated_at: string | null;
};

type WarningEventInput = {
  warningCode: string;
  severity: "info" | "warning" | "blocker";
  entityType: string;
  entityId?: string | null;
  title: string;
  message: string;
  detail: Record<string, unknown>;
  createdBy?: string | null;
};

type NumberingTaskRow = {
  id: string;
  company_id: string;
  task_type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  message: string;
  risk_level: "info" | "warning" | "critical";
  task_status: NumberingTaskStatus;
  assigned_to: string | null;
  assigned_role: string | null;
  project_code: string | null;
  action_url: string | null;
  detail_json: string;
  created_by: string | null;
  created_at: string;
  handled_at: string | null;
};

type NumberingNotificationRow = {
  id: string;
  company_id: string;
  notification_type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  recipient_id: string | null;
  recipient_role: string | null;
  read_at: string | null;
  handled_at: string | null;
  dismissible: number;
  action_url: string | null;
  detail_json: string;
  created_by: string | null;
  created_at: string;
};

type ApprovalRequestRow = {
  id: string;
  company_id: string;
  action_code: NumberingApprovalActionCode;
  entity_type: NumberingApprovalRecord["entityType"];
  entity_id: string;
  request_status: NumberingApprovalStatus;
  reason: string;
  payload_json: string;
  requested_by: string;
  requested_at: string;
};

type ApprovalDecisionRow = {
  id: string;
  approval_request_id: string;
  approver_role: string;
  approver_id: string;
  decision: "approved" | "rejected" | "needs_info";
  comment: string | null;
  decided_at: string;
};

type ApprovalBatchRow = {
  id: string;
  company_id: string;
  batch_code: string;
  project_code: string | null;
  action_code: string | null;
  batch_status: NumberingApprovalBatchStatus;
  submitted_by: string;
  submitted_at: string;
};

type ApprovalBatchItemRow = {
  id: string;
  batch_id: string;
  approval_request_id: string;
  item_status: NumberingApprovalBatchItemStatus;
  resubmitted_from_item_id: string | null;
};

type ApprovalReviewBatchPreload = {
  itemRowsByBatchId: Map<string, ApprovalBatchItemRow[]>;
  requestRowsById: Map<string, ApprovalRequestRow>;
};

type NumberingExportJobRow = {
  id: string;
  company_id: string;
  export_mode: NumberingExportMode;
  status: NumberingExportJobRecord["status"];
  result_json: string;
  generated_by: string | null;
  generated_at: string;
  completed_at: string | null;
};

type MonthlyAuditReportRow = {
  id: string;
  company_id: string;
  report_type: string;
  report_month: string;
  generation_mode: "auto" | "manual";
  generated_by: string | null;
  status: MonthlyAuditReportRecord["status"];
  query_json: string;
  created_at: string;
};

type CountRow = {
  count: number;
};

type MonthlyProjectBucketRow = {
  projectCode: string;
  totalTasks: number;
  openTasks: number;
  criticalTasks: number;
};

type NumberingLinkRow = {
  id: string;
  drawing_number_id: string;
  part_number_id: string;
  drawing_number: string;
  part_number: string;
  link_type: "primary_manufacturing" | "reference";
  created_at: string;
};

type NumberingVariantRow = {
  id: string;
  drawing_number_id: string;
  part_number_id: string;
  drawing_number: string;
  part_number: string;
  field_name: string;
  field_value: string;
  created_at: string;
};

type NumberingWarningRow = {
  id: string;
  warning_code: string;
  severity: "info" | "warning" | "blocker";
  entity_type: string;
  entity_id: string | null;
  title: string;
  message: string;
  detail_json: string;
  created_at: string;
  acknowledged_at: string | null;
};

type NumberingAuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  detail_json: string;
  created_at: string;
};

type NumberingSearchRow = {
  entity_type: Exclude<NumberingSearchEntityType, "all">;
  entity_id: string;
  root_code: string;
  core_name: string;
  display_code: string;
  display_name: string;
  item_kind: NumberingItemKind;
  record_status: NumberingRecordStatus;
  purpose_code: DrawingPurposeCode | null;
  part_number: string | null;
  drawing_number: string | null;
  primary_drawing_number: string | null;
  part_count: number | string | null;
  drawing_count: number | string | null;
  linked_part_count: number | string | null;
  warning_count: number | string | null;
};

type DraftRootAuditSnapshot = {
  root: PartRootRow;
  parts: PartNumberRow[];
  drawings: DrawingNumberRow[];
};

type NumberingAssignedRoleRow = {
  role_code: string;
};

type NumberingRoleScopeRow = {
  role_code: string;
  scope_kind: "department" | "project" | "action";
  scope_code: string;
};

type NumberingDelegationRow = {
  delegated_from: string;
  delegated_from_name: string;
  delegated_from_role: string;
  project_code: string | null;
  action_code: string | null;
};

type NumberingDelegatedAccessRule = {
  delegatedFrom: string;
  delegatedFromName: string;
  delegatedFromRole: string;
  roleCodes: string[];
  projectCode: string | null;
  actionCode: string | null;
};

type NumberingAccessContext = {
  user: NumberingUserScope;
  baseRoles: string[];
  allRoles: string[];
  projectScopes: Set<string>;
  actionScopes: Set<string>;
  delegations: NumberingDelegatedAccessRule[];
};

export type NumberingRootBundleRecord = {
  root: PartRootRecord;
  partNumbers: PartNumberRecord[];
  drawingNumbers: DrawingNumberRecord[];
};

const DEFAULT_RULE_VERSION_ID = NUMBERING_RULE_V3_ID;
const DEFAULT_COMPANY_ID = "company-jenfu";
const NUMBERING_RULE_VERSION_SEEDS = [
  {
    id: NUMBERING_RULE_V1_ID,
    ruleCode: "PDM-NUMBERING-V1",
    title: "PDM numbering rule v1",
    status: "retired",
    retired: true,
    ruleJson: '{"partRootDigits":4,"partSequenceDigits":3,"drawingPrefix":"D","partPrefix":"P","drawingPurposeCodes":["MA","OT"]}'
  },
  {
    id: NUMBERING_RULE_V2_ID,
    ruleCode: "PDM-NUMBERING-V2",
    title: "PDM compact numbering rule v2",
    status: "retired",
    retired: true,
    ruleJson:
      '{"rootDigits":5,"partCode":"P","drawingPurposeCodes":["M","R"],"partSequenceDigits":2,"drawingSequenceDigits":2,"reservedSequences":["00"],"formats":{"root":"{root}","part":"{root}-P{seq}","drawing":"{root}-{purpose}{seq}"},"compatibility":{"v1ManufacturingCodes":["MA"],"v1ReferenceCodes":["OT"]}}'
  },
  {
    id: NUMBERING_RULE_V3_ID,
    ruleCode: "PDM-NUMBERING-V3",
    title: "PDM alphanumeric root numbering rule v3",
    status: "active",
    retired: false,
    ruleJson:
      '{"rootFormat":"alpha_numeric_1_letter_4_digits","rootLetters":"ABCDEFGHIJKLMNOPQRSTUVWXYZ","rootSequenceDigits":4,"rootSequenceStart":1,"rootSequenceEnd":9999,"partCode":"P","drawingPurposeCodes":["M","R"],"partSequenceDigits":2,"drawingSequenceDigits":2,"reservedRootSequences":["0000"],"reservedCategorySequences":["00"],"formats":{"root":"{letter}{rootSeq4}","part":"{root}-P{seq2}","drawing":"{root}-{purpose}{seq2}"},"compatibility":{"v1ManufacturingCodes":["MA"],"v1ReferenceCodes":["OT"],"v2RootPattern":"^[0-9]{5}$"}}'
  }
] as const;
const DEFAULT_ROLE_PRIORITY = [
  "system_admin",
  "pdm_admin",
  "rd_manager",
  "document_admin",
  "qa",
  "rd",
  "manufacturing",
  "procurement",
  "external_specialist"
];

const NUMBERING_HARD_RULE_CATALOG: NumberingApprovalHardRuleCatalogItem[] = [
  {
    code: "DUPLICATE_CODE_HARD_BLOCK",
    message: "Root code, part number, and drawing number uniqueness cannot be overridden.",
    requiresApproval: false,
    blocksUsage: true,
    blocksRelease: true,
    showsWarning: true,
    exportMarker: true,
    editable: false
  },
  {
    code: "PRIMARY_MA_UNIQUENESS_HARD_BLOCK",
    message: "A part number can have only one primary MA drawing.",
    requiresApproval: false,
    blocksUsage: true,
    blocksRelease: true,
    showsWarning: true,
    exportMarker: true,
    editable: false
  },
  {
    code: "RELEASED_DOCUMENT_REVISION_REQUIRED",
    message: "Released affected documents must be revised before this action can be released.",
    requiresApproval: false,
    blocksUsage: true,
    blocksRelease: true,
    showsWarning: true,
    exportMarker: true,
    editable: false
  },
  {
    code: "MAIN_DRAWING_INVALID_REVIEW_REQUIRED",
    message: "A MainDrawingInvalid part must pass restore approval before it becomes usable.",
    requiresApproval: true,
    blocksUsage: true,
    blocksRelease: true,
    showsWarning: true,
    exportMarker: true,
    editable: false
  },
  {
    code: "PRIMARY_MA_REQUIRED_FOR_CONTROLLED_HANDOFF",
    message: "Technical transfer or release of drawing-made items requires a primary manufacturing drawing.",
    requiresApproval: true,
    blocksUsage: true,
    blocksRelease: true,
    showsWarning: true,
    exportMarker: true,
    editable: false
  },
  {
    code: "OVERRIDE_AUDIT_MARKER_REQUIRED",
    message: "Every override must be audited and marked in UI/export output.",
    requiresApproval: true,
    blocksUsage: false,
    blocksRelease: false,
    showsWarning: true,
    exportMarker: true,
    editable: false
  },
  {
    code: "HIGH_SIMILARITY_WARNING_ONLY",
    message: "High-similarity numbering matches should warn users but not block numbering.",
    requiresApproval: false,
    blocksUsage: false,
    blocksRelease: false,
    showsWarning: true,
    exportMarker: false,
    editable: false
  }
];

const STANDARD_APPROVAL_RULE_DEFAULTS = [
  ["approval-rule-update-name-release", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-update-name-released", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-update-spec-released", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-obsolete-part-release", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-obsolete-ma-drawing-admin", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-obsolete-root-admin", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-merge-part-referenced", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-release-missing-ma-confirm", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-release", 1, "rd_manager", 0, 1, 1, 1],
  ["approval-rule-post-release-change-manager", 1, "rd_manager", 0, 1, 1, 1],
  ["approval-rule-post-release-change-admin", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-released-same-drawing-variant", 1, "rd_manager", 0, 1, 1, 1],
  ["approval-rule-main-drawing-restore", 1, "pdm_admin", 0, 1, 1, 1]
] as const;

function approvalRulePrefixForRuleVersion(ruleVersionId: string) {
  if (ruleVersionId === NUMBERING_RULE_V3_ID) return "v3-";
  if (ruleVersionId === NUMBERING_RULE_V2_ID) return "v2-";
  return "";
}

function approvalRuleIdForRuleVersion(id: string, ruleVersionId: string) {
  return `${approvalRulePrefixForRuleVersion(ruleVersionId)}${id}`;
}

export const SELECT_ASYNC_PART_ROOT_BY_CODE_SQL = `
  SELECT *
  FROM part_roots
  WHERE root_code = :rootCode
`;

export const SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL = `
  SELECT *
  FROM part_roots
  WHERE root_code = :rootCode
    AND company_id = :companyId
`;

export const SELECT_ASYNC_PART_ROOT_BY_ID_SQL = `
  SELECT *
  FROM part_roots
  WHERE id = :rootId
`;

export const SELECT_ASYNC_PART_NUMBER_BY_NUMBER_SQL = `
  SELECT *
  FROM part_numbers
  WHERE part_number = :partNumber
`;

export const SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL = `
  SELECT *
  FROM part_numbers
  WHERE part_number = :partNumber
    AND company_id = :companyId
`;

export const SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_SQL = `
  SELECT *
  FROM drawing_numbers
  WHERE drawing_number = :drawingNumber
`;

export const SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL = `
  SELECT *
  FROM drawing_numbers
  WHERE drawing_number = :drawingNumber
    AND company_id = :companyId
`;

export const SELECT_ASYNC_PART_NUMBER_BY_ID_SQL = `
  SELECT *
  FROM part_numbers
  WHERE id = :partNumberId
`;

export const SELECT_ASYNC_DRAWING_NUMBER_BY_ID_SQL = `
  SELECT *
  FROM drawing_numbers
  WHERE id = :drawingNumberId
`;

const SELECT_ASYNC_RECENT_DUPLICATE_CREATE_SQL = `
  SELECT
    r.id AS root_id,
    p.id AS part_number_id,
    d.id AS drawing_number_id
  FROM part_roots r
  JOIN part_numbers p ON p.part_root_id = r.id
  LEFT JOIN drawing_numbers d ON d.part_root_id = r.id
  WHERE r.company_id = :companyId
    AND r.core_name = :coreName
    AND r.item_kind = :itemKind
    AND r.record_status = :recordStatus
    AND r.rule_version_id = :ruleVersionId
    AND p.part_name = :partName
    AND p.item_kind = :itemKind
    AND p.structure_type = :structureType
    AND p.record_status = :recordStatus
    AND p.rule_version_id = :ruleVersionId
    AND p.is_universal = :isUniversal
    AND COALESCE(p.universal_reason, '') = :universalReason
    AND COALESCE(p.custom_specification, '') = :customSpecification
    AND COALESCE(p.series_code, '') = :seriesCode
    AND (r.created_by = :createdBy OR (:createdBy IS NULL AND r.created_by IS NULL))
    AND r.created_at >= :notBefore
    AND (
      (:drawingRequested = 0 AND d.id IS NULL)
      OR (
        :drawingRequested = 1
        AND d.purpose_code = :drawingPurposeCode
        AND COALESCE(d.purpose_description, '') = :drawingPurposeDescription
        AND d.record_status = :recordStatus
        AND d.rule_version_id = :ruleVersionId
      )
    )
  ORDER BY r.created_at DESC
  LIMIT 1
`;

export const SELECT_ASYNC_ADMIN_ROLES_SQL = `
  SELECT *
  FROM roles
  ORDER BY system_defined DESC, title ASC
`;

export const SELECT_ASYNC_ADMIN_USERS_SQL = `
  SELECT id, display_name, email, role
  FROM users
  ORDER BY role DESC, display_name ASC
`;

export const SELECT_ASYNC_ADMIN_ROLE_PERMISSIONS_SQL = `
  SELECT *
  FROM role_permissions
  ORDER BY role_id ASC, permission_kind ASC, permission_code ASC
`;

export const SELECT_ASYNC_ADMIN_ROLE_SCOPES_SQL = `
  SELECT *
  FROM role_scope_rules
  ORDER BY role_id ASC, scope_kind ASC, scope_code ASC
`;

export const SELECT_ASYNC_ADMIN_ROLE_ASSIGNMENTS_SQL = `
  SELECT
    a.id, a.user_id, u.display_name AS user_name, u.email AS user_email, u.role AS user_system_role,
    a.role_id, r.role_code, r.title AS role_title,
    a.reason, a.scope_template, a.named_scope, a.sponsor_user_id, a.starts_at, a.review_due_at, a.hard_ends_at,
    a.assigned_by, a.assigned_at, a.revoked_at, a.revoked_by
  FROM user_role_assignments a
  JOIN users u ON u.id = a.user_id
  JOIN roles r ON r.id = a.role_id
  ORDER BY a.revoked_at IS NOT NULL ASC, a.assigned_at DESC
`;

export const SELECT_ASYNC_ADMIN_ROLE_ASSIGNMENT_BY_ID_SQL = `
  SELECT
    a.id, a.user_id, u.display_name AS user_name, u.email AS user_email, u.role AS user_system_role,
    a.role_id, r.role_code, r.title AS role_title,
    a.reason, a.scope_template, a.named_scope, a.sponsor_user_id, a.starts_at, a.review_due_at, a.hard_ends_at,
    a.assigned_by, a.assigned_at, a.revoked_at, a.revoked_by
  FROM user_role_assignments a
  JOIN users u ON u.id = a.user_id
  JOIN roles r ON r.id = a.role_id
  WHERE a.id = :assignmentId
`;

export const SELECT_ASYNC_ADMIN_ACCESS_AUDIT_EVENTS_SQL = `
  SELECT
    a.id, a.actor_id, actor.display_name AS actor_name, a.action, a.detail_json, a.created_at
  FROM audit_logs a
  LEFT JOIN users actor ON actor.id = a.actor_id
  WHERE a.action IN (
    'numbering.role.upsert',
    'numbering.role_permission.upsert',
    'numbering.role_scope.upsert',
    'numbering.user_role_assignment.upsert',
    'numbering.user_role_assignment.revoke',
    'numbering.role_priority.save',
    'numbering.approval_delegation.upsert',
    'numbering.approval_delegation.revoke'
  )
  ORDER BY a.created_at DESC
  LIMIT 50
`;

export const SELECT_ASYNC_ADMIN_ROLE_PRIORITY_VERSIONS_SQL = `
  SELECT *
  FROM role_priority_versions
  ORDER BY created_at DESC
`;

export const SELECT_ASYNC_ADMIN_ACTIVE_ROLE_PRIORITY_SQL = `
  SELECT *
  FROM role_priority_versions
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
`;

export const SELECT_ASYNC_ADMIN_APPROVAL_DELEGATIONS_SQL = `
  SELECT
    d.id, d.delegated_from, from_user.display_name AS delegated_from_name, from_user.role AS delegated_from_role,
    d.delegated_to, to_user.display_name AS delegated_to_name, to_user.role AS delegated_to_role,
    d.project_code, d.action_code, d.starts_at, d.ends_at, d.reason,
    d.created_by, d.created_at, d.revoked_at, d.revoked_by
  FROM approval_delegations d
  JOIN users from_user ON from_user.id = d.delegated_from
  JOIN users to_user ON to_user.id = d.delegated_to
  ORDER BY d.revoked_at IS NOT NULL ASC, d.created_at DESC
`;

export const SELECT_ASYNC_ADMIN_APPROVAL_DELEGATION_BY_ID_SQL = `
  SELECT
    d.id, d.delegated_from, from_user.display_name AS delegated_from_name, from_user.role AS delegated_from_role,
    d.delegated_to, to_user.display_name AS delegated_to_name, to_user.role AS delegated_to_role,
    d.project_code, d.action_code, d.starts_at, d.ends_at, d.reason,
    d.created_by, d.created_at, d.revoked_at, d.revoked_by
  FROM approval_delegations d
  JOIN users from_user ON from_user.id = d.delegated_from
  JOIN users to_user ON to_user.id = d.delegated_to
  WHERE d.id = :delegationId
`;

export const SELECT_ASYNC_ADMIN_APPROVAL_RULES_SQL = `
  SELECT *
  FROM approval_rules
  WHERE rule_version_id = :ruleVersionId
  ORDER BY action_code ASC, rule_name ASC
`;

export const COUNT_ASYNC_ADMIN_APPROVAL_RULES_BY_VERSION_SQL = `
  SELECT COUNT(*) AS count
  FROM approval_rules
  WHERE rule_version_id = :ruleVersionId
`;

export const INSERT_ASYNC_DEFAULT_APPROVAL_RULES_FOR_VERSION_SQL = `
  INSERT INTO approval_rules (
    id, rule_version_id, rule_name, action_code, record_status, item_kind, risk_flag,
    requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker, created_by, created_at, updated_at
  )
  SELECT
    :targetIdPrefix || source_rules.id, :targetRuleVersionId, source_rules.rule_name, source_rules.action_code, source_rules.record_status,
    source_rules.item_kind, source_rules.risk_flag, source_rules.requires_approval, source_rules.approver_role, source_rules.blocks_usage,
    source_rules.blocks_release, source_rules.shows_warning, source_rules.export_marker,
    CASE
      WHEN source_rules.created_by IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE users.id = source_rules.created_by) THEN source_rules.created_by
      ELSE NULL
    END,
    :createdAt, :updatedAt
  FROM approval_rules source_rules
  WHERE source_rules.rule_version_id = :sourceRuleVersionId
    AND NOT EXISTS (
      SELECT 1 FROM approval_rules WHERE rule_version_id = :targetRuleVersionId
    )
`;

export const SELECT_ASYNC_ADMIN_APPROVAL_RULES_BY_ACTION_SQL = `
  SELECT *
  FROM approval_rules
  WHERE rule_version_id = :ruleVersionId
    AND action_code = :actionCode
  ORDER BY created_at ASC, id ASC
`;

export const SELECT_ASYNC_ADMIN_RULE_TEMPLATES_SQL = `
  SELECT *
  FROM rule_templates
  ORDER BY system_defined DESC, template_code ASC
`;

export const SELECT_ASYNC_ADMIN_RULE_TEMPLATE_BY_CODE_SQL = `
  SELECT id
  FROM rule_templates
  WHERE template_code = :templateCode
`;

export const SELECT_ASYNC_ADMIN_RULE_VERSIONS_SQL = `
  SELECT id, rule_code, title, status, effective_at, retired_at
  FROM numbering_rule_versions
  ORDER BY effective_at DESC, created_at DESC
`;

export const SELECT_ASYNC_ROLE_BY_ID_SQL = `
  SELECT *
  FROM roles
  WHERE id = :roleId
`;

export const SELECT_ASYNC_ROLE_BY_CODE_SQL = `
  SELECT *
  FROM roles
  WHERE role_code = :roleCode
`;

export const SELECT_ASYNC_ROLE_COUNT_BY_CODES_BASE_SQL = `
  SELECT COUNT(*) AS count
  FROM roles
`;

export const SELECT_ASYNC_USER_EXISTS_SQL = `
  SELECT id
  FROM users
  WHERE id = :userId
`;

export const SELECT_ASYNC_ROLE_PERMISSION_BY_NATURAL_KEY_SQL = `
  SELECT *
  FROM role_permissions
  WHERE role_id = :roleId
    AND permission_kind = :permissionKind
    AND permission_code = :permissionCode
`;

export const SELECT_ASYNC_ROLE_SCOPE_BY_NATURAL_KEY_SQL = `
  SELECT *
  FROM role_scope_rules
  WHERE role_id = :roleId
    AND scope_kind = :scopeKind
    AND scope_code = :scopeCode
`;

export const SELECT_ASYNC_ACTIVE_USER_ROLE_ASSIGNMENT_SQL = `
  SELECT *
  FROM user_role_assignments
  WHERE user_id = :userId
    AND role_id = :roleId
    AND revoked_at IS NULL
`;

export const SELECT_ASYNC_APPROVAL_RULE_BY_ID_SQL = `
  SELECT *
  FROM approval_rules
  WHERE id = :approvalRuleId
`;

export const SELECT_ASYNC_RULE_VERSION_BY_ID_SQL = `
  SELECT id
  FROM numbering_rule_versions
  WHERE id = :ruleVersionId
`;

export const INSERT_ASYNC_ADMIN_ROLE_SQL = `
  INSERT INTO roles (id, role_code, title, system_defined, enabled, created_at, updated_at)
  VALUES (:id, :roleCode, :title, 0, 1, :createdAt, :updatedAt)
`;

export const UPDATE_ASYNC_ADMIN_ROLE_SQL = `
  UPDATE roles
  SET title = :title,
      updated_at = :updatedAt
  WHERE id = :roleId
`;

export const INSERT_ASYNC_ROLE_PERMISSION_SQL = `
  INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at)
  VALUES (:id, :roleId, :permissionKind, :permissionCode, :allowed, :createdAt, :updatedAt)
`;

export const UPDATE_ASYNC_ROLE_PERMISSION_SQL = `
  UPDATE role_permissions
  SET allowed = :allowed,
      updated_at = :updatedAt
  WHERE id = :permissionId
`;

export const INSERT_ASYNC_ROLE_SCOPE_SQL = `
  INSERT INTO role_scope_rules (id, role_id, scope_kind, scope_code, allowed, created_by, created_at, updated_at)
  VALUES (:id, :roleId, :scopeKind, :scopeCode, :allowed, :createdBy, :createdAt, :updatedAt)
`;

export const UPDATE_ASYNC_ROLE_SCOPE_SQL = `
  UPDATE role_scope_rules
  SET allowed = :allowed,
      updated_at = :updatedAt
  WHERE id = :scopeId
`;

export const INSERT_ASYNC_USER_ROLE_ASSIGNMENT_SQL = `
  INSERT INTO user_role_assignments (
    id, user_id, role_id, reason, scope_template, named_scope, sponsor_user_id,
    starts_at, review_due_at, hard_ends_at, assigned_by, assigned_at
  )
  VALUES (
    :id, :userId, :roleId, :reason, :scopeTemplate, :namedScope, :sponsorUserId,
    :startsAt, :reviewDueAt, :hardEndsAt, :assignedBy, :assignedAt
  )
`;

export const UPDATE_ASYNC_USER_ROLE_ASSIGNMENT_SQL = `
  UPDATE user_role_assignments
  SET user_id = :userId,
      role_id = :roleId,
      reason = :reason,
      scope_template = :scopeTemplate,
      named_scope = :namedScope,
      sponsor_user_id = :sponsorUserId,
      starts_at = :startsAt,
      review_due_at = :reviewDueAt,
      hard_ends_at = :hardEndsAt,
      assigned_by = :assignedBy,
      assigned_at = :assignedAt
  WHERE id = :assignmentId
`;

export const UPDATE_ASYNC_USER_ROLE_ASSIGNMENT_REVOKED_SQL = `
  UPDATE user_role_assignments
  SET revoked_at = :revokedAt,
      revoked_by = :revokedBy
  WHERE id = :assignmentId
`;

export const RETIRE_ASYNC_ROLE_PRIORITIES_SQL = `
  UPDATE role_priority_versions
  SET status = 'retired'
  WHERE status = 'active'
`;

export const INSERT_ASYNC_ROLE_PRIORITY_VERSION_SQL = `
  INSERT INTO role_priority_versions (id, version_code, priority_json, status, created_by, created_at)
  VALUES (:id, :versionCode, :priorityJson, 'active', :createdBy, :createdAt)
`;

export const INSERT_ASYNC_APPROVAL_DELEGATION_SQL = `
  INSERT INTO approval_delegations (
    id, delegated_from, delegated_to, project_code, action_code, starts_at, ends_at, reason, created_by, created_at
  ) VALUES (
    :id, :delegatedFrom, :delegatedTo, :projectCode, :actionCode, :startsAt, :endsAt, :reason, :createdBy, :createdAt
  )
`;

export const UPDATE_ASYNC_APPROVAL_DELEGATION_SQL = `
  UPDATE approval_delegations
  SET delegated_from = :delegatedFrom,
      delegated_to = :delegatedTo,
      project_code = :projectCode,
      action_code = :actionCode,
      starts_at = :startsAt,
      ends_at = :endsAt,
      reason = :reason,
      revoked_at = NULL,
      revoked_by = NULL
  WHERE id = :delegationId
`;

export const UPDATE_ASYNC_APPROVAL_DELEGATION_REVOKED_SQL = `
  UPDATE approval_delegations
  SET revoked_at = :revokedAt,
      revoked_by = :revokedBy
  WHERE id = :delegationId
`;

export const INSERT_ASYNC_APPROVAL_RULE_SQL = `
  INSERT INTO approval_rules (
    id, rule_version_id, rule_name, action_code, record_status, item_kind, risk_flag,
    requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker, created_by, created_at, updated_at
  ) VALUES (
    :id, :ruleVersionId, :ruleName, :actionCode, :recordStatus, :itemKind, :riskFlag,
    :requiresApproval, :approverRole, :blocksUsage, :blocksRelease, :showsWarning, :exportMarker, :createdBy, :createdAt, :updatedAt
  )
`;

export const UPDATE_ASYNC_APPROVAL_RULE_SQL = `
  UPDATE approval_rules
  SET rule_version_id = :ruleVersionId,
      rule_name = :ruleName,
      action_code = :actionCode,
      record_status = :recordStatus,
      item_kind = :itemKind,
      risk_flag = :riskFlag,
      requires_approval = :requiresApproval,
      approver_role = :approverRole,
      blocks_usage = :blocksUsage,
      blocks_release = :blocksRelease,
      shows_warning = :showsWarning,
      export_marker = :exportMarker,
      updated_at = :updatedAt
  WHERE id = :approvalRuleId
`;

export const UPDATE_ASYNC_STANDARD_APPROVAL_RULE_SQL = `
  UPDATE approval_rules
  SET requires_approval = :requiresApproval,
      approver_role = :approverRole,
      blocks_usage = :blocksUsage,
      blocks_release = :blocksRelease,
      shows_warning = :showsWarning,
      export_marker = :exportMarker,
      updated_at = :updatedAt
  WHERE id = :approvalRuleId
`;

export const UPDATE_ASYNC_RD_EFFICIENCY_RULES_RELAXED_SQL = `
  UPDATE approval_rules
  SET requires_approval = 0,
      approver_role = NULL,
      blocks_usage = 0,
      blocks_release = 1,
      shows_warning = 1,
      export_marker = 1,
      updated_at = :updatedAt
  WHERE action_code IN ('update_name', 'obsolete_part_number')
    AND record_status IS NULL
`;

export const UPDATE_ASYNC_RD_EFFICIENCY_RULES_STRICT_SQL = `
  UPDATE approval_rules
  SET requires_approval = 1,
      approver_role = COALESCE(approver_role, 'pdm_admin'),
      blocks_usage = 0,
      blocks_release = 1,
      shows_warning = 1,
      export_marker = 1,
      updated_at = :updatedAt
  WHERE action_code IN ('release_missing_ma_confirm', 'same_drawing_variant_after_release', 'main_drawing_restore', 'release')
     OR record_status = 'Released'
`;

export const UPDATE_ASYNC_STRICT_CONTROL_RULES_SQL = `
  UPDATE approval_rules
  SET requires_approval = 1,
      approver_role = COALESCE(approver_role, 'pdm_admin'),
      blocks_usage = 0,
      blocks_release = 1,
      shows_warning = 1,
      export_marker = 1,
      updated_at = :updatedAt
  WHERE rule_version_id = :ruleVersionId
`;

export const SELECT_ASYNC_APPROVED_NUMBERING_APPROVAL_SQL = `
  SELECT id
  FROM approval_requests
  WHERE request_type = 'numbering'
    AND entity_type = :entityType
    AND entity_id = :entityId
    AND action_code = :actionCode
    AND request_status = 'approved'
  LIMIT 1
`;

export const SELECT_ASYNC_PENDING_OBSOLETE_APPROVAL_SQL = `
  SELECT id
  FROM approval_requests
  WHERE request_type = 'numbering'
    AND company_id = :companyId
    AND entity_type = :entityType
    AND entity_id = :entityId
    AND action_code = :actionCode
    AND request_status IN ('pending', 'needs_info')
  LIMIT 1
`;

export const SELECT_ASYNC_PART_VARIANT_DESCRIPTOR_SQL = `
  SELECT material_code, material_label, color_code, color_label, variant_note
  FROM part_variant_attributes
  WHERE part_number_id = :partNumberId
`;

export const SELECT_ASYNC_PRIMARY_DRAWING_LINKED_PART_COUNT_SQL = `
  SELECT COUNT(DISTINCT part_number_id) AS count
  FROM drawing_part_links
  WHERE drawing_number_id = :drawingNumberId
    AND link_type = 'primary_manufacturing'
`;

export const SELECT_ASYNC_PRIMARY_PARTS_BY_DRAWING_SQL = `
  SELECT p.*
  FROM drawing_part_links l
  JOIN part_numbers p ON p.id = l.part_number_id
  WHERE l.drawing_number_id = :drawingNumberId
    AND l.link_type = 'primary_manufacturing'
  ORDER BY p.part_number ASC
`;

export const SELECT_ASYNC_DRAWING_NUMBERS_FOR_ROOT_SQL = `
  SELECT *
  FROM drawing_numbers
  WHERE part_root_id = :rootId
  ORDER BY purpose_code ASC, sequence_no ASC, drawing_number ASC
`;

export const UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL = `
  UPDATE drawing_numbers
  SET record_status = 'Obsolete',
      updated_at = :updatedAt
  WHERE id = :drawingNumberId
`;

export const UPDATE_ASYNC_PART_MAIN_DRAWING_INVALID_SQL = `
  UPDATE part_numbers
  SET record_status = 'MainDrawingInvalid',
      updated_at = :updatedAt
  WHERE id = :partNumberId
`;

export const UPDATE_ASYNC_APPROVAL_OBSOLETE_PART_SQL = `
  UPDATE part_numbers
  SET record_status = 'Obsolete',
      updated_at = :updatedAt
  WHERE id = :partNumberId
`;

export const UPDATE_ASYNC_ROOT_MAIN_DRAWING_INVALID_SQL = `
  UPDATE part_roots
  SET record_status = 'MainDrawingInvalid',
      updated_at = :updatedAt
  WHERE id = :rootId
`;

export const UPDATE_ASYNC_PART_CLOSED_SQL = `
  UPDATE part_numbers
  SET record_status = :recordStatus,
      updated_at = :updatedAt
  WHERE id = :partNumberId
`;

export const SELECT_ASYNC_OPEN_PART_COUNT_FOR_ROOT_SQL = `
  SELECT COUNT(*) AS count
  FROM part_numbers
  WHERE part_root_id = :rootId
    AND record_status NOT IN ('Obsolete', 'Merged')
`;

export const UPDATE_ASYNC_ROOT_CLOSED_SQL = `
  UPDATE part_roots
  SET record_status = :recordStatus,
      updated_at = :updatedAt
  WHERE id = :rootId
`;

export const UPDATE_ASYNC_ROOT_TOUCH_SQL = `
  UPDATE part_roots
  SET updated_at = :updatedAt
  WHERE id = :rootId
`;

export const UPDATE_ASYNC_ROOT_DRAWINGS_CLOSED_SQL = `
  UPDATE drawing_numbers
  SET record_status = :recordStatus,
      updated_at = :updatedAt
  WHERE part_root_id = :rootId
`;

export const SELECT_ASYNC_NUMBERING_SEQUENCE_SQL = `
  SELECT next_value
  FROM numbering_sequences
  WHERE sequence_key = :sequenceKey
`;

export const SELECT_ASYNC_V2_ROOT_CODES_BY_COMPANY_SQL = `
  SELECT root_code
  FROM part_roots
  WHERE company_id = :companyId
    AND rule_version_id = :ruleVersionId
    AND LENGTH(root_code) = 5
  ORDER BY root_code ASC
`;

export const SELECT_ASYNC_ROOT_CODES_BY_COMPANY_SQL = `
  SELECT root_code
  FROM part_roots
  WHERE company_id = :companyId
  ORDER BY root_code ASC
`;

export const SELECT_ASYNC_ACTIVE_DRAWING_CODES_BY_COMPANY_SQL = `
  SELECT drawing_number
  FROM drawings
  WHERE company_id = :companyId
    AND drawing_number IS NOT NULL
    AND lifecycle_state <> 'cancelled'
`;

export const SELECT_ASYNC_AUDIT_DETAILS_WITH_ROOT_CODES_SQL = `
  SELECT detail_json
  FROM audit_logs
  WHERE action LIKE 'numbering.%'
    AND (
      CAST(detail_json AS TEXT) LIKE '%rootCode%'
      OR CAST(detail_json AS TEXT) LIKE '%rootCodes%'
      OR CAST(detail_json AS TEXT) LIKE '%root_code%'
    )
  ORDER BY created_at ASC
`;

export const INSERT_ASYNC_NUMBERING_SEQUENCE_SQL = `
  INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at)
  VALUES (:sequenceKey, :companyId, :nextValue, :updatedAt)
`;

export const UPDATE_ASYNC_NUMBERING_SEQUENCE_SQL = `
  UPDATE numbering_sequences
  SET next_value = :nextValue,
      updated_at = :updatedAt
  WHERE sequence_key = :sequenceKey
`;

export const INSERT_ASYNC_PART_ROOT_SQL = `
  INSERT INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status,
    rule_version_id, created_by, created_at, updated_at
  ) VALUES (
    :id, :companyId, :rootCode, :coreName, :itemKind, :recordStatus,
    :ruleVersionId, :createdBy, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_PART_NUMBER_SQL = `
  INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
    item_kind, structure_type, is_universal, custom_specification, series_code, record_status, universal_reason,
    rule_version_id, created_by, created_at, updated_at
  ) VALUES (
    :id, :companyId, :partRootId, :partNumber, :sequenceNo, :sequenceCode, :partName,
    :itemKind, :structureType, :isUniversal, :customSpecification, :seriesCode, :recordStatus, :universalReason,
    :ruleVersionId, :createdBy, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_DRAWING_NUMBER_SQL = `
  INSERT INTO drawing_numbers (
    id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
    is_primary_manufacturing, record_status, rule_version_id,
    created_by, created_at, updated_at
  ) VALUES (
    :id, :companyId, :partRootId, :drawingNumber, :purposeCode, :purposeDescription, :sequenceNo,
    :isPrimaryManufacturing, :recordStatus, :ruleVersionId,
    :createdBy, :createdAt, :updatedAt
  )
`;

export const SELECT_ASYNC_PART_ROOTS_FOR_DUPLICATE_SIMILARITY_SQL = `
  SELECT *
  FROM part_roots
  WHERE company_id = :companyId
  ORDER BY updated_at DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_PART_NUMBERS_FOR_DUPLICATE_SIMILARITY_SQL = `
  SELECT *
  FROM part_numbers
  WHERE company_id = :companyId
  ORDER BY updated_at DESC
  LIMIT :limit
`;

export const INSERT_ASYNC_NUMBERING_WARNING_EVENT_SQL = `
  INSERT INTO warning_events (
    id, warning_code, severity, entity_type, entity_id, title, message,
    detail_json, created_by, created_at
  ) VALUES (
    :id, :warningCode, :severity, :entityType, :entityId, :title, :message,
    :detailJson, :createdBy, :createdAt
  )
`;

export const INSERT_ASYNC_DUPLICATE_CHECK_EVENT_SQL = `
  INSERT INTO duplicate_check_events (id, entity_type, query_json, result_json, blocked, created_by, created_at)
  VALUES (:id, :entityType, :queryJson, :resultJson, :blocked, :createdBy, :createdAt)
`;

export const SELECT_ASYNC_APPROVAL_REQUEST_BY_ID_SQL = `
  SELECT
    id, company_id, action_code, entity_type, entity_id, request_status, reason,
    payload_json, requested_by, requested_at
  FROM approval_requests
  WHERE id = :approvalRequestId
`;

export const INSERT_ASYNC_APPROVAL_REQUEST_SQL = `
  INSERT INTO approval_requests (
    id, company_id, request_type, action_code, entity_type, entity_id, request_status,
    reason, payload_json, requested_by, requested_at, created_at, updated_at
  ) VALUES (
    :id, :companyId, 'numbering', :actionCode, :entityType, :entityId, 'pending',
    :reason, :payloadJson, :requestedBy, :requestedAt, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_APPROVAL_DECISION_SQL = `
  INSERT INTO approval_decisions (
    id, approval_request_id, approver_role, approver_id, decision, comment, decided_at
  ) VALUES (
    :id, :approvalRequestId, :approverRole, :approverId, :decision, :comment, :decidedAt
  )
`;

export const UPDATE_ASYNC_APPROVAL_REQUEST_DECISION_SQL = `
  UPDATE approval_requests
  SET request_status = :requestStatus,
      resolved_at = :resolvedAt,
      resolved_by = :resolvedBy,
      updated_at = :updatedAt
  WHERE id = :approvalRequestId
`;

export const SELECT_ASYNC_APPROVAL_DECISIONS_BY_REQUEST_SQL = `
  SELECT id, approval_request_id, approver_role, approver_id, decision, comment, decided_at
  FROM approval_decisions
  WHERE approval_request_id = :approvalRequestId
  ORDER BY decided_at DESC, id DESC
`;

export const SELECT_ASYNC_APPROVAL_BATCH_BY_ID_SQL = `
  SELECT id, company_id, batch_code, project_code, action_code, batch_status, submitted_by, submitted_at
  FROM approval_batches
  WHERE id = :batchId
`;

export const SELECT_ASYNC_APPROVAL_BATCH_ITEMS_BY_BATCH_SQL = `
  SELECT id, batch_id, approval_request_id, item_status, resubmitted_from_item_id
  FROM approval_batch_items
  WHERE batch_id = :batchId
  ORDER BY created_at ASC, id ASC
`;

export const SELECT_ASYNC_APPROVAL_BATCHES_BASE_SQL = `
  SELECT id, company_id, batch_code, project_code, action_code, batch_status, submitted_by, submitted_at
  FROM approval_batches
`;

export const INSERT_ASYNC_APPROVAL_BATCH_SQL = `
  INSERT INTO approval_batches (
    id, company_id, batch_code, request_type, project_code, action_code, batch_status,
    submitted_by, submitted_at, created_at, updated_at
  ) VALUES (
    :id, :companyId, :batchCode, 'numbering', :projectCode, :actionCode, 'pending',
    :submittedBy, :submittedAt, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_APPROVAL_BATCH_ITEM_SQL = `
  INSERT INTO approval_batch_items (
    id, batch_id, approval_request_id, item_status, resubmitted_from_item_id, created_at, updated_at
  ) VALUES (
    :id, :batchId, :approvalRequestId, :itemStatus, :resubmittedFromItemId, :createdAt, :updatedAt
  )
`;

export const UPDATE_ASYNC_APPROVAL_BATCH_ITEM_STATUS_SQL = `
  UPDATE approval_batch_items
  SET item_status = :itemStatus,
      updated_at = :updatedAt
  WHERE id = :itemId
`;

export const SELECT_ASYNC_REJECTED_APPROVAL_BATCH_ITEMS_SQL = `
  SELECT id, batch_id, approval_request_id, item_status, resubmitted_from_item_id
  FROM approval_batch_items
  WHERE batch_id = :batchId
    AND item_status IN ('rejected', 'needs_info')
  ORDER BY updated_at ASC, id ASC
`;

export const UPDATE_ASYNC_APPROVAL_BATCH_STATUS_SQL = `
  UPDATE approval_batches
  SET batch_status = :batchStatus,
      updated_at = :updatedAt
  WHERE id = :batchId
`;

export const SELECT_ASYNC_APPROVAL_USER_SUMMARY_SQL = `
  SELECT display_name, role
  FROM users
  WHERE id = :userId
`;

export const SELECT_ASYNC_APPROVAL_PART_ROOT_SUMMARY_SQL = `
  SELECT root_code, core_name, item_kind, record_status
  FROM part_roots
  WHERE id = :entityId
`;

export const SELECT_ASYNC_APPROVAL_PART_NUMBER_SUMMARY_SQL = `
  SELECT p.part_number, p.part_name, p.item_kind, p.record_status,
         r.root_code, r.core_name,
         (
           SELECT d.drawing_number
           FROM drawing_part_links l
           JOIN drawing_numbers d ON d.id = l.drawing_number_id
           WHERE l.part_number_id = p.id
             AND l.link_type = 'primary_manufacturing'
             AND d.purpose_code IN ('MA', 'M')
             AND d.record_status NOT IN ('Obsolete', 'Merged')
           ORDER BY d.is_primary_manufacturing DESC, d.sequence_no ASC, d.drawing_number ASC
           LIMIT 1
         ) AS primary_drawing_number
  FROM part_numbers p
  JOIN part_roots r ON r.id = p.part_root_id
  WHERE p.id = :entityId
`;

export const SELECT_ASYNC_APPROVAL_DRAWING_SUMMARY_SQL = `
  SELECT d.drawing_number, d.purpose_code, d.record_status,
         r.root_code, r.core_name, r.item_kind
  FROM drawing_numbers d
  JOIN part_roots r ON r.id = d.part_root_id
  WHERE d.id = :entityId
`;

export const UPDATE_ASYNC_APPROVAL_RELEASE_PART_SQL = `
  UPDATE part_numbers
  SET record_status = 'Released',
      updated_at = :updatedAt
  WHERE id = :partNumberId
`;

export const UPDATE_ASYNC_APPROVAL_RELEASE_ROOT_SQL = `
  UPDATE part_roots
  SET record_status = 'Released',
      updated_at = :updatedAt
  WHERE id = :rootId
`;

export const UPDATE_ASYNC_APPROVAL_RELEASE_DRAWINGS_SQL = `
  UPDATE drawing_numbers
  SET record_status = CASE WHEN record_status NOT IN ('Obsolete', 'Merged') THEN 'Released' ELSE record_status END,
      updated_at = :updatedAt
  WHERE part_root_id = :rootId
`;

export const SELECT_ASYNC_DRAWING_PART_LINK_BY_TYPE_SQL = `
  SELECT id
  FROM drawing_part_links
  WHERE drawing_number_id = :drawingNumberId
    AND part_number_id = :partNumberId
    AND link_type = :linkType
  LIMIT 1
`;

export const SELECT_ASYNC_DRAWING_PART_LINKS_FOR_PAIR_SQL = `
  SELECT
    l.id,
    l.drawing_number_id,
    l.part_number_id,
    d.drawing_number,
    p.part_number,
    l.link_type,
    l.created_at
  FROM drawing_part_links l
  JOIN drawing_numbers d ON d.id = l.drawing_number_id
  JOIN part_numbers p ON p.id = l.part_number_id
  WHERE l.drawing_number_id = :drawingNumberId
    AND l.part_number_id = :partNumberId
  ORDER BY l.link_type ASC
`;

export const SELECT_ASYNC_REFERENCE_LINK_FOR_PAIR_SQL = `
  SELECT id
  FROM drawing_part_links
  WHERE drawing_number_id = :drawingNumberId
    AND part_number_id = :partNumberId
    AND link_type = 'reference'
  LIMIT 1
`;

export const SELECT_ASYNC_PRIMARY_LINK_FOR_PAIR_SQL = `
  SELECT id
  FROM drawing_part_links
  WHERE drawing_number_id = :drawingNumberId
    AND part_number_id = :partNumberId
    AND link_type = 'primary_manufacturing'
  LIMIT 1
`;

export const SELECT_ASYNC_DRAWING_PRIMARY_LINK_COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM drawing_part_links
  WHERE drawing_number_id = :drawingNumberId
    AND link_type = 'primary_manufacturing'
`;

export const UPSERT_ASYNC_SAME_DRAWING_VARIANT_SQL = `
  INSERT INTO same_drawing_variants (id, drawing_number_id, part_number_id, field_name, field_value, created_by, created_at)
  VALUES (:id, :drawingNumberId, :partNumberId, :fieldName, :fieldValue, :createdBy, :createdAt)
  ON CONFLICT(drawing_number_id, part_number_id, field_name)
  DO UPDATE SET field_value = excluded.field_value
`;

export const SELECT_ASYNC_PRIMARY_MANUFACTURING_DRAWING_FOR_PART_SQL = `
  SELECT d.*
  FROM drawing_part_links l
  JOIN drawing_numbers d ON d.id = l.drawing_number_id
  WHERE l.part_number_id = :partNumberId
    AND l.link_type = 'primary_manufacturing'
    AND d.purpose_code IN ('MA', 'M')
    AND d.record_status NOT IN ('Obsolete', 'Merged')
  LIMIT 1
`;

export const DELETE_ASYNC_SAME_DRAWING_VARIANTS_FOR_PAIR_SQL = `
  DELETE FROM same_drawing_variants
  WHERE drawing_number_id = :drawingNumberId
    AND part_number_id = :partNumberId
`;

export const UPDATE_ASYNC_MAIN_DRAWING_RESTORE_PART_SQL = `
  UPDATE part_numbers
  SET record_status = 'Active',
      updated_at = :updatedAt
  WHERE id = :partNumberId
`;

export const SELECT_ASYNC_REMAINING_MAIN_DRAWING_INVALID_PART_COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM part_numbers
  WHERE part_root_id = :rootId
    AND record_status = 'MainDrawingInvalid'
    AND id <> :partNumberId
`;

export const UPDATE_ASYNC_MAIN_DRAWING_RESTORE_ROOT_SQL = `
  UPDATE part_roots
  SET record_status = 'Active',
      updated_at = :updatedAt
  WHERE id = :rootId
`;

export const INSERT_ASYNC_NUMBERING_AUDIT_SQL = `
  INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at)
  VALUES (:id, :actorId, :action, :detailJson, :createdAt)
`;

export const UPDATE_ASYNC_NUMBERING_TASK_STATUS_SQL = `
  UPDATE numbering_task_items
  SET task_status = :status,
      handled_by = :handledBy,
      handled_at = :handledAt,
      updated_at = :updatedAt
  WHERE id = :taskId
    AND company_id = :companyId
`;

export const SELECT_ASYNC_NUMBERING_TASK_BY_ID_SQL = `
  SELECT
    id, company_id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
    assigned_to, assigned_role, project_code, action_url, detail_json, created_by, created_at, handled_at
  FROM numbering_task_items
  WHERE id = :taskId
    AND company_id = :companyId
`;

export const SELECT_ASYNC_NUMBERING_ASSIGNED_ROLE_CODES_SQL = `
  SELECT r.role_code
  FROM user_role_assignments a
  JOIN roles r ON r.id = a.role_id
  WHERE a.user_id = :userId
    AND a.revoked_at IS NULL
    AND (a.starts_at IS NULL OR a.starts_at <= :now)
    AND (a.hard_ends_at IS NULL OR a.hard_ends_at > :now)
    AND r.enabled = 1
  ORDER BY a.assigned_at DESC, r.role_code ASC
`;

export const SELECT_ASYNC_NUMBERING_ALLOWED_ROLE_SCOPES_SQL = `
  SELECT r.role_code, s.scope_kind, s.scope_code
  FROM role_scope_rules s
  JOIN roles r ON r.id = s.role_id
  WHERE s.allowed = 1
`;

export const SELECT_ASYNC_NUMBERING_ACTIVE_DELEGATIONS_SQL = `
  SELECT
    d.delegated_from,
    u.display_name AS delegated_from_name,
    u.role AS delegated_from_role,
    d.project_code,
    d.action_code
  FROM approval_delegations d
  JOIN users u ON u.id = d.delegated_from
  WHERE d.delegated_to = :userId
    AND d.revoked_at IS NULL
    AND (d.starts_at IS NULL OR d.starts_at <= :now)
    AND (d.ends_at IS NULL OR d.ends_at >= :now)
  ORDER BY d.created_at DESC
`;

export const SELECT_ASYNC_NUMBERING_TASKS_BASE_SQL = `
  SELECT
    id, company_id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
    assigned_to, assigned_role, project_code, action_url, detail_json, created_by, created_at, handled_at
  FROM numbering_task_items
`;

export const SELECT_ASYNC_NUMBERING_NOTIFICATIONS_BASE_SQL = `
  SELECT
    id, company_id, notification_type, entity_type, entity_id, title, message, severity,
    recipient_id, recipient_role, read_at, handled_at, dismissible,
    action_url, detail_json, created_by, created_at
  FROM numbering_notifications
`;

export const SELECT_ASYNC_NUMBERING_NOTIFICATION_BY_ID_SQL = `
  SELECT
    id, company_id, notification_type, entity_type, entity_id, title, message, severity,
    recipient_id, recipient_role, read_at, handled_at, dismissible,
    action_url, detail_json, created_by, created_at
  FROM numbering_notifications
  WHERE id = :notificationId
    AND company_id = :companyId
`;

export const UPDATE_ASYNC_NUMBERING_NOTIFICATION_STATE_SQL = `
  UPDATE numbering_notifications
  SET read_at = CASE WHEN :markRead = 1 AND read_at IS NULL THEN :now ELSE read_at END,
      handled_at = CASE WHEN :markHandled = 1 AND handled_at IS NULL THEN :now ELSE handled_at END,
      handled_by = CASE WHEN :markHandled = 1 THEN :handledBy ELSE handled_by END,
      updated_at = :now
  WHERE id = :notificationId
    AND company_id = :companyId
`;

export const SELECT_ASYNC_NUMBERING_EXPORT_ROOTS_SQL = `
  SELECT root_code, core_name, item_kind, record_status, updated_at
  FROM part_roots
  WHERE company_id = :companyId
  ORDER BY root_code
`;

export const SELECT_ASYNC_NUMBERING_EXPORT_PARTS_SQL = `
  SELECT r.root_code, p.part_number, p.part_name, p.item_kind, p.record_status, p.updated_at
  FROM part_numbers p
  JOIN part_roots r ON r.id = p.part_root_id
  WHERE p.company_id = :companyId
  ORDER BY r.root_code, p.sequence_no
`;

export const SELECT_ASYNC_NUMBERING_EXPORT_DRAWINGS_SQL = `
  SELECT r.root_code, d.drawing_number, d.purpose_code, d.purpose_description, d.record_status, d.updated_at
  FROM drawing_numbers d
  JOIN part_roots r ON r.id = d.part_root_id
  WHERE d.company_id = :companyId
  ORDER BY r.root_code, d.purpose_code, d.sequence_no
`;

export const SELECT_ASYNC_NUMBERING_EXPORT_AUDIT_SQL = `
  SELECT action, actor_id, detail_json, created_at
  FROM audit_logs
  WHERE action LIKE 'numbering.%'
  ORDER BY created_at DESC
  LIMIT :limit
`;

export const INSERT_ASYNC_NUMBERING_EXPORT_JOB_SQL = `
  INSERT INTO numbering_export_jobs (
    id, company_id, export_mode, status, result_json, generated_by, generated_at, completed_at
  ) VALUES (
    :id, :companyId, :exportMode, 'completed', :resultJson, :generatedBy, :generatedAt, :completedAt
  )
`;

export const SELECT_ASYNC_NUMBERING_EXPORT_JOB_BY_ID_SQL = `
  SELECT id, company_id, export_mode, status, result_json, generated_by, generated_at, completed_at
  FROM numbering_export_jobs
  WHERE id = :jobId
`;

export const SELECT_ASYNC_NUMBERING_EXPORT_JOBS_SQL = `
  SELECT id, company_id, export_mode, status, result_json, generated_by, generated_at, completed_at
  FROM numbering_export_jobs
  WHERE company_id = :companyId
  ORDER BY generated_at DESC, id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_COUNT_ROOTS_SQL = `
  SELECT COUNT(*) AS count
  FROM part_roots
  WHERE company_id = :companyId
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_COUNT_PARTS_SQL = `
  SELECT COUNT(*) AS count
  FROM part_numbers
  WHERE company_id = :companyId
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_COUNT_DRAWINGS_SQL = `
  SELECT COUNT(*) AS count
  FROM drawing_numbers
  WHERE company_id = :companyId
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_COUNT_OPEN_TASKS_SQL = `
  SELECT COUNT(*) AS count
  FROM numbering_task_items
  WHERE task_status = 'open'
    AND company_id = :companyId
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_OPEN_TASKS_FOR_TWO_ROLES_SQL = `
  SELECT COUNT(*) AS count
  FROM numbering_task_items
  WHERE task_status = 'open'
    AND company_id = :companyId
    AND assigned_role IN (:role0, :role1)
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_APPROVAL_RULES_FOR_TWO_ROLES_SQL = `
  SELECT COUNT(*) AS count
  FROM approval_rules
  WHERE approver_role IN (:role0, :role1)
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_PROJECT_BUCKETS_SQL = `
  SELECT COALESCE(NULLIF(project_code, ''), 'Unassigned') AS projectCode,
         COUNT(*) AS totalTasks,
         SUM(CASE WHEN task_status = 'open' THEN 1 ELSE 0 END) AS openTasks,
         SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) AS criticalTasks
  FROM numbering_task_items
  WHERE company_id = :companyId
  GROUP BY COALESCE(NULLIF(project_code, ''), 'Unassigned')
  ORDER BY openTasks DESC, totalTasks DESC, projectCode ASC
  LIMIT 20
`;

export const INSERT_ASYNC_MONTHLY_AUDIT_REPORT_SQL = `
  INSERT INTO monthly_audit_reports (
    id, company_id, report_type, report_month, generation_mode, generated_by, status, query_json, created_at
  ) VALUES (
    :id, :companyId, 'numbering_master', :reportMonth, :generationMode, :generatedBy, 'completed', :queryJson, :createdAt
  )
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_REPORT_BY_ID_SQL = `
  SELECT id, company_id, report_type, report_month, generation_mode, generated_by, status, query_json, created_at
  FROM monthly_audit_reports
  WHERE id = :reportId
    AND report_type = 'numbering_master'
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_SQL = `
  SELECT id, company_id, report_type, report_month, generation_mode, generated_by, status, query_json, created_at
  FROM monthly_audit_reports
  WHERE report_type = 'numbering_master'
    AND company_id = :companyId
  ORDER BY created_at DESC, id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_BY_MONTH_SQL = `
  SELECT id, company_id, report_type, report_month, generation_mode, generated_by, status, query_json, created_at
  FROM monthly_audit_reports
  WHERE report_type = 'numbering_master'
    AND company_id = :companyId
    AND report_month = :reportMonth
  ORDER BY created_at DESC, id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_OVERDUE_DRAFT_ROOTS_SQL = `
  SELECT *
  FROM part_roots
  WHERE record_status IN ('Draft', 'NeedInfo')
    AND updated_at <= :cutoffAt
  ORDER BY updated_at ASC, root_code ASC
`;

export const SELECT_ASYNC_DRAFT_ROOT_PARTS_SQL = `
  SELECT *
  FROM part_numbers
  WHERE part_root_id = :rootId
  ORDER BY sequence_no ASC, part_number ASC
`;

export const SELECT_ASYNC_DRAFT_ROOT_DRAWINGS_SQL = `
  SELECT *
  FROM drawing_numbers
  WHERE part_root_id = :rootId
  ORDER BY sequence_no ASC, drawing_number ASC
`;

export const UPDATE_ASYNC_OVERDUE_DRAFT_DRAWINGS_SQL = `
  UPDATE drawing_numbers
  SET record_status = 'PendingAdminConfirm',
      updated_at = :updatedAt
  WHERE part_root_id = :rootId
    AND record_status IN ('Draft', 'NeedInfo')
`;

export const UPDATE_ASYNC_OVERDUE_DRAFT_PARTS_SQL = `
  UPDATE part_numbers
  SET record_status = 'PendingAdminConfirm',
      updated_at = :updatedAt
  WHERE part_root_id = :rootId
    AND record_status IN ('Draft', 'NeedInfo')
`;

export const UPDATE_ASYNC_OVERDUE_DRAFT_ROOT_SQL = `
  UPDATE part_roots
  SET record_status = 'PendingAdminConfirm',
      updated_at = :updatedAt
  WHERE id = :rootId
`;

export const INSERT_ASYNC_NUMBERING_TASK_ITEM_SQL = `
  INSERT INTO numbering_task_items (
    id, company_id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
    assigned_to, assigned_role, project_code, action_url, detail_json,
    created_by, created_at, updated_at
  ) VALUES (
    :id, :companyId, :taskType, :entityType, :entityId, :title, :message, :riskLevel, 'open',
    :assignedTo, :assignedRole, :projectCode, :actionUrl, :detailJson,
    :createdBy, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_NUMBERING_NOTIFICATION_SQL = `
  INSERT INTO numbering_notifications (
    id, company_id, notification_type, entity_type, entity_id, title, message, severity,
    recipient_id, recipient_role, dismissible, action_url, detail_json,
    created_by, created_at, updated_at
  ) VALUES (
    :id, :companyId, :notificationType, :entityType, :entityId, :title, :message, :severity,
    :recipientId, :recipientRole, :dismissible, :actionUrl, :detailJson,
    :createdBy, :createdAt, :updatedAt
  )
`;

export const SELECT_ASYNC_ROOT_PART_NUMBERS_SQL = `
  SELECT *
  FROM part_numbers
  WHERE part_root_id = :rootId
  ORDER BY sequence_no ASC, part_number ASC
`;

export const SELECT_ASYNC_ROOT_PART_NUMBERS_WITH_MASTER_DATA_SQL = `
  SELECT p.*, va.material_code, va.material_label, va.surface_treatment
  FROM part_numbers p
  LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
  WHERE p.part_root_id = :rootId
  ORDER BY p.sequence_no ASC, p.part_number ASC
`;

export const SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL = `
  SELECT *
  FROM drawing_numbers
  WHERE part_root_id = :rootId
  ORDER BY purpose_code ASC, sequence_no ASC, drawing_number ASC
`;

export const SELECT_ASYNC_FIRST_PART_NUMBER_FOR_ROOT_SQL = `
  SELECT *
  FROM part_numbers
  WHERE part_root_id = :rootId
  ORDER BY sequence_no ASC
  LIMIT 1
`;

export const SELECT_ASYNC_FIRST_DRAWING_NUMBER_FOR_ROOT_SQL = `
  SELECT *
  FROM drawing_numbers
  WHERE part_root_id = :rootId
  ORDER BY purpose_code ASC, sequence_no ASC
  LIMIT 1
`;

export const UPDATE_ASYNC_PART_ROOT_CORE_NAME_SQL = `
  UPDATE part_roots
  SET core_name = :coreName,
      updated_at = :updatedAt
  WHERE id = :rootId
`;

export const UPDATE_ASYNC_PART_NUMBER_DRAFT_SQL = `
  UPDATE part_numbers
  SET part_name = :partName,
      custom_specification = :customSpecification,
      universal_reason = :universalReason,
      updated_at = :updatedAt
  WHERE id = :partNumberId
`;

export const UPDATE_ASYNC_ROOT_PART_NAMES_SQL = `
  UPDATE part_numbers
  SET part_name = :partName,
      updated_at = :updatedAt
  WHERE part_root_id = :rootId
`;

export const UPDATE_ASYNC_DRAWING_PURPOSE_DESCRIPTION_SQL = `
  UPDATE drawing_numbers
  SET purpose_description = :purposeDescription,
      updated_at = :updatedAt
  WHERE id = :drawingNumberId
`;

export const UPDATE_ASYNC_ROOT_DRAWINGS_OBSOLETE_SQL = `
  UPDATE drawing_numbers
  SET record_status = 'Obsolete',
      updated_at = :updatedAt
  WHERE part_root_id = :rootId
`;

export const UPDATE_ASYNC_ROOT_PARTS_OBSOLETE_SQL = `
  UPDATE part_numbers
  SET record_status = 'Obsolete',
      updated_at = :updatedAt
  WHERE part_root_id = :rootId
`;

export const UPDATE_ASYNC_ROOT_OBSOLETE_SQL = `
  UPDATE part_roots
  SET record_status = 'Obsolete',
      updated_at = :updatedAt
  WHERE id = :rootId
`;

export const SELECT_ASYNC_DRAFT_DELETE_DEPENDENCY_COUNTS_SQL = `
  SELECT
    (SELECT COUNT(*)
     FROM approval_requests
     WHERE (entity_id = :rootId
        OR entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)
        OR entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId))
       AND (CAST(:excludeApprovalRequestId AS text) IS NULL OR id <> CAST(:excludeApprovalRequestId AS text))) AS approval_count,
    (SELECT COUNT(*)
     FROM drawing_revision_packages
     WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId)) AS revision_package_count,
    (SELECT COUNT(*)
     FROM shared_cad_model_versions
     WHERE part_root_id = :rootId
        OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)) AS shared_model_count,
    (SELECT COUNT(*)
     FROM manufacturing_baselines
     WHERE part_root_id = :rootId
        OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)) AS manufacturing_baseline_count,
    (SELECT COUNT(*)
     FROM manufacturing_baseline_items
     WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId)) AS manufacturing_baseline_item_count,
    (SELECT COUNT(*)
     FROM part_replacement_links
     WHERE old_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)
        OR new_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)
        OR source_drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId)) AS replacement_link_count,
    (SELECT COUNT(*)
     FROM bom_reconfirmation_flags
     WHERE old_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)
        OR new_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)) AS bom_reconfirmation_count,
    (SELECT COUNT(*)
     FROM file_assets
     WHERE (linked_entity_type = 'part_root' AND linked_entity_id = :rootId)
        OR (linked_entity_type = 'part_number' AND linked_entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId))
        OR (linked_entity_type = 'drawing_number' AND linked_entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId))) AS file_asset_count
`;

export const UPDATE_ASYNC_DRAFT_FILE_ASSETS_DELETED_SQL = `
  UPDATE file_assets
  SET deleted_at = :deletedAt,
      deleted_by = :deletedBy,
      deleted_reason = :deletedReason,
      updated_at = :updatedAt
  WHERE deleted_at IS NULL
    AND (
      (linked_entity_type = 'part_root' AND linked_entity_id = :rootId)
      OR (linked_entity_type = 'part_number' AND linked_entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId))
      OR (linked_entity_type = 'drawing_number' AND linked_entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId))
    )
`;

export const DELETE_ASYNC_DRAFT_WARNING_EVENTS_SQL = `
  DELETE FROM warning_events
  WHERE (entity_type = 'part_root' AND entity_id = :rootId)
     OR (entity_type = 'part_number' AND entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId))
     OR (entity_type = 'drawing_number' AND entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId))
`;

export const UPDATE_ASYNC_DRAFT_TASK_ITEMS_CANCELLED_SQL = `
  UPDATE numbering_task_items
  SET task_status = 'cancelled',
      handled_by = :handledBy,
      handled_at = :handledAt,
      updated_at = :handledAt
  WHERE task_status = 'open'
    AND (
      (entity_type = 'part_root' AND entity_id = :rootId)
      OR (entity_type = 'part_number' AND entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId))
      OR (entity_type = 'drawing_number' AND entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId))
    )
`;

export const UPDATE_ASYNC_DRAFT_NOTIFICATIONS_HANDLED_SQL = `
  UPDATE numbering_notifications
  SET handled_by = :handledBy,
      handled_at = :handledAt,
      updated_at = :handledAt
  WHERE handled_at IS NULL
    AND (
      (entity_type = 'part_root' AND entity_id = :rootId)
      OR (entity_type = 'part_number' AND entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId))
      OR (entity_type = 'drawing_number' AND entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId))
    )
`;

export const UPDATE_ASYNC_DRAFT_PART_NUMBER_DRAFT_SOURCES_NULL_SQL = `
  UPDATE part_number_drafts
  SET source_part_number_id = CASE
        WHEN source_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId) THEN NULL
        ELSE source_part_number_id
      END,
      source_drawing_number_id = CASE
        WHEN source_drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId) THEN NULL
        ELSE source_drawing_number_id
      END,
      updated_at = :updatedAt
  WHERE source_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)
     OR source_drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId)
`;

export const DELETE_ASYNC_DRAFT_DRAWING_FFF_SQL = `
  DELETE FROM drawing_revision_fff_assessments
  WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId)
`;

export const DELETE_ASYNC_DRAFT_SAME_DRAWING_VARIANTS_SQL = `
  DELETE FROM same_drawing_variants
  WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = :rootId)
     OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)
`;

export const DELETE_ASYNC_DRAFT_PART_VARIANT_ATTRIBUTES_SQL = `
  DELETE FROM part_variant_attributes
  WHERE part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = :rootId)
`;

export const DELETE_ASYNC_DRAFT_DRAWING_NUMBERS_SQL = `
  DELETE FROM drawing_numbers
  WHERE part_root_id = :rootId
`;

export const DELETE_ASYNC_DRAFT_PART_NUMBERS_SQL = `
  DELETE FROM part_numbers
  WHERE part_root_id = :rootId
`;

export const DELETE_ASYNC_DRAFT_PART_ROOT_SQL = `
  DELETE FROM part_roots
  WHERE id = :rootId
`;

export const SELECT_ASYNC_NUMBERING_LINKS_FOR_ROOT_SQL = `
  SELECT
    l.id,
    l.drawing_number_id,
    l.part_number_id,
    d.drawing_number,
    p.part_number,
    l.link_type,
    l.created_at
  FROM drawing_part_links l
  JOIN drawing_numbers d ON d.id = l.drawing_number_id
  JOIN part_numbers p ON p.id = l.part_number_id
  WHERE d.part_root_id = :rootId OR p.part_root_id = :rootId
  ORDER BY d.drawing_number ASC, p.part_number ASC, l.link_type ASC
`;

export const SELECT_ASYNC_NUMBERING_VARIANTS_FOR_ROOT_SQL = `
  SELECT
    v.id,
    v.drawing_number_id,
    v.part_number_id,
    d.drawing_number,
    p.part_number,
    v.field_name,
    v.field_value,
    v.created_at
  FROM same_drawing_variants v
  JOIN drawing_numbers d ON d.id = v.drawing_number_id
  JOIN part_numbers p ON p.id = v.part_number_id
  WHERE d.part_root_id = :rootId OR p.part_root_id = :rootId
  ORDER BY d.drawing_number ASC, p.part_number ASC, v.field_name ASC
`;

export const SELECT_ASYNC_NUMBERING_WARNINGS_BASE_SQL = `
  SELECT id, warning_code, severity, entity_type, entity_id, title, message, detail_json, created_at, acknowledged_at
  FROM warning_events
`;

export const SELECT_ASYNC_NUMBERING_AUDIT_TRAIL_SQL = `
  SELECT id, actor_id, action, detail_json, created_at
  FROM audit_logs
  WHERE action LIKE 'numbering.%'
  ORDER BY created_at DESC
  LIMIT 200
`;

export const SELECT_ASYNC_NUMBERING_SEARCH_ROOTS_BASE_SQL = `
  SELECT
    'part_root' AS entity_type,
    r.id AS entity_id,
    r.root_code,
    r.core_name,
    r.root_code AS display_code,
    r.core_name AS display_name,
    r.item_kind,
    r.record_status,
    NULL AS purpose_code,
    NULL AS part_number,
    NULL AS drawing_number,
    (
      SELECT d.drawing_number
      FROM drawing_numbers d
      WHERE d.part_root_id = r.id AND d.purpose_code IN ('MA', 'M') AND d.is_primary_manufacturing = 1
      ORDER BY d.sequence_no ASC
      LIMIT 1
    ) AS primary_drawing_number,
    (SELECT COUNT(*) FROM part_numbers p WHERE p.part_root_id = r.id) AS part_count,
    (SELECT COUNT(*) FROM drawing_numbers d WHERE d.part_root_id = r.id) AS drawing_count,
    0 AS linked_part_count,
    (
      SELECT COUNT(*)
      FROM warning_events w
      WHERE w.entity_type = 'part_root' AND w.entity_id = r.id AND w.acknowledged_at IS NULL
    ) AS warning_count
  FROM part_roots r
`;

export const SELECT_ASYNC_NUMBERING_SEARCH_PARTS_BASE_SQL = `
  SELECT
    'part_number' AS entity_type,
    p.id AS entity_id,
    r.root_code,
    r.core_name,
    p.part_number AS display_code,
    p.part_name AS display_name,
    p.item_kind,
    p.record_status,
    NULL AS purpose_code,
    p.part_number,
    NULL AS drawing_number,
    (
      SELECT d.drawing_number
      FROM drawing_part_links l
      JOIN drawing_numbers d ON d.id = l.drawing_number_id
      WHERE l.part_number_id = p.id AND l.link_type = 'primary_manufacturing'
      ORDER BY d.sequence_no ASC
      LIMIT 1
    ) AS primary_drawing_number,
    1 AS part_count,
    (
      SELECT COUNT(*)
      FROM drawing_part_links l
      WHERE l.part_number_id = p.id
    ) AS drawing_count,
    0 AS linked_part_count,
    (
      SELECT COUNT(*)
      FROM warning_events w
      WHERE w.entity_type = 'part_number' AND w.entity_id = p.id AND w.acknowledged_at IS NULL
    ) AS warning_count
  FROM part_numbers p
  JOIN part_roots r ON r.id = p.part_root_id
`;

export const SELECT_ASYNC_NUMBERING_SEARCH_DRAWINGS_BASE_SQL = `
  SELECT
    'drawing_number' AS entity_type,
    d.id AS entity_id,
    r.root_code,
    r.core_name,
    d.drawing_number AS display_code,
    d.purpose_description AS display_name,
    r.item_kind,
    d.record_status,
    d.purpose_code,
    NULL AS part_number,
    d.drawing_number,
    CASE WHEN d.purpose_code IN ('MA', 'M') AND d.is_primary_manufacturing = 1 THEN d.drawing_number ELSE NULL END AS primary_drawing_number,
    0 AS part_count,
    1 AS drawing_count,
    (
      SELECT COUNT(*)
      FROM drawing_part_links l
      WHERE l.drawing_number_id = d.id
    ) AS linked_part_count,
    (
      SELECT COUNT(*)
      FROM warning_events w
      WHERE w.entity_type = 'drawing_number' AND w.entity_id = d.id AND w.acknowledged_at IS NULL
    ) AS warning_count
  FROM drawing_numbers d
  JOIN part_roots r ON r.id = d.part_root_id
`;

export const SELECT_ASYNC_DRAWING_MODULE_RECORDS_BASE_SQL = `
  SELECT
    d.*,
    r.root_code,
    r.core_name,
    r.item_kind,
    (
      SELECT COUNT(*)
      FROM drawing_part_links l
      WHERE l.drawing_number_id = d.id
    ) AS linked_part_count,
    (
      SELECT COUNT(*)
      FROM warning_events w
      WHERE w.entity_type = 'drawing_number'
        AND w.entity_id = d.id
        AND w.acknowledged_at IS NULL
    ) AS warning_count
  FROM drawing_numbers d
  JOIN part_roots r ON r.id = d.part_root_id
`;

export const SELECT_ASYNC_DRAWING_MODULE_LINKED_PART_NUMBERS_SQL = `
  SELECT l.drawing_number_id, p.part_number
  FROM drawing_part_links l
  JOIN part_numbers p ON p.id = l.part_number_id
`;

export const SELECT_ASYNC_DRAWING_MODULE_LINKED_PARTS_BY_ROOT_SQL = `
  SELECT
    p.id,
    p.part_root_id,
    p.part_number,
    p.part_name,
    p.record_status,
    va.material_code,
    va.material_label,
    va.color_code,
    va.color_label,
    va.surface_treatment,
    va.variant_note,
    (
      SELECT d.drawing_number
      FROM drawing_part_links l
      JOIN drawing_numbers d ON d.id = l.drawing_number_id
      WHERE l.part_number_id = p.id AND l.link_type = 'primary_manufacturing'
      ORDER BY d.drawing_number ASC
      LIMIT 1
    ) AS primary_drawing_number
  FROM part_numbers p
  LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
`;

export const SELECT_ASYNC_DRAWING_MODULE_RELEASE_STATUS_MISMATCHES_SQL = `
  SELECT
    d.id AS drawing_number_id,
    s.id AS submission_id,
    s.revision,
    s.released_at
  FROM drawing_numbers d
  JOIN submissions s
    ON s.company_id = d.company_id
   AND s.status = 'Released'
   AND (
      (s.source_entity_type = 'drawing_number' AND s.source_entity_id = d.id)
      OR (s.drawing_number = d.drawing_number)
   )
  WHERE d.id IN (__DRAWING_ID_FILTER__)
    AND d.record_status <> 'Released'
  ORDER BY d.id ASC, COALESCE(s.released_at, s.updated_at, s.created_at) DESC, s.id DESC
`;

export const SELECT_ASYNC_PART_MODULE_RECORDS_BASE_SQL = `
  SELECT
    p.*,
    r.root_code,
    r.core_name,
    va.id AS variant_id,
    va.material_code,
    va.material_label,
    va.color_code,
    va.color_label,
    va.surface_treatment,
    va.variant_note,
    va.updated_at AS variant_updated_at,
    (
      SELECT d.drawing_number
      FROM drawing_part_links l
      JOIN drawing_numbers d ON d.id = l.drawing_number_id
      WHERE l.part_number_id = p.id AND l.link_type = 'primary_manufacturing'
      ORDER BY d.drawing_number ASC
      LIMIT 1
    ) AS primary_drawing_number,
    (
      SELECT d.record_status
      FROM drawing_part_links l
      JOIN drawing_numbers d ON d.id = l.drawing_number_id
      WHERE l.part_number_id = p.id AND l.link_type = 'primary_manufacturing'
      ORDER BY d.drawing_number ASC
      LIMIT 1
    ) AS primary_drawing_record_status,
    (
      SELECT COUNT(*)
      FROM drawing_part_links l
      WHERE l.part_number_id = p.id
    ) AS drawing_count
  FROM part_numbers p
  JOIN part_roots r ON r.id = p.part_root_id
  LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
`;

export const SELECT_ASYNC_PART_DETAIL_LINKED_DRAWINGS_SQL = `
  SELECT
    l.id,
    l.drawing_number_id,
    l.part_number_id,
    d.drawing_number,
    p.part_number,
    l.link_type,
    l.created_at
  FROM drawing_part_links l
  JOIN drawing_numbers d ON d.id = l.drawing_number_id
  JOIN part_numbers p ON p.id = l.part_number_id
  WHERE l.part_number_id = :partNumberId
  ORDER BY l.link_type ASC, d.drawing_number ASC
`;

export const SELECT_ASYNC_PART_DETAIL_SAME_DRAWING_VARIANTS_SQL = `
  SELECT
    v.id,
    v.drawing_number_id,
    v.part_number_id,
    d.drawing_number,
    p.part_number,
    v.field_name,
    v.field_value,
    v.created_at
  FROM same_drawing_variants v
  JOIN drawing_numbers d ON d.id = v.drawing_number_id
  JOIN part_numbers p ON p.id = v.part_number_id
  WHERE v.part_number_id = :partNumberId
  ORDER BY d.drawing_number ASC, v.field_name ASC
`;

export const SELECT_ASYNC_PART_VARIANT_ATTRIBUTES_BY_PART_ID_SQL = `
  SELECT *
  FROM part_variant_attributes
  WHERE part_number_id = :partNumberId
`;

export const UPDATE_ASYNC_PART_VARIANT_ATTRIBUTES_SQL = `
  UPDATE part_variant_attributes
  SET material_code = :materialCode,
      material_label = :materialLabel,
      color_code = :colorCode,
      color_label = :colorLabel,
      surface_treatment = :surfaceTreatment,
      variant_note = :variantNote,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :id
`;

export const INSERT_ASYNC_PART_VARIANT_ATTRIBUTES_SQL = `
  INSERT INTO part_variant_attributes (
    id, part_number_id, material_code, material_label, color_code, color_label, surface_treatment, variant_note, updated_by, created_at, updated_at
  ) VALUES (
    :id, :partNumberId, :materialCode, :materialLabel, :colorCode, :colorLabel, :surfaceTreatment, :variantNote, :updatedBy, :createdAt, :updatedAt
  )
`;

function normalizeComparable(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./\\()[\]{}]+/g, "");
}

function similarityScore(candidate: string, query: string) {
  const normalizedCandidate = normalizeComparable(candidate);
  const normalizedQuery = normalizeComparable(query);
  if (!normalizedCandidate || !normalizedQuery) return 0;
  if (normalizedCandidate === normalizedQuery) return 100;
  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) return 85;

  const candidateTokens = new Set(candidate.toLowerCase().split(/[\s_\-./\\()[\]{}]+/).filter(Boolean));
  const queryTokens = new Set(query.toLowerCase().split(/[\s_\-./\\()[\]{}]+/).filter(Boolean));
  if (candidateTokens.size === 0 || queryTokens.size === 0) return 0;
  const overlap = Array.from(queryTokens).filter((token) => candidateTokens.has(token)).length;
  return Math.round((overlap / Math.max(queryTokens.size, candidateTokens.size)) * 70);
}

function computeAuditDiff(before: unknown, after: unknown) {
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const beforeRecord = before as Record<string, unknown>;
    const afterRecord = after as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])).sort();
    return Object.fromEntries(
      keys
        .filter((key) => JSON.stringify(beforeRecord[key] ?? null) !== JSON.stringify(afterRecord[key] ?? null))
        .map((key) => [key, { before: beforeRecord[key] ?? null, after: afterRecord[key] ?? null }])
    );
  }
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return {};
  return { before: before ?? null, after: after ?? null };
}

function normalizeAuditDetail(detail: Record<string, unknown>) {
  const { before: explicitBefore, after: explicitAfter, diff: explicitDiff, markers: explicitMarkers, ...rest } = detail;
  const hasBefore = Object.prototype.hasOwnProperty.call(detail, "before");
  const hasAfter = Object.prototype.hasOwnProperty.call(detail, "after");
  const hasDiff = Object.prototype.hasOwnProperty.call(detail, "diff");
  const before = hasBefore ? explicitBefore : null;
  const after = hasAfter ? explicitAfter : rest;
  const diff = hasDiff ? explicitDiff : computeAuditDiff(before, after);
  return {
    ...rest,
    before,
    after,
    diff,
    markers: Array.isArray(explicitMarkers) ? explicitMarkers : []
  };
}

function normalizeRootCodeCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return rootCodeToV3Ordinal(normalized) !== null ? normalized : null;
}

function objectCompanyId(value: Record<string, unknown>): string | null {
  const companyId = value.companyId ?? value.company_id;
  return typeof companyId === "string" && companyId.trim() ? companyId.trim() : null;
}

function extractAuditRootCodes(value: unknown, companyId: string): string[] {
  const rootCodes = new Set<string>();
  const visit = (node: unknown, key = ""): void => {
    if (typeof node === "string") {
      if (/root/i.test(key)) {
        const rootCode = normalizeRootCodeCandidate(node);
        if (rootCode) rootCodes.add(rootCode);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const nodeCompanyId = objectCompanyId(record);
    if (nodeCompanyId && nodeCompanyId !== companyId) return;
    for (const [childKey, childValue] of Object.entries(record)) visit(childValue, childKey);
  };
  visit(value);
  return Array.from(rootCodes);
}

function extractAuditRootCodesFromJson(detailJson: string, companyId: string): string[] {
  try {
    return extractAuditRootCodes(JSON.parse(detailJson), companyId);
  } catch {
    return [];
  }
}

function normalizeNullableText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function formatRootCode(value: number, ruleVersionId = DEFAULT_RULE_VERSION_ID) {
  return formatRootCodeForRule(value, ruleVersionId);
}

function formatPartSequence(value: number, ruleVersionId = DEFAULT_RULE_VERSION_ID) {
  return formatPartSequenceForRule(value, ruleVersionId);
}

function formatDrawingSequence(value: number, ruleVersionId = DEFAULT_RULE_VERSION_ID) {
  return formatDrawingSequenceForRule(value, ruleVersionId);
}

function requireCustomSpecification(itemKind: NumberingItemKind, customSpecification: string | undefined) {
  void itemKind;
  void customSpecification;
}

function normalizePurposeDescription(purposeCode: DrawingPurposeCode, description: string | undefined) {
  const trimmed = description?.trim() ?? "";
  if (isReferenceDrawingPurpose(purposeCode) && !trimmed) {
    throw new Error("REFERENCE_PURPOSE_DESCRIPTION_REQUIRED");
  }
  if (!trimmed) return isManufacturingDrawingPurpose(purposeCode) ? "Manufacturing drawing" : "";
  return trimmed || displayDrawingPurposeLabel(purposeCode);
}

function normalizeSeriesCode(itemKind: NumberingItemKind, isUniversal: boolean, seriesCode: string | undefined) {
  if (itemKind !== "manufactured" || isUniversal) return null;
  const normalized = seriesCode?.trim() || null;
  if (normalized && normalized.length > 80) throw new Error("SERIES_CODE_TOO_LONG");
  return normalized;
}

function assertDraftMutableStatus(status: NumberingRecordStatus, label: string) {
  if (status !== "Draft" && status !== "NeedInfo") {
    throw new Error(`NUMBERING_${label}_NOT_DRAFT: ${status}`);
  }
}

function parseJsonDetail(value: string) {
  try {
    return JSON.parse(value || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isFormalRecordStatus(status: NumberingRecordStatus) {
  return status === "Active" || status === "Released" || status === "MainDrawingInvalid";
}

function isClosedRecordStatus(status: NumberingRecordStatus) {
  return status === "Obsolete" || status === "Merged";
}

type RootDependencyCountRow = {
  approval_count: number;
  revision_package_count: number;
  shared_model_count: number;
  manufacturing_baseline_count: number;
  manufacturing_baseline_item_count: number;
  replacement_link_count: number;
  bom_reconfirmation_count: number;
  file_asset_count: number;
};

function mapRootDependencySummary(row: RootDependencyCountRow | null): RootObsoleteDependencySummary {
  const summary = {
    approvalCount: Number(row?.approval_count ?? 0),
    revisionPackageCount: Number(row?.revision_package_count ?? 0),
    sharedModelCount: Number(row?.shared_model_count ?? 0),
    manufacturingBaselineCount: Number(row?.manufacturing_baseline_count ?? 0),
    manufacturingBaselineItemCount: Number(row?.manufacturing_baseline_item_count ?? 0),
    replacementLinkCount: Number(row?.replacement_link_count ?? 0),
    bomReconfirmationCount: Number(row?.bom_reconfirmation_count ?? 0),
    fileAssetCount: Number(row?.file_asset_count ?? 0)
  };
  const controlledReferenceCount = Object.entries(summary)
    .filter(([key]) => key !== "fileAssetCount")
    .reduce((total, [, value]) => total + Number(value), 0);
  return {
    ...summary,
    controlledReferenceCount,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify({ ...summary, controlledReferenceCount })).digest("hex")
  };
}

function actionCodeFromDetail(detail: Record<string, unknown>) {
  const value = detail.actionCode ?? detail.action_code;
  return typeof value === "string" ? value : null;
}

function payloadFromDetail(detail: Record<string, unknown>) {
  const payload = detail.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : detail;
}

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function numberingApprovalActionLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    release: "\u767c\u884c\u5be9\u6838",
    release_missing_ma_confirm: "\u767c\u884c\u7f3a MA \u518d\u78ba\u8a8d",
    same_drawing_variant_after_release: "\u767c\u884c\u5f8c\u540c\u5716\u591a\u6599\u865f",
    main_drawing_restore: "MA \u5716\u6062\u5fa9",
    obsolete_part_number: "\u6599\u865f\u4f5c\u5ee2\u5be9\u6838",
    obsolete_ma_drawing: "\u5716\u865f\u4f5c\u5ee2\u5be9\u6838",
    obsolete_part_root: "\u4e3b\u6839\u4f5c\u5ee2\u5be9\u6838"
  };
  return value ? labels[value] ?? value : "\u5be9\u6838";
}

function numberingRoleCodes(user: NumberingUserScope) {
  if (user.role === "Admin") return ["system_admin", "pdm_admin"];
  if (user.role === "R&D Manager") return ["rd_manager"];
  if (user.role === "Engineer") return ["rd"];
  return [user.role.toLowerCase().replaceAll(" ", "_")];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampNumberingListLimit(value: number | undefined, fallback = 20) {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

function nullableText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function nullableTextOrExisting(value: string | null | undefined, existing: string | null | undefined) {
  if (value === undefined) return existing ?? null;
  return nullableText(value);
}

function boolToInt(value: boolean | undefined, fallback = false) {
  return value ?? fallback ? 1 : 0;
}

function normalizeRiskFlags(riskFlags: string[] | undefined) {
  return new Set((riskFlags ?? []).map((flag) => flag.trim()).filter(Boolean));
}

function approvalRuleMatches(row: ApprovalRuleRow, input: EvaluateApprovalRuleInput, riskFlags: Set<string>) {
  if (row.action_code !== input.actionCode) return false;
  if (row.record_status && row.record_status !== input.recordStatus) return false;
  if (row.item_kind && row.item_kind !== input.itemKind) return false;
  if (row.risk_flag && !riskFlags.has(row.risk_flag)) return false;
  return true;
}

function partRequiresPrimaryManufacturingDrawing(partNumber: PartNumberRecord) {
  if (partNumber.isUniversal) return false;
  return partNumber.itemKind === "manufactured";
}

function escapeLikeLiteral(query: string) {
  return query.replace(/[\\%_]/g, "\\$&");
}

function escapeLikeQuery(query: string) {
  return `%${escapeLikeLiteral(query)}%`;
}

function addProductSeriesFilter(filters: string[], params: Record<string, unknown>, productSeries: string | undefined) {
  const normalized = normalizeProductSeries(productSeries);
  if (!normalized) return;
  filters.push("(r.core_name = :productSeries OR r.core_name LIKE :productSeriesPrefix ESCAPE '\\')");
  params.productSeries = normalized;
  params.productSeriesPrefix = `${escapeLikeLiteral(normalized)}\\_%`;
}

function addSeriesCodeFilter(
  filters: string[],
  params: Record<string, unknown>,
  seriesCode: string | undefined,
  target: "root" | "part"
) {
  const normalized = seriesCode?.trim();
  if (!normalized) return;
  filters.push(
    target === "part"
      ? "p.series_code = :seriesCode"
      : "EXISTS (SELECT 1 FROM part_numbers sp WHERE sp.part_root_id = r.id AND sp.company_id = r.company_id AND sp.series_code = :seriesCode)"
  );
  params.seriesCode = normalized;
}

function buildNumberingSearchWhere(
  input: Required<Pick<NumberingSearchInput, "query" | "limit">> & NumberingSearchInput,
  queryFilter: string,
  recordStatusColumn: string,
  seriesCodeTarget: "root" | "part"
) {
  const filters: string[] = ["r.company_id = :companyId"];
  const params: Record<string, unknown> = { companyId: input.companyId ?? DEFAULT_COMPANY_ID };
  if (input.query) {
    filters.push(queryFilter);
    params.queryLike = escapeLikeQuery(input.query);
  }
  addProductSeriesFilter(filters, params, input.productSeries);
  addSeriesCodeFilter(filters, params, input.seriesCode, seriesCodeTarget);
  if (input.recordStatus) {
    filters.push(`${recordStatusColumn} = :recordStatus`);
    params.recordStatus = input.recordStatus;
  }
  if (input.includeHistory === false) filters.push(`${recordStatusColumn} NOT IN ('Obsolete', 'Merged')`);
  if (input.limit !== null) params.limit = input.limit;
  return {
    where: filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "",
    params
  };
}

function buildDrawingModuleWhere(input: Required<Pick<DrawingModuleListInput, "query" | "limit">> & DrawingModuleListInput) {
  const filters: string[] = ["r.company_id = :companyId"];
  const params: Record<string, unknown> = { companyId: input.companyId ?? DEFAULT_COMPANY_ID };
  if (input.query) {
    filters.push(`(
      d.drawing_number LIKE :queryLike ESCAPE '\\'
      OR d.purpose_description LIKE :queryLike ESCAPE '\\'
      OR r.root_code LIKE :queryLike ESCAPE '\\'
      OR r.core_name LIKE :queryLike ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM drawing_part_links ql
        JOIN part_numbers qp ON qp.id = ql.part_number_id
        WHERE ql.drawing_number_id = d.id
          AND (qp.part_number LIKE :queryLike ESCAPE '\\' OR qp.part_name LIKE :queryLike ESCAPE '\\')
      )
    )`);
    params.queryLike = escapeLikeQuery(input.query);
  }
  addProductSeriesFilter(filters, params, input.productSeries);
  addSeriesCodeFilter(filters, params, input.seriesCode, "root");
  if (input.recordStatus) {
    filters.push("d.record_status = :recordStatus");
    params.recordStatus = input.recordStatus;
  }
  if (input.purposeCode) {
    filters.push("d.purpose_code = :purposeCode");
    params.purposeCode = input.purposeCode;
  }
  params.limit = input.limit;
  return {
    where: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    params
  };
}

function buildPartModuleWhere(input: Required<Pick<PartModuleListInput, "query" | "limit">> & PartModuleListInput) {
  const filters: string[] = ["r.company_id = :companyId"];
  const params: Record<string, unknown> = { companyId: input.companyId ?? DEFAULT_COMPANY_ID };
  if (input.query) {
    filters.push(
      "(p.part_number LIKE :queryLike OR p.part_name LIKE :queryLike OR r.root_code LIKE :queryLike OR r.core_name LIKE :queryLike OR va.material_label LIKE :queryLike OR va.color_label LIKE :queryLike)"
    );
    params.queryLike = `%${input.query}%`;
  }
  addProductSeriesFilter(filters, params, input.productSeries);
  addSeriesCodeFilter(filters, params, input.seriesCode, "part");
  if (input.recordStatus) {
    filters.push("p.record_status = :recordStatus");
    params.recordStatus = input.recordStatus;
  }
  if (input.includeHistory === false) filters.push("p.record_status NOT IN ('Obsolete', 'Merged')");
  if (input.limit !== null) params.limit = input.limit;
  return {
    where: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    params
  };
}

function addAttentionMarker(markers: NumberingAttentionMarkerRecord[], marker: NumberingAttentionMarkerRecord | null) {
  if (!marker || markers.some((item) => item.code === marker.code && item.label === marker.label)) return;
  markers.push(marker);
}

function proxySubmissionReason(payload: Record<string, unknown>) {
  const explicitReason = String(payload.proxyReason ?? payload.delegationReason ?? "").trim();
  const requestedFor = String(payload.requestedFor ?? payload.submittedFor ?? payload.onBehalfOf ?? "").trim();
  if (explicitReason) return explicitReason;
  if (requestedFor) return `\u4ee3 ${requestedFor} \u9001\u5be9`;
  if (payload.proxySubmitted === true) return "\u7ba1\u7406\u54e1\u4ee3\u9001\u5be9";
  return null;
}

function buildNumberingActionMarkers(input: { actionCode?: string | null; payload?: Record<string, unknown>; proxyReason?: string | null }) {
  const actionCode = input.actionCode ?? null;
  const payload = input.payload ?? {};
  const markers: NumberingAttentionMarkerRecord[] = [];

  if (input.proxyReason) {
    addAttentionMarker(markers, {
      code: "proxy_submission",
      label: "\u4ee3\u9001\u5be9",
      detail: input.proxyReason,
      severity: "info"
    });
  }

  const riskFlags = textList(payload.riskFlags);
  const overrideTypes = textList(payload.overrideTypes);
  const hasOverride =
    Boolean(payload.hasOverride) ||
    Boolean(payload.allowMainDrawingOverride) ||
    Boolean(actionCode?.includes("override")) ||
    actionCode === "release_missing_ma_confirm" ||
    riskFlags.includes("has_override") ||
    overrideTypes.length > 0;
  if (hasOverride) {
    const detailParts = [numberingApprovalActionLabel(actionCode), ...overrideTypes].filter(Boolean);
    addAttentionMarker(markers, {
      code: "override",
      label: "! Override",
      detail: detailParts.join(" / ") || null,
      severity: "warning"
    });
  }

  const impactedPartNumbers = textList(payload.impactedPartNumbers);
  const requiredDocuments = textList(payload.requiredDocuments);
  const hasImpact =
    actionCode === "main_drawing_restore" ||
    actionCode === "release_missing_ma_confirm" ||
    impactedPartNumbers.length > 0 ||
    requiredDocuments.length > 0;
  if (hasImpact) {
    const detailParts = [
      impactedPartNumbers.length ? `\u53d7\u5f71\u97ff\u6599\u865f: ${impactedPartNumbers.join(", ")}` : "",
      requiredDocuments.length ? `\u9700\u78ba\u8a8d\u6587\u4ef6: ${requiredDocuments.join(", ")}` : ""
    ].filter(Boolean);
    addAttentionMarker(markers, {
      code: "impact_scope",
      label: "! \u5f71\u97ff\u7bc4\u570d",
      detail: detailParts.join("\uff1b") || numberingApprovalActionLabel(actionCode),
      severity: "critical"
    });
  }

  return markers;
}

function mapNumberingTask(row: NumberingTaskRow, context: NumberingAccessContext | null = null): NumberingTaskRecord {
  const detail = parseJsonDetail(row.detail_json);
  const payload = payloadFromDetail(detail);
  const markers = buildNumberingActionMarkers({
    actionCode: actionCodeFromDetail(detail),
    payload,
    proxyReason: proxySubmissionReason(payload)
  });
  const delegatedMarker = delegatedReviewMarker(context, row.assigned_role, row.project_code, actionCodeFromDetail(detail));
  if (delegatedMarker) markers.push(delegatedMarker);
  return {
    id: row.id,
    companyId: row.company_id,
    taskType: row.task_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    message: row.message,
    riskLevel: row.risk_level,
    taskStatus: row.task_status,
    assignedTo: row.assigned_to,
    assignedRole: row.assigned_role,
    projectCode: row.project_code,
    actionUrl: row.action_url,
    detail,
    markers,
    createdAt: row.created_at,
    handledAt: row.handled_at
  };
}

function mapNumberingNotification(row: NumberingNotificationRow, context: NumberingAccessContext | null = null): NumberingNotificationRecord {
  const detail = parseJsonDetail(row.detail_json);
  const payload = payloadFromDetail(detail);
  const markers = buildNumberingActionMarkers({
    actionCode: actionCodeFromDetail(detail),
    payload,
    proxyReason: proxySubmissionReason(payload)
  });
  const delegatedMarker = delegatedReviewMarker(context, row.recipient_role, extractProjectCodeFromDetail(row.detail_json), actionCodeFromDetail(detail));
  if (delegatedMarker) markers.push(delegatedMarker);
  return {
    id: row.id,
    companyId: row.company_id,
    notificationType: row.notification_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    message: row.message,
    severity: row.severity,
    recipientId: row.recipient_id,
    recipientRole: row.recipient_role,
    readAt: row.read_at,
    handledAt: row.handled_at,
    dismissible: row.dismissible === 1,
    actionUrl: row.action_url,
    detail,
    markers,
    createdAt: row.created_at
  };
}

function mapPartRoot(row: PartRootRow): PartRootRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    rootCode: row.root_code,
    coreName: row.core_name,
    itemKind: row.item_kind,
    recordStatus: row.record_status,
    ruleVersionId: row.rule_version_id
  };
}

function mapPartNumber(row: PartNumberRow): PartNumberRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    partRootId: row.part_root_id,
    partNumber: row.part_number,
    sequenceNo: row.sequence_no,
    sequenceCode: row.sequence_code,
    partName: row.part_name,
    itemKind: row.item_kind,
    structureType: row.structure_type ?? "single_part",
    isUniversal: row.is_universal === 1,
    customSpecification: row.custom_specification,
    seriesCode: row.series_code,
    recordStatus: row.record_status,
    universalReason: row.universal_reason,
    ruleVersionId: row.rule_version_id
  };
}

function mapDrawingNumber(row: DrawingNumberRow): DrawingNumberRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    partRootId: row.part_root_id,
    drawingNumber: row.drawing_number,
    purposeCode: row.purpose_code,
    purposeDescription: row.purpose_description,
    sequenceNo: row.sequence_no,
    isPrimaryManufacturing: row.is_primary_manufacturing === 1,
    recordStatus: row.record_status,
    ruleVersionId: row.rule_version_id
  };
}

function mapNumberingSearchRow(row: NumberingSearchRow): NumberingSearchResultRecord {
  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    rootCode: row.root_code,
    coreName: row.core_name,
    displayCode: row.display_code,
    displayName: row.display_name,
    itemKind: row.item_kind,
    recordStatus: row.record_status,
    purposeCode: row.purpose_code,
    partNumber: row.part_number,
    drawingNumber: row.drawing_number,
    primaryDrawingNumber: row.primary_drawing_number,
    partCount: Number(row.part_count ?? 0),
    drawingCount: Number(row.drawing_count ?? 0),
    linkedPartCount: Number(row.linked_part_count ?? 0),
    warningCount: Number(row.warning_count ?? 0)
  };
}

function mapDrawingModuleLinkedPartRow(row: DrawingModuleLinkedPartRow): DrawingModuleLinkedPartRecord {
  return {
    id: row.id,
    partNumber: row.part_number,
    partName: row.part_name,
    recordStatus: row.record_status,
    materialCode: row.material_code,
    materialLabel: row.material_label,
    colorCode: row.color_code,
    colorLabel: row.color_label,
    surfaceTreatment: row.surface_treatment,
    variantNote: row.variant_note,
    primaryDrawingNumber: row.primary_drawing_number
  };
}

function hasPotentialHardcodedTitleBlockVariantText(text: string | null | undefined) {
  const normalized = (text ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return [
    "material",
    "matl",
    "color",
    "colour",
    "surface",
    "finish",
    "\u6750\u8cea",
    "\u6750\u6599",
    "\u8868\u9762",
    "\u984f\u8272",
    "\u8272\u78bc",
    "\u5857\u88dd",
    "\u8655\u7406"
  ].some((keyword) => normalized.includes(keyword));
}

function mapDrawingModuleListRow(
  row: DrawingModuleListRow,
  linkedPartNumbers: string[] = [],
  sameRootParts: DrawingModuleLinkedPartRecord[] = [],
  releaseStatusMismatch: DrawingModuleReleaseStatusMismatch | null = null,
  pendingApproval: DrawingModulePendingApprovalSummary | null = null
): DrawingModuleListRecord {
  return {
    ...mapDrawingNumber(row),
    rootCode: row.root_code,
    coreName: row.core_name,
    itemKind: row.item_kind,
    linkedPartCount: Number(row.linked_part_count ?? 0),
    linkedPartNumbers,
    sameRootParts,
    titleBlockVariantWarning: hasPotentialHardcodedTitleBlockVariantText(row.purpose_description) && sameRootParts.length > 1,
    warningCount: Number(row.warning_count ?? 0),
    releaseStatusMismatch,
    pendingApproval,
    updatedAt: row.updated_at
  };
}

function compareDrawingModuleRevision(left: string, right: string) {
  return left.localeCompare(right, "zh-Hant", { numeric: true, sensitivity: "base" });
}

function mapPartVariantAttributes(row: PartVariantAttributesRow | null | undefined): PartVariantAttributesRecord | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    partNumberId: row.part_number_id,
    materialCode: row.material_code,
    materialLabel: row.material_label,
    colorCode: row.color_code,
    colorLabel: row.color_label,
    surfaceTreatment: row.surface_treatment,
    variantNote: row.variant_note,
    updatedAt: row.updated_at
  };
}

function mapPartModuleListRow(row: PartModuleListRow): PartModuleListRecord {
  return {
    ...mapPartNumber(row),
    updatedAt: row.updated_at ?? "",
    rootCode: row.root_code,
    coreName: row.core_name,
    primaryDrawingNumber: row.primary_drawing_number,
    primaryDrawingRecordStatus: row.primary_drawing_record_status ?? null,
    drawingCount: Number(row.drawing_count ?? 0),
    variant: mapPartVariantAttributes({
      id: row.variant_id ?? "",
      part_number_id: row.id,
      material_code: row.material_code,
      material_label: row.material_label,
      color_code: row.color_code,
      color_label: row.color_label,
      surface_treatment: row.surface_treatment,
      variant_note: row.variant_note,
      updated_at: row.variant_updated_at ?? ""
    })
  };
}

function mapNumberingLink(row: NumberingLinkRow): NumberingLinkRecord {
  return {
    id: row.id,
    drawingNumberId: row.drawing_number_id,
    partNumberId: row.part_number_id,
    drawingNumber: row.drawing_number,
    partNumber: row.part_number,
    linkType: row.link_type,
    createdAt: row.created_at
  };
}

function mapNumberingVariant(row: NumberingVariantRow): NumberingVariantRecord {
  return {
    id: row.id,
    drawingNumberId: row.drawing_number_id,
    partNumberId: row.part_number_id,
    drawingNumber: row.drawing_number,
    partNumber: row.part_number,
    fieldName: row.field_name,
    fieldValue: row.field_value,
    createdAt: row.created_at
  };
}

function mapNumberingWarning(row: NumberingWarningRow): NumberingWarningRecord {
  return {
    id: row.id,
    warningCode: row.warning_code,
    severity: row.severity,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    message: row.message,
    detail: parseJsonDetail(row.detail_json),
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at
  };
}

function mapNumberingAudit(row: NumberingAuditLogRow): NumberingAuditTrailRecord {
  const detail = parseJsonDetail(row.detail_json);
  return {
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    detail,
    before: detail.before ?? null,
    after: detail.after ?? null,
    diff: detail.diff ?? null,
    markers: Array.isArray(detail.markers) ? (detail.markers as NumberingAttentionMarkerRecord[]) : [],
    createdAt: row.created_at
  };
}

function mapApprovalRequest(row: ApprovalRequestRow): NumberingApprovalRecord {
  return {
    id: row.id,
    actionCode: row.action_code,
    entityType: row.entity_type,
    entityId: row.entity_id,
    requestStatus: row.request_status,
    reason: row.reason,
    payload: parseJsonDetail(row.payload_json),
    requestedBy: row.requested_by,
    requestedAt: row.requested_at
  };
}

function mapApprovalRule(row: ApprovalRuleRow): MatchedApprovalRule {
  const predictedRule = withPredictedApprovalControls({
    actionCode: row.action_code,
    recordStatus: row.record_status,
    itemKind: row.item_kind,
    riskFlag: row.risk_flag,
    requiresApproval: row.requires_approval === 1,
    approverRole: row.approver_role,
    showsWarning: row.shows_warning === 1,
    exportMarker: row.export_marker === 1
  });
  return {
    id: row.id,
    ruleName: buildApprovalRuleSummary(predictedRule),
    ...predictedRule
  };
}

function mapAdminApprovalRule(row: ApprovalRuleRow): NumberingAdminApprovalRuleRecord {
  return {
    ...mapApprovalRule(row),
    ruleVersionId: row.rule_version_id
  };
}

function mapNumberingAdminRole(row: NumberingAdminRoleRow): NumberingAdminRoleRecord {
  return {
    id: row.id,
    roleCode: row.role_code,
    title: row.title,
    systemDefined: row.system_defined === 1
  };
}

function mapNumberingAdminUser(row: NumberingAdminUserRow): NumberingAdminUserRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role
  };
}

function mapNumberingAdminPermission(row: NumberingAdminPermissionRow): NumberingAdminPermissionRecord {
  return {
    id: row.id,
    roleId: row.role_id,
    permissionKind: row.permission_kind,
    permissionCode: row.permission_code,
    allowed: row.allowed === 1
  };
}

function mapNumberingAdminRoleScope(row: NumberingAdminRoleScopeRow): NumberingAdminRoleScopeRecord {
  return {
    id: row.id,
    roleId: row.role_id,
    scopeKind: row.scope_kind,
    scopeCode: row.scope_code,
    allowed: row.allowed === 1
  };
}

function mapNumberingUserRoleAssignment(row: NumberingUserRoleAssignmentRow): NumberingUserRoleAssignmentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    userSystemRole: row.user_system_role,
    roleId: row.role_id,
    roleCode: row.role_code,
    roleTitle: row.role_title,
    reason: row.reason,
    scopeTemplate: row.scope_template ?? "own_department",
    namedScope: row.named_scope ?? "",
    sponsorUserId: row.sponsor_user_id,
    startsAt: row.starts_at,
    reviewDueAt: row.review_due_at,
    hardEndsAt: row.hard_ends_at,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by
  };
}

function mapNumberingAdminAuditEvent(row: NumberingAdminAuditEventRow): NumberingAdminAuditEventRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    detail: parseJsonDetail(row.detail_json),
    createdAt: row.created_at
  };
}

function parseRolePriorityJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function mapNumberingRolePriorityVersion(row: NumberingRolePriorityVersionRow): NumberingRolePriorityVersionRecord {
  return {
    id: row.id,
    versionCode: row.version_code,
    priority: parseRolePriorityJson(row.priority_json),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function mapNumberingApprovalDelegation(row: NumberingApprovalDelegationRow): NumberingApprovalDelegationRecord {
  return {
    id: row.id,
    delegatedFrom: row.delegated_from,
    delegatedFromName: row.delegated_from_name,
    delegatedFromRole: row.delegated_from_role,
    delegatedTo: row.delegated_to,
    delegatedToName: row.delegated_to_name,
    delegatedToRole: row.delegated_to_role,
    projectCode: row.project_code,
    actionCode: row.action_code,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by
  };
}

function mapNumberingRuleTemplate(row: NumberingAdminRuleTemplateRow): NumberingAdminRuleTemplateRecord {
  return {
    id: row.id,
    templateCode: row.template_code,
    title: row.title,
    description: row.description,
    systemDefined: row.system_defined === 1
  };
}

function mapNumberingRuleVersion(row: NumberingRuleVersionRow): NumberingRuleVersionRecord {
  return {
    id: row.id,
    ruleCode: row.rule_code,
    title: row.title,
    status: row.status,
    effectiveAt: row.effective_at,
    retiredAt: row.retired_at
  };
}

function mapApprovalBatchItem(row: ApprovalBatchItemRow): NumberingApprovalBatchItemRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    approvalRequestId: row.approval_request_id,
    itemStatus: row.item_status,
    resubmittedFromItemId: row.resubmitted_from_item_id
  };
}

function emptyApprovalBatchItemCounts() {
  return {
    pending: 0,
    approved: 0,
    rejected: 0,
    needs_info: 0,
    cancelled: 0,
    resubmitted: 0
  } satisfies Record<NumberingApprovalBatchItemStatus, number>;
}

function emptyApprovalEntitySummary(request: ApprovalRequestRow): NumberingApprovalEntitySummaryRecord {
  return {
    entityType: request.entity_type,
    entityId: request.entity_id,
    label: request.entity_id,
    secondary: request.action_code,
    rootCode: null,
    partNumber: null,
    drawingNumber: null,
    partName: null,
    coreName: null,
    itemKind: null,
    recordStatus: null
  };
}

function approvalRecipientRole(actionCode: NumberingApprovalActionCode) {
  if (
    actionCode === "release" ||
    actionCode === "same_drawing_variant_after_release" ||
    actionCode === "obsolete_ma_drawing"
  ) {
    return "rd_manager";
  }
  return "pdm_admin";
}

function normalizeVariantFields(fields: LinkPartNumberToDrawingInput["variants"]) {
  if (!fields) return [];
  const entries = Array.isArray(fields)
    ? fields.map((field) => [field.fieldName, field.fieldValue] as const)
    : Object.entries(fields);
  const normalized = new Map<string, string>();
  for (const [fieldName, fieldValue] of entries) {
    const name = String(fieldName ?? "").trim();
    const value = String(fieldValue ?? "").trim();
    if (name && value) normalized.set(name, value);
  }
  return Array.from(normalized, ([fieldName, fieldValue]) => ({ fieldName, fieldValue }));
}

function mapNumberingExportJob(row: NumberingExportJobRow): NumberingExportJobRecord {
  return {
    id: row.id,
    exportMode: row.export_mode,
    status: row.status,
    result: parseJsonDetail(row.result_json),
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
    completedAt: row.completed_at
  };
}

function mapMonthlyAuditReport(row: MonthlyAuditReportRow): MonthlyAuditReportRecord {
  return {
    id: row.id,
    reportType: row.report_type,
    reportMonth: row.report_month,
    generationMode: row.generation_mode,
    generatedBy: row.generated_by,
    status: row.status,
    query: parseJsonDetail(row.query_json),
    createdAt: row.created_at
  };
}

function duplicateEntityType(input: DuplicateCheckInput) {
  return input.drawingNumber ? "drawing_number" : input.partNumber ? "part_number" : input.rootCode ? "part_root" : "mixed";
}

function extractProjectCodeFromDetail(detailJson: string) {
  const detail = parseJsonDetail(detailJson);
  const value = detail.projectCode ?? detail.project_code;
  return typeof value === "string" ? value : null;
}

function directRoleAccessAllowed(context: NumberingAccessContext, assignedRole: string | null, projectCode: string | null, actionCode: string | null) {
  if (!assignedRole || !context.baseRoles.includes(assignedRole)) return false;
  if (context.projectScopes.size > 0 && (!projectCode || !context.projectScopes.has(projectCode))) return false;
  if (context.actionScopes.size > 0 && (!actionCode || !context.actionScopes.has(actionCode))) return false;
  return true;
}

function delegatedAccessAllowed(context: NumberingAccessContext, assignedRole: string | null, projectCode: string | null, actionCode: string | null) {
  if (!assignedRole) return false;
  return context.delegations.some((delegation) => {
    if (!delegation.roleCodes.includes(assignedRole)) return false;
    if (delegation.projectCode && delegation.projectCode !== projectCode) return false;
    if (delegation.actionCode && delegation.actionCode !== actionCode) return false;
    return true;
  });
}

function delegatedReviewMarker(
  context: NumberingAccessContext | null,
  assignedRole: string | null,
  projectCode: string | null,
  actionCode: string | null
): NumberingAttentionMarkerRecord | null {
  if (!context || context.user.role === "Admin" || !assignedRole) return null;
  if (directRoleAccessAllowed(context, assignedRole, projectCode, actionCode)) return null;
  const delegation = context.delegations.find((item) => {
    if (!item.roleCodes.includes(assignedRole)) return false;
    if (item.projectCode && item.projectCode !== projectCode) return false;
    if (item.actionCode && item.actionCode !== actionCode) return false;
    return true;
  });
  if (!delegation) return null;
  const scope = [
    `\u88ab\u4ee3\u7406\u4eba: ${delegation.delegatedFromName} (${delegation.delegatedFromRole})`,
    `\u5c08\u6848: ${delegation.projectCode ?? projectCode ?? "\u5168\u90e8"}`,
    `\u52d5\u4f5c: ${delegation.actionCode ?? actionCode ?? "\u5168\u90e8"}`
  ];
  return {
    code: "delegated_review",
    label: "\u4ee3\u7406\u5be9\u6838",
    detail: scope.join(" / "),
    severity: "warning"
  };
}

function canAccessNumberingRoleItem(
  context: NumberingAccessContext,
  assignedTo: string | null,
  createdBy: string | null,
  assignedRole: string | null,
  projectCode: string | null,
  actionCode: string | null
) {
  if (context.user.role === "Admin") return true;
  if (assignedTo === context.user.id || createdBy === context.user.id) return true;
  return directRoleAccessAllowed(context, assignedRole, projectCode, actionCode) || delegatedAccessAllowed(context, assignedRole, projectCode, actionCode);
}

function canAccessNumberingScope(context: NumberingAccessContext, projectCode: string | null, actionCode: string | null) {
  if (context.user.role === "Admin") return true;
  if (context.projectScopes.size > 0 && (!projectCode || !context.projectScopes.has(projectCode))) return false;
  if (context.actionScopes.size > 0 && (!actionCode || !context.actionScopes.has(actionCode))) return false;
  return context.baseRoles.includes("rd_manager") || context.baseRoles.includes("pdm_admin") || delegatedAccessAllowed(context, "rd_manager", projectCode, actionCode);
}

function createNamedList(prefix: string, values: string[]) {
  const params: Record<string, string> = {};
  const placeholders = values.map((value, index) => {
    const name = `${prefix}${index}`;
    params[name] = value;
    return `:${name}`;
  });
  return { sql: placeholders.join(", "), params };
}

const ROLE_ASSIGNMENT_SCOPE_TEMPLATES = new Set([
  "own_department",
  "workspace_quality",
  "released_only",
  "named_scope",
  "self",
  "workspace_all"
]);

function defaultScopeTemplateForRoleCode(roleCode: string) {
  if (roleCode === "qa") return "workspace_quality";
  if (roleCode === "manufacturing" || roleCode === "procurement") return "released_only";
  if (roleCode === "external_specialist") return "named_scope";
  if (roleCode === "system_admin" || roleCode === "pdm_admin") return "workspace_all";
  return "own_department";
}

function normalizeAssignmentDate(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function defaultReviewDueDate(now: string) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + 90);
  return date.toISOString().slice(0, 10);
}

async function normalizeRoleAssignmentScope(
  client: AsyncDatabaseClient,
  roleCode: string,
  input: UpsertNumberingUserRoleAssignmentInput,
  now: string
) {
  const scopeTemplate = (input.scopeTemplate?.trim() || defaultScopeTemplateForRoleCode(roleCode)).toLowerCase();
  if (!ROLE_ASSIGNMENT_SCOPE_TEMPLATES.has(scopeTemplate)) throw new Error("NUMBERING_ROLE_ASSIGNMENT_SCOPE_TEMPLATE_INVALID");
  if (scopeTemplate === "workspace_all" && !["system_admin", "pdm_admin", "qa"].includes(roleCode)) {
    throw new Error("NUMBERING_ROLE_ASSIGNMENT_WORKSPACE_ALL_RESTRICTED");
  }

  const namedScope = input.namedScope?.trim() ?? "";
  const sponsorUserId = input.sponsorUserId?.trim() || null;
  const startsAt = normalizeAssignmentDate(input.startsAt);
  let reviewDueAt = normalizeAssignmentDate(input.reviewDueAt);
  const hardEndsAt = normalizeAssignmentDate(input.hardEndsAt);

  if ((scopeTemplate === "named_scope" || roleCode === "external_specialist") && !namedScope) {
    throw new Error("NUMBERING_ROLE_ASSIGNMENT_NAMED_SCOPE_REQUIRED");
  }
  if (roleCode === "external_specialist") {
    if (scopeTemplate !== "named_scope") throw new Error("NUMBERING_EXTERNAL_SPECIALIST_REQUIRES_NAMED_SCOPE");
    if (!sponsorUserId) throw new Error("NUMBERING_EXTERNAL_SPECIALIST_SPONSOR_REQUIRED");
    reviewDueAt = reviewDueAt ?? defaultReviewDueDate(now);
  }
  if (sponsorUserId && !(await client.queryOne<{ id: string }>(SELECT_ASYNC_USER_EXISTS_SQL, { userId: sponsorUserId }))) {
    throw new Error("NUMBERING_ROLE_ASSIGNMENT_SPONSOR_NOT_FOUND");
  }
  if (hardEndsAt && startsAt && hardEndsAt < startsAt) throw new Error("NUMBERING_ROLE_ASSIGNMENT_TIME_RANGE_INVALID");

  return { scopeTemplate, namedScope, sponsorUserId, startsAt, reviewDueAt, hardEndsAt };
}

export class AsyncNumberingRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  private async getRootAppendPartProfile(client: AsyncDatabaseClient, rootRow: PartRootRow): Promise<RootAppendPartProfile> {
    const firstPart = await client.queryOne<PartNumberRow>(SELECT_ASYNC_FIRST_PART_NUMBER_FOR_ROOT_SQL, { rootId: rootRow.id });
    if (!firstPart) {
      return {
        itemKind: rootRow.item_kind,
        structureType: "single_part",
        isUniversal: false,
        seriesCode: null,
        customSpecification: null
      };
    }
    return {
      itemKind: firstPart.item_kind,
      structureType: firstPart.structure_type,
      isUniversal: firstPart.is_universal === 1,
      seriesCode: firstPart.series_code,
      customSpecification: firstPart.custom_specification
    };
  }

  private async ensureNumberingRuleVersionSeeds(client: AsyncDatabaseClient = this.client) {
    const now = this.clock();
    for (const seed of NUMBERING_RULE_VERSION_SEEDS) {
      await client.execute(
        `
          INSERT INTO numbering_rule_versions (id, rule_code, title, status, retired_at, rule_json, created_at, updated_at)
          VALUES (:id, :ruleCode, :title, :status, :retiredAt, :ruleJson, :now, :now)
          ON CONFLICT (id) DO NOTHING
        `,
        {
          id: seed.id,
          ruleCode: seed.ruleCode,
          title: seed.title,
          status: seed.status,
          retiredAt: seed.retired ? now : null,
          ruleJson: seed.ruleJson,
          now
        }
      );
      await client.execute(
        `
          UPDATE numbering_rule_versions
          SET status = :status,
              retired_at = CASE WHEN :retired = 1 THEN COALESCE(retired_at, :now) ELSE NULL END,
              updated_at = :now
          WHERE id = :id
        `,
        { id: seed.id, status: seed.status, retired: seed.retired ? 1 : 0, now }
      );
    }
  }

  private async ensureDefaultApprovalRulesForCurrentRuleVersion(client: AsyncDatabaseClient = this.client) {
    await this.ensureNumberingRuleVersionSeeds(client);
    const existing = await client.queryOne<{ count: number | string }>(COUNT_ASYNC_ADMIN_APPROVAL_RULES_BY_VERSION_SQL, {
      ruleVersionId: DEFAULT_RULE_VERSION_ID
    });
    if (Number(existing?.count ?? 0) > 0) return;
    const now = this.clock();
    await client.execute(INSERT_ASYNC_DEFAULT_APPROVAL_RULES_FOR_VERSION_SQL, {
      targetIdPrefix: approvalRulePrefixForRuleVersion(DEFAULT_RULE_VERSION_ID),
      targetRuleVersionId: DEFAULT_RULE_VERSION_ID,
      sourceRuleVersionId: NUMBERING_RULE_V1_ID,
      createdAt: now,
      updatedAt: now
    });
  }

  async createNumberingRecord(input: CreateNumberingRecordInput): Promise<{
    root: PartRootRecord;
    partNumber: PartNumberRecord;
    drawingNumber: DrawingNumberRecord | null;
  }> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const recordStatus = input.recordStatus ?? "Draft";
      const ruleVersionId = input.ruleVersionId ?? DEFAULT_RULE_VERSION_ID;
      const isUniversal = input.isUniversal ?? false;
      const structureType = input.structureType ?? "single_part";
      if (input.itemKind === "purchased" && structureType === "assembly") {
        throw new Error("PURCHASED_ASSEMBLY_NOT_SUPPORTED");
      }
      const rootName = input.coreName.trim();
      const recentDuplicate = await this.findRecentDuplicateCreateInClient(client, {
        companyId,
        coreName: rootName,
        partName: rootName,
        itemKind: input.itemKind,
        structureType,
        recordStatus,
        isUniversal,
        universalReason: input.universalReason,
        customSpecification: input.customSpecification,
        seriesCode: input.seriesCode,
        drawingPurposeCode: input.drawingPurposeCode,
        drawingPurposeDescription: input.drawingPurposeDescription,
        ruleVersionId,
        createdBy: input.createdBy
      });
      if (recentDuplicate) {
        await this.ensureCanonicalPartWorkbenchState(client, recentDuplicate.partNumber);
        if (recentDuplicate.drawingNumber) {
          await this.ensureCanonicalDrawingWorkbenchState(client, recentDuplicate.drawingNumber, input.createdBy);
        }
        return recentDuplicate;
      }

      const root = await this.insertPartRoot(client, {
        coreName: rootName,
        companyId,
        itemKind: input.itemKind,
        recordStatus,
        ruleVersionId,
        createdBy: input.createdBy
      });
      const partNumber = await this.insertPartNumber(client, root, {
        partName: root.coreName,
        itemKind: input.itemKind,
        structureType,
        recordStatus,
        isUniversal,
        universalReason: input.universalReason,
        customSpecification: input.customSpecification,
        seriesCode: input.seriesCode,
        ruleVersionId,
        createdBy: input.createdBy
      });
      const drawingNumber = input.drawingPurposeCode
        ? await this.insertDrawingNumber(client, root, {
            purposeCode: input.drawingPurposeCode,
            purposeDescription: input.drawingPurposeDescription,
            recordStatus,
            ruleVersionId,
            createdBy: input.createdBy
          })
        : null;

      if (drawingNumber) {
        await this.linkDrawingToPart(client, { drawing: drawingNumber, part: partNumber, createdBy: input.createdBy });
      }

      await this.insertAudit(client, {
        actorId: input.createdBy,
        action: "numbering.create",
        detail: {
          companyId,
          rootCode: root.rootCode,
          partNumber: partNumber.partNumber,
          customSpecification: partNumber.customSpecification,
          seriesCode: partNumber.seriesCode,
          structureType: partNumber.structureType,
          drawingNumber: drawingNumber?.drawingNumber ?? null,
          ruleVersionId
        }
      });

      return { root, partNumber, drawingNumber };
    };
    return this.client.transaction(run);
  }

  async addDrawingNumberToRoot(input: AddDrawingNumberInput): Promise<AddDrawingNumberToRootResult> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const rootCode = input.rootCode.trim();
      if (!rootCode) throw new Error("PART_ROOT_REQUIRED");
      const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId });
      if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${rootCode}`);
      if (isClosedRecordStatus(rootRow.record_status)) throw new Error(`ROOT_APPEND_LOCKED: ${rootRow.record_status}`);

      const idempotencyKey = input.idempotencyKey?.trim();
      if (idempotencyKey) {
        const recent = await this.findRecentAppendAudit(client, {
          action: "numbering.drawing_number.create",
          actorId: input.createdBy ?? null,
          idempotencyKey
        });
        const recentDrawingNumber = String(recent?.drawingNumber ?? "").trim();
        if (recentDrawingNumber) {
          const recentRow = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
            drawingNumber: recentDrawingNumber,
            companyId
          });
          if (recentRow && recentRow.part_root_id === rootRow.id) {
            const drawingNumber = mapDrawingNumber(recentRow);
            await this.ensureCanonicalDrawingWorkbenchState(client, drawingNumber, input.createdBy);
            return { root: mapPartRoot(rootRow), drawingNumber, linkedPart: null, linkType: null, reusedFromIdempotency: true };
          }
        }
      }

      const reasonRequired = await this.rootAppendReasonRequired(client, rootRow.id, rootRow.record_status);
      const reason = input.reason?.trim() ?? "";
      if (reasonRequired && !reason) throw new Error("APPEND_REASON_REQUIRED_FOR_FORMAL_ROOT");

      const root = mapPartRoot(rootRow);
      const drawingNumber = await this.insertDrawingNumber(client, root, {
        purposeCode: input.purposeCode,
        purposeDescription: input.purposeDescription,
        recordStatus: input.recordStatus ?? "Draft",
        ruleVersionId: input.ruleVersionId ?? root.ruleVersionId,
        createdBy: input.createdBy
      });

      let linkedPart: PartNumberRecord | null = null;
      let linkType: "primary_manufacturing" | "reference" | null = null;
      const linkPartNumber = input.linkPartNumber?.trim();
      const linkRelationType = input.linkRelationType ?? (linkPartNumber ? "auto" : "none");
      if (linkPartNumber && linkRelationType !== "none") {
        const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
          partNumber: linkPartNumber,
          companyId
        });
        if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${linkPartNumber}`);
        if (partRow.part_root_id !== root.id) throw new Error("DRAWING_PART_ROOT_MISMATCH");
        if (linkRelationType === "primary_manufacturing" && !isManufacturingDrawingPurpose(drawingNumber.purposeCode)) {
          throw new Error("PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING");
        }
        linkType = linkRelationType === "reference" || !isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? "reference" : "primary_manufacturing";
        linkedPart = mapPartNumber(partRow);
        await new RelationFormalAuthorityRepository(client).upsertPairInClient(client, {
          companyId,
          drawingNumberId: drawingNumber.id,
          partNumberId: linkedPart.id,
          relationType: linkType === "primary_manufacturing" ? "manufacturing_basis" : "reference",
          actorId: input.createdBy ?? null
        });
      }

      await this.insertAudit(client, {
        actorId: input.createdBy,
        action: "numbering.drawing_number.create",
        detail: {
          sourceEntrypoint: input.sourceEntrypoint ?? "contextual_entrypoint",
          companyId,
          rootCode: root.rootCode,
          drawingNumber: drawingNumber.drawingNumber,
          purposeCode: drawingNumber.purposeCode,
          linkedPartNumber: linkedPart?.partNumber ?? null,
          linkType,
          reason: reason || null,
          idempotencyKey: idempotencyKey ?? null
        }
      });
      return { root, drawingNumber, linkedPart, linkType, reusedFromIdempotency: false };
    };
    return this.client.transaction(run);
  }

  async addPartNumberToRoot(input: AddPartNumberInput): Promise<AddPartNumberToRootResult> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const rootCode = input.rootCode.trim();
      if (!rootCode) throw new Error("PART_ROOT_REQUIRED");
      const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId });
      if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${rootCode}`);
      if (isClosedRecordStatus(rootRow.record_status)) throw new Error(`ROOT_APPEND_LOCKED: ${rootRow.record_status}`);
      const inheritedPart = await this.getRootAppendPartProfile(client, rootRow);
      if (input.itemKind && input.itemKind !== inheritedPart.itemKind) throw new Error("PART_ROOT_ITEM_KIND_MISMATCH");
      if (inheritedPart.structureType === "unclassified") throw new Error("PART_ROOT_STRUCTURE_TYPE_UNCLASSIFIED");
      if (input.structureType && input.structureType !== inheritedPart.structureType) throw new Error("PART_ROOT_STRUCTURE_TYPE_MISMATCH");
      const structureType = inheritedPart.structureType;
      if (inheritedPart.itemKind === "purchased" && structureType === "assembly") throw new Error("PURCHASED_ASSEMBLY_NOT_SUPPORTED");

      const idempotencyKey = input.idempotencyKey?.trim();
      if (idempotencyKey) {
        const recent = await this.findRecentAppendAudit(client, {
          action: "numbering.part_number.create",
          actorId: input.createdBy ?? null,
          idempotencyKey
        });
        const recentPartNumber = String(recent?.partNumber ?? "").trim();
        if (recentPartNumber) {
          const recentRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
            partNumber: recentPartNumber,
            companyId
          });
          if (recentRow && recentRow.part_root_id === rootRow.id) {
            const partNumber = mapPartNumber(recentRow);
            await this.ensureCanonicalPartWorkbenchState(client, partNumber);
            return { root: mapPartRoot(rootRow), partNumber, linkedDrawing: null, linkType: null, reusedFromIdempotency: true };
          }
        }
      }

      const reasonRequired = await this.rootAppendReasonRequired(client, rootRow.id, rootRow.record_status);
      const reason = input.reason?.trim() ?? "";
      if (reasonRequired && !reason) throw new Error("APPEND_REASON_REQUIRED_FOR_FORMAL_ROOT");

      const root = mapPartRoot(rootRow);
      const partNumber = await this.insertPartNumber(client, root, {
        partName: root.coreName,
        itemKind: inheritedPart.itemKind,
        structureType,
        recordStatus: input.recordStatus ?? "Draft",
        isUniversal: inheritedPart.isUniversal,
        customSpecification: inheritedPart.customSpecification ?? undefined,
        seriesCode: inheritedPart.seriesCode ?? undefined,
        ruleVersionId: input.ruleVersionId ?? root.ruleVersionId,
        createdBy: input.createdBy
      });

      let linkedDrawing: DrawingNumberRecord | null = null;
      let linkType: "primary_manufacturing" | "reference" | null = null;
      const linkDrawingNumber = input.linkDrawingNumber?.trim();
      const linkRelationType = input.linkRelationType ?? (linkDrawingNumber ? "auto" : "none");
      if (linkDrawingNumber && linkRelationType !== "none") {
        const drawingRow = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
          drawingNumber: linkDrawingNumber,
          companyId
        });
        if (!drawingRow) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${linkDrawingNumber}`);
        if (drawingRow.part_root_id !== root.id) throw new Error("DRAWING_PART_ROOT_MISMATCH");
        const drawing = mapDrawingNumber(drawingRow);
        if (linkRelationType === "primary_manufacturing" && !isManufacturingDrawingPurpose(drawing.purposeCode)) {
          throw new Error("PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING");
        }
        linkType = linkRelationType === "reference" || !isManufacturingDrawingPurpose(drawing.purposeCode) ? "reference" : "primary_manufacturing";
        await new RelationFormalAuthorityRepository(client).upsertPairInClient(client, {
          companyId,
          drawingNumberId: drawing.id,
          partNumberId: partNumber.id,
          relationType: linkType === "primary_manufacturing" ? "manufacturing_basis" : "reference",
          actorId: input.createdBy ?? null
        });
        linkedDrawing = drawing;
      }

      await this.insertAudit(client, {
        actorId: input.createdBy,
        action: "numbering.part_number.create",
        detail: {
          sourceEntrypoint: input.sourceEntrypoint ?? "contextual_entrypoint",
          companyId,
          rootCode: root.rootCode,
          partNumber: partNumber.partNumber,
          structureType: partNumber.structureType,
          linkedDrawingNumber: linkedDrawing?.drawingNumber ?? null,
          linkType,
          reason: reason || null,
          idempotencyKey: idempotencyKey ?? null
        }
      });
      return { root, partNumber, linkedDrawing, linkType, reusedFromIdempotency: false };
    };
    return this.client.transaction(run);
  }

  async addDrawingAndPartToRoot(input: AddDrawingAndPartToRootInput): Promise<AddDrawingAndPartToRootResult> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const rootCode = input.rootCode.trim();
      if (!rootCode) throw new Error("PART_ROOT_REQUIRED");
      const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId });
      if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${rootCode}`);
      if (isClosedRecordStatus(rootRow.record_status)) throw new Error(`ROOT_APPEND_LOCKED: ${rootRow.record_status}`);
      const inheritedPart = await this.getRootAppendPartProfile(client, rootRow);
      if (input.itemKind && input.itemKind !== inheritedPart.itemKind) throw new Error("PART_ROOT_ITEM_KIND_MISMATCH");
      if (inheritedPart.structureType === "unclassified") throw new Error("PART_ROOT_STRUCTURE_TYPE_UNCLASSIFIED");
      if (input.structureType && input.structureType !== inheritedPart.structureType) throw new Error("PART_ROOT_STRUCTURE_TYPE_MISMATCH");
      const structureType = inheritedPart.structureType;
      if (inheritedPart.itemKind === "purchased" && structureType === "assembly") throw new Error("PURCHASED_ASSEMBLY_NOT_SUPPORTED");

      const idempotencyKey = input.idempotencyKey?.trim();
      if (idempotencyKey) {
        const recent = await this.findRecentAppendAudit(client, {
          action: "numbering.drawing_part.create",
          actorId: input.createdBy ?? null,
          idempotencyKey
        });
        const recentDrawingNumber = String(recent?.drawingNumber ?? "").trim();
        const recentPartNumber = String(recent?.partNumber ?? "").trim();
        if (recentDrawingNumber && recentPartNumber) {
          const [drawingRow, partRow] = await Promise.all([
            client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { drawingNumber: recentDrawingNumber, companyId }),
            client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: recentPartNumber, companyId })
          ]);
          const recentLinkType = String(recent?.linkType ?? "") as "primary_manufacturing" | "reference";
          if (drawingRow && partRow && drawingRow.part_root_id === rootRow.id && partRow.part_root_id === rootRow.id && (recentLinkType === "primary_manufacturing" || recentLinkType === "reference")) {
            const drawingNumber = mapDrawingNumber(drawingRow);
            const partNumber = mapPartNumber(partRow);
            await this.ensureCanonicalDrawingWorkbenchState(client, drawingNumber, input.createdBy);
            await this.ensureCanonicalPartWorkbenchState(client, partNumber);
            return {
              root: mapPartRoot(rootRow),
              drawingNumber,
              partNumber,
              linkType: recentLinkType,
              reusedFromIdempotency: true
            };
          }
        }
      }

      const reasonRequired = await this.rootAppendReasonRequired(client, rootRow.id, rootRow.record_status);
      const reason = input.reason?.trim() ?? "";
      if (reasonRequired && !reason) throw new Error("APPEND_REASON_REQUIRED_FOR_FORMAL_ROOT");

      const root = mapPartRoot(rootRow);
      const recordStatus = input.recordStatus ?? "Draft";
      const ruleVersionId = input.ruleVersionId ?? root.ruleVersionId;
      const drawingNumber = await this.insertDrawingNumber(client, root, {
        purposeCode: input.purposeCode,
        purposeDescription: input.purposeDescription,
        recordStatus,
        ruleVersionId,
        createdBy: input.createdBy
      });
      const partNumber = await this.insertPartNumber(client, root, {
        partName: root.coreName,
        itemKind: inheritedPart.itemKind,
        structureType,
        recordStatus,
        isUniversal: inheritedPart.isUniversal,
        customSpecification: inheritedPart.customSpecification ?? undefined,
        seriesCode: inheritedPart.seriesCode ?? undefined,
        ruleVersionId,
        createdBy: input.createdBy
      });

      const relationType = input.linkRelationType ?? "auto";
      if (relationType === "primary_manufacturing" && !isManufacturingDrawingPurpose(drawingNumber.purposeCode)) {
        throw new Error("PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING");
      }
      const linkType: "primary_manufacturing" | "reference" =
        relationType === "reference" || !isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? "reference" : "primary_manufacturing";
      await new RelationFormalAuthorityRepository(client).upsertPairInClient(client, {
        companyId,
        drawingNumberId: drawingNumber.id,
        partNumberId: partNumber.id,
        relationType: linkType === "primary_manufacturing" ? "manufacturing_basis" : "reference",
        actorId: input.createdBy ?? null
      });

      await this.insertAudit(client, {
        actorId: input.createdBy,
        action: "numbering.drawing_part.create",
        detail: {
          sourceEntrypoint: input.sourceEntrypoint ?? "numbering_request_append",
          companyId,
          rootCode: root.rootCode,
          drawingNumber: drawingNumber.drawingNumber,
          partNumber: partNumber.partNumber,
          structureType: partNumber.structureType,
          purposeCode: drawingNumber.purposeCode,
          linkType,
          reason: reason || null,
          idempotencyKey: idempotencyKey ?? null
        }
      });
      return { root, drawingNumber, partNumber, linkType, reusedFromIdempotency: false };
    };
    return this.client.transaction(run);
  }

  async getRootObsoleteImpact(input: { companyId?: string; rootCode?: string; rootId?: string; excludeApprovalRequestId?: string | null }): Promise<RootObsoleteImpactResult> {
    return this.getRootObsoleteImpactInClient(this.client, input);
  }

  async requestRootObsoleteApproval(input: RequestRootObsoleteApprovalInput): Promise<RootObsoleteApprovalResult> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const reason = input.reason.trim();
      if (!reason) throw new Error("reason is required");
      const impact = await this.getRootObsoleteImpactInClient(client, { companyId, rootCode: input.rootCode, rootId: input.rootId });
      if (impact.pendingRequestId) throw new Error("LIFE_OBSOLETE_ALREADY_REQUESTED");
      if (impact.policy.action !== "request_formal_obsolete") throw new Error("LIFE_OBSOLETE_NOT_ELIGIBLE");
      if (impact.approvalTargets.length === 0) throw new Error("LIFE_OBSOLETE_NOT_ELIGIBLE");

      const approvalRequest = await this.insertNumberingApprovalRequest(client, {
        companyId,
        actionCode: "obsolete_part_root",
        entityType: "part_root",
        entityId: impact.root.id,
        reason,
        requestedBy: input.requestedBy,
        payload: {
          lifecycleAction: "obsolete",
          aggregateIntent: "whole_root_obsolete",
          rootCode: impact.root.rootCode,
          rootStatus: impact.root.recordStatus,
          schemaVersion: 1,
          targetCount: impact.approvalTargets.length,
          approvalTargets: impact.approvalTargets,
          childTargets: impact.formalTargets,
          dependencySummary: impact.dependencySummary,
          dependencyFingerprint: impact.dependencySummary.fingerprint,
          links: impact.links,
          warnings: impact.warnings,
          projectCode: input.projectCode?.trim() || null
        }
      });
      const approvalBatch = await this.createNumberingApprovalBatchInClient(client, {
        companyId,
        approvalRequestIds: [approvalRequest.id],
        projectCode: input.projectCode?.trim() || undefined,
        actionCode: "obsolete_part_root",
        submittedBy: input.requestedBy
      });
      return { approvalRequest, approvalBatch, impact };
    };
    return this.client.transaction(run);
  }

  private async findRecentDuplicateCreateInClient(
    client: AsyncDatabaseClient,
    input: CreateNumberingRecordInput & {
      companyId: string;
      recordStatus: NumberingRecordStatus;
      isUniversal: boolean;
      ruleVersionId: string;
    }
  ): Promise<{
    root: PartRootRecord;
    partNumber: PartNumberRecord;
    drawingNumber: DrawingNumberRecord | null;
  } | null> {
    const nowMs = Date.parse(this.clock());
    const notBefore = new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) - 60_000).toISOString();
    const recent = await client.queryOne<{
      root_id: string;
      part_number_id: string;
      drawing_number_id: string | null;
    }>(SELECT_ASYNC_RECENT_DUPLICATE_CREATE_SQL, {
      companyId: input.companyId,
      coreName: input.coreName.trim(),
      partName: input.partName?.trim() || input.coreName.trim(),
      itemKind: input.itemKind,
      recordStatus: input.recordStatus,
      ruleVersionId: input.ruleVersionId,
      isUniversal: input.isUniversal ? 1 : 0,
      universalReason: input.universalReason?.trim() ?? "",
      customSpecification: input.customSpecification?.trim() ?? "",
      seriesCode: normalizeSeriesCode(input.itemKind, Boolean(input.isUniversal), input.seriesCode) ?? "",
      structureType: input.structureType ?? "single_part",
      createdBy: input.createdBy ?? null,
      notBefore,
      drawingRequested: input.drawingPurposeCode ? 1 : 0,
      drawingPurposeCode: input.drawingPurposeCode ?? "",
      drawingPurposeDescription: input.drawingPurposeDescription?.trim() ?? ""
    });
    if (!recent) return null;

    const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_ID_SQL, { rootId: recent.root_id });
    const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_ID_SQL, { partNumberId: recent.part_number_id });
    const drawingRow = recent.drawing_number_id
      ? await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_ID_SQL, { drawingNumberId: recent.drawing_number_id })
      : null;
    if (!rootRow || !partRow) return null;
    return {
      root: mapPartRoot(rootRow),
      partNumber: mapPartNumber(partRow),
      drawingNumber: drawingRow ? mapDrawingNumber(drawingRow) : null
    };
  }

  async updateDraftNumberingRecord(input: UpdateDraftNumberingRecordInput): Promise<NumberingRootBundleRecord | null> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode: input.rootCode, companyId });
      if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${input.rootCode}`);
      assertDraftMutableStatus(rootRow.record_status, "ROOT");
      const before = await this.getNumberingRootBundleInClient(client, input.rootCode, companyId);
      const now = this.clock();
      const coreName = input.coreName?.trim();
      if (coreName) {
        await client.execute(UPDATE_ASYNC_PART_ROOT_CORE_NAME_SQL, { rootId: rootRow.id, coreName, updatedAt: now });
        await client.execute(UPDATE_ASYNC_ROOT_PART_NAMES_SQL, { rootId: rootRow.id, partName: coreName, updatedAt: now });
      }
      const effectiveRootName = coreName || rootRow.core_name;

      const partNumberText = input.partNumber?.trim();
      const partRow = partNumberText
        ? await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
            partNumber: partNumberText,
            companyId
          })
        : await client.queryOne<PartNumberRow>(SELECT_ASYNC_FIRST_PART_NUMBER_FOR_ROOT_SQL, { rootId: rootRow.id });
      if ((input.customSpecification !== undefined || input.universalReason !== undefined) && partRow) {
        if (partRow.part_root_id !== rootRow.id) throw new Error(`PART_NUMBER_ROOT_MISMATCH: ${partNumberText ?? partRow.part_number}`);
        assertDraftMutableStatus(partRow.record_status, "PART");
        await client.execute(UPDATE_ASYNC_PART_NUMBER_DRAFT_SQL, {
          partNumberId: partRow.id,
          partName: effectiveRootName,
          customSpecification: input.customSpecification !== undefined ? input.customSpecification.trim() || null : partRow.custom_specification,
          universalReason: input.universalReason !== undefined ? input.universalReason.trim() || null : partRow.universal_reason,
          updatedAt: now
        });
      }

      const drawingNumberText = input.drawingNumber?.trim();
      const drawingRow = drawingNumberText
        ? await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
            drawingNumber: drawingNumberText,
            companyId
          })
        : await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_FIRST_DRAWING_NUMBER_FOR_ROOT_SQL, { rootId: rootRow.id });
      if (input.drawingPurposeDescription !== undefined && drawingRow) {
        if (drawingRow.part_root_id !== rootRow.id) throw new Error(`DRAWING_NUMBER_ROOT_MISMATCH: ${drawingNumberText ?? drawingRow.drawing_number}`);
        assertDraftMutableStatus(drawingRow.record_status, "DRAWING");
        await client.execute(UPDATE_ASYNC_DRAWING_PURPOSE_DESCRIPTION_SQL, {
          drawingNumberId: drawingRow.id,
          purposeDescription:
            input.drawingPurposeDescription.trim() || normalizePurposeDescription(drawingRow.purpose_code, drawingRow.purpose_description),
          updatedAt: now
        });
        await new UnifiedDrawingAsyncRepository(client).synchronizeFormalDrawing({
          drawingNumberId: drawingRow.id,
          companyId
        });
      }

      const after = await this.getNumberingRootBundleInClient(client, input.rootCode, companyId);
      await this.insertAudit(client, {
        actorId: input.updatedBy,
        action: "numbering.draft.update",
        detail: { rootCode: input.rootCode, before, after }
      });
      return after;
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async obsoleteDraftNumberingRecord(input: ObsoleteDraftNumberingRecordInput): Promise<NumberingRootBundleRecord | null> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const reason = input.reason.trim();
      if (!reason) throw new Error("OBSOLETE_REASON_REQUIRED");
      const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, {
        rootCode: input.rootCode,
        companyId
      });
      if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${input.rootCode}`);
      assertDraftMutableStatus(rootRow.record_status, "ROOT");
      const impact = await this.getRootObsoleteImpactInClient(client, { companyId, rootCode: input.rootCode });
      if (impact.pendingRequestId) throw new Error("LIFE_OBSOLETE_ALREADY_REQUESTED");
      if (impact.policy.action !== "obsolete_draft_official_number") throw new Error("LIFE_ROOT_MIXED_OR_TERMINAL");
      if (impact.dependencySummary.controlledReferenceCount > 0) {
        throw new Error("NUMBERING_DRAFT_OBSOLETE_HAS_CONTROLLED_REFERENCES");
      }
      const [partRows, drawingRows] = await Promise.all([
        client.query<PartNumberRow>(SELECT_ASYNC_ROOT_PART_NUMBERS_SQL, { rootId: rootRow.id }),
        client.query<DrawingNumberRow>(SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL, { rootId: rootRow.id })
      ]);
      for (const row of partRows) assertDraftMutableStatus(row.record_status, "PART");
      for (const row of drawingRows) assertDraftMutableStatus(row.record_status, "DRAWING");

      const before = await this.getNumberingRootBundleInClient(client, input.rootCode, companyId);
      const now = this.clock();
      await client.execute(UPDATE_ASYNC_ROOT_DRAWINGS_OBSOLETE_SQL, { rootId: rootRow.id, updatedAt: now });
      await client.execute(UPDATE_ASYNC_ROOT_PARTS_OBSOLETE_SQL, { rootId: rootRow.id, updatedAt: now });
      await client.execute(UPDATE_ASYNC_ROOT_OBSOLETE_SQL, { rootId: rootRow.id, updatedAt: now });
      const after = await this.getNumberingRootBundleInClient(client, input.rootCode, companyId);
      await this.insertAudit(client, {
        actorId: input.obsoletedBy,
        action: "numbering.draft.obsolete",
        detail: { rootCode: input.rootCode, reason, before, after }
      });
      for (const drawing of drawingRows) {
        await new UnifiedDrawingAsyncRepository(client).synchronizeFormalDrawing({
          drawingNumberId: drawing.id,
          companyId
        });
      }
      return after;
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async deleteDraftNumberingRecord(input: DeleteDraftNumberingRecordInput): Promise<DeleteDraftNumberingRecordResult> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const rootCode = input.rootCode.trim();
      if (!rootCode) throw new Error("PART_ROOT_REQUIRED");
      const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId });
      if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${rootCode}`);
      assertDraftMutableStatus(rootRow.record_status, "ROOT");

      const [partRows, drawingRows] = await Promise.all([
        client.query<PartNumberRow>(SELECT_ASYNC_ROOT_PART_NUMBERS_SQL, { rootId: rootRow.id }),
        client.query<DrawingNumberRow>(SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL, { rootId: rootRow.id })
      ]);
      for (const row of partRows) assertDraftMutableStatus(row.record_status, "PART");
      for (const row of drawingRows) assertDraftMutableStatus(row.record_status, "DRAWING");

      const dependencyCounts = await client.queryOne<{
        approval_count: number;
        revision_package_count: number;
        shared_model_count: number;
        manufacturing_baseline_count: number;
        manufacturing_baseline_item_count: number;
        replacement_link_count: number;
        bom_reconfirmation_count: number;
        file_asset_count: number;
      }>(SELECT_ASYNC_DRAFT_DELETE_DEPENDENCY_COUNTS_SQL, { rootId: rootRow.id, excludeApprovalRequestId: null });
      const controlledDependencyCount =
        Number(dependencyCounts?.approval_count ?? 0) +
        Number(dependencyCounts?.revision_package_count ?? 0) +
        Number(dependencyCounts?.shared_model_count ?? 0) +
        Number(dependencyCounts?.manufacturing_baseline_count ?? 0) +
        Number(dependencyCounts?.manufacturing_baseline_item_count ?? 0) +
        Number(dependencyCounts?.replacement_link_count ?? 0) +
        Number(dependencyCounts?.bom_reconfirmation_count ?? 0);
      if (controlledDependencyCount > 0) throw new Error("NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES");

      const deletedRoot = mapPartRoot(rootRow);
      const deletedPartNumbers = partRows.map(mapPartNumber);
      const deletedDrawingNumbers = drawingRows.map(mapDrawingNumber);
      const affectedFileAssets = Number(dependencyCounts?.file_asset_count ?? 0);
      const now = this.clock();
      const reason = input.reason?.trim() || "刪除未送審草稿";

      await client.execute(UPDATE_ASYNC_DRAFT_FILE_ASSETS_DELETED_SQL, {
        rootId: rootRow.id,
        deletedAt: now,
        deletedBy: input.deletedBy ?? null,
        deletedReason: reason,
        updatedAt: now
      });
      await client.execute(UPDATE_ASYNC_DRAFT_TASK_ITEMS_CANCELLED_SQL, { rootId: rootRow.id, handledBy: input.deletedBy ?? null, handledAt: now });
      await client.execute(UPDATE_ASYNC_DRAFT_NOTIFICATIONS_HANDLED_SQL, { rootId: rootRow.id, handledBy: input.deletedBy ?? null, handledAt: now });
      await client.execute(DELETE_ASYNC_DRAFT_WARNING_EVENTS_SQL, { rootId: rootRow.id });
      await client.execute(UPDATE_ASYNC_DRAFT_PART_NUMBER_DRAFT_SOURCES_NULL_SQL, { rootId: rootRow.id, updatedAt: now });
      await client.execute(DELETE_ASYNC_DRAFT_DRAWING_FFF_SQL, { rootId: rootRow.id });
      await client.execute(DELETE_ASYNC_DRAFT_SAME_DRAWING_VARIANTS_SQL, { rootId: rootRow.id });
      await new RelationFormalAuthorityRepository(client).removeRootLinksInClient(client, { companyId, rootId: rootRow.id });
      await client.execute(DELETE_ASYNC_DRAFT_PART_VARIANT_ATTRIBUTES_SQL, { rootId: rootRow.id });
      for (const drawing of drawingRows) {
        await client.execute(
          `DELETE FROM drawing_revision_files
           WHERE drawing_revision_id IN (
             SELECT revision.id FROM drawing_revisions revision
             JOIN drawings canonical ON canonical.id = revision.drawing_id
             WHERE canonical.formal_drawing_number_id = :drawingNumberId
               AND canonical.company_id = :companyId
               AND revision.lifecycle_state IN ('preparing', 'cancelled')
           )`,
          { drawingNumberId: drawing.id, companyId }
        );
        await client.execute(
          `DELETE FROM drawing_revisions
           WHERE drawing_id IN (
             SELECT id FROM drawings
             WHERE formal_drawing_number_id = :drawingNumberId AND company_id = :companyId
           ) AND lifecycle_state IN ('preparing', 'cancelled')`,
          { drawingNumberId: drawing.id, companyId }
        );
        await client.execute(
          `DELETE FROM drawings
           WHERE formal_drawing_number_id = :drawingNumberId AND company_id = :companyId
             AND lifecycle_state IN ('building', 'drawing_preparation', 'cancelled')`,
          { drawingNumberId: drawing.id, companyId }
        );
      }
      await client.execute(DELETE_ASYNC_DRAFT_DRAWING_NUMBERS_SQL, { rootId: rootRow.id });
      await client.execute(DELETE_ASYNC_DRAFT_PART_NUMBERS_SQL, { rootId: rootRow.id });
      await client.execute(DELETE_ASYNC_DRAFT_PART_ROOT_SQL, { rootId: rootRow.id });

      const result = { rootCode, deletedRoot, deletedPartNumbers, deletedDrawingNumbers, affectedFileAssets };
      await this.insertAudit(client, {
        actorId: input.deletedBy,
        action: "numbering.draft.delete",
        detail: { reason, ...result }
      });
      return result;
    };
    return this.client.transaction(run);
  }

  async checkNumberingDuplicates(input: DuplicateCheckInput): Promise<DuplicateCheckResult> {
    const run = async (client: AsyncDatabaseClient) => this.checkNumberingDuplicatesInClient(client, input);
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async requestNumberingApproval(input: RequestNumberingApprovalInput): Promise<NumberingApprovalRecord> {
    const run = async (client: AsyncDatabaseClient) => this.insertNumberingApprovalRequest(client, input);
    return this.client.transaction(run);
  }

  async requestNumberingObsoleteApproval(input: RequestNumberingObsoleteApprovalInput): Promise<NumberingObsoleteApprovalResult> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const entityId = input.entityId?.trim() || "";
      const entityCode = input.entityCode?.trim() || "";
      const projectCode = input.projectCode?.trim() || undefined;
      const actionCode: Extract<NumberingApprovalActionCode, "obsolete_part_number" | "obsolete_ma_drawing"> =
        input.entityType === "part_number" ? "obsolete_part_number" : "obsolete_ma_drawing";

      if (!entityId && !entityCode) throw new Error("LIFE_OBSOLETE_ENTITY_REQUIRED");

      const entityRow =
        input.entityType === "part_number"
          ? entityId
            ? await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_ID_SQL, { partNumberId: entityId })
            : await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: entityCode, companyId })
          : entityId
            ? await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_ID_SQL, { drawingNumberId: entityId })
            : await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { drawingNumber: entityCode, companyId });

      if (!entityRow) throw new Error(input.entityType === "part_number" ? `PART_NUMBER_NOT_FOUND: ${entityCode || entityId}` : `DRAWING_NUMBER_NOT_FOUND: ${entityCode || entityId}`);
      if (entityRow.company_id !== companyId) throw new Error("LIFE_OBSOLETE_COMPANY_MISMATCH");
      if (entityRow.record_status === "Obsolete") throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
      if (entityRow.record_status !== "Active" && entityRow.record_status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

      const activeCanonicalActivityCount = await this.readCanonicalActivityCount(client, {
        companyId,
        entityType: input.entityType === "part_number" ? "part" : "drawing",
        entityId: entityRow.id
      });
      if (activeCanonicalActivityCount > 0) throw new Error("LIFE_ACTIVE_CANONICAL_WORK");

      const pending = await client.queryOne<{ id: string }>(SELECT_ASYNC_PENDING_OBSOLETE_APPROVAL_SQL, {
        companyId,
        entityType: input.entityType,
        entityId: entityRow.id,
        actionCode
      });
      if (pending) throw new Error("LIFE_OBSOLETE_ALREADY_REQUESTED");

      const resolvedEntityCode = input.entityType === "part_number" ? (entityRow as PartNumberRow).part_number : (entityRow as DrawingNumberRow).drawing_number;
      const approvalRequest = await this.insertNumberingApprovalRequest(client, {
        companyId,
        actionCode,
        entityType: input.entityType,
        entityId: entityRow.id,
        reason: input.reason,
        requestedBy: input.requestedBy,
        payload: {
          lifecycleAction: "obsolete",
          entityCode: resolvedEntityCode,
          partNumber: input.entityType === "part_number" ? resolvedEntityCode : undefined,
          drawingNumber: input.entityType === "drawing_number" ? resolvedEntityCode : undefined,
          previousRecordStatus: entityRow.record_status,
          projectCode: projectCode ?? null
        }
      });
      const approvalBatch = await this.createNumberingApprovalBatchInClient(client, {
        companyId,
        approvalRequestIds: [approvalRequest.id],
        projectCode,
        actionCode,
        submittedBy: input.requestedBy
      });

      return {
        approvalRequest,
        approvalBatch,
        entity: {
          entityType: input.entityType,
          entityId: entityRow.id,
          entityCode: resolvedEntityCode,
          recordStatus: entityRow.record_status,
          actionCode
        }
      };
    };
    return this.client.transaction(run);
  }

  async requestSameDrawingVariantApproval(input: RequestSameDrawingVariantApprovalInput): Promise<NumberingApprovalRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const drawingRow = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
        drawingNumber: input.drawingNumber,
        companyId
      });
      if (!drawingRow) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${input.drawingNumber}`);
      const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: input.partNumber, companyId });
      if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
      if (drawingRow.part_root_id !== partRow.part_root_id) throw new Error("DRAWING_PART_ROOT_MISMATCH");
      const variants = normalizeVariantFields(input.variants);
      if (!isManufacturingDrawingPurpose(drawingRow.purpose_code)) throw new Error("SAME_DRAWING_VARIANT_REQUIRES_MA_DRAWING");
      if (variants.length === 0) throw new Error("SAME_DRAWING_VARIANT_REQUIRED");
      return this.insertNumberingApprovalRequest(client, {
        companyId,
        actionCode: "same_drawing_variant_after_release",
        entityType: "same_drawing_variant",
        entityId: drawingRow.id,
        reason: input.reason,
        requestedBy: input.requestedBy,
        payload: {
          drawingNumber: input.drawingNumber,
          partNumber: input.partNumber,
          variants
        }
      });
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async requestMainDrawingRestoreApproval(input: RequestMainDrawingRestoreApprovalInput): Promise<NumberingApprovalRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: input.partNumber, companyId });
      if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
      if (partRow.record_status !== "MainDrawingInvalid") throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_INVALID_PART");
      const replacementDrawingNumber = input.replacementDrawingNumber?.trim() || "";
      if (replacementDrawingNumber) await this.validateReplacementManufacturingDrawing(client, partRow, replacementDrawingNumber);
      return this.insertNumberingApprovalRequest(client, {
        companyId,
        actionCode: "main_drawing_restore",
        entityType: "part_number",
        entityId: partRow.id,
        reason: input.reason,
        requestedBy: input.requestedBy,
        payload: {
          partNumber: input.partNumber,
          replacementDrawingNumber: replacementDrawingNumber || null
        }
      });
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async decideNumberingApproval(input: DecideNumberingApprovalInput): Promise<NumberingApprovalRecord> {
    const run = async (client: AsyncDatabaseClient) => this.decideNumberingApprovalInClient(client, input);
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async getNumberingApprovalBatch(batchId: string, companyId: string = DEFAULT_COMPANY_ID): Promise<NumberingApprovalBatchRecord | null> {
    const row = await this.client.queryOne<ApprovalBatchRow>(SELECT_ASYNC_APPROVAL_BATCH_BY_ID_SQL, { batchId });
    if (row && row.company_id !== companyId) return null;
    return row ? this.mapApprovalBatchInClient(this.client, row) : null;
  }

  async listNumberingApprovalBatches(input: ListNumberingApprovalBatchesInput = {}): Promise<NumberingApprovalReviewBatchRecord[]> {
    const where = ["request_type = 'numbering'"];
    const params: Record<string, unknown> = { companyId: input.companyId ?? DEFAULT_COMPANY_ID };
    const accessContext = input.user ? await this.getNumberingAccessContext(input.user) : null;
    where.push("company_id = :companyId");

    const status = input.status ?? "active";
    if (status === "active") {
      where.push("batch_status IN ('pending', 'partially_approved', 'needs_info')");
    } else if (status !== "all") {
      where.push("batch_status = :status");
      params.status = status;
    }

    const actionCodes = Array.from(new Set((input.actionCodes ?? []).map((actionCode) => actionCode.trim()).filter(Boolean)));
    if (actionCodes.length > 0) {
      const actionList = createNamedList("actionCode", actionCodes);
      where.push(`action_code IN (${actionList.sql})`);
      Object.assign(params, actionList.params);
    }

    const limit = clampNumberingListLimit(input.limit);
    params.limit = accessContext && accessContext.user.role !== "Admin" ? 500 : limit;
    const rows = await this.client.query<ApprovalBatchRow>(
      `
      ${SELECT_ASYNC_APPROVAL_BATCHES_BASE_SQL}
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE batch_status
          WHEN 'pending' THEN 0
          WHEN 'partially_approved' THEN 1
          WHEN 'needs_info' THEN 2
          ELSE 3
        END,
        submitted_at DESC,
        id DESC
      LIMIT :limit
    `,
      params
    );

    const visibleRows = rows
      .filter((row) => (accessContext ? canAccessNumberingScope(accessContext, row.project_code, row.action_code) : true))
      .slice(0, limit);
    const preload = await this.preloadApprovalReviewBatches(this.client, visibleRows);
    const batches: NumberingApprovalReviewBatchRecord[] = [];
    for (const row of visibleRows) {
      const batch = await this.mapApprovalReviewBatchInClient(this.client, row, preload);
      const marker = delegatedReviewMarker(accessContext, "rd_manager", row.project_code, row.action_code);
      batches.push(marker ? { ...batch, markers: [...batch.markers, marker] } : batch);
    }
    return batches;
  }

  async createNumberingApprovalBatch(input: CreateNumberingApprovalBatchInput): Promise<NumberingApprovalBatchRecord> {
    const run = async (client: AsyncDatabaseClient) => this.createNumberingApprovalBatchInClient(client, input);
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async decideNumberingApprovalBatch(
    input: DecideNumberingApprovalBatchInput
  ): Promise<{ batch: NumberingApprovalBatchRecord; decisions: NumberingApprovalRecord[] }> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const batch = await client.queryOne<ApprovalBatchRow>(SELECT_ASYNC_APPROVAL_BATCH_BY_ID_SQL, { batchId: input.batchId });
      if (!batch) throw new Error(`APPROVAL_BATCH_NOT_FOUND: ${input.batchId}`);
      if (batch.company_id !== companyId) throw new Error("APPROVAL_BATCH_COMPANY_MISMATCH");

      const requestedIdSet = input.approvalRequestIds?.length
        ? new Set(input.approvalRequestIds.map((id) => id.trim()).filter(Boolean))
        : null;
      const itemRows = await client.query<ApprovalBatchItemRow>(SELECT_ASYNC_APPROVAL_BATCH_ITEMS_BY_BATCH_SQL, { batchId: input.batchId });
      const targetItems = itemRows.filter(
        (item) => item.item_status === "pending" && (!requestedIdSet || requestedIdSet.has(item.approval_request_id))
      );
      if (targetItems.length === 0) throw new Error("APPROVAL_BATCH_HAS_NO_PENDING_TARGETS");

      const decisions: NumberingApprovalRecord[] = [];
      for (const item of targetItems) {
        const itemComment = input.itemComments?.[item.approval_request_id]?.trim();
        const decision = await this.decideNumberingApprovalInClient(client, {
          approvalRequestId: item.approval_request_id,
          decision: input.decision,
          comment: itemComment || input.comment,
          approverRole: input.approverRole,
          approverId: input.approverId,
          companyId
        });
        await client.execute(UPDATE_ASYNC_APPROVAL_BATCH_ITEM_STATUS_SQL, {
          itemId: item.id,
          itemStatus: input.decision,
          updatedAt: this.clock()
        });
        decisions.push(decision);
      }

      const batchStatus = await this.refreshApprovalBatchStatus(client, input.batchId);
      await this.insertAudit(client, {
        actorId: input.approverId,
        action: "numbering.approval_batch.decision",
        detail: {
          batchId: input.batchId,
          decision: input.decision,
          approvalRequestIds: targetItems.map((item) => item.approval_request_id),
          batchStatus
        }
      });
      const updated = await client.queryOne<ApprovalBatchRow>(SELECT_ASYNC_APPROVAL_BATCH_BY_ID_SQL, { batchId: input.batchId });
      if (!updated) throw new Error(`APPROVAL_BATCH_NOT_FOUND: ${input.batchId}`);
      return { batch: await this.mapApprovalBatchInClient(client, updated), decisions };
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async resubmitRejectedNumberingApprovalBatchItems(
    input: ResubmitRejectedNumberingApprovalBatchItemsInput
  ): Promise<{ batch: NumberingApprovalBatchRecord; requests: NumberingApprovalRecord[] }> {
    const reason = input.reason.trim();
    if (!reason) throw new Error("RESUBMIT_REASON_REQUIRED");

    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const batch = await client.queryOne<ApprovalBatchRow>(SELECT_ASYNC_APPROVAL_BATCH_BY_ID_SQL, { batchId: input.batchId });
      if (!batch) throw new Error(`APPROVAL_BATCH_NOT_FOUND: ${input.batchId}`);
      if (batch.company_id !== companyId) throw new Error("APPROVAL_BATCH_COMPANY_MISMATCH");
      const requestedIdSet = input.approvalRequestIds?.length
        ? new Set(input.approvalRequestIds.map((id) => id.trim()).filter(Boolean))
        : null;
      const rejectedItems = await client.query<ApprovalBatchItemRow>(SELECT_ASYNC_REJECTED_APPROVAL_BATCH_ITEMS_SQL, { batchId: input.batchId });
      const targetItems = rejectedItems.filter((item) => !requestedIdSet || requestedIdSet.has(item.approval_request_id));
      if (targetItems.length === 0) throw new Error("APPROVAL_BATCH_HAS_NO_REJECTED_TARGETS");

      const requests: NumberingApprovalRecord[] = [];
      const now = this.clock();
      for (const item of targetItems) {
        const original = await client.queryOne<ApprovalRequestRow>(SELECT_ASYNC_APPROVAL_REQUEST_BY_ID_SQL, {
          approvalRequestId: item.approval_request_id
        });
        if (!original) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${item.approval_request_id}`);
        if (original.company_id !== companyId) throw new Error("APPROVAL_REQUEST_COMPANY_MISMATCH");
        const request = await this.insertNumberingApprovalRequest(client, {
          companyId,
          actionCode: original.action_code,
          entityType: original.entity_type,
          entityId: original.entity_id,
          reason,
          payload: {
            ...parseJsonDetail(original.payload_json),
            resubmittedFromApprovalRequestId: original.id,
            originalBatchId: input.batchId
          },
          requestedBy: input.requestedBy
        });
        await client.execute(INSERT_ASYNC_APPROVAL_BATCH_ITEM_SQL, {
          id: this.idFactory(),
          batchId: input.batchId,
          approvalRequestId: request.id,
          itemStatus: "pending",
          resubmittedFromItemId: item.id,
          createdAt: now,
          updatedAt: now
        });
        await client.execute(UPDATE_ASYNC_APPROVAL_BATCH_ITEM_STATUS_SQL, {
          itemId: item.id,
          itemStatus: "resubmitted",
          updatedAt: now
        });
        requests.push(request);
      }

      await this.refreshApprovalBatchStatus(client, input.batchId);
      await this.insertAudit(client, {
        actorId: input.requestedBy,
        action: "numbering.approval_batch.resubmit_rejected",
        detail: {
          batchId: input.batchId,
          originalApprovalRequestIds: targetItems.map((item) => item.approval_request_id),
          newApprovalRequestIds: requests.map((request) => request.id)
        }
      });
      const updated = await client.queryOne<ApprovalBatchRow>(SELECT_ASYNC_APPROVAL_BATCH_BY_ID_SQL, { batchId: input.batchId });
      if (!updated) throw new Error(`APPROVAL_BATCH_NOT_FOUND: ${input.batchId}`);
      return { batch: await this.mapApprovalBatchInClient(client, updated), requests };
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }


  async listNumberingAdminMatrix(): Promise<NumberingAdminMatrixRecord> {
    await this.ensureDefaultApprovalRulesForCurrentRuleVersion();
    const [
      roleRows,
      userRows,
      permissionRows,
      scopeRows,
      assignmentRows,
      priorityRows,
      delegationRows,
      auditRows,
      approvalRuleRows,
      templateRows,
      versionRows
    ] = await Promise.all([
      this.client.query<NumberingAdminRoleRow>(SELECT_ASYNC_ADMIN_ROLES_SQL),
      this.client.query<NumberingAdminUserRow>(SELECT_ASYNC_ADMIN_USERS_SQL),
      this.client.query<NumberingAdminPermissionRow>(SELECT_ASYNC_ADMIN_ROLE_PERMISSIONS_SQL),
      this.client.query<NumberingAdminRoleScopeRow>(SELECT_ASYNC_ADMIN_ROLE_SCOPES_SQL),
      this.client.query<NumberingUserRoleAssignmentRow>(SELECT_ASYNC_ADMIN_ROLE_ASSIGNMENTS_SQL),
      this.client.query<NumberingRolePriorityVersionRow>(SELECT_ASYNC_ADMIN_ROLE_PRIORITY_VERSIONS_SQL),
      this.client.query<NumberingApprovalDelegationRow>(SELECT_ASYNC_ADMIN_APPROVAL_DELEGATIONS_SQL),
      this.client.query<NumberingAdminAuditEventRow>(SELECT_ASYNC_ADMIN_ACCESS_AUDIT_EVENTS_SQL),
      this.client.query<ApprovalRuleRow>(SELECT_ASYNC_ADMIN_APPROVAL_RULES_SQL, { ruleVersionId: DEFAULT_RULE_VERSION_ID }),
      this.client.query<NumberingAdminRuleTemplateRow>(SELECT_ASYNC_ADMIN_RULE_TEMPLATES_SQL),
      this.client.query<NumberingRuleVersionRow>(SELECT_ASYNC_ADMIN_RULE_VERSIONS_SQL)
    ]);
    const approvalRules = approvalRuleRows.map(mapAdminApprovalRule);
    const actionCodes = Array.from(new Set([...NUMBERING_ACTION_PERMISSION_CODES, ...approvalRules.map((rule) => rule.actionCode)])).sort();

    return {
      ruleVersionId: DEFAULT_RULE_VERSION_ID,
      roles: roleRows.map(mapNumberingAdminRole),
      users: userRows.map(mapNumberingAdminUser),
      rolePermissions: permissionRows.map(mapNumberingAdminPermission),
      roleScopes: scopeRows.map(mapNumberingAdminRoleScope),
      rolePriorityVersions: priorityRows.map(mapNumberingRolePriorityVersion),
      activeRolePriority: priorityRows.map(mapNumberingRolePriorityVersion).find((version) => version.status === "active")?.priority ?? DEFAULT_ROLE_PRIORITY,
      roleAssignments: assignmentRows.map(mapNumberingUserRoleAssignment),
      approvalDelegations: delegationRows.map(mapNumberingApprovalDelegation),
      auditEvents: auditRows.map(mapNumberingAdminAuditEvent),
      approvalRules,
      hardRules: NUMBERING_HARD_RULE_CATALOG,
      ruleTemplates: templateRows.map(mapNumberingRuleTemplate),
      ruleVersions: versionRows.map(mapNumberingRuleVersion),
      options: {
        actionCodes,
        pagePermissionCodes: [...NUMBERING_PAGE_PERMISSION_CODES],
        recordStatuses: ["Draft", "NeedInfo", "Active", "PendingReview", "Released", "Obsolete", "Merged", "PendingAdminConfirm", "MainDrawingInvalid"],
        itemKinds: ["manufactured", "purchased"],
        riskFlags: [
          "duplicate_code",
          "multiple_primary_ma",
          "released_document_unrevised",
          "released_document_blocker",
          "main_drawing_invalid",
          "missing_primary_ma",
          "has_override",
          "high_similarity",
          "has_reference"
        ]
      }
    };
  }

  async upsertNumberingAdminRole(input: UpsertNumberingAdminRoleInput): Promise<NumberingAdminRoleRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const roleCode = input.roleCode.trim().toLowerCase().replaceAll(" ", "_");
      const title = input.title.trim();
      if (!roleCode || !/^[a-z][a-z0-9_]*$/.test(roleCode)) throw new Error("NUMBERING_ROLE_CODE_INVALID");
      if (!title) throw new Error("NUMBERING_ROLE_TITLE_REQUIRED");
      const existing = input.id
        ? await client.queryOne<NumberingAdminRoleRow>(SELECT_ASYNC_ROLE_BY_ID_SQL, { roleId: input.id })
        : await client.queryOne<NumberingAdminRoleRow>(SELECT_ASYNC_ROLE_BY_CODE_SQL, { roleCode });
      const id = existing?.id ?? input.id?.trim() ?? `role-${this.idFactory().slice(0, 12)}`;
      const now = this.clock();
      if (existing) {
        await client.execute(UPDATE_ASYNC_ADMIN_ROLE_SQL, { title, updatedAt: now, roleId: existing.id });
      } else {
        await client.execute(INSERT_ASYNC_ADMIN_ROLE_SQL, { id, roleCode, title, createdAt: now, updatedAt: now });
      }
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.role.upsert",
        detail: { roleId: id, roleCode, title, systemDefined: existing?.system_defined === 1 }
      });
      const row = await client.queryOne<NumberingAdminRoleRow>(SELECT_ASYNC_ROLE_BY_ID_SQL, { roleId: id });
      if (!row) throw new Error("NUMBERING_ROLE_NOT_FOUND");
      return mapNumberingAdminRole(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async upsertNumberingRolePermission(input: UpsertNumberingRolePermissionInput): Promise<NumberingAdminPermissionRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const role = await this.resolveNumberingRole(client, input);
      const permissionCode = input.permissionCode.trim();
      if (!permissionCode) throw new Error("NUMBERING_PERMISSION_CODE_REQUIRED");
      const now = this.clock();
      const existing = await client.queryOne<NumberingAdminPermissionRow>(SELECT_ASYNC_ROLE_PERMISSION_BY_NATURAL_KEY_SQL, {
        roleId: role.id,
        permissionKind: input.permissionKind,
        permissionCode
      });
      const id = existing?.id ?? `role-permission-${this.idFactory().slice(0, 12)}`;
      if (existing) {
        await client.execute(UPDATE_ASYNC_ROLE_PERMISSION_SQL, { permissionId: existing.id, allowed: boolToInt(input.allowed), updatedAt: now });
      } else {
        await client.execute(INSERT_ASYNC_ROLE_PERMISSION_SQL, {
          id,
          roleId: role.id,
          permissionKind: input.permissionKind,
          permissionCode,
          allowed: boolToInt(input.allowed),
          createdAt: now,
          updatedAt: now
        });
      }
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.role_permission.upsert",
        detail: { roleCode: role.role_code, permissionKind: input.permissionKind, permissionCode, allowed: input.allowed }
      });
      const row = await client.queryOne<NumberingAdminPermissionRow>("SELECT * FROM role_permissions WHERE id = :permissionId", { permissionId: id });
      if (!row) throw new Error("NUMBERING_PERMISSION_NOT_FOUND");
      return mapNumberingAdminPermission(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async upsertNumberingRoleScope(input: UpsertNumberingRoleScopeInput): Promise<NumberingAdminRoleScopeRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const role = await this.resolveNumberingRole(client, input);
      const scopeCode = input.scopeCode.trim();
      if (!scopeCode) throw new Error("NUMBERING_ROLE_SCOPE_CODE_REQUIRED");
      const now = this.clock();
      const existing = await client.queryOne<NumberingAdminRoleScopeRow>(SELECT_ASYNC_ROLE_SCOPE_BY_NATURAL_KEY_SQL, {
        roleId: role.id,
        scopeKind: input.scopeKind,
        scopeCode
      });
      const id = existing?.id ?? `role-scope-${this.idFactory().slice(0, 12)}`;
      if (existing) {
        await client.execute(UPDATE_ASYNC_ROLE_SCOPE_SQL, { scopeId: existing.id, allowed: boolToInt(input.allowed), updatedAt: now });
      } else {
        await client.execute(INSERT_ASYNC_ROLE_SCOPE_SQL, {
          id,
          roleId: role.id,
          scopeKind: input.scopeKind,
          scopeCode,
          allowed: boolToInt(input.allowed),
          createdBy: input.actorId ?? null,
          createdAt: now,
          updatedAt: now
        });
      }
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.role_scope.upsert",
        detail: { roleCode: role.role_code, scopeKind: input.scopeKind, scopeCode, allowed: input.allowed }
      });
      const row = await client.queryOne<NumberingAdminRoleScopeRow>("SELECT * FROM role_scope_rules WHERE id = :scopeId", { scopeId: id });
      if (!row) throw new Error("NUMBERING_ROLE_SCOPE_NOT_FOUND");
      return mapNumberingAdminRoleScope(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async upsertNumberingUserRoleAssignment(input: UpsertNumberingUserRoleAssignmentInput): Promise<NumberingUserRoleAssignmentRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const userId = input.userId.trim();
      const reason = input.reason.trim();
      if (!reason) throw new Error("NUMBERING_ROLE_ASSIGNMENT_REASON_REQUIRED");
      if (!(await client.queryOne<{ id: string }>(SELECT_ASYNC_USER_EXISTS_SQL, { userId }))) throw new Error("NUMBERING_ROLE_ASSIGNMENT_USER_NOT_FOUND");
      const role = await this.resolveNumberingRole(client, input);
      const now = this.clock();
      const scope = await normalizeRoleAssignmentScope(client, role.role_code, input, now);
      const existing = input.id
        ? await client.queryOne<{ id: string; revoked_at: string | null }>("SELECT * FROM user_role_assignments WHERE id = :assignmentId", { assignmentId: input.id.trim() })
        : await client.queryOne<{ id: string; revoked_at: string | null }>(SELECT_ASYNC_ACTIVE_USER_ROLE_ASSIGNMENT_SQL, { userId, roleId: role.id });
      if (existing?.revoked_at) throw new Error("NUMBERING_ROLE_ASSIGNMENT_REVOKED");
      const before = existing ? mapNumberingUserRoleAssignment((await this.selectNumberingUserRoleAssignment(client, existing.id)) as NumberingUserRoleAssignmentRow) : null;
      const id = existing?.id ?? input.id?.trim() ?? `user-role-${this.idFactory().slice(0, 12)}`;
      if (existing) {
        await client.execute(UPDATE_ASYNC_USER_ROLE_ASSIGNMENT_SQL, {
          assignmentId: existing.id,
          userId,
          roleId: role.id,
          reason,
          scopeTemplate: scope.scopeTemplate,
          namedScope: scope.namedScope,
          sponsorUserId: scope.sponsorUserId,
          startsAt: scope.startsAt,
          reviewDueAt: scope.reviewDueAt,
          hardEndsAt: scope.hardEndsAt,
          assignedBy: input.actorId,
          assignedAt: now
        });
      } else {
        await client.execute(INSERT_ASYNC_USER_ROLE_ASSIGNMENT_SQL, {
          id,
          userId,
          roleId: role.id,
          reason,
          scopeTemplate: scope.scopeTemplate,
          namedScope: scope.namedScope,
          sponsorUserId: scope.sponsorUserId,
          startsAt: scope.startsAt,
          reviewDueAt: scope.reviewDueAt,
          hardEndsAt: scope.hardEndsAt,
          assignedBy: input.actorId,
          assignedAt: now
        });
      }
      const after = mapNumberingUserRoleAssignment((await this.selectNumberingUserRoleAssignment(client, id)) as NumberingUserRoleAssignmentRow);
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.user_role_assignment.upsert",
        detail: { before, after, markers: ["role_assignment_override"], userId, roleCode: role.role_code, reason, scope }
      });
      return after;
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async revokeNumberingUserRoleAssignment(input: RevokeNumberingUserRoleAssignmentInput): Promise<NumberingUserRoleAssignmentRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const assignmentId = input.id.trim();
      const beforeRow = await this.selectNumberingUserRoleAssignment(client, assignmentId);
      if (!beforeRow) throw new Error("NUMBERING_ROLE_ASSIGNMENT_NOT_FOUND");
      const before = mapNumberingUserRoleAssignment(beforeRow);
      if (!before.revokedAt) {
        await client.execute(UPDATE_ASYNC_USER_ROLE_ASSIGNMENT_REVOKED_SQL, { assignmentId, revokedAt: this.clock(), revokedBy: input.actorId });
      }
      const after = mapNumberingUserRoleAssignment((await this.selectNumberingUserRoleAssignment(client, assignmentId)) as NumberingUserRoleAssignmentRow);
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.user_role_assignment.revoke",
        detail: { before, after, markers: ["role_assignment_override"], reason: input.reason?.trim() ?? null }
      });
      return after;
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async saveNumberingRolePriority(input: SaveNumberingRolePriorityInput): Promise<NumberingRolePriorityVersionRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const priority = Array.from(new Set(input.priority.map((roleCode) => roleCode.trim()).filter(Boolean)));
      const reason = input.reason.trim();
      if (priority.length === 0) throw new Error("NUMBERING_ROLE_PRIORITY_REQUIRED");
      if (!reason) throw new Error("NUMBERING_ROLE_PRIORITY_REASON_REQUIRED");
      const roleList = createNamedList("roleCode", priority);
      const existingRoleCount = await client.queryOne<CountRow>(
        `${SELECT_ASYNC_ROLE_COUNT_BY_CODES_BASE_SQL} WHERE role_code IN (${roleList.sql})`,
        roleList.params
      );
      if (Number(existingRoleCount?.count ?? 0) !== priority.length) throw new Error("NUMBERING_ROLE_PRIORITY_ROLE_NOT_FOUND");
      const before = await client.queryOne<NumberingRolePriorityVersionRow>(SELECT_ASYNC_ADMIN_ACTIVE_ROLE_PRIORITY_SQL);
      const now = this.clock();
      await client.execute(RETIRE_ASYNC_ROLE_PRIORITIES_SQL);
      const id = `role-priority-${this.idFactory().slice(0, 12)}`;
      const versionCode = `role-priority-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${id.slice(-4)}`;
      await client.execute(INSERT_ASYNC_ROLE_PRIORITY_VERSION_SQL, {
        id,
        versionCode,
        priorityJson: JSON.stringify(priority),
        createdBy: input.actorId ?? null,
        createdAt: now
      });
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.role_priority.save",
        detail: { before: before ? parseRolePriorityJson(before.priority_json) : DEFAULT_ROLE_PRIORITY, after: priority, reason, versionCode }
      });
      const row = await client.queryOne<NumberingRolePriorityVersionRow>("SELECT * FROM role_priority_versions WHERE id = :priorityId", { priorityId: id });
      if (!row) throw new Error("NUMBERING_ROLE_PRIORITY_NOT_FOUND");
      return mapNumberingRolePriorityVersion(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async upsertNumberingApprovalDelegation(input: UpsertNumberingApprovalDelegationInput): Promise<NumberingApprovalDelegationRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const delegatedFrom = input.delegatedFrom.trim();
      const delegatedTo = input.delegatedTo.trim();
      const reason = input.reason.trim();
      if (!delegatedFrom || !delegatedTo) throw new Error("NUMBERING_DELEGATION_USERS_REQUIRED");
      if (delegatedFrom === delegatedTo) throw new Error("NUMBERING_DELEGATION_SELF_NOT_ALLOWED");
      if (!reason) throw new Error("NUMBERING_DELEGATION_REASON_REQUIRED");
      if (!(await client.queryOne<{ id: string }>(SELECT_ASYNC_USER_EXISTS_SQL, { userId: delegatedFrom }))) throw new Error("NUMBERING_DELEGATION_FROM_NOT_FOUND");
      if (!(await client.queryOne<{ id: string }>(SELECT_ASYNC_USER_EXISTS_SQL, { userId: delegatedTo }))) throw new Error("NUMBERING_DELEGATION_TO_NOT_FOUND");
      const startsAt = nullableText(input.startsAt);
      const endsAt = nullableText(input.endsAt);
      if (startsAt && endsAt && startsAt > endsAt) throw new Error("NUMBERING_DELEGATION_TIME_RANGE_INVALID");
      const existing = input.id
        ? await client.queryOne<NumberingApprovalDelegationRow>(SELECT_ASYNC_ADMIN_APPROVAL_DELEGATION_BY_ID_SQL, { delegationId: input.id })
        : null;
      const id = existing?.id ?? input.id?.trim() ?? `delegation-${this.idFactory().slice(0, 12)}`;
      if (existing) {
        await client.execute(UPDATE_ASYNC_APPROVAL_DELEGATION_SQL, {
          delegationId: id,
          delegatedFrom,
          delegatedTo,
          projectCode: nullableText(input.projectCode),
          actionCode: nullableText(input.actionCode),
          startsAt,
          endsAt,
          reason
        });
      } else {
        await client.execute(INSERT_ASYNC_APPROVAL_DELEGATION_SQL, {
          id,
          delegatedFrom,
          delegatedTo,
          projectCode: nullableText(input.projectCode),
          actionCode: nullableText(input.actionCode),
          startsAt,
          endsAt,
          reason,
          createdBy: input.actorId,
          createdAt: this.clock()
        });
      }
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.approval_delegation.upsert",
        detail: { delegationId: id, delegatedFrom, delegatedTo, projectCode: nullableText(input.projectCode), actionCode: nullableText(input.actionCode), startsAt, endsAt, reason }
      });
      const row = await client.queryOne<NumberingApprovalDelegationRow>(SELECT_ASYNC_ADMIN_APPROVAL_DELEGATION_BY_ID_SQL, { delegationId: id });
      if (!row) throw new Error("NUMBERING_DELEGATION_NOT_FOUND");
      return mapNumberingApprovalDelegation(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async revokeNumberingApprovalDelegation(input: RevokeNumberingApprovalDelegationInput): Promise<NumberingApprovalDelegationRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      await client.execute(UPDATE_ASYNC_APPROVAL_DELEGATION_REVOKED_SQL, { delegationId: input.id, revokedAt: this.clock(), revokedBy: input.actorId });
      const row = await client.queryOne<NumberingApprovalDelegationRow>(SELECT_ASYNC_ADMIN_APPROVAL_DELEGATION_BY_ID_SQL, { delegationId: input.id });
      if (!row) throw new Error("NUMBERING_DELEGATION_NOT_FOUND");
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.approval_delegation.revoke",
        detail: { delegationId: input.id, reason: nullableText(input.reason) }
      });
      return mapNumberingApprovalDelegation(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async upsertNumberingApprovalRule(input: UpsertNumberingApprovalRuleInput): Promise<NumberingAdminApprovalRuleRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const existing = input.id
        ? await client.queryOne<ApprovalRuleRow>(SELECT_ASYNC_APPROVAL_RULE_BY_ID_SQL, { approvalRuleId: input.id })
        : null;
      const id = existing?.id ?? input.id?.trim() ?? this.idFactory();
      const ruleVersionId = nullableText(input.ruleVersionId) ?? existing?.rule_version_id ?? DEFAULT_RULE_VERSION_ID;
      const actionCode = input.actionCode.trim();
      const requiresApproval = input.requiresApproval ?? (existing ? existing.requires_approval === 1 : false);
      const approverRole = nullableTextOrExisting(input.approverRole, existing?.approver_role);
      if (!actionCode) throw new Error("APPROVAL_RULE_ACTION_REQUIRED");
      if (!(await client.queryOne<{ id: string }>(SELECT_ASYNC_RULE_VERSION_BY_ID_SQL, { ruleVersionId }))) throw new Error("APPROVAL_RULE_VERSION_NOT_FOUND");
      if (requiresApproval && !approverRole) throw new Error("APPROVAL_RULE_APPROVER_REQUIRED");
      if (approverRole && !(await client.queryOne<NumberingAdminRoleRow>(SELECT_ASYNC_ROLE_BY_CODE_SQL, { roleCode: approverRole }))) {
        throw new Error("APPROVAL_RULE_APPROVER_ROLE_NOT_FOUND");
      }
      const recordStatus = nullableTextOrExisting(input.recordStatus, existing?.record_status);
      const itemKind = nullableTextOrExisting(input.itemKind, existing?.item_kind);
      const riskFlag = nullableTextOrExisting(input.riskFlag, existing?.risk_flag);
      const showsWarning = input.showsWarning ?? (existing ? existing.shows_warning === 1 : true);
      const exportMarker = input.exportMarker ?? (existing ? existing.export_marker === 1 : true);
      const predictedRule = withPredictedApprovalControls({
        actionCode,
        recordStatus,
        itemKind,
        riskFlag,
        requiresApproval,
        approverRole,
        showsWarning,
        exportMarker
      });
      const values = {
        ruleName: buildApprovalRuleSummary(predictedRule),
        actionCode,
        recordStatus,
        itemKind,
        riskFlag,
        requiresApproval,
        approverRole,
        blocksUsage: predictedRule.blocksUsage,
        blocksRelease: predictedRule.blocksRelease,
        showsWarning,
        exportMarker
      };
      const now = this.clock();
      const params = {
        approvalRuleId: id,
        id,
        ruleVersionId,
        ...values,
        requiresApproval: boolToInt(values.requiresApproval),
        blocksUsage: boolToInt(values.blocksUsage),
        blocksRelease: boolToInt(values.blocksRelease),
        showsWarning: boolToInt(values.showsWarning, true),
        exportMarker: boolToInt(values.exportMarker, true),
        createdBy: input.actorId ?? null,
        createdAt: now,
        updatedAt: now
      };
      await client.execute(existing ? UPDATE_ASYNC_APPROVAL_RULE_SQL : INSERT_ASYNC_APPROVAL_RULE_SQL, params);
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.approval_rule.upsert",
        detail: { approvalRuleId: id, actionCode: values.actionCode, ruleVersionId }
      });
      const row = await client.queryOne<ApprovalRuleRow>(SELECT_ASYNC_APPROVAL_RULE_BY_ID_SQL, { approvalRuleId: id });
      if (!row) throw new Error("APPROVAL_RULE_NOT_FOUND");
      return mapAdminApprovalRule(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async applyNumberingRuleTemplate(input: ApplyNumberingRuleTemplateInput): Promise<NumberingAdminMatrixRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const template = await client.queryOne<{ id: string }>(SELECT_ASYNC_ADMIN_RULE_TEMPLATE_BY_CODE_SQL, { templateCode: input.templateCode });
      if (!template) throw new Error("NUMBERING_RULE_TEMPLATE_NOT_FOUND");
      const now = this.clock();
      await this.ensureDefaultApprovalRulesForCurrentRuleVersion(client);
      if (input.templateCode === "standard_control") {
        for (const [approvalRuleId, requiresApproval, approverRole, blocksUsage, blocksRelease, showsWarning, exportMarker] of STANDARD_APPROVAL_RULE_DEFAULTS) {
          const targetApprovalRuleId = approvalRuleIdForRuleVersion(approvalRuleId, DEFAULT_RULE_VERSION_ID);
          await client.execute(UPDATE_ASYNC_STANDARD_APPROVAL_RULE_SQL, {
            approvalRuleId: targetApprovalRuleId,
            requiresApproval,
            approverRole,
            blocksUsage,
            blocksRelease,
            showsWarning,
            exportMarker,
            updatedAt: now
          });
        }
      }
      if (input.templateCode === "rd_efficiency") {
        await client.execute(UPDATE_ASYNC_RD_EFFICIENCY_RULES_RELAXED_SQL, { updatedAt: now });
        await client.execute(UPDATE_ASYNC_RD_EFFICIENCY_RULES_STRICT_SQL, { updatedAt: now });
      }
      if (input.templateCode === "strict_control") {
        await client.execute(UPDATE_ASYNC_STRICT_CONTROL_RULES_SQL, { updatedAt: now, ruleVersionId: DEFAULT_RULE_VERSION_ID });
      }
      await this.insertAudit(client, {
        actorId: input.actorId,
        action: "numbering.approval_rule_template.apply",
        detail: { templateCode: input.templateCode, ruleVersionId: DEFAULT_RULE_VERSION_ID }
      });
    };
    if (this.client.kind === "postgres") await this.client.transaction(run);
    else await run(this.client);
    return this.listNumberingAdminMatrix();
  }

  async evaluateApprovalRules(input: EvaluateApprovalRuleInput): Promise<ApprovalRuleEvaluation> {
    const actionCode = input.actionCode.trim();
    if (!actionCode) throw new Error("APPROVAL_RULE_ACTION_REQUIRED");
    const ruleVersionId = input.ruleVersionId?.trim() || DEFAULT_RULE_VERSION_ID;
    if (ruleVersionId === DEFAULT_RULE_VERSION_ID) await this.ensureDefaultApprovalRulesForCurrentRuleVersion();
    const riskFlags = normalizeRiskFlags(input.riskFlags);
    const rows = await this.client.query<ApprovalRuleRow>(SELECT_ASYNC_ADMIN_APPROVAL_RULES_BY_ACTION_SQL, { ruleVersionId, actionCode });
    const matchedRules = rows.filter((row) => approvalRuleMatches(row, { ...input, actionCode, ruleVersionId }, riskFlags)).map(mapApprovalRule);
    const hardRules = evaluateHardApprovalRulesShared({ ...input, actionCode, ruleVersionId }, riskFlags);
    const requiredRoleSet = new Set(
      matchedRules
        .filter((rule) => rule.requiresApproval)
        .map((rule) => rule.approverRole?.trim())
        .filter((role): role is string => Boolean(role))
    );
    if (requiredRoleSet.size === 0 && hardRules.some((rule) => rule.requiresApproval)) requiredRoleSet.add("pdm_admin");
    const warnings = [
      ...matchedRules.filter((rule) => rule.showsWarning).map((rule) => rule.ruleName),
      ...hardRules.filter((rule) => rule.showsWarning).map((rule) => rule.message)
    ];
    const blockers = [
      ...matchedRules.filter((rule) => rule.blocksUsage || rule.blocksRelease).map((rule) => rule.ruleName),
      ...hardRules.filter((rule) => rule.blocksUsage || rule.blocksRelease).map((rule) => rule.message)
    ];
    return {
      actionCode,
      ruleVersionId,
      requiresApproval: matchedRules.some((rule) => rule.requiresApproval) || hardRules.some((rule) => rule.requiresApproval),
      blocksUsage: matchedRules.some((rule) => rule.blocksUsage) || hardRules.some((rule) => rule.blocksUsage),
      blocksRelease: matchedRules.some((rule) => rule.blocksRelease) || hardRules.some((rule) => rule.blocksRelease),
      showsWarning: matchedRules.some((rule) => rule.showsWarning) || hardRules.some((rule) => rule.showsWarning),
      exportMarker: matchedRules.some((rule) => rule.exportMarker) || hardRules.some((rule) => rule.exportMarker),
      requiredRoles: Array.from(requiredRoleSet),
      warnings,
      blockers,
      matchedRules,
      hardRules
    };
  }

  async evaluateNumberingGate(input: EvaluateNumberingGateInput): Promise<NumberingGateEvaluation> {
    return this.evaluateNumberingGateInClient(this.client, input);
  }

  async analyzeMainDrawingObsolescence(input: MainDrawingImpactInput): Promise<MainDrawingImpactAnalysis> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const drawingRow = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
        drawingNumber: input.drawingNumber,
        companyId
      });
      if (!drawingRow) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${input.drawingNumber}`);
      const drawingNumber = mapDrawingNumber(drawingRow);
      const impactedPartNumbers =
        isManufacturingDrawingPurpose(drawingNumber.purposeCode)
          ? (await client.query<PartNumberRow>(SELECT_ASYNC_PRIMARY_PARTS_BY_DRAWING_SQL, { drawingNumberId: drawingNumber.id })).map(mapPartNumber)
          : [];
      const warnings = isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? [] : ["DRAWING_IS_NOT_PRIMARY_MA"];
      const requiredDocuments = impactedPartNumbers.length
        ? ["2D manufacturing drawing", "3D CAD model", "Released PDF package", "BOM or where-used records", "Related SOP/WI or inspection documents"]
        : [];
      if (input.applyInvalidation && !isManufacturingDrawingPurpose(drawingNumber.purposeCode)) throw new Error("MAIN_DRAWING_INVALIDATION_REQUIRES_MA_DRAWING");
      if (input.applyInvalidation) {
        const now = this.clock();
        await client.execute(UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL, { drawingNumberId: drawingNumber.id, updatedAt: now });
        await new UnifiedDrawingAsyncRepository(client).synchronizeFormalDrawing({
          drawingNumberId: drawingNumber.id,
          companyId
        });
        for (const partNumber of impactedPartNumbers) {
          await client.execute(UPDATE_ASYNC_PART_MAIN_DRAWING_INVALID_SQL, { partNumberId: partNumber.id, updatedAt: now });
          await client.execute(UPDATE_ASYNC_ROOT_MAIN_DRAWING_INVALID_SQL, { rootId: partNumber.partRootId, updatedAt: now });
        }
      }
      await this.insertAudit(client, {
        actorId: input.createdBy,
        action: input.applyInvalidation ? "numbering.main_drawing.invalidate" : "numbering.main_drawing.impact_analysis",
        detail: {
          drawingNumber: drawingNumber.drawingNumber,
          applied: Boolean(input.applyInvalidation),
          impactedPartNumbers: impactedPartNumbers.map((partNumber) => partNumber.partNumber),
          requiredDocuments,
          reason: input.reason?.trim() || null
        }
      });
      return { drawingNumber, applied: Boolean(input.applyInvalidation), impactedPartNumbers, requiredDocuments, warnings };
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async linkPartNumberToDrawing(input: LinkPartNumberToDrawingInput) {
    const run = async (client: AsyncDatabaseClient) => this.linkPartNumberToDrawingInClient(client, input);
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async maintainDrawingPartRelation(input: MaintainDrawingPartRelationInput): Promise<MaintainDrawingPartRelationResult> {
    const run = async (client: AsyncDatabaseClient) => this.maintainDrawingPartRelationInClient(client, input);
    return this.client.transaction(run);
  }

  async listNumberingTasks(input: ListNumberingTasksInput): Promise<NumberingTaskRecord[]> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const context = await this.getNumberingAccessContext(input.user);
    const where: string[] = [
      "company_id = :companyId",
      `NOT EXISTS (
        SELECT 1 FROM drawing_revision_lifecycle_workflows lifecycle
        WHERE lifecycle.origin = 'adopted_active'
          AND lifecycle.legacy_submission_id = numbering_task_items.entity_id
          AND numbering_task_items.entity_type = 'submission'
      )`
    ];
    const params: Record<string, unknown> = { companyId };

    if (input.status && input.status !== "all") {
      where.push("task_status = :status");
      params.status = input.status;
    }

    if (input.user.role !== "Admin") {
      const roleList = createNamedList("role", context.allRoles);
      where.push(`(assigned_to = :userId OR created_by = :userId OR assigned_role IN (${roleList.sql || "NULL"}))`);
      params.userId = input.user.id;
      Object.assign(params, roleList.params);
    }

    params.limit = input.user.role === "Admin" ? 100 : 500;
    const sql = `
      ${SELECT_ASYNC_NUMBERING_TASKS_BASE_SQL}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY
        CASE risk_level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT :limit
    `;
    const rows = await this.client.query<NumberingTaskRow>(sql, params);
    const stored = rows
      .filter((row) => canAccessNumberingRoleItem(context, row.assigned_to, row.created_by, row.assigned_role, row.project_code, actionCodeFromDetail(parseJsonDetail(row.detail_json))))
      .map((row) => mapNumberingTask(row, context));
    const lifecycleTasks = input.status === "handled" || input.status === "cancelled"
      ? []
      : await this.client.query<{
          workflow_id: string;
          package_id: string;
          request_id: string;
          drawing_number: string;
          revision: string;
          requested_at: string;
        }>(
          `SELECT
             workflow.id AS workflow_id,
             workflow.package_id,
             workflow.approval_request_id AS request_id,
             package.drawing_number,
             package.revision,
             request.requested_at
           FROM drawing_revision_lifecycle_workflows workflow
           JOIN drawing_revision_lifecycle_reviewers reviewer
             ON reviewer.workflow_id = workflow.id AND reviewer.reviewer_id = :actorId
           JOIN drawing_revision_packages package ON package.id = workflow.package_id
           JOIN approval_platform_requests request ON request.id = workflow.approval_request_id
           WHERE workflow.company_id = :companyId
             AND workflow.state = 'active'
             AND package.lifecycle_state = 'in_review'
             AND request.request_status = 'pending'
           ORDER BY request.requested_at DESC`,
          { companyId, actorId: input.user.id }
        );
    const projected: NumberingTaskRecord[] = lifecycleTasks.map((task) => ({
      id: `phase1h:${task.workflow_id}`,
      companyId,
      taskType: "drawing_revision_lifecycle_review",
      entityType: "drawing_revision_package",
      entityId: task.package_id,
      title: `${task.drawing_number} / rev ${task.revision}`,
      message: "圖面進版待你審核。",
      riskLevel: "warning",
      taskStatus: "open",
      assignedTo: input.user.id,
      assignedRole: null,
      projectCode: null,
      actionUrl: `/approvals?requestId=${encodeURIComponent(task.request_id)}&drawing=${encodeURIComponent(task.drawing_number)}`,
      detail: {},
      markers: [],
      createdAt: task.requested_at,
      handledAt: null
    }));
    return [...projected, ...stored]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 100);
  }

  async updateNumberingTaskStatus(input: UpdateNumberingTaskStatusInput): Promise<NumberingTaskRecord> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const now = this.clock();
    await this.client.execute(UPDATE_ASYNC_NUMBERING_TASK_STATUS_SQL, {
      taskId: input.taskId,
      companyId,
      status: input.status,
      handledBy: input.status === "handled" ? input.handledBy : null,
      handledAt: input.status === "handled" ? now : null,
      updatedAt: now
    });
    const row = await this.client.queryOne<NumberingTaskRow>(SELECT_ASYNC_NUMBERING_TASK_BY_ID_SQL, { taskId: input.taskId, companyId });
    if (!row) throw new Error(`NUMBERING_TASK_NOT_FOUND: ${input.taskId}`);
    return mapNumberingTask(row);
  }

  async listNumberingNotifications(input: ListNumberingNotificationsInput): Promise<NumberingNotificationRecord[]> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const context = await this.getNumberingAccessContext(input.user);
    const where: string[] = [
      "company_id = :companyId",
      `NOT EXISTS (
        SELECT 1 FROM drawing_revision_lifecycle_workflows lifecycle
        WHERE lifecycle.origin = 'adopted_active'
          AND lifecycle.legacy_submission_id = numbering_notifications.entity_id
          AND numbering_notifications.entity_type = 'submission'
      )`
    ];
    const params: Record<string, unknown> = { companyId };

    if (input.read === "read") where.push("read_at IS NOT NULL");
    if (input.read === "unread") where.push("read_at IS NULL");
    if (input.handled === "handled") where.push("handled_at IS NOT NULL");
    if (input.handled === "unhandled") where.push("handled_at IS NULL");

    if (input.user.role !== "Admin") {
      const roleList = createNamedList("role", context.allRoles);
      where.push(`(recipient_id = :userId OR created_by = :userId OR recipient_role IN (${roleList.sql || "NULL"}))`);
      params.userId = input.user.id;
      Object.assign(params, roleList.params);
    }

    params.limit = input.user.role === "Admin" ? 100 : 500;
    const sql = `
      ${SELECT_ASYNC_NUMBERING_NOTIFICATIONS_BASE_SQL}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT :limit
    `;
    const rows = await this.client.query<NumberingNotificationRow>(sql, params);
    return rows
      .filter((row) =>
        canAccessNumberingRoleItem(
          context,
          row.recipient_id,
          row.created_by,
          row.recipient_role,
          extractProjectCodeFromDetail(row.detail_json),
          actionCodeFromDetail(parseJsonDetail(row.detail_json))
        )
      )
      .slice(0, 100)
      .map((row) => mapNumberingNotification(row, context));
  }

  async updateNumberingNotificationState(input: UpdateNumberingNotificationStateInput): Promise<NumberingNotificationRecord> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const row = await this.client.queryOne<NumberingNotificationRow>(SELECT_ASYNC_NUMBERING_NOTIFICATION_BY_ID_SQL, {
      notificationId: input.notificationId,
      companyId
    });
    if (!row) throw new Error(`NUMBERING_NOTIFICATION_NOT_FOUND: ${input.notificationId}`);
    if (input.user.role !== "Admin") {
      const context = await this.getNumberingAccessContext(input.user);
      const visible = canAccessNumberingRoleItem(
        context,
        row.recipient_id,
        row.created_by,
        row.recipient_role,
        extractProjectCodeFromDetail(row.detail_json),
        actionCodeFromDetail(parseJsonDetail(row.detail_json))
      );
      if (!visible) throw new Error("NUMBERING_NOTIFICATION_FORBIDDEN");
    }
    if (input.markHandled && row.dismissible !== 1) {
      throw new Error("NUMBERING_NOTIFICATION_NOT_DISMISSIBLE");
    }
    const now = this.clock();
    await this.client.execute(UPDATE_ASYNC_NUMBERING_NOTIFICATION_STATE_SQL, {
      notificationId: input.notificationId,
      companyId,
      markRead: input.markRead ? 1 : 0,
      markHandled: input.markHandled ? 1 : 0,
      handledBy: input.user.id,
      now
    });
    const updated = await this.client.queryOne<NumberingNotificationRow>(SELECT_ASYNC_NUMBERING_NOTIFICATION_BY_ID_SQL, {
      notificationId: input.notificationId,
      companyId
    });
    if (!updated) throw new Error(`NUMBERING_NOTIFICATION_NOT_FOUND: ${input.notificationId}`);
    return mapNumberingNotification(updated);
  }

  async createNumberingExportJob(input: CreateNumberingExportJobInput): Promise<NumberingExportJobRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const id = this.idFactory();
      const now = this.clock();
      const result = await this.buildNumberingExportPayload(client, input.exportMode, companyId);
      await client.execute(INSERT_ASYNC_NUMBERING_EXPORT_JOB_SQL, {
        id,
        companyId,
        exportMode: input.exportMode,
        resultJson: JSON.stringify(result),
        generatedBy: input.generatedBy,
        generatedAt: now,
        completedAt: now
      });
      await client.execute(INSERT_ASYNC_NUMBERING_AUDIT_SQL, {
        id: this.idFactory(),
        actorId: input.generatedBy,
        action: "numbering.export_job.create",
        detailJson: JSON.stringify(normalizeAuditDetail({ exportJobId: id, exportMode: input.exportMode })),
        createdAt: now
      });
      const row = await client.queryOne<NumberingExportJobRow>(SELECT_ASYNC_NUMBERING_EXPORT_JOB_BY_ID_SQL, { jobId: id });
      if (!row) throw new Error(`NUMBERING_EXPORT_JOB_NOT_FOUND: ${id}`);
      return mapNumberingExportJob(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async getNumberingExportJob(jobId: string, companyId: string = DEFAULT_COMPANY_ID): Promise<NumberingExportJobRecord | null> {
    const row = await this.client.queryOne<NumberingExportJobRow>(SELECT_ASYNC_NUMBERING_EXPORT_JOB_BY_ID_SQL, { jobId });
    if (row && row.company_id !== companyId) return null;
    return row ? mapNumberingExportJob(row) : null;
  }

  async listNumberingExportJobs(input: ListNumberingExportJobsInput = {}): Promise<NumberingExportJobRecord[]> {
    const limit = clampNumberingListLimit(input.limit);
    const rows = await this.client.query<NumberingExportJobRow>(SELECT_ASYNC_NUMBERING_EXPORT_JOBS_SQL, {
      companyId: input.companyId ?? DEFAULT_COMPANY_ID,
      limit
    });
    return rows.map(mapNumberingExportJob);
  }

  async generateMonthlyNumberingAuditReport(input: GenerateMonthlyNumberingAuditReportInput): Promise<MonthlyAuditReportRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const id = this.idFactory();
      const reportMonth = input.reportMonth?.trim() || this.clock().slice(0, 7);
      const generationMode = input.generationMode ?? "manual";
      const now = this.clock();
      const counts = await this.getMonthlyAuditCounts(client, companyId);
      const query = {
        reportType: "numbering_master",
        reportMonth,
        scheduledDay: 1,
        counts,
        departmentPages: await this.buildMonthlyAuditDepartmentPages(client, counts, companyId),
        projectBuckets: await client.query<MonthlyProjectBucketRow>(SELECT_ASYNC_MONTHLY_AUDIT_PROJECT_BUCKETS_SQL, { companyId })
      };
      await client.execute(INSERT_ASYNC_MONTHLY_AUDIT_REPORT_SQL, {
        id,
        companyId,
        reportMonth,
        generationMode,
        generatedBy: input.generatedBy ?? null,
        queryJson: JSON.stringify(query),
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_NUMBERING_AUDIT_SQL, {
        id: this.idFactory(),
        actorId: input.generatedBy ?? null,
        action: "numbering.monthly_audit_report.generate",
        detailJson: JSON.stringify(normalizeAuditDetail({ monthlyAuditReportId: id, reportMonth, generationMode })),
        createdAt: now
      });
      const row = await client.queryOne<MonthlyAuditReportRow>(SELECT_ASYNC_MONTHLY_AUDIT_REPORT_BY_ID_SQL, { reportId: id });
      if (!row) throw new Error(`MONTHLY_AUDIT_REPORT_NOT_FOUND: ${id}`);
      return mapMonthlyAuditReport(row);
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async getMonthlyNumberingAuditReport(reportId: string, companyId: string = DEFAULT_COMPANY_ID): Promise<MonthlyAuditReportRecord | null> {
    const row = await this.client.queryOne<MonthlyAuditReportRow>(SELECT_ASYNC_MONTHLY_AUDIT_REPORT_BY_ID_SQL, { reportId });
    if (row && row.company_id !== companyId) return null;
    return row ? mapMonthlyAuditReport(row) : null;
  }

  async listMonthlyNumberingAuditReports(input: ListMonthlyNumberingAuditReportsInput = {}): Promise<MonthlyAuditReportRecord[]> {
    const limit = clampNumberingListLimit(input.limit);
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const reportMonth = input.reportMonth?.trim();
    const rows = reportMonth
      ? await this.client.query<MonthlyAuditReportRow>(SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_BY_MONTH_SQL, { companyId, reportMonth, limit })
      : await this.client.query<MonthlyAuditReportRow>(SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_SQL, { companyId, limit });
    return rows.map(mapMonthlyAuditReport);
  }

  async markOverdueDraftNumberingRecords(input: MarkOverdueDraftNumberingInput = {}): Promise<MarkOverdueDraftNumberingResult> {
    const run = async (client: AsyncDatabaseClient) => {
      const olderThanDays = Math.max(1, Math.floor(input.olderThanDays ?? 30));
      const nowSource = input.now ?? this.clock();
      const nowDate = new Date(nowSource);
      if (Number.isNaN(nowDate.getTime())) throw new Error("INVALID_NOW");
      const actedAt = nowDate.toISOString();
      const cutoffAt = new Date(nowDate.getTime() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
      const rows = await client.query<PartRootRow>(SELECT_ASYNC_OVERDUE_DRAFT_ROOTS_SQL, { cutoffAt });
      const updatedRootCodes: string[] = [];

      for (const row of rows) {
        const before = await this.getDraftRootAuditSnapshot(client, row.id);
        await client.execute(UPDATE_ASYNC_OVERDUE_DRAFT_DRAWINGS_SQL, { rootId: row.id, updatedAt: actedAt });
        await client.execute(UPDATE_ASYNC_OVERDUE_DRAFT_PARTS_SQL, { rootId: row.id, updatedAt: actedAt });
        await client.execute(UPDATE_ASYNC_OVERDUE_DRAFT_ROOT_SQL, { rootId: row.id, updatedAt: actedAt });
        const after = await this.getDraftRootAuditSnapshot(client, row.id);
        const detail = { rootCode: row.root_code, cutoffAt };
        const message = `Draft root ${row.root_code} has been open for at least ${olderThanDays} days.`;
        const actionUrl = `/numbering/search?root=${encodeURIComponent(row.root_code)}`;

        await client.execute(INSERT_ASYNC_NUMBERING_TASK_ITEM_SQL, {
          id: this.idFactory(),
          companyId: row.company_id,
          taskType: "draft_admin_confirm",
          entityType: "part_root",
          entityId: row.id,
          title: "Draft numbering requires admin confirmation",
          message,
          riskLevel: "warning",
          assignedTo: null,
          assignedRole: "pdm_admin",
          projectCode: null,
          actionUrl,
          detailJson: JSON.stringify(detail),
          createdBy: input.actorId ?? null,
          createdAt: actedAt,
          updatedAt: actedAt
        });
        await client.execute(INSERT_ASYNC_NUMBERING_NOTIFICATION_SQL, {
          id: this.idFactory(),
          companyId: row.company_id,
          notificationType: "draft_admin_confirm",
          entityType: "part_root",
          entityId: row.id,
          title: "Draft numbering requires admin confirmation",
          message,
          severity: "warning",
          recipientId: null,
          recipientRole: "pdm_admin",
          dismissible: 0,
          actionUrl,
          detailJson: JSON.stringify(detail),
          createdBy: input.actorId ?? null,
          createdAt: actedAt,
          updatedAt: actedAt
        });
        await client.execute(INSERT_ASYNC_NUMBERING_AUDIT_SQL, {
          id: this.idFactory(),
          actorId: input.actorId ?? null,
          action: "numbering.draft.pending_admin_confirm",
          detailJson: JSON.stringify(normalizeAuditDetail({ rootCode: row.root_code, olderThanDays, cutoffAt, before, after })),
          createdAt: actedAt
        });
        updatedRootCodes.push(row.root_code);
      }

      return { cutoffAt, updatedRootCodes, updatedCount: updatedRootCodes.length };
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  async getNumberingRootDetail(rootCode: string, companyId = DEFAULT_COMPANY_ID, options: { includePartMasterDataGaps?: boolean } = {}): Promise<NumberingRootDetailWithPartMasterDataGaps | null> {
    const rootRow = await this.client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode: rootCode.trim(), companyId });
    if (!rootRow) return null;

    const [partRows, drawingRows] = await Promise.all([
      this.client.query<PartNumberMasterDataRow>(SELECT_ASYNC_ROOT_PART_NUMBERS_WITH_MASTER_DATA_SQL, { rootId: rootRow.id }),
      this.client.query<DrawingNumberRow>(SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL, { rootId: rootRow.id })
    ]);
    const root = mapPartRoot(rootRow);
    const partNumbers = partRows.map(mapPartNumber);
    const drawingNumbers = drawingRows.map(mapDrawingNumber);
    const warningEntities = [
      { entityType: "part_root", entityId: root.id },
      ...partNumbers.map((partNumber) => ({ entityType: "part_number", entityId: partNumber.id })),
      ...drawingNumbers.map((drawingNumber) => ({ entityType: "drawing_number", entityId: drawingNumber.id }))
    ];
    const [linkRows, variantRows, warnings, auditTrail] = await Promise.all([
      this.client.query<NumberingLinkRow>(SELECT_ASYNC_NUMBERING_LINKS_FOR_ROOT_SQL, { rootId: root.id }),
      this.client.query<NumberingVariantRow>(SELECT_ASYNC_NUMBERING_VARIANTS_FOR_ROOT_SQL, { rootId: root.id }),
      this.listNumberingWarnings(warningEntities),
      this.listNumberingAuditTrail([
        root.rootCode,
        ...partNumbers.map((partNumber) => partNumber.partNumber),
        ...drawingNumbers.map((drawingNumber) => drawingNumber.drawingNumber)
      ])
    ]);

    return {
      root,
      partNumbers,
      drawingNumbers,
      links: linkRows.map(mapNumberingLink),
      variants: variantRows.map(mapNumberingVariant),
      warnings,
      auditTrail,
      summary: {
        partCount: partNumbers.length,
        drawingCount: drawingNumbers.length,
        primaryManufacturingCount: drawingNumbers.filter((drawingNumber) => isManufacturingDrawingPurpose(drawingNumber.purposeCode) && drawingNumber.isPrimaryManufacturing)
          .length,
        warningCount: warnings.filter((warning) => !warning.acknowledgedAt).length,
        hasMainDrawingInvalid:
          root.recordStatus === "MainDrawingInvalid" || partNumbers.some((partNumber) => partNumber.recordStatus === "MainDrawingInvalid")
      },
      ...(options.includePartMasterDataGaps ? { partMasterDataGaps: buildPartMasterDataGaps(partRows) } : {})
    };
  }

  async searchNumberingRecords(input: NumberingSearchInput = {}): Promise<NumberingSearchResultRecord[]> {
    const normalizedInput = {
      ...input,
      query: input.query?.trim() ?? "",
      limit: input.limit === null ? null : clampNumberingListLimit(input.limit, 50)
    };
    const entityType = normalizedInput.entityType ?? "all";
    const rows: NumberingSearchRow[] = [];

    if (entityType === "all" || entityType === "part_root") {
      rows.push(...(await this.searchRootRecords(normalizedInput)));
    }
    if (entityType === "all" || entityType === "part_number") {
      rows.push(...(await this.searchPartNumberRecords(normalizedInput)));
    }
    if (entityType === "all" || entityType === "drawing_number") {
      rows.push(...(await this.searchDrawingNumberRecords(normalizedInput)));
    }

    return rows
      .map(mapNumberingSearchRow)
      .sort((a, b) => b.warningCount - a.warningCount || a.rootCode.localeCompare(b.rootCode) || a.displayCode.localeCompare(b.displayCode))
      .slice(0, normalizedInput.limit === null ? undefined : normalizedInput.limit);
  }

  async listProductSeriesOptions(companyId: string = DEFAULT_COMPANY_ID): Promise<string[]> {
    const rows = await this.client.query<{ core_name: string }>(
      "SELECT core_name FROM part_roots WHERE company_id = :companyId ORDER BY core_name ASC",
      { companyId }
    );
    return productSeriesOptionsFromCoreNames(rows.map((row) => row.core_name));
  }

  async listSeriesCodeOptions(companyId: string = DEFAULT_COMPANY_ID): Promise<string[]> {
    const rows = await this.client.query<{ series_code: string }>(
      `
        SELECT DISTINCT TRIM(series_code) AS series_code
        FROM (
          SELECT series_code FROM part_numbers WHERE company_id = :companyId
          UNION
          SELECT series_code FROM numbering_draft_parts WHERE company_id = :companyId
        ) series_codes
        WHERE series_code IS NOT NULL AND TRIM(series_code) <> ''
        ORDER BY series_code ASC
      `,
      { companyId }
    );
    return rows.map((row) => row.series_code.trim());
  }

  async listDrawingModuleRecords(input: DrawingModuleListInput = {}): Promise<DrawingModuleListRecord[]> {
    const normalizedInput = {
      ...input,
      query: input.query?.trim() ?? "",
      limit: clampNumberingListLimit(input.limit, 50)
    };
    const { where, params } = buildDrawingModuleWhere(normalizedInput);
    const rows = await this.client.query<DrawingModuleListRow>(
      `
        ${SELECT_ASYNC_DRAWING_MODULE_RECORDS_BASE_SQL}
        ${where}
        ORDER BY d.updated_at DESC, d.drawing_number ASC
        LIMIT :limit
      `,
      params
    );
    const drawingIds = rows.map((row) => row.id);
    const rootIds = uniqueStrings(rows.map((row) => row.part_root_id));
    const [linkedPartNumbersByDrawing, sameRootPartsByRoot, releaseStatusMismatchByDrawing, pendingApprovalByDrawing] = await Promise.all([
      this.listDrawingModuleLinkedPartNumbers(drawingIds),
      this.listDrawingModuleLinkedPartsByRoot(rootIds),
      this.listDrawingModuleReleaseStatusMismatches(drawingIds),
      this.listDrawingModulePendingApprovalSummaries(drawingIds)
    ]);
    return rows.map((row) =>
      mapDrawingModuleListRow(
        row,
        linkedPartNumbersByDrawing.get(row.id) ?? [],
        sameRootPartsByRoot.get(row.part_root_id) ?? [],
        releaseStatusMismatchByDrawing.get(row.id) ?? null,
        pendingApprovalByDrawing.get(row.id) ?? null
      )
    );
  }

  async listDrawingModuleRecordsByIds(
    drawingIds: string[],
    companyId: string = DEFAULT_COMPANY_ID
  ): Promise<DrawingModuleListRecord[]> {
    const ids = uniqueStrings(drawingIds);
    if (ids.length === 0) return [];
    const drawingList = createNamedList("drawingModuleId", ids);
    const rows = await this.client.query<DrawingModuleListRow>(
      `
        ${SELECT_ASYNC_DRAWING_MODULE_RECORDS_BASE_SQL}
        WHERE d.company_id = :companyId
          AND d.id IN (${drawingList.sql})
        ORDER BY d.updated_at DESC, d.drawing_number ASC
      `,
      { companyId, ...drawingList.params }
    );
    const foundDrawingIds = rows.map((row) => row.id);
    const rootIds = uniqueStrings(rows.map((row) => row.part_root_id));
    const [linkedPartNumbersByDrawing, sameRootPartsByRoot, releaseStatusMismatchByDrawing, pendingApprovalByDrawing] = await Promise.all([
      this.listDrawingModuleLinkedPartNumbers(foundDrawingIds),
      this.listDrawingModuleLinkedPartsByRoot(rootIds),
      this.listDrawingModuleReleaseStatusMismatches(foundDrawingIds),
      this.listDrawingModulePendingApprovalSummaries(foundDrawingIds)
    ]);
    return rows.map((row) =>
      mapDrawingModuleListRow(
        row,
        linkedPartNumbersByDrawing.get(row.id) ?? [],
        sameRootPartsByRoot.get(row.part_root_id) ?? [],
        releaseStatusMismatchByDrawing.get(row.id) ?? null,
        pendingApprovalByDrawing.get(row.id) ?? null
      )
    );
  }

  async listPartModuleRecords(input: PartModuleListInput = {}): Promise<PartModuleListRecord[]> {
    const normalizedInput = {
      ...input,
      query: input.query?.trim() ?? "",
      limit: input.limit === null ? null : clampNumberingListLimit(input.limit, 50)
    };
    const { where, params } = buildPartModuleWhere(normalizedInput);
    const rows = await this.client.query<PartModuleListRow>(
      `
        ${SELECT_ASYNC_PART_MODULE_RECORDS_BASE_SQL}
        ${where}
        ORDER BY r.root_code ASC, p.sequence_no ASC, p.part_number ASC
        ${normalizedInput.limit === null ? "" : "LIMIT :limit"}
      `,
      params
    );
    return rows.map(mapPartModuleListRow);
  }

  async listPartModuleRecordsByIds(partNumberIds: string[], companyId: string = DEFAULT_COMPANY_ID): Promise<PartModuleListRecord[]> {
    const orderedIds = [...new Set(partNumberIds.filter(Boolean))];
    if (orderedIds.length === 0) return [];
    const rows: PartModuleListRow[] = [];
    for (let offset = 0; offset < orderedIds.length; offset += 400) {
      const chunk = orderedIds.slice(offset, offset + 400);
      const bindings: Record<string, string> = { companyId };
      const placeholders = chunk.map((id, index) => {
        const key = `partNumberId${offset}_${index}`;
        bindings[key] = id;
        return `:${key}`;
      }).join(", ");
      rows.push(...await this.client.query<PartModuleListRow>(
        `${SELECT_ASYNC_PART_MODULE_RECORDS_BASE_SQL}
         WHERE p.company_id = :companyId
           AND p.id IN (${placeholders})
         ORDER BY r.root_code ASC, p.sequence_no ASC, p.part_number ASC`,
        bindings
      ));
    }
    const byId = new Map(rows.map((row) => [row.id, mapPartModuleListRow(row)]));
    return orderedIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  async getPartModuleDetail(partNumber: string, companyId: string = DEFAULT_COMPANY_ID): Promise<PartModuleDetailRecord | null> {
    return this.getPartModuleDetailWithClient(this.client, partNumber, companyId);
  }

  async upsertPartVariantAttributes(input: UpsertPartVariantAttributesInput): Promise<PartModuleDetailRecord> {
    const run = async (client: AsyncDatabaseClient) => {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const partNumber = input.partNumber.trim();
      const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber, companyId });
      if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);

      const existing = await client.queryOne<PartVariantAttributesRow>(SELECT_ASYNC_PART_VARIANT_ATTRIBUTES_BY_PART_ID_SQL, {
        partNumberId: partRow.id
      });
      const now = this.clock();
      const values = {
        materialCode: normalizeNullableText(input.materialCode),
        materialLabel: normalizeNullableText(input.materialLabel),
        colorCode: normalizeNullableText(input.colorCode),
        colorLabel: normalizeNullableText(input.colorLabel),
        surfaceTreatment: normalizeNullableText(input.surfaceTreatment),
        variantNote: normalizeNullableText(input.variantNote)
      };

      if (existing) {
        await client.execute(UPDATE_ASYNC_PART_VARIANT_ATTRIBUTES_SQL, {
          id: existing.id,
          ...values,
          updatedBy: input.updatedBy ?? null,
          updatedAt: now
        });
      } else {
        await client.execute(INSERT_ASYNC_PART_VARIANT_ATTRIBUTES_SQL, {
          id: this.idFactory(),
          partNumberId: partRow.id,
          ...values,
          updatedBy: input.updatedBy ?? null,
          createdAt: now,
          updatedAt: now
        });
      }

      await client.execute(INSERT_ASYNC_NUMBERING_AUDIT_SQL, {
        id: this.idFactory(),
        actorId: input.updatedBy ?? null,
        action: "numbering.part_variant.upsert",
        detailJson: JSON.stringify(normalizeAuditDetail({ partNumber: partRow.part_number, ...values })),
        createdAt: now
      });

      const part = await this.getPartModuleDetailWithClient(client, partRow.part_number, companyId);
      if (!part) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
      return part;
    };
    if (this.client.kind === "postgres") return this.client.transaction(run);
    return run(this.client);
  }

  private async getPartModuleDetailWithClient(client: AsyncDatabaseClient, partNumber: string, companyId: string): Promise<PartModuleDetailRecord | null> {
    const row = await client.queryOne<PartModuleListRow>(
      `
        ${SELECT_ASYNC_PART_MODULE_RECORDS_BASE_SQL}
        WHERE p.part_number = :partNumber
          AND p.company_id = :companyId
        LIMIT 1
      `,
      { partNumber: partNumber.trim(), companyId }
    );
    if (!row) return null;

    const [linkedDrawingRows, sameDrawingVariantRows] = await Promise.all([
      client.query<NumberingLinkRow>(SELECT_ASYNC_PART_DETAIL_LINKED_DRAWINGS_SQL, { partNumberId: row.id }),
      client.query<NumberingVariantRow>(SELECT_ASYNC_PART_DETAIL_SAME_DRAWING_VARIANTS_SQL, { partNumberId: row.id })
    ]);

    return {
      ...mapPartModuleListRow(row),
      linkedDrawings: linkedDrawingRows.map(mapNumberingLink),
      sameDrawingVariants: sameDrawingVariantRows.map(mapNumberingVariant)
    };
  }

  private async listUserRoleCodes(user: NumberingUserScope): Promise<string[]> {
    const rows = await this.client.query<NumberingAssignedRoleRow>(SELECT_ASYNC_NUMBERING_ASSIGNED_ROLE_CODES_SQL, {
      userId: user.id,
      now: this.clock()
    });
    return uniqueStrings([...numberingRoleCodes(user), ...rows.map((row) => row.role_code)]);
  }

  private async searchRootRecords(input: Required<Pick<NumberingSearchInput, "query" | "limit">> & NumberingSearchInput) {
    const { where, params } = buildNumberingSearchWhere(
      input,
      "(r.root_code LIKE :queryLike ESCAPE '\\' OR r.core_name LIKE :queryLike ESCAPE '\\')",
      "r.record_status",
      "root"
    );
    return this.client.query<NumberingSearchRow>(
      `
        ${SELECT_ASYNC_NUMBERING_SEARCH_ROOTS_BASE_SQL}
        ${where}
        ORDER BY r.updated_at DESC, r.root_code ASC
        ${input.limit === null ? "" : "LIMIT :limit"}
      `,
      params
    );
  }

  private async searchPartNumberRecords(input: Required<Pick<NumberingSearchInput, "query" | "limit">> & NumberingSearchInput) {
    const { where, params } = buildNumberingSearchWhere(
      input,
      "(p.part_number LIKE :queryLike ESCAPE '\\' OR p.part_name LIKE :queryLike ESCAPE '\\' OR r.root_code LIKE :queryLike ESCAPE '\\' OR r.core_name LIKE :queryLike ESCAPE '\\')",
      "p.record_status",
      "part"
    );
    return this.client.query<NumberingSearchRow>(
      `
        ${SELECT_ASYNC_NUMBERING_SEARCH_PARTS_BASE_SQL}
        ${where}
        ORDER BY p.updated_at DESC, p.part_number ASC
        ${input.limit === null ? "" : "LIMIT :limit"}
      `,
      params
    );
  }

  private async searchDrawingNumberRecords(input: Required<Pick<NumberingSearchInput, "query" | "limit">> & NumberingSearchInput) {
    const { where, params } = buildNumberingSearchWhere(
      input,
      "(d.drawing_number LIKE :queryLike ESCAPE '\\' OR d.purpose_description LIKE :queryLike ESCAPE '\\' OR r.root_code LIKE :queryLike ESCAPE '\\' OR r.core_name LIKE :queryLike ESCAPE '\\')",
      "d.record_status",
      "root"
    );
    return this.client.query<NumberingSearchRow>(
      `
        ${SELECT_ASYNC_NUMBERING_SEARCH_DRAWINGS_BASE_SQL}
        ${where}
        ORDER BY d.updated_at DESC, d.drawing_number ASC
        ${input.limit === null ? "" : "LIMIT :limit"}
      `,
      params
    );
  }

  private async listDrawingModuleLinkedPartNumbers(drawingIds: string[]) {
    const linkedPartNumbersByDrawing = new Map<string, string[]>();
    if (drawingIds.length === 0) return linkedPartNumbersByDrawing;
    const drawingList = createNamedList("drawingId", drawingIds);
    const rows = await this.client.query<DrawingModuleLinkedPartNumberRow>(
      `
        ${SELECT_ASYNC_DRAWING_MODULE_LINKED_PART_NUMBERS_SQL}
        WHERE l.drawing_number_id IN (${drawingList.sql})
        ORDER BY l.drawing_number_id ASC, p.part_number ASC
      `,
      drawingList.params
    );
    for (const row of rows) {
      const list = linkedPartNumbersByDrawing.get(row.drawing_number_id) ?? [];
      list.push(row.part_number);
      linkedPartNumbersByDrawing.set(row.drawing_number_id, list);
    }
    return linkedPartNumbersByDrawing;
  }

  private async listDrawingModuleLinkedPartsByRoot(rootIds: string[]) {
    const partsByRoot = new Map<string, DrawingModuleLinkedPartRecord[]>();
    if (rootIds.length === 0) return partsByRoot;
    const rootList = createNamedList("rootId", rootIds);
    const rows = await this.client.query<DrawingModuleLinkedPartRow>(
      `
        ${SELECT_ASYNC_DRAWING_MODULE_LINKED_PARTS_BY_ROOT_SQL}
        WHERE p.part_root_id IN (${rootList.sql})
        ORDER BY p.part_root_id ASC, p.sequence_no ASC, p.part_number ASC
      `,
      rootList.params
    );
    for (const row of rows) {
      const list = partsByRoot.get(row.part_root_id) ?? [];
      list.push(mapDrawingModuleLinkedPartRow(row));
      partsByRoot.set(row.part_root_id, list);
    }
    return partsByRoot;
  }

  private async listDrawingModuleReleaseStatusMismatches(drawingIds: string[]) {
    const mismatchByDrawing = new Map<string, DrawingModuleReleaseStatusMismatch>();
    if (drawingIds.length === 0) return mismatchByDrawing;
    const drawingList = createNamedList("drawingId", drawingIds);
    const rows = await this.client.query<DrawingModuleReleaseStatusMismatchRow>(
      SELECT_ASYNC_DRAWING_MODULE_RELEASE_STATUS_MISMATCHES_SQL.replace("__DRAWING_ID_FILTER__", drawingList.sql),
      drawingList.params
    );
    for (const row of rows) {
      if (mismatchByDrawing.has(row.drawing_number_id)) continue;
      mismatchByDrawing.set(row.drawing_number_id, {
        submissionId: row.submission_id,
        revision: row.revision,
        releasedAt: row.released_at
      });
    }
    return mismatchByDrawing;
  }

  private async listDrawingModulePendingApprovalSummaries(drawingIds: string[]) {
    const pendingByDrawing = new Map<string, DrawingModulePendingApprovalSummary>();
    if (drawingIds.length === 0) return pendingByDrawing;
    const drawingList = createNamedList("drawingId", drawingIds);
    const rows = await this.client.query<DrawingModulePendingApprovalRow>(
      `
        SELECT
          a.drawing_number_id,
          a.id AS assessment_id,
          a.revision,
          a.assessed_at
        FROM drawing_revision_fff_assessments a
        LEFT JOIN submissions review_submission
          ON review_submission.id = a.submission_id
         AND review_submission.company_id = a.company_id
        LEFT JOIN review_confirmation_events rce ON rce.id = (
          SELECT latest.id
          FROM review_confirmation_events latest
          WHERE latest.company_id = a.company_id
            AND latest.review_id = a.id
          ORDER BY latest.occurred_at DESC, latest.id DESC
          LIMIT 1
        )
        WHERE a.drawing_number_id IN (${drawingList.sql})
          AND rce.id IS NULL
          AND (
            a.submission_id IS NULL
            OR (
              review_submission.status IN ('Pending', 'Releasing')
              AND review_submission.superseded_by_submission_id IS NULL
              AND review_submission.resolved_by_submission_id IS NULL
            )
          )
        ORDER BY a.drawing_number_id ASC, a.assessed_at DESC, a.id DESC
      `,
      drawingList.params
    );

    for (const row of rows) {
      const current =
        pendingByDrawing.get(row.drawing_number_id) ??
        ({
          count: 0,
          revisions: [],
          latestRequestedAt: null,
          latestRequestId: null,
          workbenchHref: "/approvals?status=pending&domain=numbering&action=numbering.drawing_revision_impact_review"
        } satisfies DrawingModulePendingApprovalSummary);
      current.count += 1;
      if (!current.revisions.includes(row.revision)) current.revisions.push(row.revision);
      if (!current.latestRequestedAt || row.assessed_at.localeCompare(current.latestRequestedAt) > 0) {
        current.latestRequestedAt = row.assessed_at;
        current.latestRequestId = `legacy:legacy_drawing_revision_review:${row.assessment_id}`;
        current.workbenchHref =
          `/approvals?status=pending&domain=numbering&action=numbering.drawing_revision_impact_review&requestId=${encodeURIComponent(current.latestRequestId)}`;
      }
      pendingByDrawing.set(row.drawing_number_id, current);
    }

    for (const summary of pendingByDrawing.values()) {
      summary.revisions = [...summary.revisions].sort(compareDrawingModuleRevision);
    }

    return pendingByDrawing;
  }

  private async getNumberingAccessContext(user: NumberingUserScope): Promise<NumberingAccessContext> {
    const baseRoles = await this.listUserRoleCodes(user);
    const scopeRows = await this.client.query<NumberingRoleScopeRow>(SELECT_ASYNC_NUMBERING_ALLOWED_ROLE_SCOPES_SQL);
    const scopedRows = scopeRows.filter((row) => baseRoles.includes(row.role_code));
    const projectScopes = new Set(scopedRows.filter((row) => row.scope_kind === "project").map((row) => row.scope_code));
    const actionScopes = new Set(scopedRows.filter((row) => row.scope_kind === "action").map((row) => row.scope_code));
    const delegationRows = await this.client.query<NumberingDelegationRow>(SELECT_ASYNC_NUMBERING_ACTIVE_DELEGATIONS_SQL, {
      userId: user.id,
      now: this.clock()
    });
    const delegations = await Promise.all(
      delegationRows.map(async (row) => ({
        delegatedFrom: row.delegated_from,
        delegatedFromName: row.delegated_from_name,
        delegatedFromRole: row.delegated_from_role,
        roleCodes: await this.listUserRoleCodes({ id: row.delegated_from, role: row.delegated_from_role }),
        projectCode: row.project_code,
        actionCode: row.action_code
      }))
    );
    const allRoles = uniqueStrings([...baseRoles, ...delegations.flatMap((delegation) => delegation.roleCodes)]);
    return { user, baseRoles, allRoles, projectScopes, actionScopes, delegations };
  }

  private async buildNumberingExportPayload(client: AsyncDatabaseClient, exportMode: NumberingExportMode, companyId: string) {
    const roots = await client.query<Record<string, unknown>>(SELECT_ASYNC_NUMBERING_EXPORT_ROOTS_SQL, { companyId });
    const parts = await client.query<Record<string, unknown>>(SELECT_ASYNC_NUMBERING_EXPORT_PARTS_SQL, { companyId });
    const drawings = await client.query<Record<string, unknown>>(SELECT_ASYNC_NUMBERING_EXPORT_DRAWINGS_SQL, { companyId });
    const result: Record<string, unknown> = {
      exportMode,
      companyId,
      generatedAt: this.clock(),
      roots,
      parts,
      drawings
    };
    if (exportMode !== "no_audit") {
      result.auditSummary = await client.query<Record<string, unknown>>(SELECT_ASYNC_NUMBERING_EXPORT_AUDIT_SQL, {
        limit: exportMode === "last_change_summary" ? 50 : 500
      });
    }
    return result;
  }

  private async getMonthlyCount(client: AsyncDatabaseClient, sql: string, params: Record<string, unknown> = {}) {
    const row = await client.queryOne<CountRow>(sql, params);
    return Number(row?.count ?? 0);
  }

  private async getMonthlyAuditCounts(client: AsyncDatabaseClient, companyId: string) {
    return {
      roots: await this.getMonthlyCount(client, SELECT_ASYNC_MONTHLY_AUDIT_COUNT_ROOTS_SQL, { companyId }),
      parts: await this.getMonthlyCount(client, SELECT_ASYNC_MONTHLY_AUDIT_COUNT_PARTS_SQL, { companyId }),
      drawings: await this.getMonthlyCount(client, SELECT_ASYNC_MONTHLY_AUDIT_COUNT_DRAWINGS_SQL, { companyId }),
      openTasks: await this.getMonthlyCount(client, SELECT_ASYNC_MONTHLY_AUDIT_COUNT_OPEN_TASKS_SQL, { companyId })
    };
  }

  async getNumberingRootDetailsByIds(
    rootIds: string[],
    companyId = DEFAULT_COMPANY_ID,
    options: { includeAncillary?: boolean; includePartMasterDataGaps?: boolean } = {}
  ): Promise<NumberingRootDetailWithPartMasterDataGaps[]> {
    const orderedIds = [...new Set(rootIds.filter(Boolean))];
    if (orderedIds.length === 0) return [];
    const chunks = Array.from({ length: Math.ceil(orderedIds.length / 400) }, (_, index) => orderedIds.slice(index * 400, (index + 1) * 400));
    const queryChunks = async <T>(sql: (placeholders: string) => string) => {
      const batches = await Promise.all(chunks.map((chunk, chunkIndex) => {
        const bindings: Record<string, string> = { companyId };
        const placeholders = chunk.map((rootId, itemIndex) => {
          const key = `rootId${chunkIndex}_${itemIndex}`;
          bindings[key] = rootId;
          return `:${key}`;
        }).join(", ");
        return this.client.query<T>(sql(placeholders), bindings);
      }));
      return batches.flat();
    };
    const includeAncillary = options.includeAncillary !== false;
    const [rootRows, partRows, drawingRows, linkRows, variantRows] = await Promise.all([
      queryChunks<PartRootRow>((ids) => `SELECT * FROM part_roots WHERE company_id = :companyId AND id IN (${ids})`),
      queryChunks<PartNumberMasterDataRow>((ids) => options.includePartMasterDataGaps
        ? `SELECT p.*, va.material_code, va.material_label, va.surface_treatment
           FROM part_numbers p
           LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
           WHERE p.company_id = :companyId AND p.part_root_id IN (${ids})
           ORDER BY p.part_root_id, p.sequence_no, p.part_number`
        : `SELECT * FROM part_numbers WHERE company_id = :companyId AND part_root_id IN (${ids}) ORDER BY part_root_id, sequence_no, part_number`),
      queryChunks<DrawingNumberRow>((ids) => `SELECT * FROM drawing_numbers WHERE company_id = :companyId AND part_root_id IN (${ids}) ORDER BY part_root_id, purpose_code, sequence_no, drawing_number`),
      queryChunks<NumberingLinkRow>((ids) => `SELECT l.id, l.drawing_number_id, l.part_number_id, d.drawing_number, p.part_number, l.link_type, l.created_at
        FROM drawing_part_links l
        JOIN drawing_numbers d ON d.id = l.drawing_number_id
        JOIN part_numbers p ON p.id = l.part_number_id
        WHERE d.company_id = :companyId AND p.company_id = :companyId
          AND (d.part_root_id IN (${ids}) OR p.part_root_id IN (${ids}))
        ORDER BY d.drawing_number, p.part_number, l.link_type`),
      includeAncillary ? queryChunks<NumberingVariantRow>((ids) => `SELECT v.id, v.drawing_number_id, v.part_number_id, d.drawing_number, p.part_number, v.field_name, v.field_value, v.created_at
        FROM same_drawing_variants v
        JOIN drawing_numbers d ON d.id = v.drawing_number_id
        JOIN part_numbers p ON p.id = v.part_number_id
        WHERE d.company_id = :companyId AND p.company_id = :companyId
          AND (d.part_root_id IN (${ids}) OR p.part_root_id IN (${ids}))
        ORDER BY d.drawing_number, p.part_number, v.field_name`) : Promise.resolve([] as NumberingVariantRow[])
    ]);
    const entityIds = [...new Set([
      ...rootRows.map((row) => row.id),
      ...partRows.map((row) => row.id),
      ...drawingRows.map((row) => row.id)
    ])];
    const warningRows: NumberingWarningRow[] = [];
    for (let offset = 0; includeAncillary && offset < entityIds.length; offset += 400) {
      const chunk = entityIds.slice(offset, offset + 400);
      const bindings: Record<string, string> = {};
      const placeholders = chunk.map((entityId, index) => {
        const key = `warningEntityId${offset}_${index}`;
        bindings[key] = entityId;
        return `:${key}`;
      }).join(", ");
      warningRows.push(...await this.client.query<NumberingWarningRow>(
        `${SELECT_ASYNC_NUMBERING_WARNINGS_BASE_SQL}
         WHERE entity_id IN (${placeholders})
         ORDER BY acknowledged_at IS NULL DESC, created_at DESC`,
        bindings
      ));
    }
    const rootsById = new Map(rootRows.map((row) => [row.id, mapPartRoot(row)]));
    const partsByRoot = new Map<string, PartNumberRecord[]>();
    for (const row of partRows) partsByRoot.set(row.part_root_id, [...(partsByRoot.get(row.part_root_id) ?? []), mapPartNumber(row)]);
    const drawingsByRoot = new Map<string, DrawingNumberRecord[]>();
    for (const row of drawingRows) drawingsByRoot.set(row.part_root_id, [...(drawingsByRoot.get(row.part_root_id) ?? []), mapDrawingNumber(row)]);
    const rootIdByPartId = new Map(partRows.map((row) => [row.id, row.part_root_id]));
    const rootIdByDrawingId = new Map(drawingRows.map((row) => [row.id, row.part_root_id]));
    const linksByRoot = new Map<string, NumberingLinkRecord[]>();
    for (const row of linkRows) {
      const rootId = rootIdByDrawingId.get(row.drawing_number_id) ?? rootIdByPartId.get(row.part_number_id);
      if (rootId) linksByRoot.set(rootId, [...(linksByRoot.get(rootId) ?? []), mapNumberingLink(row)]);
    }
    const variantsByRoot = new Map<string, NumberingVariantRecord[]>();
    for (const row of variantRows) {
      const rootId = rootIdByDrawingId.get(row.drawing_number_id) ?? rootIdByPartId.get(row.part_number_id);
      if (rootId) variantsByRoot.set(rootId, [...(variantsByRoot.get(rootId) ?? []), mapNumberingVariant(row)]);
    }
    const warningsByEntityId = new Map<string, NumberingWarningRecord[]>();
    for (const row of warningRows) {
      if (!row.entity_id) continue;
      warningsByEntityId.set(row.entity_id, [...(warningsByEntityId.get(row.entity_id) ?? []), mapNumberingWarning(row)]);
    }
    return orderedIds.flatMap((rootId) => {
      const root = rootsById.get(rootId);
      if (!root) return [];
      const partNumbers = partsByRoot.get(rootId) ?? [];
      const drawingNumbers = drawingsByRoot.get(rootId) ?? [];
      const entityIdsForRoot = [rootId, ...partNumbers.map((part) => part.id), ...drawingNumbers.map((drawing) => drawing.id)];
      const warnings = entityIdsForRoot.flatMap((entityId) => warningsByEntityId.get(entityId) ?? []);
      return [{
        root,
        partNumbers,
        drawingNumbers,
        links: linksByRoot.get(rootId) ?? [],
        variants: variantsByRoot.get(rootId) ?? [],
        warnings,
        auditTrail: [],
        summary: {
          partCount: partNumbers.length,
          drawingCount: drawingNumbers.length,
          primaryManufacturingCount: drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode) && drawing.isPrimaryManufacturing).length,
          warningCount: warnings.filter((warning) => !warning.acknowledgedAt).length,
          hasMainDrawingInvalid: root.recordStatus === "MainDrawingInvalid" || partNumbers.some((part) => part.recordStatus === "MainDrawingInvalid")
        },
        ...(options.includePartMasterDataGaps ? { partMasterDataGaps: buildPartMasterDataGaps(partRows.filter((part) => part.part_root_id === rootId)) } : {})
      } satisfies NumberingRootDetailWithPartMasterDataGaps];
    });
  }

  async getNumberingRootDetailsByCodes(
    rootCodes: string[],
    companyId = DEFAULT_COMPANY_ID,
    options: { includeAncillary?: boolean; includePartMasterDataGaps?: boolean } = {}
  ): Promise<NumberingRootDetailWithPartMasterDataGaps[]> {
    const orderedCodes = [...new Set(rootCodes.map((code) => code.trim()).filter(Boolean))];
    if (orderedCodes.length === 0) return [];
    const bindings: Record<string, string> = { companyId };
    const placeholders = orderedCodes.map((code, index) => {
      const key = `rootCode${index}`;
      bindings[key] = code;
      return `:${key}`;
    }).join(", ");
    const rows = await this.client.query<{ id: string; root_code: string }>(
      `SELECT id, root_code FROM part_roots WHERE company_id = :companyId AND root_code IN (${placeholders})`,
      bindings
    );
    const idByCode = new Map(rows.map((row) => [row.root_code, row.id]));
    const details = await this.getNumberingRootDetailsByIds(orderedCodes.flatMap((code) => idByCode.get(code) ?? []), companyId, options);
    const detailByCode = new Map(details.map((detail) => [detail.root.rootCode, detail]));
    return orderedCodes.flatMap((code) => detailByCode.get(code) ?? []);
  }

  private async buildMonthlyAuditDepartmentPages(client: AsyncDatabaseClient, counts: Record<string, number>, companyId: string) {
    const definitions = [
      { key: "company", label: "Company", roles: [] },
      { key: "rd", label: "RD", roles: ["rd", "rd_manager"] },
      { key: "pdm_admin", label: "PDM Admin", roles: ["pdm_admin", "system_admin"] },
      { key: "qa_document", label: "QA / Document", roles: ["qa", "document_admin"] }
    ];
    const pages = [];
    for (const definition of definitions) {
      const scoped = definition.roles.length > 0;
      pages.push({
        key: definition.key,
        label: definition.label,
        roles: definition.roles,
        counts: scoped
          ? {
              openTasks: await this.getMonthlyCount(client, SELECT_ASYNC_MONTHLY_AUDIT_OPEN_TASKS_FOR_TWO_ROLES_SQL, {
                companyId,
                role0: definition.roles[0],
                role1: definition.roles[1]
              }),
              approvalRules: await this.getMonthlyCount(client, SELECT_ASYNC_MONTHLY_AUDIT_APPROVAL_RULES_FOR_TWO_ROLES_SQL, {
                role0: definition.roles[0],
                role1: definition.roles[1]
              })
            }
          : counts
      });
    }
    return pages;
  }

  private async getDraftRootAuditSnapshot(client: AsyncDatabaseClient, rootId: string): Promise<DraftRootAuditSnapshot | null> {
    const root = await client.queryOne<PartRootRow>("SELECT * FROM part_roots WHERE id = :rootId", { rootId });
    if (!root) return null;
    const [parts, drawings] = await Promise.all([
      client.query<PartNumberRow>(SELECT_ASYNC_DRAFT_ROOT_PARTS_SQL, { rootId }),
      client.query<DrawingNumberRow>(SELECT_ASYNC_DRAFT_ROOT_DRAWINGS_SQL, { rootId })
    ]);
    return { root, parts, drawings };
  }

  private async listNumberingWarnings(entities: Array<{ entityType: string; entityId: string }>): Promise<NumberingWarningRecord[]> {
    if (entities.length === 0) return [];
    const params: Record<string, string> = {};
    const conditions = entities.map((entity, index) => {
      params[`entityType${index}`] = entity.entityType;
      params[`entityId${index}`] = entity.entityId;
      return `(entity_type = :entityType${index} AND entity_id = :entityId${index})`;
    });
    const rows = await this.client.query<NumberingWarningRow>(
      `
        ${SELECT_ASYNC_NUMBERING_WARNINGS_BASE_SQL}
        WHERE ${conditions.join(" OR ")}
        ORDER BY acknowledged_at IS NULL DESC, created_at DESC
        LIMIT 100
      `,
      params
    );
    return rows.map(mapNumberingWarning);
  }

  private async listNumberingAuditTrail(tokens: string[]): Promise<NumberingAuditTrailRecord[]> {
    const meaningfulTokens = tokens.filter(Boolean);
    if (meaningfulTokens.length === 0) return [];
    const rows = await this.client.query<NumberingAuditLogRow>(SELECT_ASYNC_NUMBERING_AUDIT_TRAIL_SQL);
    return rows
      .map(mapNumberingAudit)
      .filter((row) => {
        const detailText = JSON.stringify(row.detail);
        return meaningfulTokens.some((token) => detailText.includes(token));
      })
      .slice(0, 50);
  }

  private async checkNumberingDuplicatesInClient(client: AsyncDatabaseClient, input: DuplicateCheckInput): Promise<DuplicateCheckResult> {
    const matches = new Map<string, DuplicateCheckMatch>();
    const addMatch = (match: DuplicateCheckMatch) => {
      const key = `${match.entityType}:${match.entityId}:${match.reason}`;
      const existing = matches.get(key);
      if (!existing || existing.score < match.score) matches.set(key, match);
    };

    const rootCode = input.rootCode?.trim();
    const partNumber = input.partNumber?.trim();
    const drawingNumber = input.drawingNumber?.trim();
    const coreName = input.coreName?.trim();
    const partName = input.partName?.trim();

    if (rootCode) {
      const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
      const row = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId });
      if (row) {
        addMatch({
          entityType: "part_root",
          entityId: row.id,
          displayCode: row.root_code,
          displayName: row.core_name,
          recordStatus: row.record_status,
          score: 100,
          reason: "exact_code",
          severity: "blocker"
        });
      }
    }

    if (partNumber) {
      const row = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber, companyId: input.companyId ?? DEFAULT_COMPANY_ID });
      if (row) {
        addMatch({
          entityType: "part_number",
          entityId: row.id,
          displayCode: row.part_number,
          displayName: row.part_name,
          recordStatus: row.record_status,
          score: 100,
          reason: "exact_code",
          severity: "blocker"
        });
      }
    }

    if (drawingNumber) {
      const row = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { drawingNumber, companyId: input.companyId ?? DEFAULT_COMPANY_ID });
      if (row) {
        addMatch({
          entityType: "drawing_number",
          entityId: row.id,
          displayCode: row.drawing_number,
          displayName: row.purpose_description,
          recordStatus: row.record_status,
          score: 100,
          reason: "exact_code",
          severity: "blocker"
        });
      }
    }

    if (coreName) {
      const rows = await client.query<PartRootRow>(SELECT_ASYNC_PART_ROOTS_FOR_DUPLICATE_SIMILARITY_SQL, {
        companyId: input.companyId ?? DEFAULT_COMPANY_ID,
        limit: 200
      });
      for (const row of rows) {
        const score = similarityScore(row.core_name, coreName);
        if (score >= 70) {
          addMatch({
            entityType: "part_root",
            entityId: row.id,
            displayCode: row.root_code,
            displayName: row.core_name,
            recordStatus: row.record_status,
            score,
            reason: score === 100 ? "exact_name" : "high_similarity",
            severity: "warning"
          });
        }
      }
    }

    if (partName) {
      const rows = await client.query<PartNumberRow>(SELECT_ASYNC_PART_NUMBERS_FOR_DUPLICATE_SIMILARITY_SQL, {
        companyId: input.companyId ?? DEFAULT_COMPANY_ID,
        limit: 200
      });
      for (const row of rows) {
        const score = similarityScore(row.part_name, partName);
        if (score >= 70) {
          addMatch({
            entityType: "part_number",
            entityId: row.id,
            displayCode: row.part_number,
            displayName: row.part_name,
            recordStatus: row.record_status,
            score,
            reason: score === 100 ? "exact_name" : "high_similarity",
            severity: "warning"
          });
        }
      }
    }

    const sortedMatches = Array.from(matches.values()).sort((a, b) => b.score - a.score || a.displayCode.localeCompare(b.displayCode));
    const blocked = sortedMatches.some((match) => match.severity === "blocker");
    const warningEventId =
      sortedMatches.length > 0
        ? await this.insertWarningEvent(client, {
            warningCode: blocked ? "DUPLICATE_NUMBERING_BLOCKER" : "HIGH_SIMILARITY_NUMBERING",
            severity: blocked ? "blocker" : "warning",
            entityType: sortedMatches[0].entityType,
            entityId: sortedMatches[0].entityId,
            title: blocked ? "Duplicate numbering code" : "High-similarity numbering candidate",
            message: blocked
              ? "An exact numbering code already exists and cannot be reused."
              : "Similar numbering records were found. This is a warning only and does not block RD.",
            detail: { query: input, matches: sortedMatches },
            createdBy: input.createdBy
          })
        : null;

    await client.execute(INSERT_ASYNC_DUPLICATE_CHECK_EVENT_SQL, {
      id: this.idFactory(),
      entityType: duplicateEntityType(input),
      queryJson: JSON.stringify(input),
      resultJson: JSON.stringify({ matches: sortedMatches, warningEventId }),
      blocked: blocked ? 1 : 0,
      createdBy: input.createdBy ?? null,
      createdAt: this.clock()
    });

    await client.execute(INSERT_ASYNC_NUMBERING_AUDIT_SQL, {
      id: this.idFactory(),
      actorId: input.createdBy ?? null,
      action: "numbering.duplicate_check",
      detailJson: JSON.stringify(
        normalizeAuditDetail({
          query: input,
          blocked,
          warningEventId,
          matchCount: sortedMatches.length
        })
      ),
      createdAt: this.clock()
    });

    return {
      blocked,
      warningsOnly: sortedMatches.length > 0 && !blocked,
      matches: sortedMatches,
      warningEventId
    };
  }

  private async insertNumberingApprovalRequest(client: AsyncDatabaseClient, input: RequestNumberingApprovalInput): Promise<NumberingApprovalRecord> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const id = this.idFactory();
    const now = this.clock();
    const payload = input.payload ?? {};
    const recipientRole = approvalRecipientRole(input.actionCode);
    const projectCode = typeof payload.projectCode === "string" ? payload.projectCode : typeof payload.project_code === "string" ? payload.project_code : null;
    const approvalDetail = {
      approvalRequestId: id,
      actionCode: input.actionCode,
      projectCode,
      payload
    };

    await client.execute(INSERT_ASYNC_APPROVAL_REQUEST_SQL, {
      id,
      companyId,
      actionCode: input.actionCode,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason.trim(),
      payloadJson: JSON.stringify(payload),
      requestedBy: input.requestedBy,
      requestedAt: now,
      createdAt: now,
      updatedAt: now
    });

    await this.insertWarningEvent(client, {
      warningCode: "PENDING_APPROVAL_NOT_USABLE",
      severity: "warning",
      entityType: input.entityType,
      entityId: input.entityId,
      title: "Pending approval",
      message: "This numbering action is pending approval and is not usable until approved.",
      detail: approvalDetail,
      createdBy: input.requestedBy
    });
    await client.execute(INSERT_ASYNC_NUMBERING_TASK_ITEM_SQL, {
      id: this.idFactory(),
      companyId,
      taskType: "approval_request",
      entityType: input.entityType,
      entityId: input.entityId,
      title: "Numbering approval required",
      message: `Action ${input.actionCode} is waiting for review.`,
      riskLevel: "warning",
      assignedTo: null,
      assignedRole: recipientRole,
      projectCode,
      actionUrl: "/numbering/approvals",
      detailJson: JSON.stringify(approvalDetail),
      createdBy: input.requestedBy,
      createdAt: now,
      updatedAt: now
    });
    await client.execute(INSERT_ASYNC_NUMBERING_NOTIFICATION_SQL, {
      id: this.idFactory(),
      companyId,
      notificationType: "approval_request_pending",
      entityType: input.entityType,
      entityId: input.entityId,
      title: "Numbering approval required",
      message: `Action ${input.actionCode} is waiting for review.`,
      severity: "warning",
      recipientId: null,
      recipientRole,
      dismissible: 0,
      actionUrl: "/numbering/approvals",
      detailJson: JSON.stringify(approvalDetail),
      createdBy: input.requestedBy,
      createdAt: now,
      updatedAt: now
    });
    await this.insertAudit(client, {
      actorId: input.requestedBy,
      action: "numbering.approval.request",
      detail: {
        approvalRequestId: id,
        actionCode: input.actionCode,
        entityType: input.entityType,
        entityId: input.entityId
      }
    });

    const row = await client.queryOne<ApprovalRequestRow>(SELECT_ASYNC_APPROVAL_REQUEST_BY_ID_SQL, { approvalRequestId: id });
    if (!row) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${id}`);
    return mapApprovalRequest(row);
  }

  private async createNumberingApprovalBatchInClient(
    client: AsyncDatabaseClient,
    input: CreateNumberingApprovalBatchInput
  ): Promise<NumberingApprovalBatchRecord> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const approvalRequestIds = Array.from(new Set(input.approvalRequestIds.map((id) => id.trim()).filter(Boolean)));
    if (approvalRequestIds.length === 0) throw new Error("APPROVAL_BATCH_REQUIRES_REQUESTS");

    const requests: ApprovalRequestRow[] = [];
    for (const id of approvalRequestIds) {
      const row = await client.queryOne<ApprovalRequestRow>(SELECT_ASYNC_APPROVAL_REQUEST_BY_ID_SQL, { approvalRequestId: id });
      if (!row) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${id}`);
      if (row.company_id !== companyId) throw new Error("APPROVAL_REQUEST_COMPANY_MISMATCH");
      if (row.request_status !== "pending") throw new Error(`APPROVAL_BATCH_REQUIRES_PENDING_REQUEST: ${id}`);
      requests.push(row);
    }

    const actionCodes = new Set(requests.map((request) => request.action_code));
    if (input.actionCode?.trim() && !actionCodes.has(input.actionCode.trim() as NumberingApprovalActionCode)) {
      throw new Error("APPROVAL_BATCH_ACTION_MISMATCH");
    }
    if (!input.actionCode?.trim() && actionCodes.size > 1) throw new Error("APPROVAL_BATCH_REQUIRES_SAME_ACTION");

    const id = this.idFactory();
    const now = this.clock();
    const batchCode = `NB-${Date.now().toString(36).toUpperCase()}-${approvalRequestIds.length}`;
    const actionCode = input.actionCode?.trim() || requests[0]?.action_code || null;
    const projectCode = input.projectCode?.trim() || null;
    await client.execute(INSERT_ASYNC_APPROVAL_BATCH_SQL, {
      id,
      companyId,
      batchCode,
      projectCode,
      actionCode,
      submittedBy: input.submittedBy,
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    });

    for (const approvalRequestId of approvalRequestIds) {
      await client.execute(INSERT_ASYNC_APPROVAL_BATCH_ITEM_SQL, {
        id: this.idFactory(),
        batchId: id,
        approvalRequestId,
        itemStatus: "pending",
        resubmittedFromItemId: null,
        createdAt: now,
        updatedAt: now
      });
    }

    await this.insertAudit(client, {
      actorId: input.submittedBy,
      action: "numbering.approval_batch.create",
      detail: { batchId: id, batchCode, actionCode, approvalRequestIds, projectCode }
    });

    const row = await client.queryOne<ApprovalBatchRow>(SELECT_ASYNC_APPROVAL_BATCH_BY_ID_SQL, { batchId: id });
    if (!row) throw new Error(`APPROVAL_BATCH_NOT_FOUND: ${id}`);
    return this.mapApprovalBatchInClient(client, row);
  }

  private async decideNumberingApprovalInClient(client: AsyncDatabaseClient, input: DecideNumberingApprovalInput): Promise<NumberingApprovalRecord> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const row = await client.queryOne<ApprovalRequestRow>(SELECT_ASYNC_APPROVAL_REQUEST_BY_ID_SQL, {
      approvalRequestId: input.approvalRequestId
    });
    if (!row) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.approvalRequestId}`);
    if (row.company_id !== companyId) throw new Error("APPROVAL_REQUEST_COMPANY_MISMATCH");
    if (row.request_status !== "pending" && row.request_status !== "needs_info") {
      throw new Error(`APPROVAL_REQUEST_ALREADY_RESOLVED: ${row.request_status}`);
    }

    const now = this.clock();
    await client.execute(INSERT_ASYNC_APPROVAL_DECISION_SQL, {
      id: this.idFactory(),
      approvalRequestId: input.approvalRequestId,
      approverRole: input.approverRole,
      approverId: input.approverId,
      decision: input.decision,
      comment: input.comment?.trim() || null,
      decidedAt: now
    });
    await client.execute(UPDATE_ASYNC_APPROVAL_REQUEST_DECISION_SQL, {
      approvalRequestId: row.id,
      requestStatus: input.decision,
      resolvedAt: input.decision === "needs_info" ? null : now,
      resolvedBy: input.decision === "needs_info" ? null : input.approverId,
      updatedAt: now
    });

    const request = mapApprovalRequest({ ...row, request_status: input.decision });
    if (input.decision === "approved") await this.applyApprovedNumberingRequest(client, request, input.approverId, companyId);

    await this.insertAudit(client, {
      actorId: input.approverId,
      action: "numbering.approval.decision",
      detail: {
        approvalRequestId: row.id,
        actionCode: row.action_code,
        approverRole: input.approverRole,
        decision: input.decision,
        comment: input.comment?.trim() || null
      }
    });

    const updated = await client.queryOne<ApprovalRequestRow>(SELECT_ASYNC_APPROVAL_REQUEST_BY_ID_SQL, { approvalRequestId: row.id });
    if (!updated) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${row.id}`);
    return mapApprovalRequest(updated);
  }

  private async refreshApprovalBatchStatus(client: AsyncDatabaseClient, batchId: string): Promise<NumberingApprovalBatchStatus> {
    const rows = await client.query<{ item_status: NumberingApprovalBatchItemStatus }>(
      "SELECT item_status FROM approval_batch_items WHERE batch_id = :batchId",
      { batchId }
    );
    const activeRows = rows.filter((row) => row.item_status !== "resubmitted" && row.item_status !== "cancelled");
    const status: NumberingApprovalBatchStatus =
      activeRows.length === 0
        ? "cancelled"
        : activeRows.every((row) => row.item_status === "approved")
          ? "approved"
          : activeRows.some((row) => row.item_status === "approved")
            ? "partially_approved"
            : activeRows.every((row) => row.item_status === "rejected")
              ? "rejected"
              : activeRows.some((row) => row.item_status === "needs_info")
                ? "needs_info"
                : "pending";
    await client.execute(UPDATE_ASYNC_APPROVAL_BATCH_STATUS_SQL, { batchId, batchStatus: status, updatedAt: this.clock() });
    return status;
  }

  private async mapApprovalBatchInClient(client: AsyncDatabaseClient, row: ApprovalBatchRow): Promise<NumberingApprovalBatchRecord> {
    const itemRows = await client.query<ApprovalBatchItemRow>(SELECT_ASYNC_APPROVAL_BATCH_ITEMS_BY_BATCH_SQL, { batchId: row.id });
    return {
      id: row.id,
      batchCode: row.batch_code,
      projectCode: row.project_code,
      actionCode: row.action_code,
      batchStatus: row.batch_status,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at,
      items: itemRows.map(mapApprovalBatchItem)
    };
  }

  private async preloadApprovalReviewBatches(client: AsyncDatabaseClient, rows: ApprovalBatchRow[]): Promise<ApprovalReviewBatchPreload> {
    const itemRowsByBatchId = new Map<string, ApprovalBatchItemRow[]>();
    const requestRowsById = new Map<string, ApprovalRequestRow>();
    if (rows.length === 0) return { itemRowsByBatchId, requestRowsById };

    const batchIds = rows.map((row) => row.id);
    const batchList = createNamedList("reviewBatchId", batchIds);
    const itemRows = await client.query<ApprovalBatchItemRow>(
      `
      SELECT id, batch_id, approval_request_id, item_status, resubmitted_from_item_id
      FROM approval_batch_items
      WHERE batch_id IN (${batchList.sql})
      ORDER BY batch_id ASC, created_at ASC, id ASC
    `,
      batchList.params
    );
    for (const itemRow of itemRows) {
      const batchItems = itemRowsByBatchId.get(itemRow.batch_id) ?? [];
      batchItems.push(itemRow);
      itemRowsByBatchId.set(itemRow.batch_id, batchItems);
    }

    const requestIds = [...new Set(itemRows.map((itemRow) => itemRow.approval_request_id))];
    if (requestIds.length === 0) return { itemRowsByBatchId, requestRowsById };
    const requestList = createNamedList("reviewRequestId", requestIds);
    const requestRows = await client.query<ApprovalRequestRow>(
      `
      SELECT id, company_id, action_code, entity_type, entity_id, request_status,
             reason, payload_json, requested_by, requested_at
      FROM approval_requests
      WHERE id IN (${requestList.sql})
    `,
      requestList.params
    );
    for (const requestRow of requestRows) requestRowsById.set(requestRow.id, requestRow);
    return { itemRowsByBatchId, requestRowsById };
  }

  private async mapApprovalReviewBatchInClient(
    client: AsyncDatabaseClient,
    row: ApprovalBatchRow,
    preload?: ApprovalReviewBatchPreload
  ): Promise<NumberingApprovalReviewBatchRecord> {
    const [itemRows, submittedBy] = await Promise.all([
      preload?.itemRowsByBatchId.get(row.id) ?? client.query<ApprovalBatchItemRow>(SELECT_ASYNC_APPROVAL_BATCH_ITEMS_BY_BATCH_SQL, { batchId: row.id }),
      this.approvalUserSummary(client, row.submitted_by)
    ]);
    const counts = emptyApprovalBatchItemCounts();
    const items: NumberingApprovalReviewBatchRecord["items"] = [];
    for (const itemRow of itemRows) {
      counts[itemRow.item_status] += 1;
      const requestRow =
        preload?.requestRowsById.get(itemRow.approval_request_id) ??
        (await client.queryOne<ApprovalRequestRow>(SELECT_ASYNC_APPROVAL_REQUEST_BY_ID_SQL, {
          approvalRequestId: itemRow.approval_request_id
        }));
      if (!requestRow) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${itemRow.approval_request_id}`);
      items.push({
        ...mapApprovalBatchItem(itemRow),
        request: await this.mapApprovalReviewRequestInClient(client, requestRow)
      });
    }

    return {
      id: row.id,
      batchCode: row.batch_code,
      projectCode: row.project_code,
      actionCode: row.action_code,
      batchStatus: row.batch_status,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at,
      submittedByName: submittedBy.display_name,
      submittedByRole: submittedBy.role,
      markers: [],
      itemCounts: counts,
      items
    };
  }

  private async mapApprovalReviewRequestInClient(client: AsyncDatabaseClient, row: ApprovalRequestRow): Promise<NumberingApprovalReviewRequestRecord> {
    const requestedBy = await this.approvalUserSummary(client, row.requested_by);
    const payload = parseJsonDetail(row.payload_json);
    const proxyReason = proxySubmissionReason(payload);
    const entitySummary = await this.approvalEntitySummary(client, row);
    return {
      ...mapApprovalRequest(row),
      requestedByName: requestedBy.display_name,
      requestedByRole: requestedBy.role,
      isProxySubmission: Boolean(proxyReason),
      proxyReason,
      markers: buildNumberingActionMarkers({ actionCode: row.action_code, payload, proxyReason }),
      entitySummary,
      decisions: await this.approvalRequestDecisions(client, row.id)
    };
  }

  private async approvalRequestDecisions(client: AsyncDatabaseClient, approvalRequestId: string): Promise<NumberingApprovalDecisionRecord[]> {
    const rows = await client.query<ApprovalDecisionRow>(SELECT_ASYNC_APPROVAL_DECISIONS_BY_REQUEST_SQL, { approvalRequestId });
    const decisions: NumberingApprovalDecisionRecord[] = [];
    for (const row of rows) decisions.push(await this.mapApprovalDecision(client, row));
    return decisions;
  }

  private async mapApprovalDecision(client: AsyncDatabaseClient, row: ApprovalDecisionRow): Promise<NumberingApprovalDecisionRecord> {
    const approver = await this.approvalUserSummary(client, row.approver_id);
    return {
      id: row.id,
      approvalRequestId: row.approval_request_id,
      approverRole: row.approver_role,
      approverId: row.approver_id,
      approverName: approver.display_name,
      approverUserRole: approver.role,
      isDelegatedApproval: !numberingRoleCodes({ id: row.approver_id, role: approver.role }).includes(row.approver_role),
      decision: row.decision,
      comment: row.comment,
      decidedAt: row.decided_at
    };
  }

  private async approvalUserSummary(client: AsyncDatabaseClient, userId: string): Promise<{ display_name: string; role: string }> {
    return (
      (await client.queryOne<{ display_name: string; role: string }>(SELECT_ASYNC_APPROVAL_USER_SUMMARY_SQL, { userId })) ?? {
        display_name: userId,
        role: "unknown"
      }
    );
  }

  private async approvalEntitySummary(client: AsyncDatabaseClient, request: ApprovalRequestRow): Promise<NumberingApprovalEntitySummaryRecord> {
    if (request.entity_type === "part_root") {
      const row = await client.queryOne<{
        root_code: string;
        core_name: string;
        item_kind: NumberingItemKind;
        record_status: NumberingRecordStatus;
      }>(SELECT_ASYNC_APPROVAL_PART_ROOT_SUMMARY_SQL, { entityId: request.entity_id });
      if (!row) return emptyApprovalEntitySummary(request);
      return {
        entityType: request.entity_type,
        entityId: request.entity_id,
        label: row.root_code,
        secondary: row.core_name,
        rootCode: row.root_code,
        partNumber: null,
        drawingNumber: null,
        partName: null,
        coreName: row.core_name,
        itemKind: row.item_kind,
        recordStatus: row.record_status
      };
    }

    if (request.entity_type === "part_number") {
      const row = await client.queryOne<{
        part_number: string;
        part_name: string;
        item_kind: NumberingItemKind;
        record_status: NumberingRecordStatus;
        root_code: string;
        core_name: string;
        primary_drawing_number: string | null;
      }>(SELECT_ASYNC_APPROVAL_PART_NUMBER_SUMMARY_SQL, { entityId: request.entity_id });
      if (!row) return emptyApprovalEntitySummary(request);
      return {
        entityType: request.entity_type,
        entityId: request.entity_id,
        label: row.part_number,
        secondary: row.part_name,
        rootCode: row.root_code,
        partNumber: row.part_number,
        drawingNumber: row.primary_drawing_number,
        partName: row.part_name,
        coreName: row.core_name,
        itemKind: row.item_kind,
        recordStatus: row.record_status
      };
    }

    const drawingRow = await client.queryOne<{
      drawing_number: string;
      purpose_code: DrawingPurposeCode;
      record_status: NumberingRecordStatus;
      root_code: string;
      core_name: string;
      item_kind: NumberingItemKind;
    }>(SELECT_ASYNC_APPROVAL_DRAWING_SUMMARY_SQL, { entityId: request.entity_id });
    if (!drawingRow) return emptyApprovalEntitySummary(request);
    const payload = parseJsonDetail(request.payload_json);
    const payloadPartNumber = String(payload.partNumber ?? "").trim();
    return {
      entityType: request.entity_type,
      entityId: request.entity_id,
      label: drawingRow.drawing_number,
      secondary: request.entity_type === "same_drawing_variant" && payloadPartNumber ? `Variant for ${payloadPartNumber}` : drawingRow.purpose_code,
      rootCode: drawingRow.root_code,
      partNumber: payloadPartNumber || null,
      drawingNumber: drawingRow.drawing_number,
      partName: null,
      coreName: drawingRow.core_name,
      itemKind: drawingRow.item_kind,
      recordStatus: drawingRow.record_status
    };
  }

  private async applyApprovedNumberingRequest(
    client: AsyncDatabaseClient,
    request: NumberingApprovalRecord,
    actorId: string,
    companyId: string
  ): Promise<void> {
    if (request.actionCode === "release") {
      const partNumberFromPayload = String(request.payload.partNumber ?? "").trim();
      const partRow =
        (await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_ID_SQL, { partNumberId: request.entityId })) ??
        (partNumberFromPayload
          ? await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: partNumberFromPayload, companyId })
          : null);
      if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${request.entityId}`);
      if (partRow.company_id !== companyId) throw new Error("PART_NUMBER_COMPANY_MISMATCH");
      const now = this.clock();
      await client.execute(UPDATE_ASYNC_APPROVAL_RELEASE_PART_SQL, { partNumberId: partRow.id, updatedAt: now });
      await client.execute(UPDATE_ASYNC_APPROVAL_RELEASE_ROOT_SQL, { rootId: partRow.part_root_id, updatedAt: now });
      await client.execute(UPDATE_ASYNC_APPROVAL_RELEASE_DRAWINGS_SQL, { rootId: partRow.part_root_id, updatedAt: now });
      await this.insertAudit(client, {
        actorId,
        action: "numbering.release.approved",
        detail: { approvalRequestId: request.id, partNumber: partRow.part_number }
      });
      return;
    }

    if (request.actionCode === "same_drawing_variant_after_release") {
      const drawingNumber = String(request.payload.drawingNumber ?? "").trim();
      const partNumber = String(request.payload.partNumber ?? "").trim();
      const variants = request.payload.variants as LinkPartNumberToDrawingInput["variants"];
      await this.linkPartNumberToDrawingInClient(client, { companyId, drawingNumber, partNumber, variants, createdBy: actorId, approvedAfterRelease: true });
      return;
    }

    if (request.actionCode === "obsolete_part_number") {
      const partNumberFromPayload = String(request.payload.partNumber ?? request.payload.entityCode ?? "").trim();
      const partRow =
        (await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_ID_SQL, { partNumberId: request.entityId })) ??
        (partNumberFromPayload
          ? await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: partNumberFromPayload, companyId })
          : null);
      if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${request.entityId}`);
      if (partRow.company_id !== companyId) throw new Error("LIFE_OBSOLETE_COMPANY_MISMATCH");
      if (partRow.record_status === "Obsolete") throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
      if (partRow.record_status !== "Active" && partRow.record_status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

      const now = this.clock();
      await client.execute(UPDATE_ASYNC_APPROVAL_OBSOLETE_PART_SQL, { partNumberId: partRow.id, updatedAt: now });
      await this.markRootClosedIfNoOpenParts(client, partRow.part_root_id, "Obsolete", now);
      await this.insertAudit(client, {
        actorId,
        action: "lifecycle.obsolete.approved",
        detail: {
          approvalRequestId: request.id,
          actionCode: request.actionCode,
          entityType: "part_number",
          entityId: partRow.id,
          entityCode: partRow.part_number,
          previousRecordStatus: partRow.record_status,
          newRecordStatus: "Obsolete",
          reason: request.reason
        }
      });
      return;
    }

    if (request.actionCode === "obsolete_ma_drawing") {
      const drawingNumberFromPayload = String(request.payload.drawingNumber ?? request.payload.entityCode ?? "").trim();
      const drawingRow =
        (await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_ID_SQL, { drawingNumberId: request.entityId })) ??
        (drawingNumberFromPayload
          ? await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { drawingNumber: drawingNumberFromPayload, companyId })
          : null);
      if (!drawingRow) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${request.entityId}`);
      if (drawingRow.company_id !== companyId) throw new Error("LIFE_OBSOLETE_COMPANY_MISMATCH");
      if (drawingRow.record_status === "Obsolete") throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
      if (drawingRow.record_status !== "Active" && drawingRow.record_status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

      const now = this.clock();
      const impactedPartRows = isManufacturingDrawingPurpose(drawingRow.purpose_code)
        ? (await client.query<PartNumberRow>(SELECT_ASYNC_PRIMARY_PARTS_BY_DRAWING_SQL, { drawingNumberId: drawingRow.id })).filter(
            (partRow) => partRow.record_status !== "Obsolete" && partRow.record_status !== "Merged"
          )
        : [];
      await client.execute(UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL, { drawingNumberId: drawingRow.id, updatedAt: now });
      await new UnifiedDrawingAsyncRepository(client).synchronizeFormalDrawing({
        drawingNumberId: drawingRow.id,
        companyId
      });
      for (const partRow of impactedPartRows) {
        await client.execute(UPDATE_ASYNC_PART_MAIN_DRAWING_INVALID_SQL, { partNumberId: partRow.id, updatedAt: now });
        await client.execute(UPDATE_ASYNC_ROOT_MAIN_DRAWING_INVALID_SQL, { rootId: partRow.part_root_id, updatedAt: now });
      }
      await this.insertAudit(client, {
        actorId,
        action: "lifecycle.obsolete.approved",
        detail: {
          approvalRequestId: request.id,
          actionCode: request.actionCode,
          entityType: "drawing_number",
          entityId: drawingRow.id,
          entityCode: drawingRow.drawing_number,
          previousRecordStatus: drawingRow.record_status,
          newRecordStatus: "Obsolete",
          impactedPartNumbers: impactedPartRows.map((partRow) => partRow.part_number),
          reason: request.reason
        }
      });
      return;
    }

    if (request.actionCode === "obsolete_part_root") {
      const rootCodeFromPayload = String(request.payload.rootCode ?? "").trim();
      const rootRow =
        (await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_ID_SQL, { rootId: request.entityId })) ??
        (rootCodeFromPayload
          ? await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode: rootCodeFromPayload, companyId })
          : null);
      if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${request.entityId}`);
      if (rootRow.company_id !== companyId) throw new Error("PART_ROOT_COMPANY_MISMATCH");

      const snapshotTargets = Array.isArray(request.payload.approvalTargets) ? request.payload.approvalTargets : null;
      const impact = await this.getRootObsoleteImpactInClient(client, {
        companyId,
        rootId: rootRow.id,
        excludeApprovalRequestId: request.id
      });
      const targets = snapshotTargets ?? (Array.isArray(request.payload.childTargets) ? request.payload.childTargets : impact.formalTargets);
      if (targets.length === 0) throw new Error("LIFE_OBSOLETE_NOT_ELIGIBLE");
      if (snapshotTargets) {
        const targetSignature = (value: unknown) => JSON.stringify(
          (Array.isArray(value) ? value : [])
            .map((target) => {
              const row = target && typeof target === "object" ? (target as Record<string, unknown>) : {};
              return {
                entityType: String(row.entityType ?? "").trim(),
                entityId: String(row.entityId ?? "").trim(),
                entityCode: String(row.entityCode ?? "").trim(),
                recordStatus: String(row.recordStatus ?? "").trim()
              };
            })
            .sort((left, right) => `${left.entityType}:${left.entityId}`.localeCompare(`${right.entityType}:${right.entityId}`))
        );
        const expectedFingerprint = String(request.payload.dependencyFingerprint ?? "").trim();
        if (Number(request.payload.schemaVersion ?? 0) !== 1 || !expectedFingerprint || expectedFingerprint !== impact.dependencySummary.fingerprint || targetSignature(snapshotTargets) !== targetSignature(impact.approvalTargets)) {
          throw new Error("ROOT_OBSOLETE_SNAPSHOT_STALE");
        }
      }

      const now = this.clock();
      const obsoletedParts: string[] = [];
      const obsoletedDrawings: string[] = [];
      let rootTargetIncluded = false;
      for (const target of targets) {
        const targetRecord = target && typeof target === "object" ? (target as Record<string, unknown>) : {};
        const entityType = String(targetRecord.entityType ?? "").trim();
        const entityId = String(targetRecord.entityId ?? "").trim();
        const expectedStatus = String(targetRecord.recordStatus ?? "").trim();
        if (entityType === "part_root") {
          if (entityId !== rootRow.id || rootRow.record_status !== expectedStatus) throw new Error("ROOT_OBSOLETE_SNAPSHOT_STALE");
          rootTargetIncluded = true;
          continue;
        }
        if (entityType === "part_number" && entityId) {
          const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_ID_SQL, { partNumberId: entityId });
          if (!partRow || partRow.company_id !== companyId || partRow.part_root_id !== rootRow.id) throw new Error("ROOT_OBSOLETE_TARGET_MISMATCH");
          if (partRow.record_status !== expectedStatus || isClosedRecordStatus(partRow.record_status)) throw new Error("ROOT_OBSOLETE_SNAPSHOT_STALE");
          await client.execute(UPDATE_ASYNC_APPROVAL_OBSOLETE_PART_SQL, { partNumberId: partRow.id, updatedAt: now });
          obsoletedParts.push(partRow.part_number);
        }
        if (entityType === "drawing_number" && entityId) {
          const drawingRow = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_ID_SQL, { drawingNumberId: entityId });
          if (!drawingRow || drawingRow.company_id !== companyId || drawingRow.part_root_id !== rootRow.id) throw new Error("ROOT_OBSOLETE_TARGET_MISMATCH");
          if (drawingRow.record_status !== expectedStatus || isClosedRecordStatus(drawingRow.record_status)) throw new Error("ROOT_OBSOLETE_SNAPSHOT_STALE");
          await client.execute(UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL, { drawingNumberId: drawingRow.id, updatedAt: now });
          await new UnifiedDrawingAsyncRepository(client).synchronizeFormalDrawing({
            drawingNumberId: drawingRow.id,
            companyId
          });
          obsoletedDrawings.push(drawingRow.drawing_number);
        }
      }
      if (rootTargetIncluded) {
        await client.execute(UPDATE_ASYNC_ROOT_OBSOLETE_SQL, { rootId: rootRow.id, updatedAt: now });
      } else {
        await this.markRootClosedIfNoOpenParts(client, rootRow.id, "Obsolete", now);
      }
      await this.insertAudit(client, {
        actorId,
        action: "lifecycle.root_obsolete.approved",
        detail: {
          approvalRequestId: request.id,
          actionCode: request.actionCode,
          entityType: "part_root",
          entityId: rootRow.id,
          rootCode: rootRow.root_code,
          obsoletedParts,
          obsoletedDrawings,
          reason: request.reason
        }
      });
      return;
    }

    if (request.actionCode === "main_drawing_restore") {
      const partNumberFromPayload = String(request.payload.partNumber ?? "").trim();
      const partRow =
        (await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_ID_SQL, { partNumberId: request.entityId })) ??
        (partNumberFromPayload
          ? await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: partNumberFromPayload, companyId })
          : null);
      if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${request.entityId}`);
      if (partRow.company_id !== companyId) throw new Error("PART_NUMBER_COMPANY_MISMATCH");
      if (partRow.record_status !== "MainDrawingInvalid") throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_INVALID_PART");

      const replacementDrawingNumber = String(request.payload.replacementDrawingNumber ?? "").trim();
      let replacementDrawing: DrawingNumberRecord | null = null;
      const now = this.clock();
      if (replacementDrawingNumber) {
        const replacementRow = await this.validateReplacementManufacturingDrawing(client, partRow, replacementDrawingNumber);
        replacementDrawing = mapDrawingNumber(replacementRow);
        await new RelationFormalAuthorityRepository(client).upsertPairInClient(client, {
          companyId,
          drawingNumberId: replacementRow.id,
          partNumberId: partRow.id,
          relationType: "manufacturing_basis",
          actorId
        });
      } else if (!(await this.getPrimaryManufacturingDrawingForPart(client, partRow.id))) {
        throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_ACTIVE_MA_DRAWING");
      }

      await client.execute(UPDATE_ASYNC_MAIN_DRAWING_RESTORE_PART_SQL, { partNumberId: partRow.id, updatedAt: now });
      const remainingInvalid = await client.queryOne<CountRow>(SELECT_ASYNC_REMAINING_MAIN_DRAWING_INVALID_PART_COUNT_SQL, {
        rootId: partRow.part_root_id,
        partNumberId: partRow.id
      });
      if (Number(remainingInvalid?.count ?? 0) === 0) {
        await client.execute(UPDATE_ASYNC_MAIN_DRAWING_RESTORE_ROOT_SQL, { rootId: partRow.part_root_id, updatedAt: now });
      }
      await this.insertAudit(client, {
        actorId,
        action: "numbering.main_drawing.restore",
        detail: {
          approvalRequestId: request.id,
          partNumber: partRow.part_number,
          replacementDrawingNumber: replacementDrawing?.drawingNumber ?? null,
          rootRestored: Number(remainingInvalid?.count ?? 0) === 0
        }
      });
    }
  }

  private async resolveNumberingRole(
    client: AsyncDatabaseClient,
    input: { roleId?: string; roleCode?: string }
  ): Promise<NumberingAdminRoleRow> {
    const roleId = input.roleId?.trim();
    const roleCode = input.roleCode?.trim();
    const row = roleId
      ? await client.queryOne<NumberingAdminRoleRow>(SELECT_ASYNC_ROLE_BY_ID_SQL, { roleId })
      : roleCode
        ? await client.queryOne<NumberingAdminRoleRow>(SELECT_ASYNC_ROLE_BY_CODE_SQL, { roleCode })
        : null;
    if (!row) throw new Error("NUMBERING_ROLE_NOT_FOUND");
    return row;
  }

  private async selectNumberingUserRoleAssignment(
    client: AsyncDatabaseClient,
    assignmentId: string
  ): Promise<NumberingUserRoleAssignmentRow | null> {
    return client.queryOne<NumberingUserRoleAssignmentRow>(SELECT_ASYNC_ADMIN_ROLE_ASSIGNMENT_BY_ID_SQL, { assignmentId });
  }

  private async hasApprovedNumberingApproval(
    client: AsyncDatabaseClient,
    input: { entityType: NumberingApprovalRecord["entityType"]; entityId: string; actionCode: NumberingApprovalActionCode }
  ): Promise<boolean> {
    return Boolean(await client.queryOne<{ id: string }>(SELECT_ASYNC_APPROVED_NUMBERING_APPROVAL_SQL, input));
  }

  private async partHasVariantDescriptor(client: AsyncDatabaseClient, partNumberId: string): Promise<boolean> {
    const row = await client.queryOne<Pick<PartVariantAttributesRow, "material_code" | "material_label" | "color_code" | "color_label" | "variant_note">>(
      SELECT_ASYNC_PART_VARIANT_DESCRIPTOR_SQL,
      { partNumberId }
    );
    if (!row) return false;
    return [row.material_code, row.material_label, row.color_code, row.color_label, row.variant_note].some((value) => Boolean(value?.trim()));
  }

  private async primaryDrawingHasMultipleLinkedParts(client: AsyncDatabaseClient, drawingNumberId: string): Promise<boolean> {
    const row = await client.queryOne<CountRow>(SELECT_ASYNC_PRIMARY_DRAWING_LINKED_PART_COUNT_SQL, { drawingNumberId });
    return Number(row?.count ?? 0) > 1;
  }

  private async evaluateNumberingGateInClient(client: AsyncDatabaseClient, input: EvaluateNumberingGateInput): Promise<NumberingGateEvaluation> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: input.partNumber, companyId });
    if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    const partNumber = mapPartNumber(partRow);
    const primaryManufacturingDrawing = await this.getPrimaryManufacturingDrawingForPart(client, partNumber.id);
    const issues: NumberingGateIssue[] = [];
    const requiresPrimaryManufacturingDrawing = partRequiresPrimaryManufacturingDrawing(partNumber);

    if (requiresPrimaryManufacturingDrawing && !primaryManufacturingDrawing) {
      issues.push({
        code: "PRIMARY_MA_REQUIRED",
        severity: "blocker",
        message: `${input.gate} gate requires a primary MA drawing before approval.`,
        entityType: "part_number",
        entityId: partNumber.id
      });
    }

    if (partNumber.recordStatus === "MainDrawingInvalid") {
      issues.push({
        code: "MAIN_DRAWING_INVALID",
        severity: "blocker",
        message: "Main drawing is invalid and the affected documents must be revised before approval.",
        entityType: "part_number",
        entityId: partNumber.id
      });
    }

    if (
      primaryManufacturingDrawing &&
      (await this.primaryDrawingHasMultipleLinkedParts(client, primaryManufacturingDrawing.id)) &&
      !(await this.partHasVariantDescriptor(client, partNumber.id))
    ) {
      issues.push({
        code: "SAME_DRAWING_VARIANT_DETAIL_REQUIRED",
        severity: "blocker",
        message: `${input.gate} gate requires material, color, or variant difference details for same-drawing multi-part records.`,
        entityType: "part_number",
        entityId: partNumber.id
      });
    }

    const requiresOverride = input.gate === "Release" && issues.some((issue) => issue.code === "PRIMARY_MA_REQUIRED");
    const approvalActionCode: NumberingApprovalActionCode | null = requiresOverride ? "release_missing_ma_confirm" : null;
    const approvedOverride = approvalActionCode
      ? await this.hasApprovedNumberingApproval(client, { entityType: "part_number", entityId: partNumber.id, actionCode: approvalActionCode })
      : false;
    const overrideAllowed = Boolean(input.allowMainDrawingOverride) || approvedOverride;
    const blockers = issues.filter((issue) => issue.severity === "blocker");
    const allowed = blockers.length === 0 || (blockers.every((issue) => issue.code === "PRIMARY_MA_REQUIRED") && overrideAllowed);

    return {
      partNumber,
      gate: input.gate,
      allowed,
      requiresApproval: requiresOverride || issues.length > 0,
      requiresOverride,
      approvalActionCode,
      issues,
      primaryManufacturingDrawing
    };
  }

  private async markRootClosedIfNoOpenParts(
    client: AsyncDatabaseClient,
    rootId: string,
    status: "Obsolete",
    now: string
  ): Promise<void> {
    const openCount = await client.queryOne<CountRow>(SELECT_ASYNC_OPEN_PART_COUNT_FOR_ROOT_SQL, { rootId });
    if (Number(openCount?.count ?? 0) === 0) {
      const drawings = await client.query<{ id: string; company_id: string }>(
        "SELECT id, company_id FROM drawing_numbers WHERE part_root_id = :rootId",
        { rootId }
      );
      await client.execute(UPDATE_ASYNC_ROOT_CLOSED_SQL, { rootId, recordStatus: status, updatedAt: now });
      await client.execute(UPDATE_ASYNC_ROOT_DRAWINGS_CLOSED_SQL, { rootId, recordStatus: status, updatedAt: now });
      for (const drawing of drawings) {
        await new UnifiedDrawingAsyncRepository(client).synchronizeFormalDrawing({
          drawingNumberId: drawing.id,
          companyId: drawing.company_id
        });
      }
      return;
    }
    await client.execute(UPDATE_ASYNC_ROOT_TOUCH_SQL, { rootId, updatedAt: now });
  }

  private async linkPartNumberToDrawingInClient(
    client: AsyncDatabaseClient,
    input: LinkPartNumberToDrawingInput & { approvedAfterRelease?: boolean }
  ): Promise<{ drawing: DrawingNumberRecord; partNumber: PartNumberRecord; linkType: string; variants: Array<{ fieldName: string; fieldValue: string }> }> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const lockRows = await client.query<{ id: string; part_root_id: string }>(
      `SELECT id, part_root_id FROM part_numbers WHERE part_number = :partNumber AND company_id = :companyId
       UNION ALL
       SELECT id, part_root_id FROM drawing_numbers WHERE drawing_number = :drawingNumber AND company_id = :companyId`,
      { partNumber: input.partNumber, drawingNumber: input.drawingNumber, companyId }
    );
    const rootId = lockRows[0]?.part_root_id;
    await lockPdmEntityScopeAsync(client, [
      ...(rootId ? [{ type: "part_root", id: rootId, companyId }] : []),
      ...lockRows.map((row) => ({ type: row.id === lockRows[0]?.id ? "part_number" : "drawing_number", id: row.id, companyId }))
    ]);
    const partRow = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: input.partNumber, companyId });
    if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    const drawingRow = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { drawingNumber: input.drawingNumber, companyId });
    if (!drawingRow) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${input.drawingNumber}`);
    if (partRow.part_root_id !== drawingRow.part_root_id) throw new Error("DRAWING_PART_ROOT_MISMATCH");

    const rootRow = await client.queryOne<PartRootRow>("SELECT * FROM part_roots WHERE id = :rootId AND company_id = :companyId", {
      rootId: partRow.part_root_id,
      companyId
    });
    if (!rootRow) throw new Error("PART_ROOT_NOT_FOUND");
    if (!input.approvedAfterRelease) {
      await assertPdmReviewScopeWritableAsync(client, {
        companyId,
        targetIds: [partRow.id, drawingRow.id, rootRow.id],
        targetRefs: [
          { type: "part_root", id: rootRow.id, companyId },
          { type: "drawing_number", id: drawingRow.id, companyId },
          { type: "part_number", id: partRow.id, companyId }
        ]
      });
    }

    const part = mapPartNumber(partRow);
    const drawing = mapDrawingNumber(drawingRow);
    const variants = normalizeVariantFields(input.variants);
    const linkType = isManufacturingDrawingPurpose(drawing.purposeCode) ? "primary_manufacturing" : "reference";
    const [existingLink, existingPrimaryCount] = await Promise.all([
      client.queryOne<{ id: string }>(SELECT_ASYNC_DRAWING_PART_LINK_BY_TYPE_SQL, {
        drawingNumberId: drawing.id,
        partNumberId: part.id,
        linkType
      }),
      client.queryOne<CountRow>(SELECT_ASYNC_DRAWING_PRIMARY_LINK_COUNT_SQL, { drawingNumberId: drawing.id })
    ]);

    if (isManufacturingDrawingPurpose(drawing.purposeCode) && !existingLink && Number(existingPrimaryCount?.count ?? 0) > 0 && variants.length === 0) {
      throw new Error("SAME_DRAWING_VARIANT_REQUIRED");
    }
    if (
      isManufacturingDrawingPurpose(drawing.purposeCode) &&
      !existingLink &&
      Number(existingPrimaryCount?.count ?? 0) > 0 &&
      (drawing.recordStatus === "Released" || part.recordStatus === "Released") &&
      !input.approvedAfterRelease
    ) {
      throw new Error("SAME_DRAWING_VARIANT_APPROVAL_REQUIRED");
    }
    if (!isManufacturingDrawingPurpose(drawing.purposeCode) && variants.length > 0) throw new Error("SAME_DRAWING_VARIANT_REQUIRES_MA_DRAWING");

    if (!existingLink) await this.linkDrawingToPart(client, { drawing, part, createdBy: input.createdBy });
    const now = this.clock();
    for (const variant of variants) {
      await client.execute(UPSERT_ASYNC_SAME_DRAWING_VARIANT_SQL, {
        id: this.idFactory(),
        drawingNumberId: drawing.id,
        partNumberId: part.id,
        fieldName: variant.fieldName,
        fieldValue: variant.fieldValue,
        createdBy: input.createdBy ?? null,
        createdAt: now
      });
    }
    await this.insertAudit(client, {
      actorId: input.createdBy,
      action: "numbering.drawing_part.link",
      detail: {
        drawingNumber: drawing.drawingNumber,
        partNumber: part.partNumber,
        linkType,
        variants
      }
    });
    return { drawing, partNumber: part, linkType, variants };
  }

  private async maintainDrawingPartRelationInClient(
    client: AsyncDatabaseClient,
    input: MaintainDrawingPartRelationInput
  ): Promise<MaintainDrawingPartRelationResult> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const drawingNumber = input.drawingNumber.trim();
    const partNumberValue = input.partNumber.trim();
    if (!drawingNumber) throw new Error("DRAWING_NUMBER_REQUIRED");
    if (!partNumberValue) throw new Error("PART_NUMBER_REQUIRED");

    const partIdentity = await client.queryOne<{ id: string; part_root_id: string }>(
      `SELECT id, part_root_id FROM part_numbers WHERE part_number = :partNumber AND company_id = :companyId`,
      { partNumber: partNumberValue, companyId }
    );
    if (!partIdentity) throw new Error(`PART_NUMBER_NOT_FOUND: ${partNumberValue}`);
    const drawingIdentity = await client.queryOne<{ id: string; part_root_id: string }>(
      `SELECT id, part_root_id FROM drawing_numbers WHERE drawing_number = :drawingNumber AND company_id = :companyId`,
      { drawingNumber, companyId }
    );
    if (!drawingIdentity) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${drawingNumber}`);
    if (partIdentity.part_root_id !== drawingIdentity.part_root_id) throw new Error("DRAWING_PART_ROOT_MISMATCH");

    await lockPdmEntityScopeAsync(client, [
      { type: "part_root", id: partIdentity.part_root_id, companyId },
      { type: "drawing_number", id: drawingIdentity.id, companyId },
      { type: "part_number", id: partIdentity.id, companyId }
    ]);

    const [partRow, drawingRow] = await Promise.all([
      client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber: partNumberValue, companyId }),
      client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { drawingNumber, companyId })
    ]);
    if (!partRow || !drawingRow) throw new Error("PDM_RELATION_SCOPE_CHANGED");
    if (partRow.part_root_id !== drawingRow.part_root_id) throw new Error("DRAWING_PART_ROOT_MISMATCH");
    const rootRow = await client.queryOne<PartRootRow>("SELECT * FROM part_roots WHERE id = :rootId AND company_id = :companyId", {
      rootId: partRow.part_root_id,
      companyId
    });
    if (!rootRow) throw new Error("PART_ROOT_NOT_FOUND");
    await assertPdmReviewScopeWritableAsync(client, {
      companyId,
      targetIds: [partRow.id, drawingRow.id, rootRow.id],
      targetRefs: [
        { type: "part_root", id: rootRow.id, companyId },
        { type: "drawing_number", id: drawingRow.id, companyId },
        { type: "part_number", id: partRow.id, companyId }
      ]
    });

    const lockedStatuses: NumberingRecordStatus[] = ["PendingReview", "Released", "Obsolete", "Merged"];
    const lockedRecord = [
      { entityType: "part_root", status: rootRow.record_status, code: rootRow.root_code },
      { entityType: "drawing_number", status: drawingRow.record_status, code: drawingRow.drawing_number },
      { entityType: "part_number", status: partRow.record_status, code: partRow.part_number }
    ].find((record) => lockedStatuses.includes(record.status));
    if (lockedRecord) {
      throw new Error(`RELATION_MAINTENANCE_RECORD_LOCKED: ${lockedRecord.entityType}:${lockedRecord.code}:${lockedRecord.status}`);
    }

    const drawing = mapDrawingNumber(drawingRow);
    const part = mapPartNumber(partRow);
    const beforeRows = await this.listDrawingPartLinksForPair(client, drawing.id, part.id);

    const authority = new RelationFormalAuthorityRepository(client);
    if (input.operation === "link") {
      await authority.upsertPairInClient(client, { companyId, drawingNumberId: drawing.id, partNumberId: part.id, relationType: isManufacturingDrawingPurpose(drawing.purposeCode) ? "manufacturing_basis" : "reference", actorId: input.actorId ?? null });
    } else if (input.operation === "set_primary") {
      if (!isManufacturingDrawingPurpose(drawing.purposeCode)) throw new Error("PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING");
      await authority.upsertPairInClient(client, { companyId, drawingNumberId: drawing.id, partNumberId: part.id, relationType: "manufacturing_basis", actorId: input.actorId ?? null });
      const primaryUpdatedAt = this.clock();
      await client.execute(
        `UPDATE drawing_numbers
         SET is_primary_manufacturing = CASE WHEN id = :drawingNumberId THEN 1 ELSE 0 END,
             updated_at = :updatedAt
         WHERE company_id = :companyId AND part_root_id = :rootId AND purpose_code IN ('MA', 'M')`,
        { drawingNumberId: drawing.id, updatedAt: primaryUpdatedAt, companyId, rootId: rootRow.id }
      );
      const rootDrawingIds = await client.query<{ id: string }>(
        `SELECT id FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId`,
        { companyId, rootId: rootRow.id }
      );
      const unifiedDrawingRepository = new UnifiedDrawingAsyncRepository(client);
      for (const rootDrawing of rootDrawingIds) {
        await unifiedDrawingRepository.synchronizeFormalDrawing({ drawingNumberId: rootDrawing.id, companyId });
      }
    } else if (input.operation === "set_reference") {
      await authority.upsertPairInClient(client, { companyId, drawingNumberId: drawing.id, partNumberId: part.id, relationType: "reference", actorId: input.actorId ?? null });
    } else if (input.operation === "remove") {
      await client.execute(DELETE_ASYNC_SAME_DRAWING_VARIANTS_FOR_PAIR_SQL, { drawingNumberId: drawing.id, partNumberId: part.id });
      await authority.removePairInClient(client, { companyId, drawingNumberId: drawing.id, partNumberId: part.id });
    } else {
      throw new Error("RELATION_MAINTENANCE_OPERATION_UNSUPPORTED");
    }

    const afterRows = await this.listDrawingPartLinksForPair(client, drawing.id, part.id);
    const before = beforeRows.map(mapNumberingLink);
    const after = afterRows.map(mapNumberingLink);
    const changed = JSON.stringify(before.map((link) => `${link.id}:${link.linkType}`).sort()) !== JSON.stringify(after.map((link) => `${link.id}:${link.linkType}`).sort());
    await this.insertAudit(client, {
      actorId: input.actorId,
      action: "numbering.drawing_part.relation_maintain",
      detail: {
        operation: input.operation,
        rootCode: rootRow.root_code,
        drawingNumber: drawing.drawingNumber,
        partNumber: part.partNumber,
        before,
        after,
        changed
      }
    });
    return { operation: input.operation, drawingNumber: drawing, partNumber: part, before, after, changed };
  }

  private async getPrimaryManufacturingDrawingForPart(client: AsyncDatabaseClient, partNumberId: string): Promise<DrawingNumberRecord | null> {
    const row = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_PRIMARY_MANUFACTURING_DRAWING_FOR_PART_SQL, { partNumberId });
    return row ? mapDrawingNumber(row) : null;
  }

  private listDrawingPartLinksForPair(client: AsyncDatabaseClient, drawingNumberId: string, partNumberId: string): Promise<NumberingLinkRow[]> {
    return client.query<NumberingLinkRow>(SELECT_ASYNC_DRAWING_PART_LINKS_FOR_PAIR_SQL, { drawingNumberId, partNumberId });
  }

  private async validateReplacementManufacturingDrawing(
    client: AsyncDatabaseClient,
    partRow: PartNumberRow,
    drawingNumber: string
  ): Promise<DrawingNumberRow> {
    const replacement = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, {
      drawingNumber,
      companyId: partRow.company_id ?? DEFAULT_COMPANY_ID
    });
    if (!replacement) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${drawingNumber}`);
    if (replacement.part_root_id !== partRow.part_root_id || !isManufacturingDrawingPurpose(replacement.purpose_code)) {
      throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_SAME_ROOT_MA_DRAWING");
    }
    if (["Obsolete", "Merged"].includes(replacement.record_status)) {
      throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_ACTIVE_MA_DRAWING");
    }
    return replacement;
  }

  private async insertWarningEvent(client: AsyncDatabaseClient, input: WarningEventInput): Promise<string> {
    const id = this.idFactory();
    await client.execute(INSERT_ASYNC_NUMBERING_WARNING_EVENT_SQL, {
      id,
      warningCode: input.warningCode,
      severity: input.severity,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      title: input.title,
      message: input.message,
      detailJson: JSON.stringify(input.detail),
      createdBy: input.createdBy ?? null,
      createdAt: this.clock()
    });
    return id;
  }

  private async selectV3ReservedRootCodes(client: AsyncDatabaseClient, companyId: string): Promise<string[]> {
    const [masterRows, drawingRows, auditRows] = await Promise.all([
      client.query<{ root_code: string }>(SELECT_ASYNC_ROOT_CODES_BY_COMPANY_SQL, { companyId }),
      client.query<{ drawing_number: string }>(SELECT_ASYNC_ACTIVE_DRAWING_CODES_BY_COMPANY_SQL, { companyId }),
      client.query<{ detail_json: string }>(SELECT_ASYNC_AUDIT_DETAILS_WITH_ROOT_CODES_SQL)
    ]);
    const drawingRootCodes = drawingRows.flatMap((row) => {
      const value = String(row.drawing_number ?? '').trim().toUpperCase();
      const match = /^(?:D-)?([A-Z][0-9]{4})-(?:M|R)[0-9]{1,2}$/u.exec(value);
      return match ? [match[1]] : [];
    });
    return Array.from(
      new Set([
        ...masterRows.map((row) => row.root_code),
        ...drawingRootCodes,
        ...auditRows.flatMap((row) => extractAuditRootCodesFromJson(row.detail_json, companyId))
      ])
    );
  }

  private async allocateSequence(client: AsyncDatabaseClient, companyId: string, sequenceKey: string): Promise<number> {
    const row = await client.queryOne<{ next_value: number }>(SELECT_ASYNC_NUMBERING_SEQUENCE_SQL, { sequenceKey });
    const now = this.clock();
    if (!row) {
      await client.execute(INSERT_ASYNC_NUMBERING_SEQUENCE_SQL, { sequenceKey, companyId, nextValue: 2, updatedAt: now });
      return 1;
    }
    await client.execute(UPDATE_ASYNC_NUMBERING_SEQUENCE_SQL, {
      sequenceKey,
      nextValue: Number(row.next_value) + 1,
      updatedAt: now
    });
    return Number(row.next_value);
  }

  private async allocateRootSequence(client: AsyncDatabaseClient, input: { companyId: string; ruleVersionId: string }): Promise<number> {
    if (input.ruleVersionId !== NUMBERING_RULE_V2_ID && input.ruleVersionId !== NUMBERING_RULE_V3_ID) {
      return this.allocateSequence(client, input.companyId, `${input.companyId}:part_root`);
    }

    const rootCodes =
      input.ruleVersionId === NUMBERING_RULE_V3_ID
        ? await this.selectV3ReservedRootCodes(client, input.companyId)
        : (
            await client.query<{ root_code: string }>(SELECT_ASYNC_V2_ROOT_CODES_BY_COMPANY_SQL, {
              companyId: input.companyId,
              ruleVersionId: input.ruleVersionId
            })
          ).map((row) => row.root_code);
    const sequenceNo = lowestAvailableSequence(
      rootCodes.map((rootCode) => (input.ruleVersionId === NUMBERING_RULE_V3_ID ? rootCodeToV3Ordinal(rootCode) ?? 0 : Number(rootCode))),
      input.ruleVersionId === NUMBERING_RULE_V3_ID ? 26 * 9999 : 99999,
      "ROOT"
    );
    const sequenceKey = input.ruleVersionId === NUMBERING_RULE_V3_ID ? `${input.companyId}:part_root:v3` : `${input.companyId}:part_root:v2`;
    const row = await client.queryOne<{ next_value: number }>(SELECT_ASYNC_NUMBERING_SEQUENCE_SQL, { sequenceKey });
    const nextValue = sequenceNo + 1;
    const now = this.clock();
    if (!row) {
      await client.execute(INSERT_ASYNC_NUMBERING_SEQUENCE_SQL, { sequenceKey, companyId: input.companyId, nextValue, updatedAt: now });
    } else {
      await client.execute(UPDATE_ASYNC_NUMBERING_SEQUENCE_SQL, { sequenceKey, nextValue, updatedAt: now });
    }
    return sequenceNo;
  }

  private async findRecentAppendAudit(
    client: AsyncDatabaseClient,
    input: { action: string; actorId: string | null; idempotencyKey: string }
  ): Promise<Record<string, unknown> | null> {
    const nowMs = Date.parse(this.clock());
    const notBefore = new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) - 60_000).toISOString();
    const row = await client.queryOne<{ detail_json: string }>(
      `
        SELECT detail_json
        FROM audit_logs
        WHERE action = :action
          AND (actor_id = :actorId OR (CAST(:actorId AS text) IS NULL AND actor_id IS NULL))
          AND created_at >= :notBefore
          AND CAST(detail_json AS TEXT) LIKE :needle
        ORDER BY created_at DESC
        LIMIT 1
      `,
      {
        action: input.action,
        actorId: input.actorId,
        notBefore,
        needle: `%${input.idempotencyKey}%`
      }
    );
    return row ? parseJsonDetail(row.detail_json) : null;
  }

  private async rootAppendReasonRequired(client: AsyncDatabaseClient, rootId: string, rootStatus: NumberingRecordStatus): Promise<boolean> {
    if (isFormalRecordStatus(rootStatus)) return true;
    const [partRows, drawingRows] = await Promise.all([
      client.query<PartNumberRow>(SELECT_ASYNC_ROOT_PART_NUMBERS_SQL, { rootId }),
      client.query<DrawingNumberRow>(SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL, { rootId })
    ]);
    return partRows.some((row) => isFormalRecordStatus(row.record_status)) || drawingRows.some((row) => isFormalRecordStatus(row.record_status));
  }

  private async readCanonicalActivityCount(client: AsyncDatabaseClient, input: { companyId: string; rootId?: string; entityType?: "part" | "drawing"; entityId?: string }): Promise<number> {
    try {
      if (input.rootId) {
        const row = await client.queryOne<{ count: number }>(
          `
            SELECT COUNT(*) AS count
            FROM canonical_workbench_states state
            WHERE state.company_id = :companyId
              AND (
                (state.entity_type = 'relation' AND state.canonical_entity_id = :rootId)
                OR (state.entity_type = 'part' AND EXISTS (
                  SELECT 1 FROM part_numbers part
                  WHERE part.id = state.canonical_entity_id
                    AND part.part_root_id = :rootId
                    AND part.company_id = :companyId
                ))
                OR (state.entity_type = 'drawing' AND EXISTS (
                  SELECT 1 FROM drawings drawing
                  WHERE drawing.id = state.canonical_entity_id
                    AND drawing.part_root_id = :rootId
                    AND drawing.company_id = :companyId
                ))
              )
              AND (
                state.data_layer = 'drawing_rd'
                OR state.work_id IS NOT NULL
                OR state.handling IN ('owner', 'review_owner', 'system', 'system_admin', 'blocked')
              )
          `,
          { companyId: input.companyId, rootId: input.rootId }
        );
        return Number(row?.count ?? 0);
      }

      if (!input.entityType || !input.entityId) return 0;
      const entityType = input.entityType;
      const ids = entityType === "drawing"
        ? [input.entityId, ...(await client.query<{ id: string }>(
            `SELECT id FROM drawings WHERE company_id = :companyId AND formal_drawing_number_id = :entityId`,
            { companyId: input.companyId, entityId: input.entityId }
          )).map((row) => row.id)]
        : [input.entityId];
      const distinctIds = Array.from(new Set(ids.filter(Boolean)));
      const placeholders = distinctIds.map((_id, index) => `:canonicalEntityId${index}`).join(", ");
      const params: Record<string, unknown> = { companyId: input.companyId };
      distinctIds.forEach((id, index) => { params[`canonicalEntityId${index}`] = id; });
      const row = await client.queryOne<{ count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM canonical_workbench_states state
          WHERE state.company_id = :companyId
            AND state.entity_type = :entityType
            AND state.canonical_entity_id IN (${placeholders || "NULL"})
            AND (
              state.work_id IS NOT NULL
              OR state.handling IN ('owner', 'review_owner', 'system', 'system_admin', 'blocked')
            )
        `,
        { ...params, entityType }
      );
      return Number(row?.count ?? 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/no such table|does not exist/iu.test(message) && message.includes("canonical_workbench_states")) return 0;
      throw error;
    }
  }

  private async getRootObsoleteImpactInClient(
    client: AsyncDatabaseClient,
    input: { companyId?: string; rootCode?: string; rootId?: string; excludeApprovalRequestId?: string | null }
  ): Promise<RootObsoleteImpactResult> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const rootCode = input.rootCode?.trim();
    const rootId = input.rootId?.trim();
    if (!rootCode && !rootId) throw new Error("PART_ROOT_REQUIRED");
    const rootRow = rootId
      ? await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_ID_SQL, { rootId })
      : await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId });
    if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${rootCode || rootId}`);
    if (rootRow.company_id !== companyId) throw new Error("PART_ROOT_COMPANY_MISMATCH");

    const [partRows, drawingRows, linkRows, pending, dependencyCountRow, activeCanonicalActivityCount] = await Promise.all([
      client.query<PartNumberRow>(SELECT_ASYNC_ROOT_PART_NUMBERS_SQL, { rootId: rootRow.id }),
      client.query<DrawingNumberRow>(SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL, { rootId: rootRow.id }),
      client.query<NumberingLinkRow>(SELECT_ASYNC_NUMBERING_LINKS_FOR_ROOT_SQL, { rootId: rootRow.id }),
      client.queryOne<{ id: string }>(
        `
          SELECT id
          FROM approval_requests
          WHERE request_type = 'numbering'
            AND company_id = :companyId
            AND entity_type = 'part_root'
            AND entity_id = :entityId
            AND action_code = 'obsolete_part_root'
            AND request_status IN ('pending', 'needs_info')
            AND (CAST(:excludeApprovalRequestId AS text) IS NULL OR id <> CAST(:excludeApprovalRequestId AS text))
          LIMIT 1
        `,
        { companyId, entityId: rootRow.id, excludeApprovalRequestId: input.excludeApprovalRequestId ?? null }
      ),
      client.queryOne<RootDependencyCountRow>(SELECT_ASYNC_DRAFT_DELETE_DEPENDENCY_COUNTS_SQL, {
        rootId: rootRow.id,
        excludeApprovalRequestId: input.excludeApprovalRequestId ?? null
      }),
      this.readCanonicalActivityCount(client, { companyId, rootId: rootRow.id })
    ]);
    const parts = partRows.map(mapPartNumber);
    const drawings = drawingRows.map(mapDrawingNumber);
    const dependencySummary = mapRootDependencySummary(dependencyCountRow);
    const formalTargets: RootObsoleteImpactTarget[] = [
      ...parts
        .filter((part) => isFormalRecordStatus(part.recordStatus))
        .map((part) => ({
          entityType: "part_number" as const,
          entityId: part.id,
          entityCode: part.partNumber,
          recordStatus: part.recordStatus
        })),
      ...drawings
        .filter((drawing) => isFormalRecordStatus(drawing.recordStatus))
        .map((drawing) => ({
          entityType: "drawing_number" as const,
          entityId: drawing.id,
          entityCode: drawing.drawingNumber,
          recordStatus: drawing.recordStatus
        }))
    ];
    const approvalTargets: RootObsoleteImpactTarget[] = [
      {
        entityType: "part_root",
        entityId: rootRow.id,
        entityCode: rootRow.root_code,
        recordStatus: rootRow.record_status
      },
      ...parts
        .filter((part) => !isClosedRecordStatus(part.recordStatus))
        .map((part) => ({
          entityType: "part_number" as const,
          entityId: part.id,
          entityCode: part.partNumber,
          recordStatus: part.recordStatus
        })),
      ...drawings
        .filter((drawing) => !isClosedRecordStatus(drawing.recordStatus))
        .map((drawing) => ({
          entityType: "drawing_number" as const,
          entityId: drawing.id,
          entityCode: drawing.drawingNumber,
          recordStatus: drawing.recordStatus
        }))
    ];
    const policy = buildNumberingPartRootLifecyclePolicy({
      rootStatus: rootRow.record_status,
      childStatuses: [...parts, ...drawings].map((record) => record.recordStatus),
      controlledReferenceCount: dependencySummary.controlledReferenceCount,
      activeCanonicalActivityCount,
      pendingObsoleteRequest: Boolean(pending)
    });
    const draftChildren = [...parts, ...drawings].filter((record) => record.recordStatus === "Draft" || record.recordStatus === "NeedInfo").length;
    const warnings = [
      draftChildren > 0 && formalTargets.length > 0 ? `尚有 ${draftChildren} 筆草稿/待補資料；正式作廢會以核准範圍為準。` : "",
      dependencySummary.controlledReferenceCount > 0 ? `目前有 ${dependencySummary.controlledReferenceCount} 筆受控關聯，不能直接作廢草稿。` : "",
      formalTargets.length === 0 && dependencySummary.controlledReferenceCount === 0 ? "此圖料根號目前沒有可申請作廢的正式範圍。" : "",
      pending ? "此圖料根號已有作廢審核中申請。" : ""
    ].filter(Boolean);
    const links: RootObsoleteImpactLink[] = linkRows.map((link) => ({
      drawingNumber: link.drawing_number,
      partNumber: link.part_number,
      linkType: link.link_type
    }));
    return {
      root: mapPartRoot(rootRow),
      parts,
      drawings,
      links,
      formalTargets,
      approvalTargets,
      dependencySummary,
      policy,
      warnings,
      pendingRequestId: pending?.id ?? null,
      activeCanonicalActivityCount
    };
  }

  private async insertPartRoot(
    client: AsyncDatabaseClient,
    input: {
      companyId: string;
      coreName: string;
      itemKind: NumberingItemKind;
      recordStatus: NumberingRecordStatus;
      ruleVersionId: string;
      createdBy?: string | null;
    }
  ): Promise<PartRootRecord> {
    const rootCode = formatRootCode(await this.allocateRootSequence(client, input), input.ruleVersionId);
    const id = this.idFactory();
    const now = this.clock();
    await client.execute(INSERT_ASYNC_PART_ROOT_SQL, {
      id,
      companyId: input.companyId,
      rootCode,
      coreName: input.coreName.trim(),
      itemKind: input.itemKind,
      recordStatus: input.recordStatus,
      ruleVersionId: input.ruleVersionId,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now
    });
    const row = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId: input.companyId });
    if (!row) throw new Error(`PART_ROOT_NOT_FOUND: ${rootCode}`);
    return mapPartRoot(row);
  }

  private async insertPartNumber(
    client: AsyncDatabaseClient,
    root: PartRootRecord,
    input: {
      partName: string;
      itemKind: NumberingItemKind;
      structureType: NumberingStructureType;
      recordStatus: NumberingRecordStatus;
      isUniversal: boolean;
      universalReason?: string;
      customSpecification?: string;
      seriesCode?: string;
      ruleVersionId: string;
      createdBy?: string | null;
    }
  ): Promise<PartNumberRecord> {
    const effectiveIsUniversal = Boolean(input.isUniversal);
    requireCustomSpecification(input.itemKind, input.customSpecification);
    const seriesCode = normalizeSeriesCode(input.itemKind, effectiveIsUniversal, input.seriesCode);
    const sequenceNo =
      effectiveIsUniversal && !isCompactNumberingRule(input.ruleVersionId)
        ? 0
        : await this.allocateSequence(client, root.companyId, `${root.companyId}:part:${root.rootCode}`);
    const sequenceCode = formatPartSequence(sequenceNo, input.ruleVersionId);
    const partNumber = formatPartNumberForRule(root.rootCode, sequenceCode, input.ruleVersionId);
    const id = this.idFactory();
    const now = this.clock();
    await client.execute(INSERT_ASYNC_PART_NUMBER_SQL, {
      id,
      companyId: root.companyId,
      partRootId: root.id,
      partNumber,
      sequenceNo,
      sequenceCode,
      partName: input.partName.trim(),
      itemKind: input.itemKind,
      structureType: input.structureType,
      isUniversal: effectiveIsUniversal ? 1 : 0,
      customSpecification: input.customSpecification?.trim() || null,
      seriesCode,
      recordStatus: input.recordStatus,
      universalReason: input.universalReason?.trim() || null,
      ruleVersionId: input.ruleVersionId,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now
    });
    const row = await client.queryOne<PartNumberRow>(SELECT_ASYNC_PART_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { partNumber, companyId: root.companyId });
    if (!row) throw new Error(`PART_NUMBER_NOT_FOUND: ${partNumber}`);
    const record = mapPartNumber(row);
    await this.ensureCanonicalPartWorkbenchState(client, record);
    return record;
  }

  private async insertDrawingNumber(
    client: AsyncDatabaseClient,
    root: PartRootRecord,
    input: {
      purposeCode: DrawingPurposeCode;
      purposeDescription?: string;
      recordStatus: NumberingRecordStatus;
      ruleVersionId: string;
      createdBy?: string | null;
    }
  ): Promise<DrawingNumberRecord> {
    assertPurposeAllowedForRule(input.purposeCode, input.ruleVersionId);
    const purposeDescription = normalizePurposeDescription(input.purposeCode, input.purposeDescription);
    const sequenceKey = `${root.companyId}:drawing:${root.rootCode}:${input.purposeCode}`;
    let sequenceNo = await this.allocateSequence(client, root.companyId, sequenceKey);
    let sequenceCode = formatDrawingSequence(sequenceNo, input.ruleVersionId);
    let drawingNumber = formatDrawingNumberForRule(root.rootCode, input.purposeCode, sequenceCode, input.ruleVersionId);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [formalConflict, projectionConflict] = await Promise.all([
        client.queryOne<{ id: string }>(
          "SELECT id FROM drawing_numbers WHERE company_id = :companyId AND drawing_number = :drawingNumber LIMIT 1",
          { companyId: root.companyId, drawingNumber }
        ),
        client.queryOne<{ id: string }>(
          "SELECT id FROM drawings WHERE company_id = :companyId AND drawing_number = :drawingNumber AND lifecycle_state <> 'cancelled' LIMIT 1",
          { companyId: root.companyId, drawingNumber }
        )
      ]);
      if (!formalConflict && !projectionConflict) break;
      sequenceNo = await this.allocateSequence(client, root.companyId, sequenceKey);
      sequenceCode = formatDrawingSequence(sequenceNo, input.ruleVersionId);
      drawingNumber = formatDrawingNumberForRule(root.rootCode, input.purposeCode, sequenceCode, input.ruleVersionId);
    }
    const id = this.idFactory();
    const now = this.clock();
    const existingPrimary = isManufacturingDrawingPurpose(input.purposeCode)
      ? await client.queryOne<CountRow>(
          `SELECT COUNT(*) AS count FROM drawing_numbers
           WHERE company_id = :companyId AND part_root_id = :partRootId
             AND purpose_code IN ('MA', 'M') AND is_primary_manufacturing = 1`,
          { companyId: root.companyId, partRootId: root.id }
        )
      : null;
    await client.execute(INSERT_ASYNC_DRAWING_NUMBER_SQL, {
      id,
      companyId: root.companyId,
      partRootId: root.id,
      drawingNumber,
      purposeCode: input.purposeCode,
      purposeDescription,
      sequenceNo,
      isPrimaryManufacturing: isManufacturingDrawingPurpose(input.purposeCode) && Number(existingPrimary?.count ?? 0) === 0 ? 1 : 0,
      recordStatus: input.recordStatus,
      ruleVersionId: input.ruleVersionId,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now
    });
    const row = await client.queryOne<DrawingNumberRow>(SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_IN_COMPANY_SQL, { drawingNumber, companyId: root.companyId });
    if (!row) throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${drawingNumber}`);
    const drawing = await new UnifiedDrawingAsyncRepository(client).synchronizeFormalDrawing({
      drawingNumberId: row.id,
      companyId: root.companyId
    });
    if (!drawing) throw new Error(`DRAWING_PROJECTION_NOT_FOUND: ${drawingNumber}`);
    const record = mapDrawingNumber(row);
    await this.ensureCanonicalDrawingWorkbenchState(client, record, input.createdBy, drawing.id);
    return record;
  }

  private async ensureCanonicalPartWorkbenchState(client: AsyncDatabaseClient, part: PartNumberRecord): Promise<void> {
    await client.execute(
      `INSERT INTO pdm_workbench_aggregates
         (id, company_id, entity_type, canonical_entity_id, open_branch_count, row_version)
       VALUES (:aggregateId, :companyId, 'part', :partId, 0, 1)
       ON CONFLICT DO NOTHING`,
      { aggregateId: this.idFactory(), companyId: part.companyId, partId: part.id }
    );
    await client.execute(
      `INSERT INTO canonical_workbench_states
         (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, work_id, handling, row_version)
       VALUES (:stateId, :companyId, 'part', :partId, 'part_formal', NULL, NULL, NULL, 'none', 1)
       ON CONFLICT DO NOTHING`,
      { stateId: this.idFactory(), companyId: part.companyId, partId: part.id }
    );
  }

  private async ensureCanonicalDrawingWorkbenchState(
    client: AsyncDatabaseClient,
    drawingNumber: DrawingNumberRecord,
    actorId?: string | null,
    knownDrawingId?: string
  ): Promise<void> {
    const drawing = knownDrawingId
      ? { id: knownDrawingId }
      : await client.queryOne<{ id: string }>(
          `SELECT id FROM drawings
           WHERE company_id = :companyId AND formal_drawing_number_id = :drawingNumberId
           LIMIT 1${client.kind === "postgres" ? " FOR UPDATE" : ""}`,
          { companyId: drawingNumber.companyId, drawingNumberId: drawingNumber.id }
        );
    if (!drawing) throw new Error(`DRAWING_PROJECTION_NOT_FOUND: ${drawingNumber.drawingNumber}`);

    const existingState = await client.queryOne<{ id: string }>(
      `SELECT id FROM canonical_workbench_states
       WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId
       LIMIT 1${client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { companyId: drawingNumber.companyId, drawingId: drawing.id }
    );
    if (existingState) return;
    if (!actorId) throw new Error("NUMBERING_ACTOR_REQUIRED_FOR_INITIAL_DRAWING_WORK");

    const aggregateId = this.idFactory();
    const branchId = this.idFactory();
    const claimId = this.idFactory();
    const revisionId = this.idFactory();
    const workId = this.idFactory();
    await client.execute(
      `INSERT INTO pdm_workbench_aggregates
         (id, company_id, entity_type, canonical_entity_id, open_branch_count, row_version)
       VALUES (:aggregateId, :companyId, 'drawing', :drawingId, 1, 1)
       ON CONFLICT DO NOTHING`,
      { aggregateId, companyId: drawingNumber.companyId, drawingId: drawing.id }
    );
    await client.execute(
      `UPDATE pdm_workbench_aggregates
       SET open_branch_count = 1, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId
         AND open_branch_count = 0`,
      { companyId: drawingNumber.companyId, drawingId: drawing.id }
    );
    await client.execute(
      `INSERT INTO drawing_rd_branches
         (id, company_id, drawing_id, base_production_revision_id, latest_approved_revision_id, status, row_version)
       VALUES (:branchId, :companyId, :drawingId, NULL, NULL, 'open', 1)`,
      { branchId, companyId: drawingNumber.companyId, drawingId: drawing.id }
    );
    await client.execute(
      `INSERT INTO drawing_revision_claims
         (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state)
       VALUES (:claimId, :companyId, :drawingId, :branchId, 0, 1, '0.1', NULL, 'work')`,
      { claimId, companyId: drawingNumber.companyId, drawingId: drawing.id, branchId }
    );
    await client.execute(
      `INSERT INTO drawing_revisions
         (id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json, row_version, created_by, updated_by)
       VALUES (:revisionId, :companyId, :drawingId, '0.1', 'preparing', '{}', 1, :actorId, :actorId)`,
      { revisionId, companyId: drawingNumber.companyId, drawingId: drawing.id, actorId }
    );
    await client.execute(
      `INSERT INTO drawing_revision_works
         (id, company_id, drawing_id, branch_id, target_claim_id, owner_user_id, proposed_payload, base_hash, row_version)
       VALUES (:workId, :companyId, :drawingId, :branchId, :claimId, :actorId, :payload, :baseHash, 1)`,
      {
        workId,
        companyId: drawingNumber.companyId,
        drawingId: drawing.id,
        branchId,
        claimId,
        actorId,
        payload: JSON.stringify({ recognitionNotes: "" }),
        baseHash: dev087RequestHash({ predecessorRevisionId: null })
      }
    );
    await client.execute(
      `INSERT INTO canonical_workbench_states
         (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, work_id, handling, row_version)
       VALUES (:stateId, :companyId, 'drawing', :drawingId, 'drawing_rd', :branchId, :revisionId, :workId, 'owner', 1)`,
      {
        stateId: this.idFactory(),
        companyId: drawingNumber.companyId,
        drawingId: drawing.id,
        branchId,
        revisionId,
        workId
      }
    );
  }

  private async linkDrawingToPart(
    client: AsyncDatabaseClient,
    input: { drawing: DrawingNumberRecord; part: PartNumberRecord; createdBy?: string | null }
  ): Promise<void> {
    await new RelationFormalAuthorityRepository(client).upsertPairInClient(client, {
      companyId: input.drawing.companyId,
      drawingNumberId: input.drawing.id,
      partNumberId: input.part.id,
      relationType: isManufacturingDrawingPurpose(input.drawing.purposeCode) ? "manufacturing_basis" : "reference",
      actorId: input.createdBy ?? null
    });
  }

  private async getNumberingRootBundleInClient(
    client: AsyncDatabaseClient,
    rootCode: string,
    companyId = DEFAULT_COMPANY_ID
  ): Promise<NumberingRootBundleRecord | null> {
    const rootRow = await client.queryOne<PartRootRow>(SELECT_ASYNC_PART_ROOT_BY_CODE_IN_COMPANY_SQL, { rootCode, companyId });
    if (!rootRow) return null;
    const [partRows, drawingRows] = await Promise.all([
      client.query<PartNumberRow>(SELECT_ASYNC_ROOT_PART_NUMBERS_SQL, { rootId: rootRow.id }),
      client.query<DrawingNumberRow>(SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL, { rootId: rootRow.id })
    ]);
    return {
      root: mapPartRoot(rootRow),
      partNumbers: partRows.map(mapPartNumber),
      drawingNumbers: drawingRows.map(mapDrawingNumber)
    };
  }

  private async insertAudit(
    client: AsyncDatabaseClient,
    input: { actorId?: string | null; action: string; detail: Record<string, unknown> }
  ): Promise<void> {
    await client.execute(INSERT_ASYNC_NUMBERING_AUDIT_SQL, {
      id: this.idFactory(),
      actorId: input.actorId ?? null,
      action: input.action,
      detailJson: JSON.stringify(normalizeAuditDetail(input.detail)),
      createdAt: this.clock()
    });
  }
}

