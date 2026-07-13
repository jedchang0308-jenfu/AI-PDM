import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import type { SqliteDatabase } from "@/lib/db-provider";
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
  rootCodeToV3Ordinal,
  type DrawingPurposeCode
} from "@/lib/numbering-identity";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { normalizeProductSeries, productSeriesOptionsFromCoreNames } from "@/lib/numbering-product-series";

export type NumberingItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
export type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
export type NumberingRecordStatus =
  | "Draft"
  | "NeedInfo"
  | "Active"
  | "PendingReview"
  | "Released"
  | "Rejected"
  | "Obsolete"
  | "Merged"
  | "EVTDisabled"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";
export type { DrawingPurposeCode } from "@/lib/numbering-identity";

export type PartRootRecord = {
  id: string;
  companyId: string;
  rootCode: string;
  coreName: string;
  itemKind: NumberingItemKind;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
};

export type PartNumberRecord = {
  id: string;
  companyId: string;
  partRootId: string;
  partNumber: string;
  sequenceNo: number;
  sequenceCode: string;
  partName: string;
  itemKind: NumberingItemKind;
  isUniversal: boolean;
  customSpecification: string | null;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  universalReason: string | null;
  ruleVersionId: string;
};

export type DrawingNumberRecord = {
  id: string;
  companyId: string;
  partRootId: string;
  drawingNumber: string;
  purposeCode: DrawingPurposeCode;
  purposeDescription: string;
  sequenceNo: number;
  isPrimaryManufacturing: boolean;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
};

export type DrawingModuleLinkedPartRecord = {
  id: string;
  partNumber: string;
  partName: string;
  recordStatus: NumberingRecordStatus;
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
  primaryDrawingNumber: string | null;
  standardCostStatus: "active" | "missing";
  standardCostProfileName: string | null;
  standardCostType: PartCostType | null;
};

export type DrawingModuleReleaseStatusMismatch = {
  submissionId: string;
  revision: string;
  releasedAt: string | null;
};

export type DrawingModulePendingApprovalSummary = {
  count: number;
  revisions: string[];
  latestRequestedAt: string | null;
  latestRequestId: string | null;
  workbenchHref: string;
};

export type DrawingModuleListRecord = DrawingNumberRecord & {
  rootCode: string;
  coreName: string;
  itemKind: NumberingItemKind;
  linkedPartCount: number;
  linkedPartNumbers: string[];
  sameRootParts: DrawingModuleLinkedPartRecord[];
  titleBlockVariantWarning: boolean;
  warningCount: number;
  releaseStatusMismatch: DrawingModuleReleaseStatusMismatch | null;
  pendingApproval?: DrawingModulePendingApprovalSummary | null;
  updatedAt: string;
};

export type DrawingModuleListInput = {
  companyId?: string;
  query?: string;
  productSeries?: string;
  recordStatus?: NumberingRecordStatus;
  developmentPhase?: NumberingPhase;
  purposeCode?: DrawingPurposeCode;
  limit?: number;
};

export type NumberingSearchEntityType = "all" | "part_root" | "part_number" | "drawing_number";

export type NumberingSearchInput = {
  companyId?: string;
  query?: string;
  productSeries?: string;
  entityType?: NumberingSearchEntityType;
  recordStatus?: NumberingRecordStatus;
  developmentPhase?: NumberingPhase;
  limit?: number;
};

export type NumberingSearchResultRecord = {
  entityType: Exclude<NumberingSearchEntityType, "all">;
  entityId: string;
  rootCode: string;
  coreName: string;
  displayCode: string;
  displayName: string;
  itemKind: NumberingItemKind;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  purposeCode: DrawingPurposeCode | null;
  partNumber: string | null;
  drawingNumber: string | null;
  primaryDrawingNumber: string | null;
  partCount: number;
  drawingCount: number;
  linkedPartCount: number;
  warningCount: number;
};

export type NumberingLinkRecord = {
  id: string;
  drawingNumberId: string;
  partNumberId: string;
  drawingNumber: string;
  partNumber: string;
  linkType: "primary_manufacturing" | "reference";
  createdAt: string;
};

export type NumberingVariantRecord = {
  id: string;
  drawingNumberId: string;
  partNumberId: string;
  drawingNumber: string;
  partNumber: string;
  fieldName: string;
  fieldValue: string;
  createdAt: string;
};

export type NumberingWarningRecord = {
  id: string;
  warningCode: string;
  severity: "info" | "warning" | "blocker";
  entityType: string;
  entityId: string | null;
  title: string;
  message: string;
  detail: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt: string | null;
};

export type NumberingAuditTrailRecord = {
  id: string;
  action: string;
  actorId: string | null;
  detail: Record<string, unknown>;
  before: unknown;
  after: unknown;
  diff: unknown;
  markers: NumberingAttentionMarkerRecord[];
  createdAt: string;
};

export type NumberingRootDetailRecord = {
  root: PartRootRecord;
  partNumbers: PartNumberRecord[];
  drawingNumbers: DrawingNumberRecord[];
  links: NumberingLinkRecord[];
  variants: NumberingVariantRecord[];
  warnings: NumberingWarningRecord[];
  auditTrail: NumberingAuditTrailRecord[];
  summary: {
    partCount: number;
    drawingCount: number;
    primaryManufacturingCount: number;
    warningCount: number;
    hasMainDrawingInvalid: boolean;
  };
};

export type PartCostType = "outsourced" | "in_house" | "purchase" | "trial" | "other";
export type PartCostProfileStatus = "draft" | "pending_review" | "approved" | "rejected" | "retired";
export type PartCostChangeRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type PartVariantAttributesRecord = {
  id: string;
  partNumberId: string;
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
  updatedAt: string;
};

export type PartCostTierRecord = {
  id: string;
  costProfileId: string;
  minQty: number;
  maxQty: number | null;
  unitCost: number;
  setupCost: number;
  leadTimeDays: number | null;
  note: string | null;
};

export type PartCostProfileRecord = {
  id: string;
  partNumberId: string;
  costType: PartCostType;
  profileName: string;
  currency: string;
  uom: string;
  supplierName: string | null;
  processName: string | null;
  costBasis: string | null;
  status: PartCostProfileStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  tiers: PartCostTierRecord[];
};

export type PartStandardCostRecord = {
  id: string;
  partNumberId: string;
  costProfileId: string;
  basisQty: number;
  standardReason: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  profileName: string;
  costType: PartCostType;
  currency: string;
  uom: string;
  unitCost: number | null;
};

export type PartCostChangeRequestRecord = {
  id: string;
  partNumberId: string;
  proposedCostProfileId: string | null;
  requestType: "set_standard" | "update_profile" | "retire_profile";
  changeReason: string;
  reviewStatus: PartCostChangeRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewComment: string | null;
};

export type PartCostResolutionRecord = {
  profileId: string;
  partNumberId: string;
  costType: PartCostType;
  profileName: string;
  currency: string;
  uom: string;
  quantity: number;
  unitCost: number;
  setupCost: number;
  extendedCost: number;
  tier: PartCostTierRecord;
};

export type PartModuleListRecord = PartNumberRecord & {
  rootCode: string;
  coreName: string;
  variant: PartVariantAttributesRecord | null;
  primaryDrawingNumber: string | null;
  drawingCount: number;
  standardCost: PartStandardCostRecord | null;
  pendingCostRequestCount: number;
};

export type PartModuleListInput = {
  companyId?: string;
  query?: string;
  productSeries?: string;
  recordStatus?: NumberingRecordStatus;
  developmentPhase?: NumberingPhase;
  limit?: number;
};

export type PartModuleDetailRecord = PartModuleListRecord & {
  linkedDrawings: NumberingLinkRecord[];
  sameDrawingVariants: NumberingVariantRecord[];
  costProfiles: PartCostProfileRecord[];
  costChangeRequests: PartCostChangeRequestRecord[];
};

export type UpsertPartVariantAttributesInput = {
  companyId?: string;
  partNumber: string;
  materialCode?: string | null;
  materialLabel?: string | null;
  colorCode?: string | null;
  colorLabel?: string | null;
  surfaceTreatment?: string | null;
  variantNote?: string | null;
  updatedBy?: string | null;
};

export type CreatePartCostProfileInput = {
  companyId?: string;
  partNumber: string;
  costType: PartCostType;
  profileName: string;
  currency?: string;
  uom?: string;
  supplierName?: string | null;
  processName?: string | null;
  costBasis?: string | null;
  status?: PartCostProfileStatus;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  createdBy?: string | null;
  tiers: Array<{
    minQty?: number;
    maxQty?: number | null;
    unitCost: number;
    setupCost?: number;
    leadTimeDays?: number | null;
    note?: string | null;
  }>;
};

export type DecidePartCostChangeRequestInput = {
  companyId?: string;
  partNumber: string;
  requestId: string;
  decision: "approve" | "reject";
  reviewedBy?: string | null;
  reviewComment?: string | null;
  basisQty?: number;
};

export type ResolvePartCostInput = {
  companyId?: string;
  partNumber: string;
  quantity?: number;
  costType?: PartCostType;
  asOf?: string | null;
};

export type CreateNumberingRecordInput = {
  companyId?: string;
  coreName: string;
  partName?: string;
  itemKind: NumberingItemKind;
  developmentPhase?: NumberingPhase;
  recordStatus?: NumberingRecordStatus;
  isUniversal?: boolean;
  universalReason?: string;
  customSpecification?: string;
  drawingPurposeCode?: DrawingPurposeCode;
  drawingPurposeDescription?: string;
  createdBy?: string | null;
  ruleVersionId?: string;
  idempotencyKey?: string;
};

export type AddPartNumberInput = {
  companyId?: string;
  rootCode: string;
  partName?: string;
  itemKind?: NumberingItemKind;
  developmentPhase?: NumberingPhase;
  recordStatus?: NumberingRecordStatus;
  isUniversal?: boolean;
  universalReason?: string;
  customSpecification?: string;
  createdBy?: string | null;
  ruleVersionId?: string;
  sourceEntrypoint?: string;
  reason?: string;
  idempotencyKey?: string;
  linkDrawingNumber?: string;
  linkRelationType?: "auto" | "primary_manufacturing" | "reference" | "none";
};

export type AddDrawingNumberInput = {
  companyId?: string;
  rootCode: string;
  purposeCode: DrawingPurposeCode;
  purposeDescription?: string;
  developmentPhase?: NumberingPhase;
  recordStatus?: NumberingRecordStatus;
  createdBy?: string | null;
  ruleVersionId?: string;
  sourceEntrypoint?: string;
  reason?: string;
  idempotencyKey?: string;
  linkPartNumber?: string;
  linkRelationType?: "auto" | "primary_manufacturing" | "reference" | "none";
};

export type AddDrawingAndPartToRootInput = {
  companyId?: string;
  rootCode: string;
  purposeCode: DrawingPurposeCode;
  purposeDescription?: string;
  partName?: string;
  itemKind?: NumberingItemKind;
  developmentPhase?: NumberingPhase;
  recordStatus?: NumberingRecordStatus;
  isUniversal?: boolean;
  universalReason?: string;
  customSpecification?: string;
  createdBy?: string | null;
  ruleVersionId?: string;
  sourceEntrypoint?: string;
  reason?: string;
  idempotencyKey?: string;
  linkRelationType?: "auto" | "primary_manufacturing" | "reference";
};

export type AddPartNumberToRootResult = {
  root: PartRootRecord;
  partNumber: PartNumberRecord;
  linkedDrawing: DrawingNumberRecord | null;
  linkType: "primary_manufacturing" | "reference" | null;
  reusedFromIdempotency: boolean;
};

export type AddDrawingNumberToRootResult = {
  root: PartRootRecord;
  drawingNumber: DrawingNumberRecord;
  linkedPart: PartNumberRecord | null;
  linkType: "primary_manufacturing" | "reference" | null;
  reusedFromIdempotency: boolean;
};

export type AddDrawingAndPartToRootResult = {
  root: PartRootRecord;
  drawingNumber: DrawingNumberRecord;
  partNumber: PartNumberRecord;
  linkType: "primary_manufacturing" | "reference";
  reusedFromIdempotency: boolean;
};

export type UpdateDraftNumberingRecordInput = {
  companyId?: string;
  rootCode: string;
  coreName?: string;
  partNumber?: string;
  customSpecification?: string;
  universalReason?: string;
  drawingNumber?: string;
  drawingPurposeDescription?: string;
  updatedBy?: string | null;
};

export type ObsoleteDraftNumberingRecordInput = {
  companyId?: string;
  rootCode: string;
  reason: string;
  obsoletedBy?: string | null;
};

export type DeleteDraftNumberingRecordInput = {
  companyId?: string;
  rootCode: string;
  reason?: string;
  deletedBy?: string | null;
};

export type DeleteDraftNumberingRecordResult = {
  rootCode: string;
  deletedRoot: PartRootRecord;
  deletedPartNumbers: PartNumberRecord[];
  deletedDrawingNumbers: DrawingNumberRecord[];
  affectedFileAssets: number;
};

export type MarkOverdueDraftNumberingInput = {
  olderThanDays?: number;
  actorId?: string | null;
  now?: string;
};

export type MarkOverdueDraftNumberingResult = {
  cutoffAt: string;
  updatedRootCodes: string[];
  updatedCount: number;
};

export type SameDrawingVariantField = {
  fieldName: string;
  fieldValue: string;
};

export type LinkPartNumberToDrawingInput = {
  companyId?: string;
  drawingNumber: string;
  partNumber: string;
  variants?: SameDrawingVariantField[] | Record<string, string>;
  createdBy?: string | null;
};

export type MaintainDrawingPartRelationOperation = "link" | "set_primary" | "set_reference" | "remove";

export type MaintainDrawingPartRelationInput = {
  companyId?: string;
  drawingNumber: string;
  partNumber: string;
  operation: MaintainDrawingPartRelationOperation;
  actorId?: string | null;
};

export type MaintainDrawingPartRelationResult = {
  operation: MaintainDrawingPartRelationOperation;
  drawingNumber: DrawingNumberRecord;
  partNumber: PartNumberRecord;
  before: NumberingLinkRecord[];
  after: NumberingLinkRecord[];
  changed: boolean;
};

export type NumberingGate = "DVT" | "Release";

export type NumberingGateIssue = {
  code: string;
  severity: "warning" | "blocker";
  message: string;
  entityType: "part_number" | "drawing_number";
  entityId: string;
};

export type NumberingGateEvaluation = {
  partNumber: PartNumberRecord;
  gate: NumberingGate;
  allowed: boolean;
  requiresApproval: boolean;
  requiresOverride: boolean;
  approvalActionCode: NumberingApprovalActionCode | null;
  issues: NumberingGateIssue[];
  primaryManufacturingDrawing: DrawingNumberRecord | null;
};

export type EvaluateNumberingGateInput = {
  companyId?: string;
  partNumber: string;
  gate: NumberingGate;
  allowMainDrawingOverride?: boolean;
};

export type DvtPromotionCandidateStatus = "ready" | "needs_override" | "blocked";
export type DvtPromotionDecisionAction = "submit_dvt" | "keep_evt" | "disable_evt" | "obsolete";

export type DvtPromotionCandidateRecord = {
  root: PartRootRecord;
  partNumber: PartNumberRecord;
  drawingNumbers: DrawingNumberRecord[];
  gate: NumberingGateEvaluation;
  status: DvtPromotionCandidateStatus;
  recommendedAction: DvtPromotionDecisionAction;
  missingItems: string[];
};

export type ListDvtPromotionCandidatesInput = {
  companyId?: string;
  limit?: number;
  includeBlocked?: boolean;
};

export type SubmitDvtPromotionDecision = {
  partNumber: string;
  action: DvtPromotionDecisionAction;
  reason?: string;
};

export type SubmitDvtPromotionInput = {
  companyId?: string;
  decisions: SubmitDvtPromotionDecision[];
  projectCode?: string;
  submittedBy: string;
};

export type DvtPromotionDecisionResult = {
  partNumber: string;
  action: DvtPromotionDecisionAction;
  status: "submitted" | "kept" | "disabled" | "obsolete" | "skipped";
  message: string;
  approvalRequestId: string | null;
};

export type DvtPromotionSubmissionRecord = {
  approvalBatch: NumberingApprovalBatchRecord | null;
  approvalRequests: NumberingApprovalRecord[];
  decisions: DvtPromotionDecisionResult[];
};

export type EvaluateApprovalRuleInput = {
  actionCode: string;
  phase?: NumberingPhase;
  recordStatus?: NumberingRecordStatus;
  itemKind?: NumberingItemKind;
  riskFlags?: string[];
  ruleVersionId?: string;
};

export type MatchedApprovalRule = {
  id: string;
  ruleName: string;
  actionCode: string;
  phase: string | null;
  recordStatus: string | null;
  itemKind: string | null;
  riskFlag: string | null;
  requiresApproval: boolean;
  approverRole: string | null;
  blocksUsage: boolean;
  blocksRelease: boolean;
  showsWarning: boolean;
  exportMarker: boolean;
};

export type ApprovalHardRule = {
  code: string;
  message: string;
  requiresApproval: boolean;
  blocksUsage: boolean;
  blocksRelease: boolean;
  showsWarning: boolean;
  exportMarker: boolean;
};

export type ApprovalRuleEvaluation = {
  actionCode: string;
  ruleVersionId: string;
  requiresApproval: boolean;
  blocksUsage: boolean;
  blocksRelease: boolean;
  showsWarning: boolean;
  exportMarker: boolean;
  requiredRoles: string[];
  warnings: string[];
  blockers: string[];
  matchedRules: MatchedApprovalRule[];
  hardRules: ApprovalHardRule[];
};

export type NumberingAdminRoleRecord = {
  id: string;
  roleCode: string;
  title: string;
  systemDefined: boolean;
};

export type NumberingAdminUserRecord = {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
};

export type NumberingAdminPermissionRecord = {
  id: string;
  roleId: string;
  permissionKind: "page" | "action";
  permissionCode: string;
  allowed: boolean;
};

export type NumberingRoleScopeKind = "department" | "project" | "action";

export type NumberingAdminRoleScopeRecord = {
  id: string;
  roleId: string;
  scopeKind: NumberingRoleScopeKind;
  scopeCode: string;
  allowed: boolean;
};

export type NumberingRolePriorityVersionRecord = {
  id: string;
  versionCode: string;
  priority: string[];
  status: "draft" | "active" | "retired";
  createdBy: string | null;
  createdAt: string;
};

export type NumberingApprovalDelegationRecord = {
  id: string;
  delegatedFrom: string;
  delegatedFromName: string;
  delegatedFromRole: string;
  delegatedTo: string;
  delegatedToName: string;
  delegatedToRole: string;
  projectCode: string | null;
  actionCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
};

export type NumberingUserRoleAssignmentRecord = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userSystemRole: string;
  roleId: string;
  roleCode: string;
  roleTitle: string;
  reason: string;
  scopeTemplate: string;
  namedScope: string;
  sponsorUserId: string | null;
  startsAt: string | null;
  reviewDueAt: string | null;
  hardEndsAt: string | null;
  assignedBy: string;
  assignedAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
};

export type NumberingAdminAuditEventRecord = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type NumberingAdminApprovalRuleRecord = MatchedApprovalRule & {
  ruleVersionId: string;
};

export type NumberingApprovalHardRuleCatalogItem = ApprovalHardRule & {
  editable: false;
};

export type NumberingAdminRuleTemplateRecord = {
  id: string;
  templateCode: string;
  title: string;
  description: string;
  systemDefined: boolean;
};

export type NumberingRuleVersionRecord = {
  id: string;
  ruleCode: string;
  title: string;
  status: "draft" | "active" | "retired";
  effectiveAt: string;
  retiredAt: string | null;
};

export type NumberingAdminMatrixRecord = {
  ruleVersionId: string;
  roles: NumberingAdminRoleRecord[];
  users: NumberingAdminUserRecord[];
  rolePermissions: NumberingAdminPermissionRecord[];
  roleScopes: NumberingAdminRoleScopeRecord[];
  rolePriorityVersions: NumberingRolePriorityVersionRecord[];
  activeRolePriority: string[];
  roleAssignments: NumberingUserRoleAssignmentRecord[];
  approvalDelegations: NumberingApprovalDelegationRecord[];
  auditEvents: NumberingAdminAuditEventRecord[];
  approvalRules: NumberingAdminApprovalRuleRecord[];
  hardRules: NumberingApprovalHardRuleCatalogItem[];
  ruleTemplates: NumberingAdminRuleTemplateRecord[];
  ruleVersions: NumberingRuleVersionRecord[];
  options: {
    actionCodes: string[];
    pagePermissionCodes: string[];
    phases: string[];
    recordStatuses: string[];
    itemKinds: string[];
    riskFlags: string[];
  };
};

export type UpsertNumberingApprovalRuleInput = {
  id?: string;
  ruleVersionId?: string;
  ruleName?: string;
  actionCode: string;
  phase?: string | null;
  recordStatus?: string | null;
  itemKind?: string | null;
  riskFlag?: string | null;
  requiresApproval?: boolean;
  approverRole?: string | null;
  blocksUsage?: boolean;
  blocksRelease?: boolean;
  showsWarning?: boolean;
  exportMarker?: boolean;
  actorId?: string | null;
};

export type ApplyNumberingRuleTemplateInput = {
  templateCode: "rd_efficiency" | "standard_control" | "strict_control";
  actorId?: string | null;
};

export type UpsertNumberingAdminRoleInput = {
  id?: string;
  roleCode: string;
  title: string;
  actorId?: string | null;
};

export type UpsertNumberingRolePermissionInput = {
  roleId?: string;
  roleCode?: string;
  permissionKind: "page" | "action";
  permissionCode: string;
  allowed: boolean;
  actorId?: string | null;
};

export type UpsertNumberingRoleScopeInput = {
  roleId?: string;
  roleCode?: string;
  scopeKind: NumberingRoleScopeKind;
  scopeCode: string;
  allowed: boolean;
  actorId?: string | null;
};

export type SaveNumberingRolePriorityInput = {
  priority: string[];
  reason: string;
  actorId?: string | null;
};

export type UpsertNumberingApprovalDelegationInput = {
  id?: string;
  delegatedFrom: string;
  delegatedTo: string;
  projectCode?: string | null;
  actionCode?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  reason: string;
  actorId: string;
};

export type RevokeNumberingApprovalDelegationInput = {
  id: string;
  actorId: string;
  reason?: string | null;
};

export type UpsertNumberingUserRoleAssignmentInput = {
  id?: string;
  userId: string;
  roleId?: string;
  roleCode?: string;
  reason: string;
  scopeTemplate?: string;
  namedScope?: string | null;
  sponsorUserId?: string | null;
  startsAt?: string | null;
  reviewDueAt?: string | null;
  hardEndsAt?: string | null;
  actorId: string;
};

export type RevokeNumberingUserRoleAssignmentInput = {
  id: string;
  actorId: string;
  reason?: string | null;
};

export type MainDrawingImpactInput = {
  companyId?: string;
  drawingNumber: string;
  reason?: string;
  applyInvalidation?: boolean;
  createdBy?: string | null;
};

export type MainDrawingImpactAnalysis = {
  drawingNumber: DrawingNumberRecord;
  applied: boolean;
  impactedPartNumbers: PartNumberRecord[];
  requiredDocuments: string[];
  warnings: string[];
};

export type DuplicateCheckInput = {
  companyId?: string;
  rootCode?: string;
  coreName?: string;
  partNumber?: string;
  partName?: string;
  drawingNumber?: string;
  createdBy?: string | null;
};

export type DuplicateCheckMatch = {
  entityType: "part_root" | "part_number" | "drawing_number";
  entityId: string;
  displayCode: string;
  displayName: string;
  recordStatus: NumberingRecordStatus;
  score: number;
  reason: "exact_code" | "exact_name" | "high_similarity";
  severity: "warning" | "blocker";
};

export type DuplicateCheckResult = {
  blocked: boolean;
  warningsOnly: boolean;
  matches: DuplicateCheckMatch[];
  warningEventId: string | null;
};

export type NumberingApprovalActionCode =
  | "dvt_promotion"
  | "release"
  | "same_drawing_variant_after_release"
  | "dvt_missing_ma_override"
  | "release_missing_ma_confirm"
  | "main_drawing_restore"
  | "obsolete_part_number"
  | "obsolete_ma_drawing"
  | "obsolete_part_root";

export type NumberingApprovalStatus = "pending" | "approved" | "rejected" | "needs_info" | "cancelled";
export type NumberingApprovalBatchStatus = "pending" | "partially_approved" | "approved" | "rejected" | "needs_info" | "cancelled";
export type NumberingApprovalBatchItemStatus = "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "resubmitted";

export type NumberingApprovalRecord = {
  id: string;
  actionCode: NumberingApprovalActionCode;
  entityType: "part_root" | "part_number" | "drawing_number" | "same_drawing_variant";
  entityId: string;
  requestStatus: NumberingApprovalStatus;
  reason: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedAt: string;
};

export type NumberingApprovalDecisionRecord = {
  id: string;
  approvalRequestId: string;
  approverRole: string;
  approverId: string;
  approverName: string;
  approverUserRole: string;
  isDelegatedApproval: boolean;
  decision: "approved" | "rejected" | "needs_info";
  comment: string | null;
  decidedAt: string;
};

export type NumberingAttentionMarkerCode = "proxy_submission" | "delegated_review" | "override" | "impact_scope";

export type NumberingAttentionMarkerRecord = {
  code: NumberingAttentionMarkerCode;
  label: string;
  detail: string | null;
  severity: "info" | "warning" | "critical";
};

export type NumberingApprovalEntitySummaryRecord = {
  entityType: NumberingApprovalRecord["entityType"];
  entityId: string;
  label: string;
  secondary: string;
  rootCode: string | null;
  partNumber: string | null;
  drawingNumber: string | null;
  partName: string | null;
  coreName: string | null;
  itemKind: NumberingItemKind | null;
  developmentPhase: NumberingPhase | null;
  recordStatus: NumberingRecordStatus | null;
};

export type RequestNumberingApprovalInput = {
  companyId?: string;
  actionCode: NumberingApprovalActionCode;
  entityType: NumberingApprovalRecord["entityType"];
  entityId: string;
  reason: string;
  payload?: Record<string, unknown>;
  requestedBy: string;
};

export type RequestSameDrawingVariantApprovalInput = LinkPartNumberToDrawingInput & {
  reason: string;
  requestedBy: string;
};

export type RequestMainDrawingRestoreApprovalInput = {
  companyId?: string;
  partNumber: string;
  replacementDrawingNumber?: string;
  reason: string;
  requestedBy: string;
};

export type RequestNumberingObsoleteApprovalInput = {
  companyId?: string;
  entityType: "part_number" | "drawing_number";
  entityId?: string;
  entityCode?: string;
  reason: string;
  requestedBy: string;
  projectCode?: string;
};

export type NumberingObsoleteApprovalResult = {
  approvalRequest: NumberingApprovalRecord;
  approvalBatch: NumberingApprovalBatchRecord;
  entity: {
    entityType: "part_number" | "drawing_number";
    entityId: string;
    entityCode: string;
    recordStatus: NumberingRecordStatus;
    actionCode: Extract<NumberingApprovalActionCode, "obsolete_part_number" | "obsolete_ma_drawing">;
  };
};

export type RootObsoleteImpactTarget = {
  entityType: "part_number" | "drawing_number";
  entityId: string;
  entityCode: string;
  recordStatus: NumberingRecordStatus;
  developmentPhase: NumberingPhase;
};

export type RootObsoleteImpactLink = {
  drawingNumber: string;
  partNumber: string;
  linkType: "primary_manufacturing" | "reference";
};

export type RootObsoleteImpactResult = {
  root: PartRootRecord;
  parts: PartNumberRecord[];
  drawings: DrawingNumberRecord[];
  links: RootObsoleteImpactLink[];
  formalTargets: RootObsoleteImpactTarget[];
  warnings: string[];
  pendingRequestId: string | null;
};

export type RequestRootObsoleteApprovalInput = {
  companyId?: string;
  rootCode?: string;
  rootId?: string;
  reason: string;
  requestedBy: string;
  projectCode?: string;
};

export type RootObsoleteApprovalResult = {
  approvalRequest: NumberingApprovalRecord;
  approvalBatch: NumberingApprovalBatchRecord;
  impact: RootObsoleteImpactResult;
};

export type DecideNumberingApprovalInput = {
  companyId?: string;
  approvalRequestId: string;
  decision: "approved" | "rejected" | "needs_info";
  comment?: string;
  approverRole: string;
  approverId: string;
};

export type NumberingApprovalBatchItemRecord = {
  id: string;
  batchId: string;
  approvalRequestId: string;
  itemStatus: NumberingApprovalBatchItemStatus;
  resubmittedFromItemId: string | null;
};

export type NumberingApprovalBatchRecord = {
  id: string;
  batchCode: string;
  projectCode: string | null;
  actionCode: string | null;
  batchStatus: NumberingApprovalBatchStatus;
  submittedBy: string;
  submittedAt: string;
  items: NumberingApprovalBatchItemRecord[];
};

export type NumberingApprovalReviewRequestRecord = NumberingApprovalRecord & {
  requestedByName: string;
  requestedByRole: string;
  isProxySubmission: boolean;
  proxyReason: string | null;
  markers: NumberingAttentionMarkerRecord[];
  entitySummary: NumberingApprovalEntitySummaryRecord;
  decisions: NumberingApprovalDecisionRecord[];
};

export type NumberingApprovalReviewBatchItemRecord = NumberingApprovalBatchItemRecord & {
  request: NumberingApprovalReviewRequestRecord;
};

export type NumberingApprovalReviewBatchRecord = Omit<NumberingApprovalBatchRecord, "items"> & {
  submittedByName: string;
  submittedByRole: string;
  markers: NumberingAttentionMarkerRecord[];
  itemCounts: Record<NumberingApprovalBatchItemStatus, number>;
  items: NumberingApprovalReviewBatchItemRecord[];
};

export type ListNumberingApprovalBatchesInput = {
  companyId?: string;
  status?: NumberingApprovalBatchStatus | "active" | "all";
  actionCodes?: NumberingApprovalActionCode[];
  limit?: number;
  user?: NumberingUserScope;
};

export type CreateNumberingApprovalBatchInput = {
  companyId?: string;
  approvalRequestIds: string[];
  projectCode?: string;
  actionCode?: string;
  submittedBy: string;
};

export type DecideNumberingApprovalBatchInput = {
  companyId?: string;
  batchId: string;
  approvalRequestIds?: string[];
  decision: "approved" | "rejected" | "needs_info";
  comment?: string;
  itemComments?: Record<string, string>;
  approverRole: string;
  approverId: string;
};

export type ResubmitRejectedNumberingApprovalBatchItemsInput = {
  companyId?: string;
  batchId: string;
  approvalRequestIds?: string[];
  reason: string;
  requestedBy: string;
};

export type NumberingTaskStatus = "open" | "handled" | "cancelled";
export type NumberingNotificationReadFilter = "all" | "read" | "unread";
export type NumberingNotificationHandledFilter = "all" | "handled" | "unhandled";

export type NumberingTaskRecord = {
  id: string;
  companyId: string;
  taskType: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  riskLevel: "info" | "warning" | "critical";
  taskStatus: NumberingTaskStatus;
  assignedTo: string | null;
  assignedRole: string | null;
  projectCode: string | null;
  actionUrl: string | null;
  detail: Record<string, unknown>;
  markers: NumberingAttentionMarkerRecord[];
  createdAt: string;
  handledAt: string | null;
};

export type NumberingNotificationRecord = {
  id: string;
  companyId: string;
  notificationType: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  recipientId: string | null;
  recipientRole: string | null;
  readAt: string | null;
  handledAt: string | null;
  dismissible: boolean;
  actionUrl: string | null;
  detail: Record<string, unknown>;
  markers: NumberingAttentionMarkerRecord[];
  createdAt: string;
};

export type NumberingUserScope = {
  id: string;
  role: string;
};

export type NumberingPermissionKind = "page" | "action";

export type CheckNumberingPermissionInput = {
  user: NumberingUserScope;
  permissionKind: NumberingPermissionKind;
  permissionCode: string;
  projectCode?: string | null;
  actionCode?: string | null;
};

export type NumberingPermissionCheckResult = {
  allowed: boolean;
  permissionKind: NumberingPermissionKind;
  permissionCode: string;
  roleCode: string | null;
  evaluatedRoles: string[];
  reason: "explicit" | "system_admin_default" | "no_candidate_role" | "missing_permission";
};

export type ListNumberingTasksInput = {
  companyId?: string;
  user: NumberingUserScope;
  status?: NumberingTaskStatus | "all";
};

export type ListNumberingNotificationsInput = {
  companyId?: string;
  user: NumberingUserScope;
  read?: NumberingNotificationReadFilter;
  handled?: NumberingNotificationHandledFilter;
};

export type UpdateNumberingTaskStatusInput = {
  companyId?: string;
  taskId: string;
  status: NumberingTaskStatus;
  handledBy: string;
};

export type UpdateNumberingNotificationStateInput = {
  companyId?: string;
  notificationId: string;
  user: NumberingUserScope;
  markRead?: boolean;
  markHandled?: boolean;
};

export type NumberingImportRowInput = Record<string, unknown>;

export type NumberingImportBatchRecord = {
  id: string;
  sourceFilename: string;
  sourceHash: string | null;
  status: "staged" | "confirmed" | "rejected";
  summary: Record<string, unknown>;
  importedBy: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  rows: NumberingImportStagingRowRecord[];
};

export type NumberingImportStagingRowRecord = {
  id: string;
  importBatchId: string;
  rowNo: number;
  raw: Record<string, unknown>;
  checkStatus: "pending" | "valid" | "need_info" | "admin_confirm" | "conflict" | "legacy_keep";
  issues: Array<{ code: string; message: string }>;
};

export type CreateNumberingImportBatchInput = {
  companyId?: string;
  sourceFilename: string;
  sourceHash?: string | null;
  rows: NumberingImportRowInput[];
  importedBy: string;
};

export type ListNumberingImportBatchesInput = {
  companyId?: string;
  status?: "all" | NumberingImportBatchRecord["status"];
  limit?: number;
};

export type ConfirmNumberingImportBatchInput = {
  companyId?: string;
  batchId: string;
  confirmedBy: string;
};

export type DeleteNumberingImportBatchInput = {
  companyId?: string;
  batchId: string;
  deletedBy: string;
};

export type RestoreNumberingImportBatchInput = {
  companyId?: string;
  batchId: string;
  restoredBy: string;
};

export type NumberingExportMode = "no_audit" | "last_change_summary" | "full_change_summary";

export type NumberingExportJobRecord = {
  id: string;
  exportMode: NumberingExportMode;
  status: "queued" | "running" | "completed" | "failed";
  result: Record<string, unknown>;
  generatedBy: string | null;
  generatedAt: string;
  completedAt: string | null;
};

export type CreateNumberingExportJobInput = {
  companyId?: string;
  exportMode: NumberingExportMode;
  generatedBy: string;
};

export type ListNumberingExportJobsInput = {
  companyId?: string;
  limit?: number;
};

export type MonthlyAuditReportRecord = {
  id: string;
  reportType: string;
  reportMonth: string;
  generationMode: "auto" | "manual";
  generatedBy: string | null;
  status: "queued" | "running" | "completed" | "failed";
  query: Record<string, unknown>;
  createdAt: string;
};

export type GenerateMonthlyNumberingAuditReportInput = {
  companyId?: string;
  reportMonth?: string;
  generationMode?: "auto" | "manual";
  generatedBy?: string | null;
};

export type ListMonthlyNumberingAuditReportsInput = {
  companyId?: string;
  reportMonth?: string;
  limit?: number;
};

type PartRootRow = {
  id: string;
  company_id?: string;
  root_code: string;
  core_name: string;
  item_kind: NumberingItemKind;
  development_phase: NumberingPhase;
  record_status: NumberingRecordStatus;
  rule_version_id: string;
};

type PartNumberRow = {
  id: string;
  company_id?: string;
  part_root_id: string;
  part_number: string;
  sequence_no: number;
  sequence_code: string;
  part_name: string;
  item_kind: NumberingItemKind;
  is_universal: number;
  custom_specification: string | null;
  development_phase: NumberingPhase;
  record_status: NumberingRecordStatus;
  universal_reason: string | null;
  rule_version_id: string;
};

type DrawingNumberRow = {
  id: string;
  company_id?: string;
  part_root_id: string;
  drawing_number: string;
  purpose_code: DrawingPurposeCode;
  purpose_description: string;
  sequence_no: number;
  is_primary_manufacturing: number;
  development_phase: NumberingPhase;
  record_status: NumberingRecordStatus;
  rule_version_id: string;
};

type NumberingSearchRow = {
  entity_type: Exclude<NumberingSearchEntityType, "all">;
  entity_id: string;
  root_code: string;
  core_name: string;
  display_code: string;
  display_name: string;
  item_kind: NumberingItemKind;
  development_phase: NumberingPhase;
  record_status: NumberingRecordStatus;
  purpose_code: DrawingPurposeCode | null;
  part_number: string | null;
  drawing_number: string | null;
  primary_drawing_number: string | null;
  part_count: number | null;
  drawing_count: number | null;
  linked_part_count: number | null;
  warning_count: number | null;
};

type DrawingModuleListRow = DrawingNumberRow & {
  root_code: string;
  core_name: string;
  item_kind: NumberingItemKind;
  linked_part_count: number | null;
  linked_part_numbers: string | null;
  warning_count: number | null;
  updated_at: string;
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
  standard_cost_id: string | null;
  standard_profile_name: string | null;
  standard_cost_type: PartCostType | null;
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

type PartCostTierRow = {
  id: string;
  cost_profile_id: string;
  min_qty: number;
  max_qty: number | null;
  unit_cost: number;
  setup_cost: number;
  lead_time_days: number | null;
  note: string | null;
};

type PartCostProfileRow = {
  id: string;
  part_number_id: string;
  cost_type: PartCostType;
  profile_name: string;
  currency: string;
  uom: string;
  supplier_name: string | null;
  process_name: string | null;
  cost_basis: string | null;
  status: PartCostProfileStatus;
  effective_from: string | null;
  effective_to: string | null;
};

type PartStandardCostRow = {
  id: string;
  part_number_id: string;
  cost_profile_id: string;
  basis_qty: number;
  standard_reason: string | null;
  effective_from: string;
  effective_to: string | null;
  profile_name: string;
  cost_type: PartCostType;
  currency: string;
  uom: string;
  unit_cost: number | null;
};

type PartCostChangeRequestRow = {
  id: string;
  part_number_id: string;
  proposed_cost_profile_id: string | null;
  request_type: "set_standard" | "update_profile" | "retire_profile";
  change_reason: string;
  review_status: PartCostChangeRequestStatus;
  requested_at: string;
  reviewed_at: string | null;
  review_comment: string | null;
};

type PartModuleListRow = PartNumberRow & {
  root_code: string;
  core_name: string;
  primary_drawing_number: string | null;
  drawing_count: number | null;
  pending_cost_request_count: number | null;
  variant_id: string | null;
  material_code: string | null;
  material_label: string | null;
  color_code: string | null;
  color_label: string | null;
  surface_treatment: string | null;
  variant_note: string | null;
  variant_updated_at: string | null;
  standard_cost_id: string | null;
  standard_cost_profile_id: string | null;
  standard_basis_qty: number | null;
  standard_reason: string | null;
  standard_effective_from: string | null;
  standard_effective_to: string | null;
  standard_profile_name: string | null;
  standard_cost_type: PartCostType | null;
  standard_currency: string | null;
  standard_uom: string | null;
  standard_unit_cost: number | null;
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

type ApprovalRuleRow = {
  id: string;
  rule_version_id: string;
  rule_name: string;
  action_code: string;
  phase: string | null;
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

type ApprovalRequestRow = {
  id: string;
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

type NumberingTaskRow = {
  id: string;
  company_id?: string;
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
  company_id?: string;
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

type ImportBatchRow = {
  id: string;
  source_filename: string;
  source_hash: string | null;
  status: "staged" | "confirmed" | "rejected";
  summary_json: string;
  imported_by: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
};

type ImportStagingRow = {
  id: string;
  import_batch_id: string;
  row_no: number;
  raw_json: string;
  check_status: NumberingImportStagingRowRecord["checkStatus"];
  issue_json: string;
};

type NumberingExportJobRow = {
  id: string;
  export_mode: NumberingExportMode;
  status: NumberingExportJobRecord["status"];
  result_json: string;
  generated_by: string | null;
  generated_at: string;
  completed_at: string | null;
};

type MonthlyAuditReportRow = {
  id: string;
  report_type: string;
  report_month: string;
  generation_mode: "auto" | "manual";
  generated_by: string | null;
  status: MonthlyAuditReportRecord["status"];
  query_json: string;
  created_at: string;
};

const DEFAULT_RULE_VERSION_ID = NUMBERING_RULE_V3_ID;
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
    code: "PRIMARY_MA_REQUIRED_FROM_DVT",
    message: "DVT or Release manufactured, outsourced, and custom items require a primary MA drawing unless an override is approved.",
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
  ["approval-rule-update-name-dvt", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-update-name-release", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-update-name-released", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-update-spec-released", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-obsolete-part-dvt", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-obsolete-part-release", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-obsolete-ma-drawing-dvt", 1, "rd_manager", 0, 1, 1, 1],
  ["approval-rule-obsolete-ma-drawing-admin", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-obsolete-root-admin", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-merge-part-referenced", 1, "pdm_admin", 0, 1, 1, 1],
  ["approval-rule-dvt-missing-ma-override", 1, "pdm_admin", 0, 1, 1, 1],
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

function ensureNumberingRuleVersionSeeds(database: SqliteDatabase) {
  const now = new Date().toISOString();
  const insert = database.prepare(
    `
      INSERT OR IGNORE INTO numbering_rule_versions (id, rule_code, title, status, retired_at, rule_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  );
  const update = database.prepare(
    `
      UPDATE numbering_rule_versions
      SET status = ?,
          retired_at = CASE WHEN ? = 1 THEN COALESCE(retired_at, ?) ELSE NULL END,
          updated_at = ?
      WHERE id = ?
    `
  );
  for (const seed of NUMBERING_RULE_VERSION_SEEDS) {
    insert.run(seed.id, seed.ruleCode, seed.title, seed.status, seed.retired ? now : null, seed.ruleJson, now, now);
    update.run(seed.status, seed.retired ? 1 : 0, now, now, seed.id);
  }
}

function ensureDefaultApprovalRulesForCurrentRuleVersion(database: SqliteDatabase) {
  ensureNumberingRuleVersionSeeds(database);
  const existing = database.prepare("SELECT COUNT(*) AS count FROM approval_rules WHERE rule_version_id = ?").get(DEFAULT_RULE_VERSION_ID) as { count: number };
  if (existing.count > 0) return;
  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT OR IGNORE INTO approval_rules (
        id, rule_version_id, rule_name, action_code, phase, record_status, item_kind, risk_flag,
        requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker, created_by, created_at, updated_at
      )
      SELECT
        ? || source_rules.id, ?, source_rules.rule_name, source_rules.action_code, source_rules.phase, source_rules.record_status,
        source_rules.item_kind, source_rules.risk_flag, source_rules.requires_approval, source_rules.approver_role, source_rules.blocks_usage,
        source_rules.blocks_release, source_rules.shows_warning, source_rules.export_marker,
        CASE
          WHEN source_rules.created_by IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE users.id = source_rules.created_by) THEN source_rules.created_by
          ELSE NULL
        END,
        ?, ?
      FROM approval_rules source_rules
      WHERE source_rules.rule_version_id = ?
      `
    )
    .run(approvalRulePrefixForRuleVersion(DEFAULT_RULE_VERSION_ID), DEFAULT_RULE_VERSION_ID, now, now, NUMBERING_RULE_V1_ID);
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
  return (value ?? fallback) ? 1 : 0;
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

function mapPartRoot(row: PartRootRow): PartRootRecord {
  return {
    id: row.id,
    companyId: row.company_id ?? "company-jenfu",
    rootCode: row.root_code,
    coreName: row.core_name,
    itemKind: row.item_kind,
    developmentPhase: row.development_phase,
    recordStatus: row.record_status,
    ruleVersionId: row.rule_version_id
  };
}

function mapPartNumber(row: PartNumberRow): PartNumberRecord {
  return {
    id: row.id,
    companyId: row.company_id ?? "company-jenfu",
    partRootId: row.part_root_id,
    partNumber: row.part_number,
    sequenceNo: row.sequence_no,
    sequenceCode: row.sequence_code,
    partName: row.part_name,
    itemKind: row.item_kind,
    isUniversal: row.is_universal === 1,
    customSpecification: row.custom_specification,
    developmentPhase: row.development_phase,
    recordStatus: row.record_status,
    universalReason: row.universal_reason,
    ruleVersionId: row.rule_version_id
  };
}

function mapDrawingNumber(row: DrawingNumberRow): DrawingNumberRecord {
  return {
    id: row.id,
    companyId: row.company_id ?? "company-jenfu",
    partRootId: row.part_root_id,
    drawingNumber: row.drawing_number,
    purposeCode: row.purpose_code,
    purposeDescription: row.purpose_description,
    sequenceNo: row.sequence_no,
    isPrimaryManufacturing: row.is_primary_manufacturing === 1,
    developmentPhase: row.development_phase,
    recordStatus: row.record_status,
    ruleVersionId: row.rule_version_id
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
    primaryDrawingNumber: row.primary_drawing_number,
    standardCostStatus: row.standard_cost_id ? "active" : "missing",
    standardCostProfileName: row.standard_profile_name,
    standardCostType: row.standard_cost_type
  };
}

function mapDrawingModuleListRow(row: DrawingModuleListRow, sameRootParts: DrawingModuleLinkedPartRecord[] = []): DrawingModuleListRecord {
  return {
    ...mapDrawingNumber(row),
    rootCode: row.root_code,
    coreName: row.core_name,
    itemKind: row.item_kind,
    linkedPartCount: row.linked_part_count ?? 0,
    linkedPartNumbers: row.linked_part_numbers ? row.linked_part_numbers.split(",").filter(Boolean) : [],
    sameRootParts,
    titleBlockVariantWarning: hasPotentialHardcodedTitleBlockVariantText(row.purpose_description) && sameRootParts.length > 1,
    warningCount: row.warning_count ?? 0,
    releaseStatusMismatch: null,
    updatedAt: row.updated_at
  };
}

function hasPotentialHardcodedTitleBlockVariantText(text: string | null | undefined) {
  const normalized = normalizeNullableText(text)?.toLowerCase() ?? "";
  if (!normalized) return false;
  return [
    "material",
    "matl",
    "color",
    "colour",
    "surface",
    "finish",
    "材質",
    "材料",
    "顏色",
    "色號",
    "表面處理",
    "表處",
    "塗裝"
  ].some((keyword) => normalized.includes(keyword));
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
    developmentPhase: row.development_phase,
    recordStatus: row.record_status,
    purposeCode: row.purpose_code,
    partNumber: row.part_number,
    drawingNumber: row.drawing_number,
    primaryDrawingNumber: row.primary_drawing_number,
    partCount: row.part_count ?? 0,
    drawingCount: row.drawing_count ?? 0,
    linkedPartCount: row.linked_part_count ?? 0,
    warningCount: row.warning_count ?? 0
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

function mapPartCostTier(row: PartCostTierRow): PartCostTierRecord {
  return {
    id: row.id,
    costProfileId: row.cost_profile_id,
    minQty: row.min_qty,
    maxQty: row.max_qty,
    unitCost: Number(row.unit_cost),
    setupCost: Number(row.setup_cost),
    leadTimeDays: row.lead_time_days,
    note: row.note
  };
}

function mapPartCostProfile(row: PartCostProfileRow, tiers: PartCostTierRecord[] = []): PartCostProfileRecord {
  return {
    id: row.id,
    partNumberId: row.part_number_id,
    costType: row.cost_type,
    profileName: row.profile_name,
    currency: row.currency,
    uom: row.uom,
    supplierName: row.supplier_name,
    processName: row.process_name,
    costBasis: row.cost_basis,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    tiers
  };
}

function mapPartStandardCost(row: PartStandardCostRow | null | undefined): PartStandardCostRecord | null {
  if (!row?.id || !row.cost_profile_id) return null;
  return {
    id: row.id,
    partNumberId: row.part_number_id,
    costProfileId: row.cost_profile_id,
    basisQty: row.basis_qty,
    standardReason: row.standard_reason,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    profileName: row.profile_name,
    costType: row.cost_type,
    currency: row.currency,
    uom: row.uom,
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost)
  };
}

function mapPartCostChangeRequest(row: PartCostChangeRequestRow): PartCostChangeRequestRecord {
  return {
    id: row.id,
    partNumberId: row.part_number_id,
    proposedCostProfileId: row.proposed_cost_profile_id,
    requestType: row.request_type,
    changeReason: row.change_reason,
    reviewStatus: row.review_status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewComment: row.review_comment
  };
}

function mapPartModuleListRow(row: PartModuleListRow): PartModuleListRecord {
  return {
    ...mapPartNumber(row),
    rootCode: row.root_code,
    coreName: row.core_name,
    primaryDrawingNumber: row.primary_drawing_number,
    drawingCount: row.drawing_count ?? 0,
    pendingCostRequestCount: row.pending_cost_request_count ?? 0,
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
    }),
    standardCost: mapPartStandardCost({
      id: row.standard_cost_id ?? "",
      part_number_id: row.id,
      cost_profile_id: row.standard_cost_profile_id ?? "",
      basis_qty: row.standard_basis_qty ?? 1,
      standard_reason: row.standard_reason,
      effective_from: row.standard_effective_from ?? "",
      effective_to: row.standard_effective_to,
      profile_name: row.standard_profile_name ?? "",
      cost_type: row.standard_cost_type ?? "other",
      currency: row.standard_currency ?? "TWD",
      uom: row.standard_uom ?? "pcs",
      unit_cost: row.standard_unit_cost
    })
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
    payload: JSON.parse(row.payload_json || "{}") as Record<string, unknown>,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at
  };
}

function mapApprovalDecision(database: SqliteDatabase, row: ApprovalDecisionRow): NumberingApprovalDecisionRecord {
  const approver = approvalUserSummary(database, row.approver_id);
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
    developmentPhase: null,
    recordStatus: null
  };
}

function approvalEntitySummary(database: SqliteDatabase, request: ApprovalRequestRow): NumberingApprovalEntitySummaryRecord {
  if (request.entity_type === "part_root") {
    const row = database.prepare("SELECT root_code, core_name, item_kind, development_phase, record_status FROM part_roots WHERE id = ?").get(request.entity_id) as
      | {
          root_code: string;
          core_name: string;
          item_kind: NumberingItemKind;
          development_phase: NumberingPhase;
          record_status: NumberingRecordStatus;
        }
      | undefined;
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
      developmentPhase: row.development_phase,
      recordStatus: row.record_status
    };
  }

  if (request.entity_type === "part_number") {
    const row = database
      .prepare(
        `
        SELECT p.part_number, p.part_name, p.item_kind, p.development_phase, p.record_status,
               r.root_code, r.core_name,
               (
                 SELECT d.drawing_number
                 FROM drawing_part_links l
                 JOIN drawing_numbers d ON d.id = l.drawing_number_id
                 WHERE l.part_number_id = p.id
                   AND l.link_type = 'primary_manufacturing'
                   AND d.purpose_code IN ('MA', 'M')
                   AND d.record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
                 ORDER BY d.is_primary_manufacturing DESC, d.sequence_no ASC, d.drawing_number ASC
                 LIMIT 1
               ) AS primary_drawing_number
        FROM part_numbers p
        JOIN part_roots r ON r.id = p.part_root_id
        WHERE p.id = ?
      `
      )
      .get(request.entity_id) as
      | {
          part_number: string;
          part_name: string;
          item_kind: NumberingItemKind;
          development_phase: NumberingPhase;
          record_status: NumberingRecordStatus;
          root_code: string;
          core_name: string;
          primary_drawing_number: string | null;
        }
      | undefined;
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
      developmentPhase: row.development_phase,
      recordStatus: row.record_status
    };
  }

  const drawingRow = database
    .prepare(
      `
      SELECT d.drawing_number, d.purpose_code, d.development_phase, d.record_status,
             r.root_code, r.core_name, r.item_kind
      FROM drawing_numbers d
      JOIN part_roots r ON r.id = d.part_root_id
      WHERE d.id = ?
    `
    )
    .get(request.entity_id) as
    | {
        drawing_number: string;
        purpose_code: DrawingPurposeCode;
        development_phase: NumberingPhase;
        record_status: NumberingRecordStatus;
        root_code: string;
        core_name: string;
        item_kind: NumberingItemKind;
      }
    | undefined;
  if (!drawingRow) return emptyApprovalEntitySummary(request);

  const payload = parseJsonDetail(request.payload_json);
  const payloadPartNumber = String(payload.partNumber ?? "").trim();
  return {
    entityType: request.entity_type,
    entityId: request.entity_id,
    label: drawingRow.drawing_number,
    secondary: request.entity_type === "same_drawing_variant" && payloadPartNumber ? `同圖料號 ${payloadPartNumber}` : drawingRow.purpose_code,
    rootCode: drawingRow.root_code,
    partNumber: payloadPartNumber || null,
    drawingNumber: drawingRow.drawing_number,
    partName: null,
    coreName: drawingRow.core_name,
    itemKind: drawingRow.item_kind,
    developmentPhase: drawingRow.development_phase,
    recordStatus: drawingRow.record_status
  };
}

function approvalRequestDecisions(database: SqliteDatabase, approvalRequestId: string) {
  const rows = database
    .prepare(
      `
      SELECT id, approval_request_id, approver_role, approver_id, decision, comment, decided_at
      FROM approval_decisions
      WHERE approval_request_id = ?
      ORDER BY decided_at DESC, id DESC
    `
    )
    .all(approvalRequestId) as ApprovalDecisionRow[];
  return rows.map((row) => mapApprovalDecision(database, row));
}

function approvalUserSummary(database: SqliteDatabase, userId: string) {
  return (
    (database.prepare("SELECT display_name, role FROM users WHERE id = ?").get(userId) as { display_name: string; role: string } | undefined) ?? {
      display_name: userId,
      role: "unknown"
    }
  );
}

function numberingApprovalActionLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    dvt_promotion: "DVT 階段晉升",
    dvt_missing_ma_override: "DVT 缺 MA Override",
    release: "發行審核",
    release_missing_ma_confirm: "發行缺 MA 再確認",
    same_drawing_variant_after_release: "發行後同圖多料號",
    main_drawing_restore: "製造圖恢復",
    obsolete_part_number: "料號作廢審核",
    obsolete_ma_drawing: "圖號作廢審核",
    obsolete_part_root: "主根作廢審核"
  };
  return value ? labels[value] ?? value : "審核";
}

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function addAttentionMarker(markers: NumberingAttentionMarkerRecord[], marker: NumberingAttentionMarkerRecord | null) {
  if (!marker || markers.some((item) => item.code === marker.code && item.label === marker.label)) return;
  markers.push(marker);
}

function proxySubmissionReason(payload: Record<string, unknown>, requestedByRole: string) {
  const explicitReason = String(payload.proxyReason ?? payload.delegationReason ?? "").trim();
  const requestedFor = String(payload.requestedFor ?? payload.submittedFor ?? payload.onBehalfOf ?? "").trim();
  if (explicitReason) return explicitReason;
  if (requestedFor) return `代 ${requestedFor} 送審`;
  if (payload.proxySubmitted === true || requestedByRole === "Admin") return "管理員代送審";
  return null;
}

function buildNumberingActionMarkers(input: {
  actionCode?: string | null;
  payload?: Record<string, unknown>;
  proxyReason?: string | null;
  entitySummary?: NumberingApprovalEntitySummaryRecord;
}) {
  const actionCode = input.actionCode ?? null;
  const payload = input.payload ?? {};
  const markers: NumberingAttentionMarkerRecord[] = [];

  if (input.proxyReason) {
    addAttentionMarker(markers, {
      code: "proxy_submission",
      label: "代送審",
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
    impactedPartNumbers.length > 0 ||
    requiredDocuments.length > 0 ||
    input.entitySummary?.recordStatus === "MainDrawingInvalid";
  if (hasImpact) {
    const detailParts = [
      impactedPartNumbers.length ? `受影響料號: ${impactedPartNumbers.join(", ")}` : "",
      requiredDocuments.length ? `需確認文件: ${requiredDocuments.join(", ")}` : "",
      input.entitySummary?.recordStatus === "MainDrawingInvalid" ? "主要製造圖失效" : ""
    ].filter(Boolean);
    addAttentionMarker(markers, {
      code: "impact_scope",
      label: "! 影響範圍",
      detail: detailParts.join("；") || numberingApprovalActionLabel(actionCode),
      severity: "critical"
    });
  }

  return markers;
}

function approvalRecipientRole(actionCode: NumberingApprovalActionCode) {
  if (
    actionCode === "dvt_promotion" ||
    actionCode === "release" ||
    actionCode === "same_drawing_variant_after_release" ||
    actionCode === "obsolete_ma_drawing"
  ) {
    return "rd_manager";
  }
  return "pdm_admin";
}

function mapApprovalReviewRequest(database: SqliteDatabase, row: ApprovalRequestRow): NumberingApprovalReviewRequestRecord {
  const requestedBy = approvalUserSummary(database, row.requested_by);
  const payload = parseJsonDetail(row.payload_json);
  const proxyReason = proxySubmissionReason(payload, requestedBy.role);
  const entitySummary = approvalEntitySummary(database, row);
  return {
    ...mapApprovalRequest(row),
    requestedByName: requestedBy.display_name,
    requestedByRole: requestedBy.role,
    isProxySubmission: Boolean(proxyReason),
    proxyReason,
    markers: buildNumberingActionMarkers({ actionCode: row.action_code, payload, proxyReason, entitySummary }),
    entitySummary,
    decisions: approvalRequestDecisions(database, row.id)
  };
}

function mapApprovalRule(row: ApprovalRuleRow): MatchedApprovalRule {
  const predictedRule = withPredictedApprovalControls({
    actionCode: row.action_code,
    phase: row.phase,
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

function mapApprovalBatch(database: SqliteDatabase, row: ApprovalBatchRow): NumberingApprovalBatchRecord {
  const itemRows = database
    .prepare("SELECT id, batch_id, approval_request_id, item_status, resubmitted_from_item_id FROM approval_batch_items WHERE batch_id = ? ORDER BY created_at ASC, id ASC")
    .all(row.id) as ApprovalBatchItemRow[];
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

function mapApprovalReviewBatch(database: SqliteDatabase, row: ApprovalBatchRow): NumberingApprovalReviewBatchRecord {
  const itemRows = database
    .prepare("SELECT id, batch_id, approval_request_id, item_status, resubmitted_from_item_id FROM approval_batch_items WHERE batch_id = ? ORDER BY created_at ASC, id ASC")
    .all(row.id) as ApprovalBatchItemRow[];
  const submittedBy = approvalUserSummary(database, row.submitted_by);
  const counts = emptyApprovalBatchItemCounts();
  const items = itemRows.map((itemRow) => {
    counts[itemRow.item_status] += 1;
    const requestRow = selectApprovalRequestById(database, itemRow.approval_request_id);
    if (!requestRow) {
      throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${itemRow.approval_request_id}`);
    }
    return {
      ...mapApprovalBatchItem(itemRow),
      request: mapApprovalReviewRequest(database, requestRow)
    };
  });

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

function parseJsonDetail(value: string) {
  try {
    return JSON.parse(value || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function actionCodeFromDetail(detail: Record<string, unknown>) {
  const value = detail.actionCode ?? detail.action_code;
  return typeof value === "string" ? value : null;
}

function payloadFromDetail(detail: Record<string, unknown>) {
  const payload = detail.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : detail;
}

function mapNumberingTask(row: NumberingTaskRow): NumberingTaskRecord {
  const detail = parseJsonDetail(row.detail_json);
  return {
    id: row.id,
    companyId: row.company_id ?? "company-jenfu",
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
    markers: buildNumberingActionMarkers({
      actionCode: actionCodeFromDetail(detail),
      payload: payloadFromDetail(detail),
      proxyReason: proxySubmissionReason(payloadFromDetail(detail), "")
    }),
    createdAt: row.created_at,
    handledAt: row.handled_at
  };
}

function mapNumberingNotification(row: NumberingNotificationRow): NumberingNotificationRecord {
  const detail = parseJsonDetail(row.detail_json);
  return {
    id: row.id,
    companyId: row.company_id ?? "company-jenfu",
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
    markers: buildNumberingActionMarkers({
      actionCode: actionCodeFromDetail(detail),
      payload: payloadFromDetail(detail),
      proxyReason: proxySubmissionReason(payloadFromDetail(detail), "")
    }),
    createdAt: row.created_at
  };
}

function mapImportStagingRow(row: ImportStagingRow): NumberingImportStagingRowRecord {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    rowNo: row.row_no,
    raw: parseJsonDetail(row.raw_json),
    checkStatus: row.check_status,
    issues: JSON.parse(row.issue_json || "[]") as Array<{ code: string; message: string }>
  };
}

function mapImportBatch(database: SqliteDatabase, row: ImportBatchRow): NumberingImportBatchRecord {
  const rows = database
    .prepare("SELECT id, import_batch_id, row_no, raw_json, check_status, issue_json FROM import_staging_rows WHERE import_batch_id = ? ORDER BY row_no ASC")
    .all(row.id) as ImportStagingRow[];
  return {
    id: row.id,
    sourceFilename: row.source_filename,
    sourceHash: row.source_hash,
    status: row.status,
    summary: parseJsonDetail(row.summary_json),
    importedBy: row.imported_by,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    rows: rows.map(mapImportStagingRow)
  };
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

function clampListLimit(value: number | undefined, fallback = 20) {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

function normalizeRiskFlags(riskFlags: string[] | undefined) {
  return new Set((riskFlags ?? []).map((flag) => flag.trim()).filter(Boolean));
}

function approvalRuleMatches(row: ApprovalRuleRow, input: EvaluateApprovalRuleInput, riskFlags: Set<string>) {
  if (row.action_code !== input.actionCode) return false;
  if (row.phase && row.phase !== input.phase) return false;
  if (row.record_status && row.record_status !== input.recordStatus) return false;
  if (row.item_kind && row.item_kind !== input.itemKind) return false;
  if (row.risk_flag && !riskFlags.has(row.risk_flag)) return false;
  return true;
}

function evaluateHardApprovalRules(input: EvaluateApprovalRuleInput, riskFlags: Set<string>): ApprovalHardRule[] {
  const hardRules: ApprovalHardRule[] = [];
  const addHardRule = (rule: ApprovalHardRule) => hardRules.push(rule);

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

  if (riskFlags.has("missing_primary_ma") && ["manufactured", "outsourced", "custom"].includes(input.itemKind ?? "")) {
    addHardRule({
      code: "PRIMARY_MA_REQUIRED_FROM_DVT",
      message: "DVT or Release manufactured, outsourced, and custom items require a primary MA drawing unless an override is approved.",
      requiresApproval: true,
      blocksUsage: input.phase === "DVT" || input.phase === "Release",
      blocksRelease: input.phase === "Release",
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

function allocateSequence(database: SqliteDatabase, sequenceKey: string) {
  const row = database.prepare("SELECT next_value FROM numbering_sequences WHERE sequence_key = ?").get(sequenceKey) as
    | { next_value: number }
    | undefined;
  const now = new Date().toISOString();
  if (!row) {
    database
      .prepare("INSERT INTO numbering_sequences (sequence_key, next_value, updated_at) VALUES (?, ?, ?)")
      .run(sequenceKey, 2, now);
    return 1;
  }
  database
    .prepare("UPDATE numbering_sequences SET next_value = ?, updated_at = ? WHERE sequence_key = ?")
    .run(row.next_value + 1, now, sequenceKey);
  return row.next_value;
}

function lowestAvailableSequence(usedValues: number[], maxValue: number, label: string) {
  const used = [...new Set(usedValues.filter((value) => Number.isInteger(value) && value > 0 && value <= maxValue))].sort((a, b) => a - b);
  let candidate = 1;
  for (const value of used) {
    if (value < candidate) continue;
    if (value > candidate) break;
    candidate += 1;
  }
  if (candidate > maxValue) throw new Error(`${label}_SEQUENCE_EXHAUSTED`);
  return candidate;
}

function normalizeRootCodeCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return rootCodeToV3Ordinal(normalized) !== null ? normalized : null;
}

function extractAuditRootCodes(value: unknown): string[] {
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
    for (const [childKey, childValue] of Object.entries(node)) visit(childValue, childKey);
  };
  visit(value);
  return Array.from(rootCodes);
}

function extractAuditRootCodesFromJson(detailJson: string): string[] {
  try {
    return extractAuditRootCodes(JSON.parse(detailJson));
  } catch {
    return [];
  }
}

function selectV3ReservedRootCodes(database: SqliteDatabase): string[] {
  const masterRows = database.prepare("SELECT root_code FROM part_roots ORDER BY root_code ASC").all() as Array<{ root_code: string }>;
  const auditRows = database
    .prepare(
      `
      SELECT detail_json
      FROM audit_logs
      WHERE action LIKE 'numbering.%'
        AND (detail_json LIKE '%rootCode%' OR detail_json LIKE '%rootCodes%' OR detail_json LIKE '%root_code%')
      ORDER BY created_at ASC
    `
    )
    .all() as Array<{ detail_json: string }>;

  return Array.from(new Set([...masterRows.map((row) => row.root_code), ...auditRows.flatMap((row) => extractAuditRootCodesFromJson(row.detail_json))]));
}

function allocateRootSequence(database: SqliteDatabase, ruleVersionId: string) {
  if (ruleVersionId !== NUMBERING_RULE_V2_ID && ruleVersionId !== NUMBERING_RULE_V3_ID) {
    return allocateSequence(database, "part_root");
  }

  const rootCodes =
    ruleVersionId === NUMBERING_RULE_V3_ID
      ? selectV3ReservedRootCodes(database)
      : (
          database.prepare("SELECT root_code FROM part_roots WHERE rule_version_id = ? AND LENGTH(root_code) = 5 ORDER BY root_code ASC").all(ruleVersionId) as Array<{
            root_code: string;
          }>
        ).map((row) => row.root_code);
  const sequenceNo = lowestAvailableSequence(
    rootCodes.map((rootCode) => (ruleVersionId === NUMBERING_RULE_V3_ID ? rootCodeToV3Ordinal(rootCode) ?? 0 : Number(rootCode))),
    ruleVersionId === NUMBERING_RULE_V3_ID ? 26 * 9999 : 99999,
    "ROOT"
  );
  const sequenceKey = ruleVersionId === NUMBERING_RULE_V3_ID ? "part_root:v3" : "part_root:v2";
  const row = database.prepare("SELECT next_value FROM numbering_sequences WHERE sequence_key = ?").get(sequenceKey) as
    | { next_value: number }
    | undefined;
  const now = new Date().toISOString();
  if (!row) {
    database.prepare("INSERT INTO numbering_sequences (sequence_key, next_value, updated_at) VALUES (?, ?, ?)").run(sequenceKey, sequenceNo + 1, now);
  } else {
    database.prepare("UPDATE numbering_sequences SET next_value = ?, updated_at = ? WHERE sequence_key = ?").run(sequenceNo + 1, now, sequenceKey);
  }
  return sequenceNo;
}

function requireUniversalReason(itemKind: NumberingItemKind, isUniversal: boolean, universalReason: string | undefined) {
  if ((itemKind === "shared" || isUniversal) && !universalReason?.trim()) {
    throw new Error("UNIVERSAL_PART_REASON_REQUIRED");
  }
}

function requireCustomSpecification(itemKind: NumberingItemKind, customSpecification: string | undefined) {
  if (itemKind === "custom" && !customSpecification?.trim()) {
    throw new Error("CUSTOM_SPECIFICATION_REQUIRED");
  }
}

function normalizePurposeDescription(purposeCode: DrawingPurposeCode, description: string | undefined) {
  const trimmed = description?.trim() ?? "";
  if (isReferenceDrawingPurpose(purposeCode) && !trimmed) {
    throw new Error("REFERENCE_PURPOSE_DESCRIPTION_REQUIRED");
  }
  if (!trimmed) return isManufacturingDrawingPurpose(purposeCode) ? "Manufacturing drawing" : "";
  return trimmed || displayDrawingPurposeLabel(purposeCode);
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

function normalizeAuditDetail(action: string, detail: Record<string, unknown>) {
  const { before: explicitBefore, after: explicitAfter, diff: explicitDiff, markers: explicitMarkers, ...rest } = detail;
  const hasBefore = Object.prototype.hasOwnProperty.call(detail, "before");
  const hasAfter = Object.prototype.hasOwnProperty.call(detail, "after");
  const hasDiff = Object.prototype.hasOwnProperty.call(detail, "diff");
  const before = hasBefore ? explicitBefore : null;
  const after = hasAfter ? explicitAfter : rest;
  const diff = hasDiff ? explicitDiff : computeAuditDiff(before, after);
  const actionCode = typeof detail.actionCode === "string" ? detail.actionCode : null;
  const payload = detail.payload && typeof detail.payload === "object" && !Array.isArray(detail.payload) ? (detail.payload as Record<string, unknown>) : rest;
  const markers = Array.isArray(explicitMarkers)
    ? explicitMarkers
    : action.startsWith("numbering.") && actionCode
      ? buildNumberingActionMarkers({ actionCode, payload })
      : [];
  return {
    ...rest,
    before,
    after,
    diff,
    markers
  };
}

function insertAudit(database: SqliteDatabase, input: { actorId?: string | null; action: string; detail: Record<string, unknown> }) {
  const detail = normalizeAuditDetail(input.action, input.detail);
  database
    .prepare("INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), input.actorId ?? null, input.action, JSON.stringify(detail), new Date().toISOString());
}

function selectPartRootByCode(database: SqliteDatabase, rootCode: string) {
  return database.prepare("SELECT * FROM part_roots WHERE root_code = ?").get(rootCode) as PartRootRow | undefined;
}

function selectPartRootById(database: SqliteDatabase, id: string) {
  return database.prepare("SELECT * FROM part_roots WHERE id = ?").get(id) as PartRootRow | undefined;
}

function selectPartNumberByNumber(database: SqliteDatabase, partNumber: string) {
  return database.prepare("SELECT * FROM part_numbers WHERE part_number = ?").get(partNumber) as PartNumberRow | undefined;
}

function selectPartNumberById(database: SqliteDatabase, id: string) {
  return database.prepare("SELECT * FROM part_numbers WHERE id = ?").get(id) as PartNumberRow | undefined;
}

function selectDrawingNumberByNumber(database: SqliteDatabase, drawingNumber: string) {
  return database.prepare("SELECT * FROM drawing_numbers WHERE drawing_number = ?").get(drawingNumber) as
    | DrawingNumberRow
    | undefined;
}

function selectDrawingNumberById(database: SqliteDatabase, id: string) {
  return database.prepare("SELECT * FROM drawing_numbers WHERE id = ?").get(id) as DrawingNumberRow | undefined;
}

function selectApprovalRequestById(database: SqliteDatabase, approvalRequestId: string) {
  return database.prepare("SELECT * FROM approval_requests WHERE id = ?").get(approvalRequestId) as ApprovalRequestRow | undefined;
}

function selectApprovalBatchById(database: SqliteDatabase, batchId: string) {
  return database.prepare("SELECT * FROM approval_batches WHERE id = ?").get(batchId) as ApprovalBatchRow | undefined;
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

function getPrimaryManufacturingDrawingForPart(database: SqliteDatabase, partNumberId: string) {
  const row = database
    .prepare(
      `
      SELECT d.*
      FROM drawing_part_links l
      JOIN drawing_numbers d ON d.id = l.drawing_number_id
      WHERE l.part_number_id = ?
        AND l.link_type = 'primary_manufacturing'
        AND d.purpose_code IN ('MA', 'M')
        AND d.record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
      LIMIT 1
    `
    )
    .get(partNumberId) as DrawingNumberRow | undefined;
  return row ? mapDrawingNumber(row) : null;
}

function validateReplacementManufacturingDrawing(database: SqliteDatabase, partRow: PartNumberRow, drawingNumber: string) {
  const replacement = selectDrawingNumberByNumber(database, drawingNumber);
  if (!replacement) {
    throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${drawingNumber}`);
  }
  if (replacement.part_root_id !== partRow.part_root_id || !isManufacturingDrawingPurpose(replacement.purpose_code)) {
    throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_SAME_ROOT_MA_DRAWING");
  }
  if (["Obsolete", "Merged", "EVTDisabled"].includes(replacement.record_status)) {
    throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_ACTIVE_MA_DRAWING");
  }
  return replacement;
}

function hasApprovedNumberingApproval(
  database: SqliteDatabase,
  input: { entityType: NumberingApprovalRecord["entityType"]; entityId: string; actionCode: NumberingApprovalActionCode }
) {
  return Boolean(
    database
      .prepare(
        `
        SELECT id
        FROM approval_requests
        WHERE request_type = 'numbering'
          AND entity_type = ?
          AND entity_id = ?
          AND action_code = ?
          AND request_status = 'approved'
        LIMIT 1
      `
      )
      .get(input.entityType, input.entityId, input.actionCode)
  );
}

function listPrimaryManufacturingPartsByDrawing(database: SqliteDatabase, drawingNumberId: string) {
  const rows = database
    .prepare(
      `
      SELECT p.*
      FROM drawing_part_links l
      JOIN part_numbers p ON p.id = l.part_number_id
      WHERE l.drawing_number_id = ?
        AND l.link_type = 'primary_manufacturing'
      ORDER BY p.part_number ASC
    `
    )
    .all(drawingNumberId) as PartNumberRow[];
  return rows.map(mapPartNumber);
}

function partRequiresPrimaryManufacturingDrawing(partNumber: PartNumberRecord) {
  if (partNumber.isUniversal) return false;
  return ["manufactured", "outsourced", "custom"].includes(partNumber.itemKind);
}

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

function insertWarningEvent(
  database: SqliteDatabase,
  input: {
    warningCode: string;
    severity: "info" | "warning" | "blocker";
    entityType: string;
    entityId?: string | null;
    title: string;
    message: string;
    detail: Record<string, unknown>;
    createdBy?: string | null;
  }
) {
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO warning_events (
        id, warning_code, severity, entity_type, entity_id, title, message,
        detail_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      input.warningCode,
      input.severity,
      input.entityType,
      input.entityId ?? null,
      input.title,
      input.message,
      JSON.stringify(input.detail),
      input.createdBy ?? null,
      new Date().toISOString()
    );
  return id;
}

function insertNumberingTaskItem(
  database: SqliteDatabase,
  input: {
    companyId?: string;
    taskType: string;
    entityType: string;
    entityId: string;
    title: string;
    message: string;
    riskLevel?: "info" | "warning" | "critical";
    assignedTo?: string | null;
    assignedRole?: string | null;
    projectCode?: string | null;
    actionUrl?: string | null;
    detail?: Record<string, unknown>;
    createdBy?: string | null;
  }
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT INTO numbering_task_items (
        id, company_id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
        assigned_to, assigned_role, project_code, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      input.companyId ?? "company-jenfu",
      input.taskType,
      input.entityType,
      input.entityId,
      input.title,
      input.message,
      input.riskLevel ?? "info",
      input.assignedTo ?? null,
      input.assignedRole ?? null,
      input.projectCode ?? null,
      input.actionUrl ?? null,
      JSON.stringify(input.detail ?? {}),
      input.createdBy ?? null,
      now,
      now
    );
  return id;
}

function insertNumberingNotification(
  database: SqliteDatabase,
  input: {
    companyId?: string;
    notificationType: string;
    entityType: string;
    entityId: string;
    title: string;
    message: string;
    severity?: "info" | "warning" | "critical";
    recipientId?: string | null;
    recipientRole?: string | null;
    dismissible?: boolean;
    actionUrl?: string | null;
    detail?: Record<string, unknown>;
    createdBy?: string | null;
  }
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT INTO numbering_notifications (
        id, company_id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_id, recipient_role, dismissible, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      input.companyId ?? "company-jenfu",
      input.notificationType,
      input.entityType,
      input.entityId,
      input.title,
      input.message,
      input.severity ?? "info",
      input.recipientId ?? null,
      input.recipientRole ?? null,
      input.dismissible === false ? 0 : 1,
      input.actionUrl ?? null,
      JSON.stringify(input.detail ?? {}),
      input.createdBy ?? null,
      now,
      now
    );
  return id;
}

function insertPartRoot(
  database: SqliteDatabase,
  input: {
    coreName: string;
    itemKind: NumberingItemKind;
    developmentPhase: NumberingPhase;
    recordStatus: NumberingRecordStatus;
    ruleVersionId: string;
    createdBy?: string | null;
  }
) {
  const rootSequence = allocateRootSequence(database, input.ruleVersionId);
  const rootCode = formatRootCode(rootSequence, input.ruleVersionId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT INTO part_roots (
        id, root_code, core_name, item_kind, development_phase, record_status,
        rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      rootCode,
      input.coreName.trim(),
      input.itemKind,
      input.developmentPhase,
      input.recordStatus,
      input.ruleVersionId,
      input.createdBy ?? null,
      now,
      now
    );
  return mapPartRoot(selectPartRootByCode(database, rootCode)!);
}

function insertPartNumber(
  database: SqliteDatabase,
  root: PartRootRecord,
  input: {
    partName: string;
    itemKind: NumberingItemKind;
    developmentPhase: NumberingPhase;
    recordStatus: NumberingRecordStatus;
    isUniversal: boolean;
    universalReason?: string;
    customSpecification?: string;
    ruleVersionId: string;
    createdBy?: string | null;
  }
) {
  const effectiveIsUniversal = input.itemKind === "shared" || input.isUniversal;
  requireUniversalReason(input.itemKind, effectiveIsUniversal, input.universalReason);
  requireCustomSpecification(input.itemKind, input.customSpecification);
  const sequenceNo = effectiveIsUniversal && !isCompactNumberingRule(input.ruleVersionId) ? 0 : allocateSequence(database, `part:${root.rootCode}`);
  const sequenceCode = formatPartSequence(sequenceNo, input.ruleVersionId);
  const partNumber = formatPartNumberForRule(root.rootCode, sequenceCode, input.ruleVersionId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, custom_specification, development_phase, record_status, universal_reason,
        rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      root.id,
      partNumber,
      sequenceNo,
      sequenceCode,
      input.partName.trim(),
      input.itemKind,
      effectiveIsUniversal ? 1 : 0,
      input.customSpecification?.trim() || null,
      input.developmentPhase,
      input.recordStatus,
      input.universalReason?.trim() || null,
      input.ruleVersionId,
      input.createdBy ?? null,
      now,
      now
    );
  const row = database.prepare("SELECT * FROM part_numbers WHERE id = ?").get(id) as PartNumberRow;
  return mapPartNumber(row);
}

function insertDrawingNumber(
  database: SqliteDatabase,
  root: PartRootRecord,
  input: {
    purposeCode: DrawingPurposeCode;
    purposeDescription?: string;
    developmentPhase: NumberingPhase;
    recordStatus: NumberingRecordStatus;
    ruleVersionId: string;
    createdBy?: string | null;
  }
) {
  assertPurposeAllowedForRule(input.purposeCode, input.ruleVersionId);
  const purposeDescription = normalizePurposeDescription(input.purposeCode, input.purposeDescription);
  const sequenceNo = allocateSequence(database, `drawing:${root.rootCode}:${input.purposeCode}`);
  const sequenceCode = formatDrawingSequence(sequenceNo, input.ruleVersionId);
  const drawingNumber = formatDrawingNumberForRule(root.rootCode, input.purposeCode, sequenceCode, input.ruleVersionId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT INTO drawing_numbers (
        id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
        is_primary_manufacturing, development_phase, record_status, rule_version_id,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      root.id,
      drawingNumber,
      input.purposeCode,
      purposeDescription,
      sequenceNo,
      isManufacturingDrawingPurpose(input.purposeCode) ? 1 : 0,
      input.developmentPhase,
      input.recordStatus,
      input.ruleVersionId,
      input.createdBy ?? null,
      now,
      now
    );
  const row = database.prepare("SELECT * FROM drawing_numbers WHERE id = ?").get(id) as DrawingNumberRow;
  return mapDrawingNumber(row);
}

function linkDrawingToPart(
  database: SqliteDatabase,
  input: { drawing: DrawingNumberRecord; part: PartNumberRecord; createdBy?: string | null }
) {
  database
    .prepare(
      `
      INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      crypto.randomUUID(),
      input.drawing.id,
      input.part.id,
      isManufacturingDrawingPurpose(input.drawing.purposeCode) ? "primary_manufacturing" : "reference",
      input.createdBy ?? null,
      new Date().toISOString()
    );
}

function linkPartNumberToDrawingInDatabase(
  database: SqliteDatabase,
  input: LinkPartNumberToDrawingInput & { approvedAfterRelease?: boolean }
) {
    const partRow = selectPartNumberByNumber(database, input.partNumber);
    if (!partRow) {
      throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    }
    const drawingRow = selectDrawingNumberByNumber(database, input.drawingNumber);
    if (!drawingRow) {
      throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${input.drawingNumber}`);
    }
    if (partRow.part_root_id !== drawingRow.part_root_id) {
      throw new Error("DRAWING_PART_ROOT_MISMATCH");
    }

    const part = mapPartNumber(partRow);
    const drawing = mapDrawingNumber(drawingRow);
    const variants = normalizeVariantFields(input.variants);
    const linkType = isManufacturingDrawingPurpose(drawing.purposeCode) ? "primary_manufacturing" : "reference";
    const existingLink = database
      .prepare(
        "SELECT id FROM drawing_part_links WHERE drawing_number_id = ? AND part_number_id = ? AND link_type = ? LIMIT 1"
      )
      .get(drawing.id, part.id, linkType) as { id: string } | undefined;
    const existingPrimaryCount = database
      .prepare("SELECT COUNT(*) AS count FROM drawing_part_links WHERE drawing_number_id = ? AND link_type = 'primary_manufacturing'")
      .get(drawing.id) as { count: number };

    if (isManufacturingDrawingPurpose(drawing.purposeCode) && !existingLink && existingPrimaryCount.count > 0 && variants.length === 0) {
      throw new Error("SAME_DRAWING_VARIANT_REQUIRED");
    }
    if (
      isManufacturingDrawingPurpose(drawing.purposeCode) &&
      !existingLink &&
      existingPrimaryCount.count > 0 &&
      (drawing.recordStatus === "Released" || part.recordStatus === "Released") &&
      !input.approvedAfterRelease
    ) {
      throw new Error("SAME_DRAWING_VARIANT_APPROVAL_REQUIRED");
    }
    if (!isManufacturingDrawingPurpose(drawing.purposeCode) && variants.length > 0) {
      throw new Error("SAME_DRAWING_VARIANT_REQUIRES_MA_DRAWING");
    }

    if (!existingLink) {
      linkDrawingToPart(database, { drawing, part, createdBy: input.createdBy });
    }

    const now = new Date().toISOString();
    for (const variant of variants) {
      database
        .prepare(
          `
          INSERT INTO same_drawing_variants (id, drawing_number_id, part_number_id, field_name, field_value, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(drawing_number_id, part_number_id, field_name)
          DO UPDATE SET field_value = excluded.field_value
        `
        )
        .run(crypto.randomUUID(), drawing.id, part.id, variant.fieldName, variant.fieldValue, input.createdBy ?? null, now);
    }

    insertAudit(database, {
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

export function linkPartNumberToDrawing(input: LinkPartNumberToDrawingInput) {
  const database = getDb();
  return database.transaction(() => linkPartNumberToDrawingInDatabase(database, input))();
}

function insertNumberingApprovalRequest(database: SqliteDatabase, input: RequestNumberingApprovalInput) {
    const companyId = input.companyId ?? "company-jenfu";
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = input.payload ?? {};
    const recipientRole = approvalRecipientRole(input.actionCode);
    const approvalDetail = {
      approvalRequestId: id,
      actionCode: input.actionCode,
      projectCode: typeof payload.projectCode === "string" ? payload.projectCode : typeof payload.project_code === "string" ? payload.project_code : null,
      payload
    };
    database
      .prepare(
        `
        INSERT INTO approval_requests (
          id, company_id, request_type, action_code, entity_type, entity_id, request_status,
          reason, payload_json, requested_by, requested_at, created_at, updated_at
        ) VALUES (?, ?, 'numbering', ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        companyId,
        input.actionCode,
        input.entityType,
        input.entityId,
        input.reason.trim(),
        JSON.stringify(payload),
        input.requestedBy,
        now,
        now,
        now
      );

    insertWarningEvent(database, {
      warningCode: "PENDING_APPROVAL_NOT_USABLE",
      severity: "warning",
      entityType: input.entityType,
      entityId: input.entityId,
      title: "Pending approval",
      message: "This numbering action is pending approval and is not usable until approved.",
      detail: approvalDetail,
      createdBy: input.requestedBy
    });
    insertNumberingTaskItem(database, {
      companyId,
      taskType: "approval_request",
      entityType: input.entityType,
      entityId: input.entityId,
      title: "Numbering approval required",
      message: `Action ${input.actionCode} is waiting for review.`,
      riskLevel: "warning",
      assignedRole: recipientRole,
      actionUrl: `/numbering/approvals`,
      detail: approvalDetail,
      createdBy: input.requestedBy
    });
    insertNumberingNotification(database, {
      companyId,
      notificationType: "approval_request_pending",
      entityType: input.entityType,
      entityId: input.entityId,
      title: "Numbering approval required",
      message: `Action ${input.actionCode} is waiting for review.`,
      severity: "warning",
      recipientRole,
      dismissible: false,
      actionUrl: `/numbering/approvals`,
      detail: approvalDetail,
      createdBy: input.requestedBy
    });
    insertAudit(database, {
      actorId: input.requestedBy,
      action: "numbering.approval.request",
      detail: {
        approvalRequestId: id,
        actionCode: input.actionCode,
        entityType: input.entityType,
        entityId: input.entityId
      }
    });

    const row = database.prepare("SELECT * FROM approval_requests WHERE id = ?").get(id) as ApprovalRequestRow;
    return mapApprovalRequest(row);
}

export function requestNumberingApproval(input: RequestNumberingApprovalInput) {
  const database = getDb();
  return database.transaction(() => insertNumberingApprovalRequest(database, input))();
}

function createNumberingApprovalBatchInDatabase(database: SqliteDatabase, input: CreateNumberingApprovalBatchInput) {
  const approvalRequestIds = Array.from(new Set(input.approvalRequestIds.map((id) => id.trim()).filter(Boolean)));
  if (approvalRequestIds.length === 0) {
    throw new Error("APPROVAL_BATCH_REQUIRES_REQUESTS");
  }

  const requests = approvalRequestIds.map((id) => {
    const row = selectApprovalRequestById(database, id);
    if (!row) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${id}`);
    if (row.request_status !== "pending") throw new Error(`APPROVAL_BATCH_REQUIRES_PENDING_REQUEST: ${id}`);
    return row;
  });
  const actionCodes = new Set(requests.map((request) => request.action_code));
  if (input.actionCode?.trim() && !actionCodes.has(input.actionCode.trim() as NumberingApprovalActionCode)) {
    throw new Error("APPROVAL_BATCH_ACTION_MISMATCH");
  }
  if (!input.actionCode?.trim() && actionCodes.size > 1) {
    throw new Error("APPROVAL_BATCH_REQUIRES_SAME_ACTION");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const batchCode = `NB-${Date.now().toString(36).toUpperCase()}-${approvalRequestIds.length}`;
  const actionCode = input.actionCode?.trim() || requests[0]?.action_code || null;
  database
    .prepare(
      `
      INSERT INTO approval_batches (
        id, batch_code, request_type, project_code, action_code, batch_status,
        submitted_by, submitted_at, created_at, updated_at
      ) VALUES (?, ?, 'numbering', ?, ?, 'pending', ?, ?, ?, ?)
    `
    )
    .run(id, batchCode, input.projectCode?.trim() || null, actionCode, input.submittedBy, now, now, now);

  for (const approvalRequestId of approvalRequestIds) {
    database
      .prepare(
        `
        INSERT INTO approval_batch_items (
          id, batch_id, approval_request_id, item_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'pending', ?, ?)
      `
      )
      .run(crypto.randomUUID(), id, approvalRequestId, now, now);
  }

  insertAudit(database, {
    actorId: input.submittedBy,
    action: "numbering.approval_batch.create",
    detail: { batchId: id, batchCode, actionCode, approvalRequestIds, projectCode: input.projectCode?.trim() || null }
  });

  return mapApprovalBatch(database, selectApprovalBatchById(database, id) as ApprovalBatchRow);
}

export function requestSameDrawingVariantApproval(input: RequestSameDrawingVariantApprovalInput) {
  const database = getDb();
  return database.transaction(() => {
    const drawingRow = selectDrawingNumberByNumber(database, input.drawingNumber);
    if (!drawingRow) {
      throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${input.drawingNumber}`);
    }
    const partRow = selectPartNumberByNumber(database, input.partNumber);
    if (!partRow) {
      throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    }
    if (drawingRow.part_root_id !== partRow.part_root_id) {
      throw new Error("DRAWING_PART_ROOT_MISMATCH");
    }
    const variants = normalizeVariantFields(input.variants);
    if (!isManufacturingDrawingPurpose(drawingRow.purpose_code)) {
      throw new Error("SAME_DRAWING_VARIANT_REQUIRES_MA_DRAWING");
    }
    if (variants.length === 0) {
      throw new Error("SAME_DRAWING_VARIANT_REQUIRED");
    }
    return insertNumberingApprovalRequest(database, {
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
  })();
}

export function requestMainDrawingRestoreApproval(input: RequestMainDrawingRestoreApprovalInput) {
  const database = getDb();
  return database.transaction(() => {
    const partRow = selectPartNumberByNumber(database, input.partNumber);
    if (!partRow) {
      throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    }
    if (partRow.record_status !== "MainDrawingInvalid") {
      throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_INVALID_PART");
    }
    const replacementDrawingNumber = input.replacementDrawingNumber?.trim() || "";
    if (replacementDrawingNumber) {
      validateReplacementManufacturingDrawing(database, partRow, replacementDrawingNumber);
    }
    return insertNumberingApprovalRequest(database, {
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
  })();
}

function decideNumberingApprovalInDatabase(database: SqliteDatabase, input: DecideNumberingApprovalInput) {
  const row = selectApprovalRequestById(database, input.approvalRequestId);
  if (!row) {
    throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.approvalRequestId}`);
  }
  if (row.request_status !== "pending" && row.request_status !== "needs_info") {
    throw new Error(`APPROVAL_REQUEST_ALREADY_RESOLVED: ${row.request_status}`);
  }

  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT INTO approval_decisions (
        id, approval_request_id, approver_role, approver_id, decision, comment, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      crypto.randomUUID(),
      input.approvalRequestId,
      input.approverRole,
      input.approverId,
      input.decision,
      input.comment?.trim() || null,
      now
    );

  database
    .prepare("UPDATE approval_requests SET request_status = ?, resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?")
    .run(input.decision, input.decision === "needs_info" ? null : now, input.decision === "needs_info" ? null : input.approverId, now, row.id);

  const request = mapApprovalRequest({ ...row, request_status: input.decision });
  if (input.decision === "approved") {
    applyApprovedNumberingRequest(database, request, input.approverId);
  }

  insertAudit(database, {
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

  const updated = selectApprovalRequestById(database, row.id) as ApprovalRequestRow;
  return mapApprovalRequest(updated);
}

export function decideNumberingApproval(input: DecideNumberingApprovalInput) {
  const database = getDb();
  return database.transaction(() => decideNumberingApprovalInDatabase(database, input))();
}

function refreshApprovalBatchStatus(database: SqliteDatabase, batchId: string) {
  const rows = database
    .prepare("SELECT item_status FROM approval_batch_items WHERE batch_id = ?")
    .all(batchId) as Array<{ item_status: NumberingApprovalBatchItemStatus }>;
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
  database.prepare("UPDATE approval_batches SET batch_status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), batchId);
  return status;
}

export function getNumberingApprovalBatch(batchId: string) {
  const database = getDb();
  const row = selectApprovalBatchById(database, batchId);
  return row ? mapApprovalBatch(database, row) : null;
}

export function listNumberingApprovalBatches(input: ListNumberingApprovalBatchesInput = {}) {
  const database = getDb();
  const where = ["request_type = 'numbering'"];
  const values: unknown[] = [];
  const accessContext = input.user ? getNumberingAccessContext(database, input.user) : null;

  const status = input.status ?? "active";
  if (status === "active") {
    where.push("batch_status IN ('pending', 'partially_approved', 'needs_info')");
  } else if (status !== "all") {
    where.push("batch_status = ?");
    values.push(status);
  }

  const actionCodes = Array.from(new Set((input.actionCodes ?? []).map((actionCode) => actionCode.trim()).filter(Boolean)));
  if (actionCodes.length > 0) {
    where.push(`action_code IN (${actionCodes.map(() => "?").join(", ")})`);
    values.push(...actionCodes);
  }

  const limit = Math.max(1, Math.min(Number(input.limit ?? 50), 100));
  const rows = database
    .prepare(
      `
      SELECT id, batch_code, project_code, action_code, batch_status, submitted_by, submitted_at
      FROM approval_batches
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
      LIMIT ?
    `
    )
    .all(...values, accessContext && accessContext.user.role !== "Admin" ? 500 : limit) as ApprovalBatchRow[];

  return rows
    .filter((row) => (accessContext ? canAccessNumberingScope(accessContext, row.project_code, row.action_code) : true))
    .slice(0, limit)
    .map((row) => {
      const batch = mapApprovalReviewBatch(database, row);
      const marker = delegatedReviewMarker(accessContext, "rd_manager", row.project_code, row.action_code);
      return marker ? { ...batch, markers: [...batch.markers, marker] } : batch;
    });
}

export function createNumberingApprovalBatch(input: CreateNumberingApprovalBatchInput) {
  const database = getDb();
  return database.transaction(() => createNumberingApprovalBatchInDatabase(database, input))();
}

export function decideNumberingApprovalBatch(input: DecideNumberingApprovalBatchInput) {
  const database = getDb();
  return database.transaction(() => {
    const batch = selectApprovalBatchById(database, input.batchId);
    if (!batch) throw new Error(`APPROVAL_BATCH_NOT_FOUND: ${input.batchId}`);

    const requestedIdSet = input.approvalRequestIds?.length
      ? new Set(input.approvalRequestIds.map((id) => id.trim()).filter(Boolean))
      : null;
    const itemRows = database
      .prepare("SELECT id, batch_id, approval_request_id, item_status, resubmitted_from_item_id FROM approval_batch_items WHERE batch_id = ? ORDER BY created_at ASC")
      .all(input.batchId) as ApprovalBatchItemRow[];
    const targetItems = itemRows.filter(
      (item) => item.item_status === "pending" && (!requestedIdSet || requestedIdSet.has(item.approval_request_id))
    );
    if (targetItems.length === 0) {
      throw new Error("APPROVAL_BATCH_HAS_NO_PENDING_TARGETS");
    }

    const decisions = targetItems.map((item) => {
      const itemComment = input.itemComments?.[item.approval_request_id]?.trim();
      const decision = decideNumberingApprovalInDatabase(database, {
        approvalRequestId: item.approval_request_id,
        decision: input.decision,
        comment: itemComment || input.comment,
        approverRole: input.approverRole,
        approverId: input.approverId
      });
      database
        .prepare("UPDATE approval_batch_items SET item_status = ?, updated_at = ? WHERE id = ?")
        .run(input.decision, new Date().toISOString(), item.id);
      return decision;
    });

    const batchStatus = refreshApprovalBatchStatus(database, input.batchId);
    insertAudit(database, {
      actorId: input.approverId,
      action: "numbering.approval_batch.decision",
      detail: {
        batchId: input.batchId,
        decision: input.decision,
        approvalRequestIds: targetItems.map((item) => item.approval_request_id),
        batchStatus
      }
    });

    return { batch: mapApprovalBatch(database, selectApprovalBatchById(database, input.batchId) as ApprovalBatchRow), decisions };
  })();
}

export function resubmitRejectedNumberingApprovalBatchItems(input: ResubmitRejectedNumberingApprovalBatchItemsInput) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("RESUBMIT_REASON_REQUIRED");
  }

  const database = getDb();
  return database.transaction(() => {
    const batch = selectApprovalBatchById(database, input.batchId);
    if (!batch) throw new Error(`APPROVAL_BATCH_NOT_FOUND: ${input.batchId}`);

    const requestedIdSet = input.approvalRequestIds?.length
      ? new Set(input.approvalRequestIds.map((id) => id.trim()).filter(Boolean))
      : null;
    const rejectedItems = database
      .prepare(
        `
        SELECT id, batch_id, approval_request_id, item_status, resubmitted_from_item_id
        FROM approval_batch_items
        WHERE batch_id = ?
          AND item_status IN ('rejected', 'needs_info')
        ORDER BY updated_at ASC, id ASC
      `
      )
      .all(input.batchId) as ApprovalBatchItemRow[];
    const targetItems = rejectedItems.filter((item) => !requestedIdSet || requestedIdSet.has(item.approval_request_id));
    if (targetItems.length === 0) {
      throw new Error("APPROVAL_BATCH_HAS_NO_REJECTED_TARGETS");
    }

    const now = new Date().toISOString();
    const requests = targetItems.map((item) => {
      const original = selectApprovalRequestById(database, item.approval_request_id);
      if (!original) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${item.approval_request_id}`);
      const request = insertNumberingApprovalRequest(database, {
        actionCode: original.action_code,
        entityType: original.entity_type,
        entityId: original.entity_id,
        reason,
        payload: {
          ...(JSON.parse(original.payload_json || "{}") as Record<string, unknown>),
          resubmittedFromApprovalRequestId: original.id,
          originalBatchId: input.batchId
        },
        requestedBy: input.requestedBy
      });
      database
        .prepare(
          `
          INSERT INTO approval_batch_items (
            id, batch_id, approval_request_id, item_status, resubmitted_from_item_id, created_at, updated_at
          ) VALUES (?, ?, ?, 'pending', ?, ?, ?)
        `
        )
        .run(crypto.randomUUID(), input.batchId, request.id, item.id, now, now);
      database.prepare("UPDATE approval_batch_items SET item_status = 'resubmitted', updated_at = ? WHERE id = ?").run(now, item.id);
      return request;
    });

    refreshApprovalBatchStatus(database, input.batchId);
    insertAudit(database, {
      actorId: input.requestedBy,
      action: "numbering.approval_batch.resubmit_rejected",
      detail: {
        batchId: input.batchId,
        originalApprovalRequestIds: targetItems.map((item) => item.approval_request_id),
        newApprovalRequestIds: requests.map((request) => request.id)
      }
    });

    return { batch: mapApprovalBatch(database, selectApprovalBatchById(database, input.batchId) as ApprovalBatchRow), requests };
  })();
}

function numberingRoleCodes(user: NumberingUserScope) {
  if (user.role === "Admin") return ["system_admin", "pdm_admin"];
  if (user.role === "R&D Manager") return ["rd_manager"];
  if (user.role === "Engineer") return ["rd"];
  return [user.role.toLowerCase().replaceAll(" ", "_")];
}

function getAssignedNumberingRoleCodes(database: SqliteDatabase, userId: string) {
  const now = new Date().toISOString();
  return (
    database
      .prepare(
        `
        SELECT r.role_code
        FROM user_role_assignments a
        JOIN roles r ON r.id = a.role_id
        WHERE a.user_id = ?
          AND a.revoked_at IS NULL
          AND (a.starts_at IS NULL OR a.starts_at <= ?)
          AND (a.hard_ends_at IS NULL OR a.hard_ends_at > ?)
          AND r.enabled = 1
        ORDER BY a.assigned_at DESC, r.role_code ASC
      `
      )
      .all(userId, now, now) as Array<{ role_code: string }>
  ).map((row) => row.role_code);
}

function getNumberingUserRoleCodes(database: SqliteDatabase, user: NumberingUserScope) {
  return Array.from(new Set([...numberingRoleCodes(user), ...getAssignedNumberingRoleCodes(database, user.id)]));
}

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

function buildRolePlaceholders(values: string[]) {
  return values.map(() => "?").join(", ");
}

function extractActionCodeFromDetail(detailJson: string) {
  const detail = parseJsonDetail(detailJson);
  const value = detail.actionCode ?? detail.action_code;
  return typeof value === "string" ? value : null;
}

function extractProjectCodeFromDetail(detailJson: string) {
  const detail = parseJsonDetail(detailJson);
  const value = detail.projectCode ?? detail.project_code;
  return typeof value === "string" ? value : null;
}

function getNumberingAccessContext(database: SqliteDatabase, user: NumberingUserScope): NumberingAccessContext {
  const baseRoles = getNumberingUserRoleCodes(database, user);
  const roleRows = baseRoles.length
    ? (database
        .prepare(`SELECT id, role_code FROM roles WHERE role_code IN (${buildRolePlaceholders(baseRoles)})`)
        .all(...baseRoles) as Array<{ id: string; role_code: string }>)
    : [];
  const roleIds = roleRows.map((row) => row.id);
  const scopeRows = roleIds.length
    ? (database
        .prepare(`SELECT scope_kind, scope_code FROM role_scope_rules WHERE allowed = 1 AND role_id IN (${buildRolePlaceholders(roleIds)})`)
        .all(...roleIds) as Array<{ scope_kind: NumberingRoleScopeKind; scope_code: string }>)
    : [];
  const projectScopes = new Set(scopeRows.filter((row) => row.scope_kind === "project").map((row) => row.scope_code));
  const actionScopes = new Set(scopeRows.filter((row) => row.scope_kind === "action").map((row) => row.scope_code));
  const now = new Date().toISOString();
  const delegatedRows = database
    .prepare(
      `
      SELECT d.delegated_from, u.display_name AS delegated_from_name, d.project_code, d.action_code, u.role AS delegated_from_role
      FROM approval_delegations d
      JOIN users u ON u.id = d.delegated_from
      WHERE d.delegated_to = ?
        AND d.revoked_at IS NULL
        AND (d.starts_at IS NULL OR d.starts_at <= ?)
        AND (d.ends_at IS NULL OR d.ends_at >= ?)
      ORDER BY d.created_at DESC
    `
    )
    .all(user.id, now, now) as Array<{
      delegated_from: string;
      delegated_from_name: string;
      project_code: string | null;
      action_code: string | null;
      delegated_from_role: string;
    }>;
  const delegations = delegatedRows.map((row) => ({
    delegatedFrom: row.delegated_from,
    delegatedFromName: row.delegated_from_name,
    delegatedFromRole: row.delegated_from_role,
    roleCodes: getNumberingUserRoleCodes(database, { id: row.delegated_from, role: row.delegated_from_role }),
    projectCode: row.project_code,
    actionCode: row.action_code
  }));
  const allRoles = Array.from(new Set([...baseRoles, ...delegations.flatMap((delegation) => delegation.roleCodes)]));
  return { user, baseRoles, allRoles, projectScopes, actionScopes, delegations };
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
  const scope = [`被代理人: ${delegation.delegatedFromName} (${delegation.delegatedFromRole})`];
  scope.push(`專案: ${delegation.projectCode ?? projectCode ?? "全部"}`);
  scope.push(`動作: ${delegation.actionCode ?? actionCode ?? "全部"}`);
  return {
    code: "delegated_review",
    label: "代理審核",
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

function getActiveRolePriority(database: SqliteDatabase) {
  const row = database.prepare("SELECT priority_json FROM role_priority_versions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as
    | { priority_json: string }
    | undefined;
  return row ? parseRolePriorityJson(row.priority_json) : DEFAULT_ROLE_PRIORITY;
}

function sortRoleCodesByPriority(roleCodes: string[], priority: string[]) {
  const priorityRank = new Map(priority.map((roleCode, index) => [roleCode, index]));
  return Array.from(new Set(roleCodes)).sort((left, right) => {
    const leftRank = priorityRank.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = priorityRank.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}

function delegationMatchesPermissionScope(delegation: NumberingDelegatedAccessRule, input: CheckNumberingPermissionInput) {
  if (delegation.projectCode && delegation.projectCode !== input.projectCode) return false;
  if (delegation.actionCode && delegation.actionCode !== input.actionCode && delegation.actionCode !== input.permissionCode) return false;
  return true;
}

export function checkNumberingPermission(input: CheckNumberingPermissionInput): NumberingPermissionCheckResult {
  const database = getDb();
  const permissionCode = input.permissionCode.trim();
  const context = getNumberingAccessContext(database, input.user);
  const delegatedRoles = context.delegations
    .filter((delegation) => delegationMatchesPermissionScope(delegation, { ...input, permissionCode }))
    .flatMap((delegation) => delegation.roleCodes);
  const candidateRoles = sortRoleCodesByPriority([...context.baseRoles, ...delegatedRoles], getActiveRolePriority(database));

  if (!permissionCode || candidateRoles.length === 0) {
    return {
      allowed: false,
      permissionKind: input.permissionKind,
      permissionCode,
      roleCode: null,
      evaluatedRoles: candidateRoles,
      reason: "no_candidate_role"
    };
  }

  const roleRows = database
    .prepare(`SELECT id, role_code FROM roles WHERE enabled = 1 AND role_code IN (${buildRolePlaceholders(candidateRoles)})`)
    .all(...candidateRoles) as Array<{ id: string; role_code: string }>;
  const roleByCode = new Map(roleRows.map((row) => [row.role_code, row]));
  const roleIds = roleRows.map((row) => row.id);
  const permissionRows = roleIds.length
    ? (database
        .prepare(`SELECT role_id, allowed FROM role_permissions WHERE permission_kind = ? AND permission_code = ? AND role_id IN (${buildRolePlaceholders(roleIds)})`)
        .all(input.permissionKind, permissionCode, ...roleIds) as Array<{ role_id: string; allowed: number }>)
    : [];
  const permissionByRoleId = new Map(permissionRows.map((row) => [row.role_id, row.allowed === 1]));

  for (const roleCode of candidateRoles) {
    const role = roleByCode.get(roleCode);
    if (!role) continue;
    if (permissionByRoleId.has(role.id)) {
      return {
        allowed: permissionByRoleId.get(role.id) === true,
        permissionKind: input.permissionKind,
        permissionCode,
        roleCode,
        evaluatedRoles: candidateRoles,
        reason: "explicit"
      };
    }
    if (roleCode === "system_admin") {
      return {
        allowed: true,
        permissionKind: input.permissionKind,
        permissionCode,
        roleCode,
        evaluatedRoles: candidateRoles,
        reason: "system_admin_default"
      };
    }
  }

  return {
    allowed: false,
    permissionKind: input.permissionKind,
    permissionCode,
    roleCode: candidateRoles[0] ?? null,
    evaluatedRoles: candidateRoles,
    reason: "missing_permission"
  };
}

export function listNumberingTasks(input: ListNumberingTasksInput) {
  const database = getDb();
  const companyId = input.companyId ?? "company-jenfu";
  const where: string[] = ["company_id = ?"];
  const values: unknown[] = [companyId];
  const accessContext = getNumberingAccessContext(database, input.user);
  if (input.status && input.status !== "all") {
    where.push("task_status = ?");
    values.push(input.status);
  }
  if (input.user.role !== "Admin") {
    const roles = accessContext.allRoles;
    where.push(`(assigned_to = ? OR created_by = ? OR assigned_role IN (${buildRolePlaceholders(roles)}))`);
    values.push(input.user.id, input.user.id, ...roles);
  }
  const rows = database
    .prepare(
      `
      SELECT
        id, company_id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
        assigned_to, assigned_role, project_code, action_url, detail_json, created_by, created_at, handled_at
      FROM numbering_task_items
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY
        CASE risk_level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ?
    `
    )
    .all(...values, input.user.role === "Admin" ? 100 : 500) as NumberingTaskRow[];
  return rows
    .filter((row) =>
      canAccessNumberingRoleItem(accessContext, row.assigned_to, row.created_by, row.assigned_role, row.project_code, extractActionCodeFromDetail(row.detail_json))
    )
    .slice(0, 100)
    .map((row) => {
      const task = mapNumberingTask(row);
      const marker = delegatedReviewMarker(accessContext, row.assigned_role, row.project_code, actionCodeFromDetail(task.detail));
      return marker ? { ...task, markers: [...task.markers, marker] } : task;
    });
}

export function updateNumberingTaskStatus(input: UpdateNumberingTaskStatusInput) {
  const database = getDb();
  const companyId = input.companyId ?? "company-jenfu";
  const now = new Date().toISOString();
  database
    .prepare("UPDATE numbering_task_items SET task_status = ?, handled_by = ?, handled_at = ?, updated_at = ? WHERE id = ? AND company_id = ?")
    .run(input.status, input.status === "handled" ? input.handledBy : null, input.status === "handled" ? now : null, now, input.taskId, companyId);
  const row = database
    .prepare(
      `
      SELECT
        id, company_id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
        assigned_to, assigned_role, project_code, action_url, detail_json, created_by, created_at, handled_at
      FROM numbering_task_items
      WHERE id = ? AND company_id = ?
    `
    )
    .get(input.taskId, companyId) as NumberingTaskRow | undefined;
  if (!row) throw new Error(`NUMBERING_TASK_NOT_FOUND: ${input.taskId}`);
  return mapNumberingTask(row);
}

export function listNumberingNotifications(input: ListNumberingNotificationsInput) {
  const database = getDb();
  const companyId = input.companyId ?? "company-jenfu";
  const where: string[] = ["company_id = ?"];
  const values: unknown[] = [companyId];
  const accessContext = getNumberingAccessContext(database, input.user);
  if (input.read === "read") where.push("read_at IS NOT NULL");
  if (input.read === "unread") where.push("read_at IS NULL");
  if (input.handled === "handled") where.push("handled_at IS NOT NULL");
  if (input.handled === "unhandled") where.push("handled_at IS NULL");
  if (input.user.role !== "Admin") {
    const roles = accessContext.allRoles;
    where.push(`(recipient_id = ? OR created_by = ? OR recipient_role IN (${buildRolePlaceholders(roles)}))`);
    values.push(input.user.id, input.user.id, ...roles);
  }
  const rows = database
    .prepare(
      `
      SELECT
        id, company_id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_id, recipient_role, read_at, handled_at, handled_by, dismissible,
        action_url, detail_json, created_by, created_at
      FROM numbering_notifications
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ?
    `
    )
    .all(...values, input.user.role === "Admin" ? 100 : 500) as NumberingNotificationRow[];
  return rows
    .filter((row) =>
      canAccessNumberingRoleItem(
        accessContext,
        row.recipient_id,
        row.created_by,
        row.recipient_role,
        extractProjectCodeFromDetail(row.detail_json),
        extractActionCodeFromDetail(row.detail_json)
      )
    )
    .slice(0, 100)
    .map((row) => {
      const notification = mapNumberingNotification(row);
      const marker = delegatedReviewMarker(accessContext, row.recipient_role, extractProjectCodeFromDetail(row.detail_json), actionCodeFromDetail(notification.detail));
      return marker ? { ...notification, markers: [...notification.markers, marker] } : notification;
    });
}

export function updateNumberingNotificationState(input: UpdateNumberingNotificationStateInput) {
  const database = getDb();
  const companyId = input.companyId ?? "company-jenfu";
  const row = database
    .prepare(
      `
      SELECT
        id, company_id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_id, recipient_role, read_at, handled_at, handled_by, dismissible,
        action_url, detail_json, created_by, created_at
      FROM numbering_notifications
      WHERE id = ? AND company_id = ?
    `
    )
    .get(input.notificationId, companyId) as NumberingNotificationRow | undefined;
  if (!row) throw new Error(`NUMBERING_NOTIFICATION_NOT_FOUND: ${input.notificationId}`);
  if (input.user.role !== "Admin") {
    const accessContext = getNumberingAccessContext(database, input.user);
    const visible = canAccessNumberingRoleItem(
      accessContext,
      row.recipient_id,
      row.created_by,
      row.recipient_role,
      extractProjectCodeFromDetail(row.detail_json),
      extractActionCodeFromDetail(row.detail_json)
    );
    if (!visible) throw new Error("NUMBERING_NOTIFICATION_FORBIDDEN");
  }
  if (input.markHandled && row.dismissible !== 1) {
    throw new Error("NUMBERING_NOTIFICATION_NOT_DISMISSIBLE");
  }
  const now = new Date().toISOString();
  database
    .prepare(
      `
      UPDATE numbering_notifications
      SET read_at = CASE WHEN ? = 1 AND read_at IS NULL THEN ? ELSE read_at END,
          handled_at = CASE WHEN ? = 1 AND handled_at IS NULL THEN ? ELSE handled_at END,
          handled_by = CASE WHEN ? = 1 THEN ? ELSE handled_by END,
          updated_at = ?
      WHERE id = ? AND company_id = ?
    `
    )
    .run(
      input.markRead ? 1 : 0,
      now,
      input.markHandled ? 1 : 0,
      now,
      input.markHandled ? 1 : 0,
      input.user.id,
      now,
      input.notificationId,
      companyId
    );
  const updated = database
    .prepare(
      `
      SELECT
        id, company_id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_id, recipient_role, read_at, handled_at, handled_by, dismissible,
        action_url, detail_json, created_by, created_at
      FROM numbering_notifications
      WHERE id = ? AND company_id = ?
    `
    )
    .get(input.notificationId, companyId) as NumberingNotificationRow;
  return mapNumberingNotification(updated);
}

function importString(row: NumberingImportRowInput, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function canonicalImportedRootName(coreName: string, partName: string) {
  const rootName = coreName.trim();
  const candidatePartName = partName.trim();
  if (!rootName) return candidatePartName;
  if (!candidatePartName) return rootName;
  if (candidatePartName === rootName) return rootName;
  if (candidatePartName.startsWith(rootName) && candidatePartName.length > rootName.length) return candidatePartName;
  return rootName;
}

function importedPartSequence(partNumber: string) {
  const v3 = partNumber.match(/^[A-Z][0-9]{4}-P([0-9]{2})$/);
  if (v3) return Number.parseInt(v3[1], 10);
  const v2 = partNumber.match(/^[0-9]{5}-P([0-9]{2})$/);
  if (v2) return Number.parseInt(v2[1], 10);
  const v1 = partNumber.match(/(\d{3})$/);
  return v1 ? Number.parseInt(v1[1], 10) : 0;
}

function importedDrawingSequence(drawingNumber: string) {
  const v3 = drawingNumber.match(/^[A-Z][0-9]{4}-[MR]([0-9]{2})$/);
  if (v3) return Number.parseInt(v3[1], 10);
  const v2 = drawingNumber.match(/^[0-9]{5}-[MR]([0-9]{2})$/);
  if (v2) return Number.parseInt(v2[1], 10);
  const v1 = drawingNumber.match(/(?:MA|OT)(\d)$/);
  return v1 ? Number.parseInt(v1[1], 10) : 1;
}

function inferImportedRuleVersionId(rootCode: string, partNumber?: string, drawingNumber?: string) {
  if (isV3RootCode(rootCode) || (partNumber && isV3PartNumber(partNumber)) || (drawingNumber && isV3DrawingNumber(drawingNumber))) {
    return NUMBERING_RULE_V3_ID;
  }
  if (isV2RootCode(rootCode) || (partNumber && isV2PartNumber(partNumber)) || (drawingNumber && isV2DrawingNumber(drawingNumber))) {
    return NUMBERING_RULE_V2_ID;
  }
  return NUMBERING_RULE_V1_ID;
}

function analyzeNumberingImportRow(
  database: SqliteDatabase,
  row: NumberingImportRowInput,
  seen: { roots: Set<string>; parts: Set<string>; drawings: Set<string> }
) {
  const rootCode = importString(row, "rootCode", "root_code", "主根號");
  const partNumber = importString(row, "partNumber", "part_number", "料號");
  const drawingNumber = importString(row, "drawingNumber", "drawing_number", "圖號");
  const importedCoreName = importString(row, "coreName", "core_name", "品名", "名稱");
  const importedPartName = importString(row, "partName", "part_name", "料號品名");
  const coreName = canonicalImportedRootName(importedCoreName, importedPartName);
  const partName = coreName;
  const issues: Array<{ code: string; message: string }> = [];

  if (!rootCode) issues.push({ code: "ROOT_CODE_REQUIRED", message: "rootCode is required." });
  if (!coreName && !partName) issues.push({ code: "NAME_REQUIRED", message: "coreName or partName is required." });
  if (!partNumber && !drawingNumber) issues.push({ code: "NUMBER_REQUIRED", message: "partNumber or drawingNumber is required." });
  if (rootCode && selectPartRootByCode(database, rootCode)) issues.push({ code: "ROOT_EXISTS", message: `Root ${rootCode} already exists.` });
  if (partNumber && selectPartNumberByNumber(database, partNumber)) issues.push({ code: "PART_EXISTS", message: `Part ${partNumber} already exists.` });
  if (drawingNumber && selectDrawingNumberByNumber(database, drawingNumber)) {
    issues.push({ code: "DRAWING_EXISTS", message: `Drawing ${drawingNumber} already exists.` });
  }
  if (rootCode && seen.roots.has(rootCode) && partNumber && seen.parts.has(partNumber)) {
    issues.push({ code: "DUPLICATE_ROW", message: "This root/part combination appears more than once in the import file." });
  }
  if (partNumber && seen.parts.has(partNumber)) issues.push({ code: "DUPLICATE_PART_IN_FILE", message: `Part ${partNumber} appears more than once.` });
  if (drawingNumber && seen.drawings.has(drawingNumber)) {
    issues.push({ code: "DUPLICATE_DRAWING_IN_FILE", message: `Drawing ${drawingNumber} appears more than once.` });
  }

  if (rootCode) seen.roots.add(rootCode);
  if (partNumber) seen.parts.add(partNumber);
  if (drawingNumber) seen.drawings.add(drawingNumber);

  const checkStatus: NumberingImportStagingRowRecord["checkStatus"] = issues.length === 0 ? "valid" : issues.some((issue) => issue.code.includes("EXISTS") || issue.code.includes("DUPLICATE")) ? "conflict" : "need_info";
  return { checkStatus, issues };
}

export function createNumberingImportBatch(input: CreateNumberingImportBatchInput) {
  const sourceFilename = input.sourceFilename.trim();
  if (!sourceFilename) throw new Error("IMPORT_SOURCE_FILENAME_REQUIRED");
  if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error("IMPORT_ROWS_REQUIRED");

  const database = getDb();
  return database.transaction(() => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const seen = { roots: new Set<string>(), parts: new Set<string>(), drawings: new Set<string>() };
    const analyzed = input.rows.map((row, index) => ({ row, rowNo: index + 1, ...analyzeNumberingImportRow(database, row, seen) }));
    const summary = {
      total: analyzed.length,
      valid: analyzed.filter((row) => row.checkStatus === "valid").length,
      needInfo: analyzed.filter((row) => row.checkStatus === "need_info").length,
      conflict: analyzed.filter((row) => row.checkStatus === "conflict").length
    };

    database
      .prepare(
        `
        INSERT INTO import_batches (
          id, source_filename, source_hash, status, summary_json, imported_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'staged', ?, ?, ?, ?)
      `
      )
      .run(id, sourceFilename, input.sourceHash?.trim() || null, JSON.stringify(summary), input.importedBy, now, now);

    for (const item of analyzed) {
      database
        .prepare(
          `
          INSERT INTO import_staging_rows (
            id, import_batch_id, row_no, raw_json, check_status, issue_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(crypto.randomUUID(), id, item.rowNo, JSON.stringify(item.row), item.checkStatus, JSON.stringify(item.issues), now);
    }

    insertAudit(database, {
      actorId: input.importedBy,
      action: "numbering.import_batch.stage",
      detail: { importBatchId: id, sourceFilename, summary }
    });

    return mapImportBatch(database, database.prepare("SELECT * FROM import_batches WHERE id = ?").get(id) as ImportBatchRow);
  })();
}

export function getNumberingImportBatch(batchId: string) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM import_batches WHERE id = ?").get(batchId) as ImportBatchRow | undefined;
  return row ? mapImportBatch(database, row) : null;
}

export function listNumberingImportBatches(input: ListNumberingImportBatchesInput = {}) {
  const database = getDb();
  const limit = clampListLimit(input.limit);
  return (database
    .prepare("SELECT * FROM import_batches ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT ?")
    .all(limit) as ImportBatchRow[]).map((row) => mapImportBatch(database, row));
}

export function confirmNumberingImportBatch(input: ConfirmNumberingImportBatchInput) {
  const database = getDb();
  return database.transaction(() => {
    const batch = database.prepare("SELECT * FROM import_batches WHERE id = ?").get(input.batchId) as ImportBatchRow | undefined;
    if (!batch) throw new Error(`IMPORT_BATCH_NOT_FOUND: ${input.batchId}`);
    if (batch.status !== "staged") throw new Error(`IMPORT_BATCH_ALREADY_${batch.status.toUpperCase()}`);

    const rows = database
      .prepare("SELECT id, import_batch_id, row_no, raw_json, check_status, issue_json FROM import_staging_rows WHERE import_batch_id = ? AND check_status = 'valid' ORDER BY row_no ASC")
      .all(input.batchId) as ImportStagingRow[];
    if (rows.length === 0) throw new Error("IMPORT_BATCH_HAS_NO_VALID_ROWS");

    const now = new Date().toISOString();
    let createdRoots = 0;
    let createdParts = 0;
    let createdDrawings = 0;
    for (const stagingRow of rows) {
      const raw = parseJsonDetail(stagingRow.raw_json);
      const rootCode = importString(raw, "rootCode", "root_code", "主根號");
      const coreName = canonicalImportedRootName(
        importString(raw, "coreName", "core_name", "品名", "名稱"),
        importString(raw, "partName", "part_name", "料號品名")
      );
      const itemKind = (importString(raw, "itemKind", "item_kind", "料件類型") || "manufactured") as NumberingItemKind;
      const partNumber = importString(raw, "partNumber", "part_number", "料號");
      const partName = coreName;
      const drawingNumber = importString(raw, "drawingNumber", "drawing_number", "圖號");
      const purposeCode = (importString(raw, "purposeCode", "purpose_code", "圖別") || "MA") as DrawingPurposeCode;
      const ruleVersionId = inferImportedRuleVersionId(rootCode, partNumber, drawingNumber);

      let root = selectPartRootByCode(database, rootCode);
      if (!root) {
        database
          .prepare(
            `
            INSERT INTO part_roots (
              id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'EVT', 'Active', ?, ?, ?, ?)
          `
          )
          .run(crypto.randomUUID(), rootCode, coreName, itemKind, ruleVersionId, input.confirmedBy, now, now);
        createdRoots += 1;
        root = selectPartRootByCode(database, rootCode);
      }
      if (!root) throw new Error(`IMPORT_ROOT_CREATE_FAILED: ${rootCode}`);

      let partRow = partNumber ? selectPartNumberByNumber(database, partNumber) : undefined;
      if (partNumber && !partRow) {
        const sequenceNo = importedPartSequence(partNumber);
        database
          .prepare(
            `
            INSERT INTO part_numbers (
              id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
              is_universal, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'EVT', 'Active', ?, ?, ?, ?)
          `
          )
          .run(
            crypto.randomUUID(),
            root.id,
            partNumber,
            sequenceNo,
            formatPartSequence(sequenceNo, ruleVersionId),
            partName,
            itemKind,
            ruleVersionId,
            input.confirmedBy,
            now,
            now
          );
        createdParts += 1;
        partRow = selectPartNumberByNumber(database, partNumber);
      }

      let drawingRow = drawingNumber ? selectDrawingNumberByNumber(database, drawingNumber) : undefined;
      if (drawingNumber && !drawingRow) {
        database
          .prepare(
            `
            INSERT INTO drawing_numbers (
              id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
              is_primary_manufacturing, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EVT', 'Active', ?, ?, ?, ?)
          `
          )
          .run(
            crypto.randomUUID(),
            root.id,
            drawingNumber,
            purposeCode,
            normalizePurposeDescription(purposeCode, importString(raw, "purposeDescription", "purpose_description", "圖面用途")),
            importedDrawingSequence(drawingNumber),
            isManufacturingDrawingPurpose(purposeCode) ? 1 : 0,
            ruleVersionId,
            input.confirmedBy,
            now,
            now
          );
        createdDrawings += 1;
        drawingRow = selectDrawingNumberByNumber(database, drawingNumber);
      }

      if (partRow && drawingRow && partRow.part_root_id === drawingRow.part_root_id) {
        const linkType = isManufacturingDrawingPurpose(drawingRow.purpose_code) ? "primary_manufacturing" : "reference";
        const existingLink = database
          .prepare("SELECT id FROM drawing_part_links WHERE drawing_number_id = ? AND part_number_id = ? AND link_type = ? LIMIT 1")
          .get(drawingRow.id, partRow.id, linkType);
        if (!existingLink) {
          database
            .prepare(
              `
              INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `
            )
            .run(crypto.randomUUID(), drawingRow.id, partRow.id, linkType, input.confirmedBy, now);
        }
      }

      database.prepare("UPDATE import_staging_rows SET check_status = 'legacy_keep' WHERE id = ?").run(stagingRow.id);
    }

    const summary = { ...parseJsonDetail(batch.summary_json), createdRoots, createdParts, createdDrawings };
    database
      .prepare("UPDATE import_batches SET status = 'confirmed', summary_json = ?, confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(summary), input.confirmedBy, now, now, input.batchId);
    insertAudit(database, {
      actorId: input.confirmedBy,
      action: "numbering.import_batch.confirm",
      detail: { importBatchId: input.batchId, summary }
    });

    return mapImportBatch(database, database.prepare("SELECT * FROM import_batches WHERE id = ?").get(input.batchId) as ImportBatchRow);
  })();
}

function buildNumberingExportPayload(database: SqliteDatabase, exportMode: NumberingExportMode) {
  const roots = database.prepare("SELECT root_code, core_name, item_kind, development_phase, record_status, updated_at FROM part_roots ORDER BY root_code").all();
  const parts = database
    .prepare(
      `
      SELECT r.root_code, p.part_number, p.part_name, p.item_kind, p.development_phase, p.record_status, p.updated_at
      FROM part_numbers p
      JOIN part_roots r ON r.id = p.part_root_id
      ORDER BY r.root_code, p.sequence_no
    `
    )
    .all();
  const drawings = database
    .prepare(
      `
      SELECT r.root_code, d.drawing_number, d.purpose_code, d.purpose_description, d.development_phase, d.record_status, d.updated_at
      FROM drawing_numbers d
      JOIN part_roots r ON r.id = d.part_root_id
      ORDER BY r.root_code, d.purpose_code, d.sequence_no
    `
    )
    .all();
  const result: Record<string, unknown> = {
    exportMode,
    generatedAt: new Date().toISOString(),
    roots,
    parts,
    drawings
  };
  if (exportMode !== "no_audit") {
    const limit = exportMode === "last_change_summary" ? 50 : 500;
    result.auditSummary = database
      .prepare("SELECT action, actor_id, detail_json, created_at FROM audit_logs WHERE action LIKE 'numbering.%' ORDER BY created_at DESC LIMIT ?")
      .all(limit);
  }
  return result;
}

export function createNumberingExportJob(input: CreateNumberingExportJobInput) {
  const database = getDb();
  return database.transaction(() => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = buildNumberingExportPayload(database, input.exportMode);
    database
      .prepare(
        `
        INSERT INTO numbering_export_jobs (
          id, export_mode, status, result_json, generated_by, generated_at, completed_at
        ) VALUES (?, ?, 'completed', ?, ?, ?, ?)
      `
      )
      .run(id, input.exportMode, JSON.stringify(result), input.generatedBy, now, now);
    insertAudit(database, {
      actorId: input.generatedBy,
      action: "numbering.export_job.create",
      detail: { exportJobId: id, exportMode: input.exportMode }
    });
    return mapNumberingExportJob(database.prepare("SELECT * FROM numbering_export_jobs WHERE id = ?").get(id) as NumberingExportJobRow);
  })();
}

export function getNumberingExportJob(jobId: string) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM numbering_export_jobs WHERE id = ?").get(jobId) as NumberingExportJobRow | undefined;
  return row ? mapNumberingExportJob(row) : null;
}

export function listNumberingExportJobs(input: ListNumberingExportJobsInput = {}) {
  const database = getDb();
  const limit = clampListLimit(input.limit);
  return (database
    .prepare("SELECT * FROM numbering_export_jobs ORDER BY generated_at DESC, id DESC LIMIT ?")
    .all(limit) as NumberingExportJobRow[]).map(mapNumberingExportJob);
}

function currentReportMonth() {
  return new Date().toISOString().slice(0, 7);
}

function countQuery(database: SqliteDatabase, query: string, ...params: Array<string | number | null>) {
  return (database.prepare(query).get(...params) as { count: number }).count;
}

function countOpenTasksForRoles(database: SqliteDatabase, roles: string[]) {
  const placeholders = roles.map(() => "?").join(", ");
  return countQuery(database, `SELECT COUNT(*) AS count FROM numbering_task_items WHERE task_status = 'open' AND assigned_role IN (${placeholders})`, ...roles);
}

function countApprovalRulesForRoles(database: SqliteDatabase, roles: string[]) {
  const placeholders = roles.map(() => "?").join(", ");
  return countQuery(database, `SELECT COUNT(*) AS count FROM approval_rules WHERE approver_role IN (${placeholders})`, ...roles);
}

function buildReportDepartmentPages(database: SqliteDatabase, counts: Record<string, number>) {
  const definitions = [
    { key: "company", label: "全公司總覽", roles: [] },
    { key: "rd", label: "研發", roles: ["rd", "rd_manager"] },
    { key: "pdm_admin", label: "PDM 管理", roles: ["pdm_admin", "system_admin"] },
    { key: "qa_document", label: "QA / 文件", roles: ["qa", "document_admin"] }
  ];
  return definitions.map((definition) => {
    const scoped = definition.roles.length > 0;
    return {
      key: definition.key,
      label: definition.label,
      roles: definition.roles,
      counts: scoped
        ? {
            openTasks: countOpenTasksForRoles(database, definition.roles),
            approvalRules: countApprovalRulesForRoles(database, definition.roles)
          }
        : counts
    };
  });
}

function buildReportProjectBuckets(database: SqliteDatabase) {
  return database
    .prepare(
      `
      SELECT COALESCE(NULLIF(project_code, ''), '未指定專案') AS projectCode,
             COUNT(*) AS totalTasks,
             SUM(CASE WHEN task_status = 'open' THEN 1 ELSE 0 END) AS openTasks,
             SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) AS criticalTasks
      FROM numbering_task_items
      GROUP BY COALESCE(NULLIF(project_code, ''), '未指定專案')
      ORDER BY openTasks DESC, totalTasks DESC, projectCode ASC
      LIMIT 20
    `
    )
    .all();
}

export function generateMonthlyNumberingAuditReport(input: GenerateMonthlyNumberingAuditReportInput) {
  const database = getDb();
  return database.transaction(() => {
    const id = crypto.randomUUID();
    const reportMonth = input.reportMonth?.trim() || currentReportMonth();
    const generationMode = input.generationMode ?? "manual";
    const counts = {
      roots: countQuery(database, "SELECT COUNT(*) AS count FROM part_roots"),
      parts: countQuery(database, "SELECT COUNT(*) AS count FROM part_numbers"),
      drawings: countQuery(database, "SELECT COUNT(*) AS count FROM drawing_numbers"),
      openTasks: countQuery(database, "SELECT COUNT(*) AS count FROM numbering_task_items WHERE task_status = 'open'")
    };
    const query = {
      reportType: "numbering_master",
      reportMonth,
      scheduledDay: 1,
      counts,
      departmentPages: buildReportDepartmentPages(database, counts),
      projectBuckets: buildReportProjectBuckets(database)
    };
    database
      .prepare(
        `
        INSERT INTO monthly_audit_reports (
          id, report_type, report_month, generation_mode, generated_by, status, query_json, created_at
        ) VALUES (?, 'numbering_master', ?, ?, ?, 'completed', ?, ?)
      `
      )
      .run(id, reportMonth, generationMode, input.generatedBy ?? null, JSON.stringify(query), new Date().toISOString());
    insertAudit(database, {
      actorId: input.generatedBy,
      action: "numbering.monthly_audit_report.generate",
      detail: { monthlyAuditReportId: id, reportMonth, generationMode }
    });
    return mapMonthlyAuditReport(database.prepare("SELECT * FROM monthly_audit_reports WHERE id = ?").get(id) as MonthlyAuditReportRow);
  })();
}

export function getMonthlyNumberingAuditReport(reportId: string) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM monthly_audit_reports WHERE id = ? AND report_type = 'numbering_master'").get(reportId) as
    | MonthlyAuditReportRow
    | undefined;
  return row ? mapMonthlyAuditReport(row) : null;
}

export function listMonthlyNumberingAuditReports(input: ListMonthlyNumberingAuditReportsInput = {}) {
  const database = getDb();
  const limit = clampListLimit(input.limit);
  const reportMonth = input.reportMonth?.trim();
  const rows = reportMonth
    ? (database
        .prepare("SELECT * FROM monthly_audit_reports WHERE report_type = 'numbering_master' AND report_month = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(reportMonth, limit) as MonthlyAuditReportRow[])
    : (database
        .prepare("SELECT * FROM monthly_audit_reports WHERE report_type = 'numbering_master' ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(limit) as MonthlyAuditReportRow[]);
  return rows.map(mapMonthlyAuditReport);
}

export function listNumberingAdminMatrix(): NumberingAdminMatrixRecord {
  const database = getDb();
  ensureDefaultApprovalRulesForCurrentRuleVersion(database);
  const roles = (database.prepare("SELECT * FROM roles ORDER BY system_defined DESC, title ASC").all() as NumberingAdminRoleRow[]).map(
    mapNumberingAdminRole
  );
  const users = (database.prepare("SELECT id, display_name, email, role FROM users ORDER BY role DESC, display_name ASC").all() as NumberingAdminUserRow[]).map(
    mapNumberingAdminUser
  );
  const rolePermissions = (
    database.prepare("SELECT * FROM role_permissions ORDER BY role_id ASC, permission_kind ASC, permission_code ASC").all() as NumberingAdminPermissionRow[]
  ).map(mapNumberingAdminPermission);
  const roleScopes = (
    database.prepare("SELECT * FROM role_scope_rules ORDER BY role_id ASC, scope_kind ASC, scope_code ASC").all() as NumberingAdminRoleScopeRow[]
  ).map(mapNumberingAdminRoleScope);
  const roleAssignments = (
    database
      .prepare(
        `
        SELECT
          a.id, a.user_id, u.display_name AS user_name, u.email AS user_email, u.role AS user_system_role,
          a.role_id, r.role_code, r.title AS role_title,
          a.reason, a.scope_template, a.named_scope, a.sponsor_user_id, a.starts_at, a.review_due_at, a.hard_ends_at,
          a.assigned_by, a.assigned_at, a.revoked_at, a.revoked_by
        FROM user_role_assignments a
        JOIN users u ON u.id = a.user_id
        JOIN roles r ON r.id = a.role_id
        ORDER BY a.revoked_at IS NOT NULL ASC, a.assigned_at DESC
      `
      )
      .all() as NumberingUserRoleAssignmentRow[]
  ).map(mapNumberingUserRoleAssignment);
  const rolePriorityVersions = (
    database.prepare("SELECT * FROM role_priority_versions ORDER BY created_at DESC").all() as NumberingRolePriorityVersionRow[]
  ).map(mapNumberingRolePriorityVersion);
  const activeRolePriority = rolePriorityVersions.find((version) => version.status === "active")?.priority ?? DEFAULT_ROLE_PRIORITY;
  const approvalDelegations = (
    database
      .prepare(
        `
        SELECT
          d.id, d.delegated_from, from_user.display_name AS delegated_from_name, from_user.role AS delegated_from_role,
          d.delegated_to, to_user.display_name AS delegated_to_name, to_user.role AS delegated_to_role,
          d.project_code, d.action_code, d.starts_at, d.ends_at, d.reason,
          d.created_by, d.created_at, d.revoked_at, d.revoked_by
        FROM approval_delegations d
        JOIN users from_user ON from_user.id = d.delegated_from
        JOIN users to_user ON to_user.id = d.delegated_to
        ORDER BY d.revoked_at IS NOT NULL ASC, d.created_at DESC
      `
      )
      .all() as NumberingApprovalDelegationRow[]
  ).map(mapNumberingApprovalDelegation);
  const auditEvents = (
    database
      .prepare(
        `
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
      `
      )
      .all() as NumberingAdminAuditEventRow[]
  ).map(mapNumberingAdminAuditEvent);
  const approvalRules = (
    database
      .prepare("SELECT * FROM approval_rules WHERE rule_version_id = ? ORDER BY action_code ASC, COALESCE(phase, '') ASC, rule_name ASC")
      .all(DEFAULT_RULE_VERSION_ID) as ApprovalRuleRow[]
  ).map(mapAdminApprovalRule);
  const ruleTemplates = (
    database.prepare("SELECT * FROM rule_templates ORDER BY system_defined DESC, template_code ASC").all() as NumberingAdminRuleTemplateRow[]
  ).map(mapNumberingRuleTemplate);
  const ruleVersions = (
    database.prepare("SELECT id, rule_code, title, status, effective_at, retired_at FROM numbering_rule_versions ORDER BY effective_at DESC, created_at DESC").all() as
      NumberingRuleVersionRow[]
  ).map(mapNumberingRuleVersion);
  const actionCodes = Array.from(
    new Set([
      ...NUMBERING_ACTION_PERMISSION_CODES,
      ...approvalRules.map((rule) => rule.actionCode)
    ])
  ).sort();

  return {
    ruleVersionId: DEFAULT_RULE_VERSION_ID,
    roles,
    users,
    rolePermissions,
    roleScopes,
    rolePriorityVersions,
    activeRolePriority,
    roleAssignments,
    approvalDelegations,
    auditEvents,
    approvalRules,
    hardRules: NUMBERING_HARD_RULE_CATALOG,
    ruleTemplates,
    ruleVersions,
    options: {
      actionCodes,
      pagePermissionCodes: [...NUMBERING_PAGE_PERMISSION_CODES],
      phases: ["EVT", "DVT", "Release"],
      recordStatuses: ["Draft", "NeedInfo", "Active", "PendingReview", "Released", "Obsolete", "Merged", "EVTDisabled", "PendingAdminConfirm", "MainDrawingInvalid"],
      itemKinds: ["manufactured", "outsourced", "purchased", "custom", "universal"],
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

function resolveNumberingRole(database: SqliteDatabase, input: { roleId?: string; roleCode?: string }) {
  const roleId = input.roleId?.trim();
  const roleCode = input.roleCode?.trim();
  const row = roleId
    ? (database.prepare("SELECT * FROM roles WHERE id = ?").get(roleId) as NumberingAdminRoleRow | undefined)
    : roleCode
      ? (database.prepare("SELECT * FROM roles WHERE role_code = ?").get(roleCode) as NumberingAdminRoleRow | undefined)
      : undefined;
  if (!row) throw new Error("NUMBERING_ROLE_NOT_FOUND");
  return row;
}

export function upsertNumberingAdminRole(input: UpsertNumberingAdminRoleInput): NumberingAdminRoleRecord {
  const database = getDb();
  return database.transaction(() => {
    const roleCode = input.roleCode.trim().toLowerCase().replaceAll(" ", "_");
    const title = input.title.trim();
    if (!roleCode || !/^[a-z][a-z0-9_]*$/.test(roleCode)) throw new Error("NUMBERING_ROLE_CODE_INVALID");
    if (!title) throw new Error("NUMBERING_ROLE_TITLE_REQUIRED");
    const existing = input.id
      ? (database.prepare("SELECT * FROM roles WHERE id = ?").get(input.id) as NumberingAdminRoleRow | undefined)
      : (database.prepare("SELECT * FROM roles WHERE role_code = ?").get(roleCode) as NumberingAdminRoleRow | undefined);
    const id = existing?.id ?? input.id?.trim() ?? `role-${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    if (existing) {
      database.prepare("UPDATE roles SET title = ?, updated_at = ? WHERE id = ?").run(title, now, existing.id);
    } else {
      database.prepare("INSERT INTO roles (id, role_code, title, system_defined, enabled, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)").run(
        id,
        roleCode,
        title,
        now,
        now
      );
    }
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.role.upsert",
      detail: { roleId: id, roleCode, title, systemDefined: existing?.system_defined === 1 }
    });
    return mapNumberingAdminRole(database.prepare("SELECT * FROM roles WHERE id = ?").get(id) as NumberingAdminRoleRow);
  })();
}

export function upsertNumberingRolePermission(input: UpsertNumberingRolePermissionInput): NumberingAdminPermissionRecord {
  const database = getDb();
  return database.transaction(() => {
    const role = resolveNumberingRole(database, input);
    const permissionCode = input.permissionCode.trim();
    if (!permissionCode) throw new Error("NUMBERING_PERMISSION_CODE_REQUIRED");
    const now = new Date().toISOString();
    const existing = database
      .prepare("SELECT * FROM role_permissions WHERE role_id = ? AND permission_kind = ? AND permission_code = ?")
      .get(role.id, input.permissionKind, permissionCode) as NumberingAdminPermissionRow | undefined;
    const id = existing?.id ?? `role-permission-${crypto.randomUUID().slice(0, 12)}`;
    if (existing) {
      database.prepare("UPDATE role_permissions SET allowed = ?, updated_at = ? WHERE id = ?").run(boolToInt(input.allowed), now, existing.id);
    } else {
      database
        .prepare(
          "INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(id, role.id, input.permissionKind, permissionCode, boolToInt(input.allowed), now, now);
    }
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.role_permission.upsert",
      detail: { roleCode: role.role_code, permissionKind: input.permissionKind, permissionCode, allowed: input.allowed }
    });
    return mapNumberingAdminPermission(database.prepare("SELECT * FROM role_permissions WHERE id = ?").get(id) as NumberingAdminPermissionRow);
  })();
}

export function upsertNumberingRoleScope(input: UpsertNumberingRoleScopeInput): NumberingAdminRoleScopeRecord {
  const database = getDb();
  return database.transaction(() => {
    const role = resolveNumberingRole(database, input);
    const scopeCode = input.scopeCode.trim();
    if (!scopeCode) throw new Error("NUMBERING_ROLE_SCOPE_CODE_REQUIRED");
    const now = new Date().toISOString();
    const existing = database
      .prepare("SELECT * FROM role_scope_rules WHERE role_id = ? AND scope_kind = ? AND scope_code = ?")
      .get(role.id, input.scopeKind, scopeCode) as NumberingAdminRoleScopeRow | undefined;
    const id = existing?.id ?? `role-scope-${crypto.randomUUID().slice(0, 12)}`;
    if (existing) {
      database.prepare("UPDATE role_scope_rules SET allowed = ?, updated_at = ? WHERE id = ?").run(boolToInt(input.allowed), now, existing.id);
    } else {
      database
        .prepare("INSERT INTO role_scope_rules (id, role_id, scope_kind, scope_code, allowed, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, role.id, input.scopeKind, scopeCode, boolToInt(input.allowed), input.actorId ?? null, now, now);
    }
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.role_scope.upsert",
      detail: { roleCode: role.role_code, scopeKind: input.scopeKind, scopeCode, allowed: input.allowed }
    });
    return mapNumberingAdminRoleScope(database.prepare("SELECT * FROM role_scope_rules WHERE id = ?").get(id) as NumberingAdminRoleScopeRow);
  })();
}

function selectNumberingUserRoleAssignment(database: SqliteDatabase, assignmentId: string) {
  return database
    .prepare(
      `
      SELECT
        a.id, a.user_id, u.display_name AS user_name, u.email AS user_email, u.role AS user_system_role,
        a.role_id, r.role_code, r.title AS role_title,
        a.reason, a.scope_template, a.named_scope, a.sponsor_user_id, a.starts_at, a.review_due_at, a.hard_ends_at,
        a.assigned_by, a.assigned_at, a.revoked_at, a.revoked_by
      FROM user_role_assignments a
      JOIN users u ON u.id = a.user_id
      JOIN roles r ON r.id = a.role_id
      WHERE a.id = ?
    `
    )
    .get(assignmentId) as NumberingUserRoleAssignmentRow | undefined;
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

function normalizeRoleAssignmentScope(database: SqliteDatabase, roleCode: string, input: UpsertNumberingUserRoleAssignmentInput, now: string) {
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
  if (sponsorUserId && !database.prepare("SELECT id FROM users WHERE id = ?").get(sponsorUserId)) {
    throw new Error("NUMBERING_ROLE_ASSIGNMENT_SPONSOR_NOT_FOUND");
  }
  if (hardEndsAt && startsAt && hardEndsAt < startsAt) throw new Error("NUMBERING_ROLE_ASSIGNMENT_TIME_RANGE_INVALID");

  return { scopeTemplate, namedScope, sponsorUserId, startsAt, reviewDueAt, hardEndsAt };
}

export function upsertNumberingUserRoleAssignment(input: UpsertNumberingUserRoleAssignmentInput): NumberingUserRoleAssignmentRecord {
  const database = getDb();
  return database.transaction(() => {
    const userId = input.userId.trim();
    const reason = input.reason.trim();
    if (!reason) throw new Error("NUMBERING_ROLE_ASSIGNMENT_REASON_REQUIRED");
    const user = database.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: string } | undefined;
    if (!user) throw new Error("NUMBERING_ROLE_ASSIGNMENT_USER_NOT_FOUND");
    const role = resolveNumberingRole(database, input);
    const now = new Date().toISOString();
    const scope = normalizeRoleAssignmentScope(database, role.role_code, input, now);
    const existing = input.id
      ? (database.prepare("SELECT * FROM user_role_assignments WHERE id = ?").get(input.id.trim()) as { id: string; revoked_at: string | null } | undefined)
      : (database
          .prepare("SELECT * FROM user_role_assignments WHERE user_id = ? AND role_id = ? AND revoked_at IS NULL")
          .get(userId, role.id) as { id: string; revoked_at: string | null } | undefined);
    if (existing?.revoked_at) throw new Error("NUMBERING_ROLE_ASSIGNMENT_REVOKED");
    const before = existing ? mapNumberingUserRoleAssignment(selectNumberingUserRoleAssignment(database, existing.id) as NumberingUserRoleAssignmentRow) : null;
    const id = existing?.id ?? input.id?.trim() ?? `user-role-${crypto.randomUUID().slice(0, 12)}`;
    if (existing) {
      database
        .prepare(
          `UPDATE user_role_assignments
           SET user_id = ?,
               role_id = ?,
               reason = ?,
               scope_template = ?,
               named_scope = ?,
               sponsor_user_id = ?,
               starts_at = ?,
               review_due_at = ?,
               hard_ends_at = ?,
               assigned_by = ?,
               assigned_at = ?
           WHERE id = ?`
        )
        .run(
          userId,
          role.id,
          reason,
          scope.scopeTemplate,
          scope.namedScope,
          scope.sponsorUserId,
          scope.startsAt,
          scope.reviewDueAt,
          scope.hardEndsAt,
          input.actorId,
          now,
          existing.id
        );
    } else {
      database
        .prepare(
          `INSERT INTO user_role_assignments (
             id, user_id, role_id, reason, scope_template, named_scope, sponsor_user_id,
             starts_at, review_due_at, hard_ends_at, assigned_by, assigned_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          userId,
          role.id,
          reason,
          scope.scopeTemplate,
          scope.namedScope,
          scope.sponsorUserId,
          scope.startsAt,
          scope.reviewDueAt,
          scope.hardEndsAt,
          input.actorId,
          now
        );
    }
    const after = mapNumberingUserRoleAssignment(selectNumberingUserRoleAssignment(database, id) as NumberingUserRoleAssignmentRow);
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.user_role_assignment.upsert",
      detail: {
        before,
        after,
        markers: ["role_assignment_override"],
        userId,
        roleCode: role.role_code,
        reason,
        scope
      }
    });
    return after;
  })();
}

export function revokeNumberingUserRoleAssignment(input: RevokeNumberingUserRoleAssignmentInput): NumberingUserRoleAssignmentRecord {
  const database = getDb();
  return database.transaction(() => {
    const assignmentId = input.id.trim();
    const beforeRow = selectNumberingUserRoleAssignment(database, assignmentId);
    if (!beforeRow) throw new Error("NUMBERING_ROLE_ASSIGNMENT_NOT_FOUND");
    const before = mapNumberingUserRoleAssignment(beforeRow);
    if (!before.revokedAt) {
      database
        .prepare("UPDATE user_role_assignments SET revoked_at = ?, revoked_by = ? WHERE id = ?")
        .run(new Date().toISOString(), input.actorId, assignmentId);
    }
    const after = mapNumberingUserRoleAssignment(selectNumberingUserRoleAssignment(database, assignmentId) as NumberingUserRoleAssignmentRow);
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.user_role_assignment.revoke",
      detail: {
        before,
        after,
        markers: ["role_assignment_override"],
        reason: input.reason?.trim() ?? null
      }
    });
    return after;
  })();
}

export function saveNumberingRolePriority(input: SaveNumberingRolePriorityInput): NumberingRolePriorityVersionRecord {
  const database = getDb();
  return database.transaction(() => {
    const priority = Array.from(new Set(input.priority.map((roleCode) => roleCode.trim()).filter(Boolean)));
    const reason = input.reason.trim();
    if (priority.length === 0) throw new Error("NUMBERING_ROLE_PRIORITY_REQUIRED");
    if (!reason) throw new Error("NUMBERING_ROLE_PRIORITY_REASON_REQUIRED");
    const existingRoleCount = database
      .prepare(`SELECT COUNT(*) AS count FROM roles WHERE role_code IN (${buildRolePlaceholders(priority)})`)
      .get(...priority) as { count: number };
    if (existingRoleCount.count !== priority.length) throw new Error("NUMBERING_ROLE_PRIORITY_ROLE_NOT_FOUND");
    const before = (
      database.prepare("SELECT * FROM role_priority_versions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as NumberingRolePriorityVersionRow | undefined
    );
    const now = new Date().toISOString();
    database.prepare("UPDATE role_priority_versions SET status = 'retired' WHERE status = 'active'").run();
    const id = `role-priority-${crypto.randomUUID().slice(0, 12)}`;
    const versionCode = `role-priority-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${id.slice(-4)}`;
    database
      .prepare("INSERT INTO role_priority_versions (id, version_code, priority_json, status, created_by, created_at) VALUES (?, ?, ?, 'active', ?, ?)")
      .run(id, versionCode, JSON.stringify(priority), input.actorId ?? null, now);
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.role_priority.save",
      detail: { before: before ? parseRolePriorityJson(before.priority_json) : DEFAULT_ROLE_PRIORITY, after: priority, reason, versionCode }
    });
    return mapNumberingRolePriorityVersion(database.prepare("SELECT * FROM role_priority_versions WHERE id = ?").get(id) as NumberingRolePriorityVersionRow);
  })();
}

export function upsertNumberingApprovalDelegation(input: UpsertNumberingApprovalDelegationInput): NumberingApprovalDelegationRecord {
  const database = getDb();
  return database.transaction(() => {
    const delegatedFrom = input.delegatedFrom.trim();
    const delegatedTo = input.delegatedTo.trim();
    const reason = input.reason.trim();
    if (!delegatedFrom || !delegatedTo) throw new Error("NUMBERING_DELEGATION_USERS_REQUIRED");
    if (delegatedFrom === delegatedTo) throw new Error("NUMBERING_DELEGATION_SELF_NOT_ALLOWED");
    if (!reason) throw new Error("NUMBERING_DELEGATION_REASON_REQUIRED");
    if (!database.prepare("SELECT id FROM users WHERE id = ?").get(delegatedFrom)) throw new Error("NUMBERING_DELEGATION_FROM_NOT_FOUND");
    if (!database.prepare("SELECT id FROM users WHERE id = ?").get(delegatedTo)) throw new Error("NUMBERING_DELEGATION_TO_NOT_FOUND");
    const startsAt = nullableText(input.startsAt);
    const endsAt = nullableText(input.endsAt);
    if (startsAt && endsAt && startsAt > endsAt) throw new Error("NUMBERING_DELEGATION_TIME_RANGE_INVALID");
    const now = new Date().toISOString();
    const existing = input.id
      ? (database
          .prepare(
            `
            SELECT
              d.id, d.delegated_from, from_user.display_name AS delegated_from_name, from_user.role AS delegated_from_role,
              d.delegated_to, to_user.display_name AS delegated_to_name, to_user.role AS delegated_to_role,
              d.project_code, d.action_code, d.starts_at, d.ends_at, d.reason,
              d.created_by, d.created_at, d.revoked_at, d.revoked_by
            FROM approval_delegations d
            JOIN users from_user ON from_user.id = d.delegated_from
            JOIN users to_user ON to_user.id = d.delegated_to
            WHERE d.id = ?
          `
          )
          .get(input.id) as NumberingApprovalDelegationRow | undefined)
      : undefined;
    const id = existing?.id ?? input.id?.trim() ?? `delegation-${crypto.randomUUID().slice(0, 12)}`;
    if (existing) {
      database
        .prepare(
          `
          UPDATE approval_delegations
          SET delegated_from = ?, delegated_to = ?, project_code = ?, action_code = ?, starts_at = ?, ends_at = ?, reason = ?, revoked_at = NULL, revoked_by = NULL
          WHERE id = ?
        `
        )
        .run(delegatedFrom, delegatedTo, nullableText(input.projectCode), nullableText(input.actionCode), startsAt, endsAt, reason, id);
    } else {
      database
        .prepare(
          `
          INSERT INTO approval_delegations (id, delegated_from, delegated_to, project_code, action_code, starts_at, ends_at, reason, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(id, delegatedFrom, delegatedTo, nullableText(input.projectCode), nullableText(input.actionCode), startsAt, endsAt, reason, input.actorId, now);
    }
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.approval_delegation.upsert",
      detail: { delegationId: id, delegatedFrom, delegatedTo, projectCode: nullableText(input.projectCode), actionCode: nullableText(input.actionCode), startsAt, endsAt, reason }
    });
    const row = database
      .prepare(
        `
        SELECT
          d.id, d.delegated_from, from_user.display_name AS delegated_from_name, from_user.role AS delegated_from_role,
          d.delegated_to, to_user.display_name AS delegated_to_name, to_user.role AS delegated_to_role,
          d.project_code, d.action_code, d.starts_at, d.ends_at, d.reason,
          d.created_by, d.created_at, d.revoked_at, d.revoked_by
        FROM approval_delegations d
        JOIN users from_user ON from_user.id = d.delegated_from
        JOIN users to_user ON to_user.id = d.delegated_to
        WHERE d.id = ?
      `
      )
      .get(id) as NumberingApprovalDelegationRow;
    return mapNumberingApprovalDelegation(row);
  })();
}

export function revokeNumberingApprovalDelegation(input: RevokeNumberingApprovalDelegationInput): NumberingApprovalDelegationRecord {
  const database = getDb();
  return database.transaction(() => {
    const now = new Date().toISOString();
    database.prepare("UPDATE approval_delegations SET revoked_at = ?, revoked_by = ? WHERE id = ?").run(now, input.actorId, input.id);
    const row = database
      .prepare(
        `
        SELECT
          d.id, d.delegated_from, from_user.display_name AS delegated_from_name, from_user.role AS delegated_from_role,
          d.delegated_to, to_user.display_name AS delegated_to_name, to_user.role AS delegated_to_role,
          d.project_code, d.action_code, d.starts_at, d.ends_at, d.reason,
          d.created_by, d.created_at, d.revoked_at, d.revoked_by
        FROM approval_delegations d
        JOIN users from_user ON from_user.id = d.delegated_from
        JOIN users to_user ON to_user.id = d.delegated_to
        WHERE d.id = ?
      `
      )
      .get(input.id) as NumberingApprovalDelegationRow | undefined;
    if (!row) throw new Error("NUMBERING_DELEGATION_NOT_FOUND");
    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.approval_delegation.revoke",
      detail: { delegationId: input.id, reason: nullableText(input.reason) }
    });
    return mapNumberingApprovalDelegation(row);
  })();
}

export function upsertNumberingApprovalRule(input: UpsertNumberingApprovalRuleInput): NumberingAdminApprovalRuleRecord {
  const database = getDb();
  return database.transaction(() => {
    const existing = input.id
      ? (database.prepare("SELECT * FROM approval_rules WHERE id = ?").get(input.id) as ApprovalRuleRow | undefined)
      : undefined;
    const id = existing?.id ?? input.id?.trim() ?? crypto.randomUUID();
    const ruleVersionId = nullableText(input.ruleVersionId) ?? existing?.rule_version_id ?? DEFAULT_RULE_VERSION_ID;
    const actionCode = input.actionCode.trim();
    const requiresApproval = input.requiresApproval ?? (existing ? existing.requires_approval === 1 : false);
    const approverRole = nullableTextOrExisting(input.approverRole, existing?.approver_role);

    if (!actionCode) throw new Error("APPROVAL_RULE_ACTION_REQUIRED");
    if (!database.prepare("SELECT id FROM numbering_rule_versions WHERE id = ?").get(ruleVersionId)) {
      throw new Error("APPROVAL_RULE_VERSION_NOT_FOUND");
    }
    if (requiresApproval && !approverRole) {
      throw new Error("APPROVAL_RULE_APPROVER_REQUIRED");
    }
    if (approverRole && !database.prepare("SELECT id FROM roles WHERE role_code = ?").get(approverRole)) {
      throw new Error("APPROVAL_RULE_APPROVER_ROLE_NOT_FOUND");
    }

    const phase = nullableTextOrExisting(input.phase, existing?.phase);
    const recordStatus = nullableTextOrExisting(input.recordStatus, existing?.record_status);
    const itemKind = nullableTextOrExisting(input.itemKind, existing?.item_kind);
    const riskFlag = nullableTextOrExisting(input.riskFlag, existing?.risk_flag);
    const showsWarning = input.showsWarning ?? (existing ? existing.shows_warning === 1 : true);
    const exportMarker = input.exportMarker ?? (existing ? existing.export_marker === 1 : true);
    const predictedRule = withPredictedApprovalControls({
      actionCode,
      phase,
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
      phase,
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
    const now = new Date().toISOString();

    if (existing) {
      database
        .prepare(
          `
          UPDATE approval_rules
          SET rule_version_id = ?, rule_name = ?, action_code = ?, phase = ?, record_status = ?, item_kind = ?, risk_flag = ?,
              requires_approval = ?, approver_role = ?, blocks_usage = ?, blocks_release = ?, shows_warning = ?, export_marker = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(
          ruleVersionId,
          values.ruleName,
          values.actionCode,
          values.phase,
          values.recordStatus,
          values.itemKind,
          values.riskFlag,
          boolToInt(values.requiresApproval),
          values.approverRole,
          boolToInt(values.blocksUsage),
          boolToInt(values.blocksRelease),
          boolToInt(values.showsWarning, true),
          boolToInt(values.exportMarker, true),
          now,
          id
        );
    } else {
      database
        .prepare(
          `
          INSERT INTO approval_rules (
            id, rule_version_id, rule_name, action_code, phase, record_status, item_kind, risk_flag,
            requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          id,
          ruleVersionId,
          values.ruleName,
          values.actionCode,
          values.phase,
          values.recordStatus,
          values.itemKind,
          values.riskFlag,
          boolToInt(values.requiresApproval),
          values.approverRole,
          boolToInt(values.blocksUsage),
          boolToInt(values.blocksRelease),
          boolToInt(values.showsWarning, true),
          boolToInt(values.exportMarker, true),
          input.actorId ?? null,
          now,
          now
        );
    }

    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.approval_rule.upsert",
      detail: { approvalRuleId: id, actionCode: values.actionCode, ruleVersionId }
    });

    return mapAdminApprovalRule(database.prepare("SELECT * FROM approval_rules WHERE id = ?").get(id) as ApprovalRuleRow);
  })();
}

export function applyNumberingRuleTemplate(input: ApplyNumberingRuleTemplateInput): NumberingAdminMatrixRecord {
  const database = getDb();
  database.transaction(() => {
    const template = database.prepare("SELECT id FROM rule_templates WHERE template_code = ?").get(input.templateCode);
    if (!template) throw new Error("NUMBERING_RULE_TEMPLATE_NOT_FOUND");
    const now = new Date().toISOString();

    if (input.templateCode === "standard_control") {
      for (const [id, requiresApproval, approverRole, blocksUsage, blocksRelease, showsWarning, exportMarker] of STANDARD_APPROVAL_RULE_DEFAULTS) {
        const approvalRuleId = approvalRuleIdForRuleVersion(id, DEFAULT_RULE_VERSION_ID);
        database
          .prepare(
            `
            UPDATE approval_rules
            SET requires_approval = ?, approver_role = ?, blocks_usage = ?, blocks_release = ?, shows_warning = ?, export_marker = ?, updated_at = ?
            WHERE id = ?
          `
          )
          .run(requiresApproval, approverRole, blocksUsage, blocksRelease, showsWarning, exportMarker, now, approvalRuleId);
      }
    }

    if (input.templateCode === "rd_efficiency") {
      database
        .prepare(
          `
          UPDATE approval_rules
          SET requires_approval = 0, approver_role = NULL, blocks_usage = 0, blocks_release = 1, shows_warning = 1, export_marker = 1, updated_at = ?
          WHERE action_code IN ('update_name', 'obsolete_part_number') AND phase = 'DVT'
        `
        )
        .run(now);
      database
        .prepare(
          `
          UPDATE approval_rules
          SET requires_approval = 1, approver_role = COALESCE(approver_role, 'pdm_admin'), blocks_usage = 0, blocks_release = 1, shows_warning = 1, export_marker = 1, updated_at = ?
          WHERE action_code IN ('dvt_missing_ma_override', 'release_missing_ma_confirm', 'same_drawing_variant_after_release', 'main_drawing_restore', 'release')
             OR phase = 'Release'
             OR record_status = 'Released'
        `
        )
        .run(now);
    }

    if (input.templateCode === "strict_control") {
      database
        .prepare(
          `
          UPDATE approval_rules
          SET requires_approval = 1,
              approver_role = COALESCE(approver_role, 'pdm_admin'),
              blocks_usage = 0,
              blocks_release = 1,
              shows_warning = 1,
              export_marker = 1,
              updated_at = ?
          WHERE rule_version_id = ?
        `
        )
        .run(now, DEFAULT_RULE_VERSION_ID);
    }

    insertAudit(database, {
      actorId: input.actorId,
      action: "numbering.approval_rule_template.apply",
      detail: { templateCode: input.templateCode, ruleVersionId: DEFAULT_RULE_VERSION_ID }
    });
  })();

  return listNumberingAdminMatrix();
}

function applyApprovedNumberingRequest(database: SqliteDatabase, request: NumberingApprovalRecord, actorId: string) {
  if (request.actionCode === "dvt_promotion") {
    const partNumberFromPayload = String(request.payload.partNumber ?? "").trim();
    const partRow = selectPartNumberById(database, request.entityId) ?? selectPartNumberByNumber(database, partNumberFromPayload);
    if (!partRow) {
      throw new Error(`PART_NUMBER_NOT_FOUND: ${request.entityId}`);
    }
    const now = new Date().toISOString();
    database
      .prepare("UPDATE part_numbers SET development_phase = 'DVT', record_status = 'Active', updated_at = ? WHERE id = ?")
      .run(now, partRow.id);
    database.prepare("UPDATE part_roots SET development_phase = 'DVT', record_status = 'Active', updated_at = ? WHERE id = ?").run(now, partRow.part_root_id);
    database
      .prepare(
        `
        UPDATE drawing_numbers
        SET development_phase = 'DVT',
            record_status = CASE WHEN record_status = 'PendingReview' THEN 'Active' ELSE record_status END,
            updated_at = ?
        WHERE part_root_id = ?
          AND record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
      `
      )
      .run(now, partRow.part_root_id);
    insertAudit(database, {
      actorId,
      action: "numbering.dvt.approved",
      detail: { approvalRequestId: request.id, partNumber: partRow.part_number }
    });
    return;
  }

  if (request.actionCode === "release") {
    const partNumberFromPayload = String(request.payload.partNumber ?? "").trim();
    const partRow = selectPartNumberById(database, request.entityId) ?? selectPartNumberByNumber(database, partNumberFromPayload);
    if (!partRow) {
      throw new Error(`PART_NUMBER_NOT_FOUND: ${request.entityId}`);
    }
    const now = new Date().toISOString();
    database
      .prepare("UPDATE part_numbers SET development_phase = 'Release', record_status = 'Released', updated_at = ? WHERE id = ?")
      .run(now, partRow.id);
    database.prepare("UPDATE part_roots SET development_phase = 'Release', record_status = 'Released', updated_at = ? WHERE id = ?").run(now, partRow.part_root_id);
    database
      .prepare(
        `
        UPDATE drawing_numbers
        SET development_phase = 'Release',
            record_status = CASE WHEN record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled') THEN 'Released' ELSE record_status END,
            updated_at = ?
        WHERE part_root_id = ?
      `
      )
      .run(now, partRow.part_root_id);
    insertAudit(database, {
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
    linkPartNumberToDrawingInDatabase(database, { drawingNumber, partNumber, variants, createdBy: actorId, approvedAfterRelease: true });
    return;
  }

  if (request.actionCode === "obsolete_part_number") {
    const partNumberFromPayload = String(request.payload.partNumber ?? request.payload.entityCode ?? "").trim();
    const partRow = selectPartNumberById(database, request.entityId) ?? selectPartNumberByNumber(database, partNumberFromPayload);
    if (!partRow) {
      throw new Error(`PART_NUMBER_NOT_FOUND: ${request.entityId}`);
    }
    if (partRow.record_status === "Obsolete") {
      throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
    }
    if (partRow.record_status !== "Active" && partRow.record_status !== "Released") {
      throw new Error("LIFE_OBSOLETE_NOT_FORMAL");
    }

    const now = new Date().toISOString();
    database.prepare("UPDATE part_numbers SET record_status = 'Obsolete', updated_at = ? WHERE id = ?").run(now, partRow.id);
    markRootClosedIfNoOpenParts(database, partRow.part_root_id, "Obsolete", now);
    insertAudit(database, {
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
    const drawingRow = selectDrawingNumberById(database, request.entityId) ?? selectDrawingNumberByNumber(database, drawingNumberFromPayload);
    if (!drawingRow) {
      throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${request.entityId}`);
    }
    if (drawingRow.record_status === "Obsolete") {
      throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
    }
    if (drawingRow.record_status !== "Active" && drawingRow.record_status !== "Released") {
      throw new Error("LIFE_OBSOLETE_NOT_FORMAL");
    }

    const drawingNumber = mapDrawingNumber(drawingRow);
    const impactedPartNumbers = isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? listPrimaryManufacturingPartsByDrawing(database, drawingNumber.id) : [];
    const now = new Date().toISOString();
    database.prepare("UPDATE drawing_numbers SET record_status = 'Obsolete', updated_at = ? WHERE id = ?").run(now, drawingNumber.id);
    for (const partNumber of impactedPartNumbers) {
      database.prepare("UPDATE part_numbers SET record_status = 'MainDrawingInvalid', updated_at = ? WHERE id = ?").run(now, partNumber.id);
      database.prepare("UPDATE part_roots SET record_status = 'MainDrawingInvalid', updated_at = ? WHERE id = ?").run(now, partNumber.partRootId);
    }
    insertAudit(database, {
      actorId,
      action: "lifecycle.obsolete.approved",
      detail: {
        approvalRequestId: request.id,
        actionCode: request.actionCode,
        entityType: "drawing_number",
        entityId: drawingNumber.id,
        entityCode: drawingNumber.drawingNumber,
        previousRecordStatus: drawingRow.record_status,
        newRecordStatus: "Obsolete",
        impactedPartNumbers: impactedPartNumbers.map((partNumber) => partNumber.partNumber),
        reason: request.reason
      }
    });
    return;
  }

  if (request.actionCode === "main_drawing_restore") {
    const partNumberFromPayload = String(request.payload.partNumber ?? "").trim();
    const partRow = selectPartNumberById(database, request.entityId) ?? selectPartNumberByNumber(database, partNumberFromPayload);
    if (!partRow) {
      throw new Error(`PART_NUMBER_NOT_FOUND: ${request.entityId}`);
    }
    if (partRow.record_status !== "MainDrawingInvalid") {
      throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_INVALID_PART");
    }

    const replacementDrawingNumber = String(request.payload.replacementDrawingNumber ?? "").trim();
    let replacementDrawing: DrawingNumberRecord | null = null;
    const now = new Date().toISOString();

    if (replacementDrawingNumber) {
      const replacementRow = validateReplacementManufacturingDrawing(database, partRow, replacementDrawingNumber);
      replacementDrawing = mapDrawingNumber(replacementRow);
      database
        .prepare(
          `
          UPDATE drawing_part_links
          SET link_type = 'reference'
          WHERE part_number_id = ?
            AND link_type = 'primary_manufacturing'
            AND drawing_number_id <> ?
        `
        )
        .run(partRow.id, replacementRow.id);

      const primaryReplacementLink = database
        .prepare(
          "SELECT id FROM drawing_part_links WHERE drawing_number_id = ? AND part_number_id = ? AND link_type = 'primary_manufacturing' LIMIT 1"
        )
        .get(replacementRow.id, partRow.id) as { id: string } | undefined;

      if (!primaryReplacementLink) {
        const referenceReplacementLink = database
          .prepare("SELECT id FROM drawing_part_links WHERE drawing_number_id = ? AND part_number_id = ? AND link_type = 'reference' LIMIT 1")
          .get(replacementRow.id, partRow.id) as { id: string } | undefined;

        if (referenceReplacementLink) {
          database.prepare("UPDATE drawing_part_links SET link_type = 'primary_manufacturing' WHERE id = ?").run(referenceReplacementLink.id);
        } else {
          database
            .prepare(
              `
              INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
              VALUES (?, ?, ?, 'primary_manufacturing', ?, ?)
            `
            )
            .run(crypto.randomUUID(), replacementRow.id, partRow.id, actorId, now);
        }
      }
    } else if (!getPrimaryManufacturingDrawingForPart(database, partRow.id)) {
      throw new Error("MAIN_DRAWING_RESTORE_REQUIRES_ACTIVE_MA_DRAWING");
    }

    database.prepare("UPDATE part_numbers SET record_status = 'Active', updated_at = ? WHERE id = ?").run(now, partRow.id);
    const remainingInvalid = database
      .prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_root_id = ? AND record_status = 'MainDrawingInvalid' AND id <> ?")
      .get(partRow.part_root_id, partRow.id) as { count: number };
    if (remainingInvalid.count === 0) {
      database.prepare("UPDATE part_roots SET record_status = 'Active', updated_at = ? WHERE id = ?").run(now, partRow.part_root_id);
    }

    insertAudit(database, {
      actorId,
      action: "numbering.main_drawing.restore",
      detail: {
        approvalRequestId: request.id,
        partNumber: partRow.part_number,
        replacementDrawingNumber: replacementDrawing?.drawingNumber ?? null,
        rootRestored: remainingInvalid.count === 0
      }
    });
  }
}

export function evaluateApprovalRules(input: EvaluateApprovalRuleInput): ApprovalRuleEvaluation {
  const actionCode = input.actionCode.trim();
  if (!actionCode) {
    throw new Error("APPROVAL_RULE_ACTION_REQUIRED");
  }

  const database = getDb();
  const ruleVersionId = input.ruleVersionId?.trim() || DEFAULT_RULE_VERSION_ID;
  if (ruleVersionId === DEFAULT_RULE_VERSION_ID) ensureDefaultApprovalRulesForCurrentRuleVersion(database);
  const riskFlags = normalizeRiskFlags(input.riskFlags);
  const rows = database
    .prepare("SELECT * FROM approval_rules WHERE rule_version_id = ? AND action_code = ? ORDER BY created_at ASC, id ASC")
    .all(ruleVersionId, actionCode) as ApprovalRuleRow[];
  const matchedRules = rows.filter((row) => approvalRuleMatches(row, { ...input, actionCode, ruleVersionId }, riskFlags)).map(mapApprovalRule);
  const hardRules = evaluateHardApprovalRules({ ...input, actionCode, ruleVersionId }, riskFlags);
  const requiredRoleSet = new Set(
    matchedRules
      .filter((rule) => rule.requiresApproval)
      .map((rule) => rule.approverRole?.trim())
      .filter((role): role is string => Boolean(role))
  );

  if (requiredRoleSet.size === 0 && hardRules.some((rule) => rule.requiresApproval)) {
    requiredRoleSet.add("pdm_admin");
  }

  const requiresApproval = matchedRules.some((rule) => rule.requiresApproval) || hardRules.some((rule) => rule.requiresApproval);
  const blocksUsage = matchedRules.some((rule) => rule.blocksUsage) || hardRules.some((rule) => rule.blocksUsage);
  const blocksRelease = matchedRules.some((rule) => rule.blocksRelease) || hardRules.some((rule) => rule.blocksRelease);
  const showsWarning = matchedRules.some((rule) => rule.showsWarning) || hardRules.some((rule) => rule.showsWarning);
  const exportMarker = matchedRules.some((rule) => rule.exportMarker) || hardRules.some((rule) => rule.exportMarker);
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
    requiresApproval,
    blocksUsage,
    blocksRelease,
    showsWarning,
    exportMarker,
    requiredRoles: Array.from(requiredRoleSet),
    warnings,
    blockers,
    matchedRules,
    hardRules
  };
}

function evaluateNumberingGateInDatabase(database: SqliteDatabase, input: EvaluateNumberingGateInput): NumberingGateEvaluation {
  const partRow = selectPartNumberByNumber(database, input.partNumber);
  if (!partRow) {
    throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
  }
  const partNumber = mapPartNumber(partRow);
  const primaryManufacturingDrawing = getPrimaryManufacturingDrawingForPart(database, partNumber.id);
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
    primaryDrawingHasMultipleLinkedParts(database, primaryManufacturingDrawing.id) &&
    !partHasVariantDescriptor(database, partNumber.id)
  ) {
    issues.push({
      code: "SAME_DRAWING_VARIANT_DETAIL_REQUIRED",
      severity: "blocker",
      message: `${input.gate} gate requires material, color, or variant difference details for same-drawing multi-part records.`,
      entityType: "part_number",
      entityId: partNumber.id
    });
  }

  const requiresOverride = issues.some((issue) => issue.code === "PRIMARY_MA_REQUIRED");
  const approvalActionCode: NumberingApprovalActionCode | null = requiresOverride
    ? input.gate === "DVT"
      ? "dvt_missing_ma_override"
      : "release_missing_ma_confirm"
    : null;
  const approvedOverride = approvalActionCode
    ? hasApprovedNumberingApproval(database, {
        entityType: "part_number",
        entityId: partNumber.id,
        actionCode: approvalActionCode
      })
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

export function evaluateNumberingGate(input: EvaluateNumberingGateInput): NumberingGateEvaluation {
  const database = getDb();
  return evaluateNumberingGateInDatabase(database, input);
}

function listDrawingNumbersForRoot(database: SqliteDatabase, rootId: string) {
  return (
    database
      .prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ? ORDER BY purpose_code ASC, sequence_no ASC, drawing_number ASC")
      .all(rootId) as DrawingNumberRow[]
  ).map(mapDrawingNumber);
}

function classifyDvtPromotionCandidate(gate: NumberingGateEvaluation): Pick<DvtPromotionCandidateRecord, "status" | "recommendedAction" | "missingItems"> {
  const missingItems = gate.issues.map((issue) => issue.message);
  if (gate.allowed && !gate.requiresOverride) {
    return { status: "ready", recommendedAction: "submit_dvt", missingItems };
  }
  if (gate.requiresOverride && gate.approvalActionCode === "dvt_missing_ma_override") {
    return { status: "needs_override", recommendedAction: "keep_evt", missingItems };
  }
  return { status: "blocked", recommendedAction: "keep_evt", missingItems };
}

export function listDvtPromotionCandidates(input: ListDvtPromotionCandidatesInput = {}): DvtPromotionCandidateRecord[] {
  const database = getDb();
  const limit = clampListLimit(input.limit);
  const rows = database
    .prepare(
      `
      SELECT *
      FROM part_numbers
      WHERE development_phase = 'EVT'
        AND record_status NOT IN ('PendingReview', 'Released', 'Obsolete', 'Merged', 'EVTDisabled')
      ORDER BY updated_at DESC, part_number ASC
      LIMIT ?
    `
    )
    .all(limit) as PartNumberRow[];

  return rows
    .map((row) => {
      const rootRow = selectPartRootById(database, row.part_root_id);
      if (!rootRow) return null;
      const partNumber = mapPartNumber(row);
      const gate = evaluateNumberingGateInDatabase(database, { partNumber: partNumber.partNumber, gate: "DVT" });
      const classification = classifyDvtPromotionCandidate(gate);
      return {
        root: mapPartRoot(rootRow),
        partNumber,
        drawingNumbers: listDrawingNumbersForRoot(database, row.part_root_id),
        gate,
        ...classification
      } satisfies DvtPromotionCandidateRecord;
    })
    .filter((candidate): candidate is DvtPromotionCandidateRecord => Boolean(candidate))
    .filter((candidate) => input.includeBlocked !== false || candidate.status !== "blocked");
}

function markRootClosedIfNoOpenParts(database: SqliteDatabase, rootId: string, status: "EVTDisabled" | "Obsolete", now: string) {
  const openCount = database
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM part_numbers
      WHERE part_root_id = ?
        AND record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
    `
    )
    .get(rootId) as { count: number };
  if (openCount.count === 0) {
    database.prepare("UPDATE part_roots SET record_status = ?, updated_at = ? WHERE id = ?").run(status, now, rootId);
    database.prepare("UPDATE drawing_numbers SET record_status = ?, updated_at = ? WHERE part_root_id = ?").run(status, now, rootId);
  } else {
    database.prepare("UPDATE part_roots SET updated_at = ? WHERE id = ?").run(now, rootId);
  }
}

function markPartPendingDvtReview(database: SqliteDatabase, partRow: PartNumberRow, now: string) {
  database
    .prepare("UPDATE part_numbers SET development_phase = 'DVT', record_status = 'PendingReview', updated_at = ? WHERE id = ?")
    .run(now, partRow.id);
  database
    .prepare("UPDATE part_roots SET development_phase = 'DVT', record_status = 'PendingReview', updated_at = ? WHERE id = ?")
    .run(now, partRow.part_root_id);
  database
    .prepare(
      `
      UPDATE drawing_numbers
      SET development_phase = 'DVT',
          record_status = CASE WHEN record_status IN ('Draft', 'Active', 'NeedInfo') THEN 'PendingReview' ELSE record_status END,
          updated_at = ?
      WHERE part_root_id = ?
        AND record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
    `
    )
    .run(now, partRow.part_root_id);
}

export function submitDvtPromotionDecisions(input: SubmitDvtPromotionInput): DvtPromotionSubmissionRecord {
  const decisions = input.decisions.filter((decision) => decision.partNumber.trim());
  if (decisions.length === 0) {
    throw new Error("DVT_PROMOTION_REQUIRES_DECISIONS");
  }

  const database = getDb();
  return database.transaction(() => {
    const approvalRequests: NumberingApprovalRecord[] = [];
    const decisionResults: DvtPromotionDecisionResult[] = [];
    const now = new Date().toISOString();

    for (const decision of decisions) {
      const partRow = selectPartNumberByNumber(database, decision.partNumber.trim());
      if (!partRow) {
        throw new Error(`PART_NUMBER_NOT_FOUND: ${decision.partNumber}`);
      }
      if (partRow.development_phase !== "EVT") {
        decisionResults.push({
          partNumber: partRow.part_number,
          action: decision.action,
          status: "skipped",
          message: "Only EVT part numbers can be processed by the DVT promotion list.",
          approvalRequestId: null
        });
        continue;
      }

      if (decision.action === "submit_dvt") {
        const gate = evaluateNumberingGateInDatabase(database, { partNumber: partRow.part_number, gate: "DVT" });
        if (!gate.allowed || gate.requiresOverride) {
          decisionResults.push({
            partNumber: partRow.part_number,
            action: decision.action,
            status: "skipped",
            message: "DVT gate is not complete; keep the item in EVT until missing data is resolved.",
            approvalRequestId: null
          });
          continue;
        }
        markPartPendingDvtReview(database, partRow, now);
        const approvalRequest = insertNumberingApprovalRequest(database, {
          actionCode: "dvt_promotion",
          entityType: "part_number",
          entityId: partRow.id,
          reason: decision.reason?.trim() || "EVT to DVT promotion",
          payload: {
            partNumber: partRow.part_number,
            fromPhase: "EVT",
            toPhase: "DVT",
            rootId: partRow.part_root_id
          },
          requestedBy: input.submittedBy
        });
        approvalRequests.push(approvalRequest);
        decisionResults.push({
          partNumber: partRow.part_number,
          action: decision.action,
          status: "submitted",
          message: "Submitted to DVT review batch.",
          approvalRequestId: approvalRequest.id
        });
        continue;
      }

      if (decision.action === "keep_evt") {
        insertAudit(database, {
          actorId: input.submittedBy,
          action: "numbering.dvt.keep_evt",
          detail: { partNumber: partRow.part_number, reason: decision.reason?.trim() || null }
        });
        decisionResults.push({
          partNumber: partRow.part_number,
          action: decision.action,
          status: "kept",
          message: "Kept in EVT.",
          approvalRequestId: null
        });
        continue;
      }

      const nextStatus: "EVTDisabled" | "Obsolete" = decision.action === "disable_evt" ? "EVTDisabled" : "Obsolete";
      database.prepare("UPDATE part_numbers SET record_status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, partRow.id);
      markRootClosedIfNoOpenParts(database, partRow.part_root_id, nextStatus, now);
      insertAudit(database, {
        actorId: input.submittedBy,
        action: decision.action === "disable_evt" ? "numbering.dvt.disable_evt" : "numbering.dvt.obsolete",
        detail: { partNumber: partRow.part_number, status: nextStatus, reason: decision.reason?.trim() || null }
      });
      decisionResults.push({
        partNumber: partRow.part_number,
        action: decision.action,
        status: decision.action === "disable_evt" ? "disabled" : "obsolete",
        message: decision.action === "disable_evt" ? "EVT item disabled." : "EVT item obsoleted.",
        approvalRequestId: null
      });
    }

    const approvalBatch =
      approvalRequests.length > 0
        ? createNumberingApprovalBatchInDatabase(database, {
            approvalRequestIds: approvalRequests.map((approvalRequest) => approvalRequest.id),
            projectCode: input.projectCode,
            actionCode: "dvt_promotion",
            submittedBy: input.submittedBy
          })
        : null;

    return {
      approvalBatch,
      approvalRequests,
      decisions: decisionResults
    };
  })();
}

export function analyzeMainDrawingObsolescence(input: MainDrawingImpactInput): MainDrawingImpactAnalysis {
  const database = getDb();
  return database.transaction(() => {
    const drawingRow = selectDrawingNumberByNumber(database, input.drawingNumber);
    if (!drawingRow) {
      throw new Error(`DRAWING_NUMBER_NOT_FOUND: ${input.drawingNumber}`);
    }
    const drawingNumber = mapDrawingNumber(drawingRow);
    const impactedPartNumbers =
      isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? listPrimaryManufacturingPartsByDrawing(database, drawingNumber.id) : [];
    const warnings = isManufacturingDrawingPurpose(drawingNumber.purposeCode) ? [] : ["DRAWING_IS_NOT_PRIMARY_MA"];
    const requiredDocuments = impactedPartNumbers.length
      ? [
          "2D manufacturing drawing",
          "3D CAD model",
          "Released PDF package",
          "BOM or where-used records",
          "Related SOP/WI or inspection documents"
        ]
      : [];

    if (input.applyInvalidation && !isManufacturingDrawingPurpose(drawingNumber.purposeCode)) {
      throw new Error("MAIN_DRAWING_INVALIDATION_REQUIRES_MA_DRAWING");
    }

    if (input.applyInvalidation) {
      const now = new Date().toISOString();
      database
        .prepare("UPDATE drawing_numbers SET record_status = 'Obsolete', updated_at = ? WHERE id = ?")
        .run(now, drawingNumber.id);
      for (const partNumber of impactedPartNumbers) {
        database
          .prepare("UPDATE part_numbers SET record_status = 'MainDrawingInvalid', updated_at = ? WHERE id = ?")
          .run(now, partNumber.id);
        database
          .prepare("UPDATE part_roots SET record_status = 'MainDrawingInvalid', updated_at = ? WHERE id = ?")
          .run(now, partNumber.partRootId);
      }
    }

    insertAudit(database, {
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

    return {
      drawingNumber,
      applied: Boolean(input.applyInvalidation),
      impactedPartNumbers,
      requiredDocuments,
      warnings
    };
  })();
}

export function checkNumberingDuplicates(input: DuplicateCheckInput): DuplicateCheckResult {
  const database = getDb();
  return database.transaction(() => {
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
      const row = selectPartRootByCode(database, rootCode);
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
      const row = selectPartNumberByNumber(database, partNumber);
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
      const row = selectDrawingNumberByNumber(database, drawingNumber);
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
      const rows = database.prepare("SELECT * FROM part_roots ORDER BY updated_at DESC LIMIT 200").all() as PartRootRow[];
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
      const rows = database.prepare("SELECT * FROM part_numbers ORDER BY updated_at DESC LIMIT 200").all() as PartNumberRow[];
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
        ? insertWarningEvent(database, {
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

    database
      .prepare(
        `
        INSERT INTO duplicate_check_events (id, entity_type, query_json, result_json, blocked, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.drawingNumber ? "drawing_number" : input.partNumber ? "part_number" : input.rootCode ? "part_root" : "mixed",
        JSON.stringify(input),
        JSON.stringify({ matches: sortedMatches, warningEventId }),
        blocked ? 1 : 0,
        input.createdBy ?? null,
        new Date().toISOString()
      );

    insertAudit(database, {
      actorId: input.createdBy,
      action: "numbering.duplicate_check",
      detail: {
        query: input,
        blocked,
        warningEventId,
        matchCount: sortedMatches.length
      }
    });

    return {
      blocked,
      warningsOnly: sortedMatches.length > 0 && !blocked,
      matches: sortedMatches,
      warningEventId
    };
  })();
}

function escapeLikeLiteral(query: string) {
  return query.replace(/[\\%_]/g, "\\$&");
}

function escapeLikeQuery(query: string) {
  return `%${escapeLikeLiteral(query)}%`;
}

function addProductSeriesFilter(filters: string[], params: unknown[], productSeries: string | undefined) {
  const normalized = normalizeProductSeries(productSeries);
  if (!normalized) return;
  filters.push("(r.core_name = ? OR r.core_name LIKE ? ESCAPE '\\')");
  params.push(normalized, `${escapeLikeLiteral(normalized)}\\_%`);
}

function searchRootRecords(database: SqliteDatabase, input: Required<Pick<NumberingSearchInput, "query" | "limit">> & NumberingSearchInput) {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (input.query) {
    const like = escapeLikeQuery(input.query);
    filters.push("(r.root_code LIKE ? ESCAPE '\\' OR r.core_name LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  addProductSeriesFilter(filters, params, input.productSeries);
  if (input.recordStatus) {
    filters.push("r.record_status = ?");
    params.push(input.recordStatus);
  }
  if (input.developmentPhase) {
    filters.push("r.development_phase = ?");
    params.push(input.developmentPhase);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  return database
    .prepare(
      `
      SELECT
        'part_root' AS entity_type,
        r.id AS entity_id,
        r.root_code,
        r.core_name,
        r.root_code AS display_code,
        r.core_name AS display_name,
        r.item_kind,
        r.development_phase,
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
      ${where}
      ORDER BY r.updated_at DESC, r.root_code ASC
      LIMIT ?
    `
    )
    .all(...params, input.limit) as NumberingSearchRow[];
}

function searchPartNumberRecords(database: SqliteDatabase, input: Required<Pick<NumberingSearchInput, "query" | "limit">> & NumberingSearchInput) {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (input.query) {
    const like = escapeLikeQuery(input.query);
    filters.push("(p.part_number LIKE ? ESCAPE '\\' OR p.part_name LIKE ? ESCAPE '\\' OR r.root_code LIKE ? ESCAPE '\\' OR r.core_name LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  addProductSeriesFilter(filters, params, input.productSeries);
  if (input.recordStatus) {
    filters.push("p.record_status = ?");
    params.push(input.recordStatus);
  }
  if (input.developmentPhase) {
    filters.push("p.development_phase = ?");
    params.push(input.developmentPhase);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  return database
    .prepare(
      `
      SELECT
        'part_number' AS entity_type,
        p.id AS entity_id,
        r.root_code,
        r.core_name,
        p.part_number AS display_code,
        p.part_name AS display_name,
        p.item_kind,
        p.development_phase,
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
      ${where}
      ORDER BY p.updated_at DESC, p.part_number ASC
      LIMIT ?
    `
    )
    .all(...params, input.limit) as NumberingSearchRow[];
}

function searchDrawingNumberRecords(database: SqliteDatabase, input: Required<Pick<NumberingSearchInput, "query" | "limit">> & NumberingSearchInput) {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (input.query) {
    const like = escapeLikeQuery(input.query);
    filters.push("(d.drawing_number LIKE ? ESCAPE '\\' OR d.purpose_description LIKE ? ESCAPE '\\' OR r.root_code LIKE ? ESCAPE '\\' OR r.core_name LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  addProductSeriesFilter(filters, params, input.productSeries);
  if (input.recordStatus) {
    filters.push("d.record_status = ?");
    params.push(input.recordStatus);
  }
  if (input.developmentPhase) {
    filters.push("d.development_phase = ?");
    params.push(input.developmentPhase);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  return database
    .prepare(
      `
      SELECT
        'drawing_number' AS entity_type,
        d.id AS entity_id,
        r.root_code,
        r.core_name,
        d.drawing_number AS display_code,
        d.purpose_description AS display_name,
        r.item_kind,
        d.development_phase,
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
      ${where}
      ORDER BY d.updated_at DESC, d.drawing_number ASC
      LIMIT ?
    `
    )
    .all(...params, input.limit) as NumberingSearchRow[];
}

export function searchNumberingRecords(input: NumberingSearchInput = {}) {
  const database = getDb();
  const normalizedInput = {
    ...input,
    query: input.query?.trim() ?? "",
    limit: clampListLimit(input.limit, 50)
  };
  const entityType = normalizedInput.entityType ?? "all";
  const rows: NumberingSearchRow[] = [];
  if (entityType === "all" || entityType === "part_root") rows.push(...searchRootRecords(database, normalizedInput));
  if (entityType === "all" || entityType === "part_number") rows.push(...searchPartNumberRecords(database, normalizedInput));
  if (entityType === "all" || entityType === "drawing_number") rows.push(...searchDrawingNumberRecords(database, normalizedInput));
  return rows
    .map(mapNumberingSearchRow)
    .sort((a, b) => b.warningCount - a.warningCount || a.rootCode.localeCompare(b.rootCode) || a.displayCode.localeCompare(b.displayCode))
    .slice(0, normalizedInput.limit);
}

export function listProductSeriesOptions(companyId: string = "company-jenfu") {
  const rows = getDb()
    .prepare("SELECT core_name FROM part_roots WHERE company_id = ? ORDER BY core_name ASC")
    .all(companyId) as Array<{ core_name: string }>;
  return productSeriesOptionsFromCoreNames(rows.map((row) => row.core_name));
}

export function listDrawingModuleRecords(input: DrawingModuleListInput = {}) {
  const database = getDb();
  const query = input.query?.trim() ?? "";
  const filters: string[] = [];
  const params: unknown[] = [];

  if (query) {
    const like = escapeLikeQuery(query);
    filters.push(`(
      d.drawing_number LIKE ? ESCAPE '\\'
      OR d.purpose_description LIKE ? ESCAPE '\\'
      OR r.root_code LIKE ? ESCAPE '\\'
      OR r.core_name LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM drawing_part_links ql
        JOIN part_numbers qp ON qp.id = ql.part_number_id
        WHERE ql.drawing_number_id = d.id
          AND (qp.part_number LIKE ? ESCAPE '\\' OR qp.part_name LIKE ? ESCAPE '\\')
      )
    )`);
    params.push(like, like, like, like, like, like);
  }
  addProductSeriesFilter(filters, params, input.productSeries);
  if (input.recordStatus) {
    filters.push("d.record_status = ?");
    params.push(input.recordStatus);
  }
  if (input.developmentPhase) {
    filters.push("d.development_phase = ?");
    params.push(input.developmentPhase);
  }
  if (input.purposeCode) {
    filters.push("d.purpose_code = ?");
    params.push(input.purposeCode);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = database
    .prepare(
      `
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
          SELECT GROUP_CONCAT(p.part_number)
          FROM drawing_part_links l
          JOIN part_numbers p ON p.id = l.part_number_id
          WHERE l.drawing_number_id = d.id
        ) AS linked_part_numbers,
        (
          SELECT COUNT(*)
          FROM warning_events w
          WHERE w.entity_type = 'drawing_number'
            AND w.entity_id = d.id
            AND w.acknowledged_at IS NULL
        ) AS warning_count
      FROM drawing_numbers d
      JOIN part_roots r ON r.id = d.part_root_id
      ${where}
      ORDER BY d.updated_at DESC, d.drawing_number ASC
      LIMIT ?
    `
    )
    .all(...params, clampListLimit(input.limit, 50)) as DrawingModuleListRow[];

  const partsByRoot = selectDrawingModuleLinkedPartsByRoot(
    database,
    Array.from(new Set(rows.map((row) => row.part_root_id)))
  );

  return rows.map((row) => mapDrawingModuleListRow(row, partsByRoot.get(row.part_root_id) ?? []));
}

function selectDrawingModuleLinkedPartsByRoot(database: SqliteDatabase, rootIds: string[]) {
  if (rootIds.length === 0) return new Map<string, DrawingModuleLinkedPartRecord[]>();
  const placeholders = rootIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `
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
        ) AS primary_drawing_number,
        sc.id AS standard_cost_id,
        cp.profile_name AS standard_profile_name,
        cp.cost_type AS standard_cost_type
      FROM part_numbers p
      LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
      LEFT JOIN part_standard_costs sc ON sc.part_number_id = p.id AND sc.effective_to IS NULL
      LEFT JOIN part_cost_profiles cp ON cp.id = sc.cost_profile_id
      WHERE p.part_root_id IN (${placeholders})
      ORDER BY p.part_root_id ASC, p.sequence_no ASC, p.part_number ASC
    `
    )
    .all(...rootIds) as DrawingModuleLinkedPartRow[];

  const partsByRoot = new Map<string, DrawingModuleLinkedPartRecord[]>();
  for (const row of rows) {
    const list = partsByRoot.get(row.part_root_id) ?? [];
    list.push(mapDrawingModuleLinkedPartRow(row));
    partsByRoot.set(row.part_root_id, list);
  }
  return partsByRoot;
}

function selectNumberingLinksForRoot(database: SqliteDatabase, rootId: string) {
  return database
    .prepare(
      `
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
      WHERE d.part_root_id = ? OR p.part_root_id = ?
      ORDER BY d.drawing_number ASC, p.part_number ASC, l.link_type ASC
    `
    )
    .all(rootId, rootId) as NumberingLinkRow[];
}

function selectNumberingVariantsForRoot(database: SqliteDatabase, rootId: string) {
  return database
    .prepare(
      `
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
      WHERE d.part_root_id = ? OR p.part_root_id = ?
      ORDER BY d.drawing_number ASC, p.part_number ASC, v.field_name ASC
    `
    )
    .all(rootId, rootId) as NumberingVariantRow[];
}

function selectNumberingWarnings(database: SqliteDatabase, entities: Array<{ entityType: string; entityId: string }>) {
  if (entities.length === 0) return [];
  const where = entities.map(() => "(entity_type = ? AND entity_id = ?)").join(" OR ");
  const params = entities.flatMap((entity) => [entity.entityType, entity.entityId]);
  return database
    .prepare(
      `
      SELECT id, warning_code, severity, entity_type, entity_id, title, message, detail_json, created_at, acknowledged_at
      FROM warning_events
      WHERE ${where}
      ORDER BY acknowledged_at IS NULL DESC, created_at DESC
      LIMIT 100
    `
    )
    .all(...params) as NumberingWarningRow[];
}

function selectNumberingAuditTrail(database: SqliteDatabase, tokens: string[]) {
  const meaningfulTokens = tokens.filter(Boolean);
  if (meaningfulTokens.length === 0) return [];
  const rows = database
    .prepare(
      `
      SELECT id, actor_id, action, detail_json, created_at
      FROM audit_logs
      WHERE action LIKE 'numbering.%'
      ORDER BY created_at DESC
      LIMIT 200
    `
    )
    .all() as NumberingAuditLogRow[];
  return rows
    .map(mapNumberingAudit)
    .filter((row) => {
      const detailText = JSON.stringify(row.detail);
      return meaningfulTokens.some((token) => detailText.includes(token));
    })
    .slice(0, 50);
}

export function getNumberingRootDetail(rootCode: string): NumberingRootDetailRecord | null {
  const database = getDb();
  const rootRow = selectPartRootByCode(database, rootCode.trim());
  if (!rootRow) return null;
  const root = mapPartRoot(rootRow);
  const partNumbers = (
    database.prepare("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY sequence_no ASC, part_number ASC").all(root.id) as PartNumberRow[]
  ).map(mapPartNumber);
  const drawingNumbers = (
    database
      .prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ? ORDER BY purpose_code ASC, sequence_no ASC, drawing_number ASC")
      .all(root.id) as DrawingNumberRow[]
  ).map(mapDrawingNumber);
  const links = selectNumberingLinksForRoot(database, root.id).map(mapNumberingLink);
  const variants = selectNumberingVariantsForRoot(database, root.id).map(mapNumberingVariant);
  const warningEntities = [
    { entityType: "part_root", entityId: root.id },
    ...partNumbers.map((partNumber) => ({ entityType: "part_number", entityId: partNumber.id })),
    ...drawingNumbers.map((drawingNumber) => ({ entityType: "drawing_number", entityId: drawingNumber.id }))
  ];
  const warnings = selectNumberingWarnings(database, warningEntities).map(mapNumberingWarning);
  const auditTrail = selectNumberingAuditTrail(database, [
    root.rootCode,
    ...partNumbers.map((partNumber) => partNumber.partNumber),
    ...drawingNumbers.map((drawingNumber) => drawingNumber.drawingNumber)
  ]);
  return {
    root,
    partNumbers,
    drawingNumbers,
    links,
    variants,
    warnings,
    auditTrail,
    summary: {
      partCount: partNumbers.length,
      drawingCount: drawingNumbers.length,
      primaryManufacturingCount: drawingNumbers.filter((drawingNumber) => isManufacturingDrawingPurpose(drawingNumber.purposeCode) && drawingNumber.isPrimaryManufacturing).length,
      warningCount: warnings.filter((warning) => !warning.acknowledgedAt).length,
      hasMainDrawingInvalid: root.recordStatus === "MainDrawingInvalid" || partNumbers.some((partNumber) => partNumber.recordStatus === "MainDrawingInvalid")
    }
  };
}

function normalizeNullableText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizeCostType(value: PartCostType) {
  const allowed = new Set<PartCostType>(["outsourced", "in_house", "purchase", "trial", "other"]);
  if (!allowed.has(value)) throw new Error(`INVALID_PART_COST_TYPE: ${value}`);
  return value;
}

function normalizeCostProfileStatus(value: PartCostProfileStatus | undefined) {
  const status = value ?? "pending_review";
  const allowed = new Set<PartCostProfileStatus>(["draft", "pending_review", "approved", "rejected", "retired"]);
  if (!allowed.has(status)) throw new Error(`INVALID_PART_COST_PROFILE_STATUS: ${status}`);
  return status;
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number, errorCode: string) {
  const normalized = Math.floor(value ?? fallback);
  if (!Number.isFinite(normalized) || normalized < 1) throw new Error(errorCode);
  return normalized;
}

function normalizePartCostTiers(input: CreatePartCostProfileInput["tiers"]) {
  if (input.length === 0) throw new Error("PART_COST_PROFILE_REQUIRES_TIER");
  const tiers = input
    .map((tier, index) => {
      const minQty = normalizePositiveInteger(tier.minQty, index === 0 ? 1 : index + 1, "INVALID_PART_COST_TIER_MIN_QTY");
      const maxQty = tier.maxQty === null || tier.maxQty === undefined ? null : normalizePositiveInteger(tier.maxQty, minQty, "INVALID_PART_COST_TIER_MAX_QTY");
      if (maxQty !== null && maxQty < minQty) throw new Error("INVALID_PART_COST_TIER_RANGE");
      if (!Number.isFinite(tier.unitCost) || tier.unitCost < 0) throw new Error("INVALID_PART_COST_TIER_UNIT_COST");
      const setupCost = tier.setupCost ?? 0;
      if (!Number.isFinite(setupCost) || setupCost < 0) throw new Error("INVALID_PART_COST_TIER_SETUP_COST");
      const leadTimeDays = tier.leadTimeDays === null || tier.leadTimeDays === undefined ? null : Math.floor(tier.leadTimeDays);
      if (leadTimeDays !== null && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) throw new Error("INVALID_PART_COST_TIER_LEAD_TIME");
      return {
        minQty,
        maxQty,
        unitCost: tier.unitCost,
        setupCost,
        leadTimeDays,
        note: tier.note
      };
    })
    .sort((a, b) => a.minQty - b.minQty);

  let previousMax: number | null | "open" = null;
  for (const tier of tiers) {
    if (previousMax === "open") throw new Error("PART_COST_TIER_RANGE_OVERLAP");
    if (previousMax !== null && tier.minQty <= previousMax) throw new Error("PART_COST_TIER_RANGE_OVERLAP");
    if (tier.maxQty === null) previousMax = "open";
    else previousMax = tier.maxQty;
  }
  return tiers;
}

function selectCostTierForQuantity(tiers: PartCostTierRecord[], quantity: number) {
  return tiers.find((tier) => tier.minQty <= quantity && (tier.maxQty === null || tier.maxQty >= quantity)) ?? null;
}

function partHasVariantDescriptor(database: SqliteDatabase, partNumberId: string) {
  const row = database
    .prepare(
      `
      SELECT material_code, material_label, color_code, color_label, variant_note
      FROM part_variant_attributes
      WHERE part_number_id = ?
    `
    )
    .get(partNumberId) as Pick<PartVariantAttributesRow, "material_code" | "material_label" | "color_code" | "color_label" | "variant_note"> | undefined;
  if (!row) return false;
  return [row.material_code, row.material_label, row.color_code, row.color_label, row.variant_note].some((value) => Boolean(value?.trim()));
}

function primaryDrawingHasMultipleLinkedParts(database: SqliteDatabase, drawingNumberId: string) {
  const row = database
    .prepare(
      `
      SELECT COUNT(DISTINCT part_number_id) AS count
      FROM drawing_part_links
      WHERE drawing_number_id = ?
        AND link_type = 'primary_manufacturing'
    `
    )
    .get(drawingNumberId) as { count: number } | undefined;
  return (row?.count ?? 0) > 1;
}

function buildPartModuleWhere(input: PartModuleListInput) {
  const where: string[] = [];
  const params: unknown[] = [];
  const query = input.query?.trim();
  if (query) {
    where.push(
      "(p.part_number LIKE ? OR p.part_name LIKE ? OR r.root_code LIKE ? OR r.core_name LIKE ? OR va.material_label LIKE ? OR va.color_label LIKE ?)"
    );
    const token = `%${query}%`;
    params.push(token, token, token, token, token, token);
  }
  addProductSeriesFilter(where, params, input.productSeries);
  if (input.recordStatus) {
    where.push("p.record_status = ?");
    params.push(input.recordStatus);
  }
  if (input.developmentPhase) {
    where.push("p.development_phase = ?");
    params.push(input.developmentPhase);
  }
  return {
    sql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
}

function selectPartModuleRows(database: SqliteDatabase, input: PartModuleListInput) {
  const normalizedInput = {
    ...input,
    limit: clampListLimit(input.limit, 50)
  };
  const where = buildPartModuleWhere(normalizedInput);
  return database
    .prepare(
      `
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
          SELECT COUNT(*)
          FROM drawing_part_links l
          WHERE l.part_number_id = p.id
        ) AS drawing_count,
        (
          SELECT COUNT(*)
          FROM part_cost_change_requests cr
          WHERE cr.part_number_id = p.id AND cr.review_status = 'pending'
        ) AS pending_cost_request_count,
        sc.id AS standard_cost_id,
        sc.cost_profile_id AS standard_cost_profile_id,
        sc.basis_qty AS standard_basis_qty,
        sc.standard_reason,
        sc.effective_from AS standard_effective_from,
        sc.effective_to AS standard_effective_to,
        cp.profile_name AS standard_profile_name,
        cp.cost_type AS standard_cost_type,
        cp.currency AS standard_currency,
        cp.uom AS standard_uom,
        (
          SELECT t.unit_cost
          FROM part_cost_tiers t
          WHERE t.cost_profile_id = sc.cost_profile_id
            AND t.min_qty <= sc.basis_qty
            AND (t.max_qty IS NULL OR t.max_qty >= sc.basis_qty)
          ORDER BY t.min_qty DESC
          LIMIT 1
        ) AS standard_unit_cost
      FROM part_numbers p
      JOIN part_roots r ON r.id = p.part_root_id
      LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
      LEFT JOIN part_standard_costs sc ON sc.part_number_id = p.id AND sc.effective_to IS NULL
      LEFT JOIN part_cost_profiles cp ON cp.id = sc.cost_profile_id
      ${where.sql}
      ORDER BY r.root_code ASC, p.sequence_no ASC, p.part_number ASC
      LIMIT ?
    `
    )
    .all(...where.params, normalizedInput.limit) as PartModuleListRow[];
}

export function listPartModuleRecords(input: PartModuleListInput = {}) {
  const database = getDb();
  return selectPartModuleRows(database, input).map(mapPartModuleListRow);
}

function selectLinkedDrawingsForPart(database: SqliteDatabase, partNumberId: string) {
  return database
    .prepare(
      `
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
      WHERE l.part_number_id = ?
      ORDER BY l.link_type ASC, d.drawing_number ASC
    `
    )
    .all(partNumberId) as NumberingLinkRow[];
}

function selectSameDrawingVariantsForPart(database: SqliteDatabase, partNumberId: string) {
  return database
    .prepare(
      `
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
      WHERE v.part_number_id = ?
      ORDER BY d.drawing_number ASC, v.field_name ASC
    `
    )
    .all(partNumberId) as NumberingVariantRow[];
}

function selectCostProfilesForPart(database: SqliteDatabase, partNumberId: string) {
  const profileRows = database
    .prepare(
      `
      SELECT *
      FROM part_cost_profiles
      WHERE part_number_id = ?
      ORDER BY
        CASE status
          WHEN 'approved' THEN 0
          WHEN 'pending_review' THEN 1
          WHEN 'draft' THEN 2
          WHEN 'rejected' THEN 3
          ELSE 4
        END,
        updated_at DESC,
        profile_name ASC
    `
    )
    .all(partNumberId) as PartCostProfileRow[];
  if (profileRows.length === 0) return [];
  const placeholders = profileRows.map(() => "?").join(", ");
  const tierRows = database
    .prepare(
      `
      SELECT *
      FROM part_cost_tiers
      WHERE cost_profile_id IN (${placeholders})
      ORDER BY cost_profile_id ASC, min_qty ASC
    `
    )
    .all(...profileRows.map((profile) => profile.id)) as PartCostTierRow[];
  const tiersByProfile = new Map<string, PartCostTierRecord[]>();
  for (const tier of tierRows.map(mapPartCostTier)) {
    const list = tiersByProfile.get(tier.costProfileId) ?? [];
    list.push(tier);
    tiersByProfile.set(tier.costProfileId, list);
  }
  return profileRows.map((profile) => mapPartCostProfile(profile, tiersByProfile.get(profile.id) ?? []));
}

function selectCostChangeRequestsForPart(database: SqliteDatabase, partNumberId: string) {
  return database
    .prepare(
      `
      SELECT *
      FROM part_cost_change_requests
      WHERE part_number_id = ?
      ORDER BY requested_at DESC
      LIMIT 50
    `
    )
    .all(partNumberId) as PartCostChangeRequestRow[];
}

export function getPartModuleDetail(partNumber: string): PartModuleDetailRecord | null {
  const database = getDb();
  const row = selectPartModuleRows(database, { query: partNumber, limit: 100 }).find((item) => item.part_number === partNumber.trim());
  if (!row) return null;
  return {
    ...mapPartModuleListRow(row),
    linkedDrawings: selectLinkedDrawingsForPart(database, row.id).map(mapNumberingLink),
    sameDrawingVariants: selectSameDrawingVariantsForPart(database, row.id).map(mapNumberingVariant),
    costProfiles: selectCostProfilesForPart(database, row.id),
    costChangeRequests: selectCostChangeRequestsForPart(database, row.id).map(mapPartCostChangeRequest)
  };
}

export function upsertPartVariantAttributes(input: UpsertPartVariantAttributesInput) {
  const database = getDb();
  return database.transaction(() => {
    const partRow = selectPartNumberByNumber(database, input.partNumber.trim());
    if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    const existing = database
      .prepare("SELECT * FROM part_variant_attributes WHERE part_number_id = ?")
      .get(partRow.id) as PartVariantAttributesRow | undefined;
    const now = new Date().toISOString();
    const values = {
      materialCode: normalizeNullableText(input.materialCode),
      materialLabel: normalizeNullableText(input.materialLabel),
      colorCode: normalizeNullableText(input.colorCode),
      colorLabel: normalizeNullableText(input.colorLabel),
      surfaceTreatment: normalizeNullableText(input.surfaceTreatment),
      variantNote: normalizeNullableText(input.variantNote)
    };
    if (existing) {
      database
        .prepare(
          `
          UPDATE part_variant_attributes
          SET material_code = ?, material_label = ?, color_code = ?, color_label = ?, surface_treatment = ?, variant_note = ?, updated_by = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(
          values.materialCode,
          values.materialLabel,
          values.colorCode,
          values.colorLabel,
          values.surfaceTreatment,
          values.variantNote,
          input.updatedBy ?? null,
          now,
          existing.id
        );
    } else {
      database
        .prepare(
          `
          INSERT INTO part_variant_attributes (
            id, part_number_id, material_code, material_label, color_code, color_label, surface_treatment, variant_note, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          crypto.randomUUID(),
          partRow.id,
          values.materialCode,
          values.materialLabel,
          values.colorCode,
          values.colorLabel,
          values.surfaceTreatment,
          values.variantNote,
          input.updatedBy ?? null,
          now,
          now
        );
    }
    insertAudit(database, {
      actorId: input.updatedBy,
      action: "numbering.part_variant.upsert",
      detail: { partNumber: partRow.part_number, ...values }
    });
    return getPartModuleDetail(partRow.part_number);
  })();
}

export function createPartCostProfile(input: CreatePartCostProfileInput) {
  const database = getDb();
  return database.transaction(() => {
    const partRow = selectPartNumberByNumber(database, input.partNumber.trim());
    if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    const tiers = normalizePartCostTiers(input.tiers);
    const now = new Date().toISOString();
    const profileId = crypto.randomUUID();
    const status = normalizeCostProfileStatus(input.status);
    database
      .prepare(
        `
        INSERT INTO part_cost_profiles (
          id, part_number_id, cost_type, profile_name, currency, uom, supplier_name, process_name, cost_basis, status, effective_from, effective_to, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        profileId,
        partRow.id,
        normalizeCostType(input.costType),
        input.profileName.trim(),
        input.currency?.trim() || "TWD",
        input.uom?.trim() || "pcs",
        normalizeNullableText(input.supplierName),
        normalizeNullableText(input.processName),
        normalizeNullableText(input.costBasis),
        status,
        normalizeNullableText(input.effectiveFrom),
        normalizeNullableText(input.effectiveTo),
        input.createdBy ?? null,
        now,
        now
      );
    tiers.forEach((tier) => {
      database
        .prepare(
          `
          INSERT INTO part_cost_tiers (id, cost_profile_id, min_qty, max_qty, unit_cost, setup_cost, lead_time_days, note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          crypto.randomUUID(),
          profileId,
          tier.minQty,
          tier.maxQty,
          tier.unitCost,
          tier.setupCost,
          tier.leadTimeDays,
          normalizeNullableText(tier.note),
          now,
          now
        );
    });
    database
      .prepare(
        `
        INSERT INTO part_cost_change_requests (
          id, part_number_id, proposed_cost_profile_id, request_type, change_reason, review_status, requested_by, requested_at
        ) VALUES (?, ?, ?, 'set_standard', ?, 'pending', ?, ?)
      `
      )
      .run(crypto.randomUUID(), partRow.id, profileId, "新增成本設定檔，待主管確認是否列為標準成本。", input.createdBy ?? null, now);
    insertAudit(database, {
      actorId: input.createdBy,
      action: "numbering.part_cost_profile.create",
      detail: { partNumber: partRow.part_number, costProfileId: profileId, status, tierCount: tiers.length }
    });
    return getPartModuleDetail(partRow.part_number);
  })();
}

function selectPartCostChangeRequestById(database: SqliteDatabase, requestId: string) {
  return database.prepare("SELECT * FROM part_cost_change_requests WHERE id = ?").get(requestId) as PartCostChangeRequestRow | undefined;
}

function selectPartCostProfileById(database: SqliteDatabase, profileId: string) {
  return database.prepare("SELECT * FROM part_cost_profiles WHERE id = ?").get(profileId) as PartCostProfileRow | undefined;
}

function selectPartCostTiersByProfileId(database: SqliteDatabase, profileId: string) {
  return database
    .prepare(
      `
      SELECT *
      FROM part_cost_tiers
      WHERE cost_profile_id = ?
      ORDER BY min_qty ASC
    `
    )
    .all(profileId)
    .map((row) => mapPartCostTier(row as PartCostTierRow));
}

function assertCostProfileEffective(profile: PartCostProfileRow, asOf: string) {
  if (profile.effective_from && profile.effective_from > asOf) throw new Error("PART_COST_PROFILE_NOT_EFFECTIVE_YET");
  if (profile.effective_to && profile.effective_to < asOf) throw new Error("PART_COST_PROFILE_EXPIRED");
}

function buildPartCostResolution(profile: PartCostProfileRow, tier: PartCostTierRecord, quantity: number): PartCostResolutionRecord {
  return {
    profileId: profile.id,
    partNumberId: profile.part_number_id,
    costType: profile.cost_type,
    profileName: profile.profile_name,
    currency: profile.currency,
    uom: profile.uom,
    quantity,
    unitCost: tier.unitCost,
    setupCost: tier.setupCost,
    extendedCost: tier.unitCost * quantity + tier.setupCost,
    tier
  };
}

export function resolvePartCost(input: ResolvePartCostInput): PartCostResolutionRecord {
  const database = getDb();
  const partRow = selectPartNumberByNumber(database, input.partNumber.trim());
  if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
  const quantity = normalizePositiveInteger(input.quantity, 1, "INVALID_PART_COST_QUANTITY");
  const asOf = normalizeNullableText(input.asOf) ?? new Date().toISOString();

  let profile: PartCostProfileRow | undefined;
  if (input.costType) {
    const costType = normalizeCostType(input.costType);
    profile = database
      .prepare(
        `
        SELECT *
        FROM part_cost_profiles
        WHERE part_number_id = ?
          AND cost_type = ?
          AND status = 'approved'
          AND (effective_from IS NULL OR effective_from <= ?)
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `
      )
      .get(partRow.id, costType, asOf, asOf) as PartCostProfileRow | undefined;
    if (!profile) throw new Error("NO_APPROVED_PART_COST_PROFILE");
  } else {
    const standard = database
      .prepare(
        `
        SELECT cp.*
        FROM part_standard_costs sc
        JOIN part_cost_profiles cp ON cp.id = sc.cost_profile_id
        WHERE sc.part_number_id = ?
          AND sc.effective_to IS NULL
          AND cp.status = 'approved'
          AND (sc.effective_from IS NULL OR sc.effective_from <= ?)
          AND (cp.effective_from IS NULL OR cp.effective_from <= ?)
          AND (cp.effective_to IS NULL OR cp.effective_to >= ?)
        ORDER BY sc.effective_from DESC, sc.created_at DESC
        LIMIT 1
      `
      )
      .get(partRow.id, asOf, asOf, asOf) as PartCostProfileRow | undefined;
    profile = standard;
    if (!profile) throw new Error("NO_APPROVED_STANDARD_COST");
  }

  assertCostProfileEffective(profile, asOf);
  const tiers = selectPartCostTiersByProfileId(database, profile.id);
  const tier = selectCostTierForQuantity(tiers, quantity);
  if (!tier) throw new Error("NO_PART_COST_TIER_FOR_QUANTITY");
  return buildPartCostResolution(profile, tier, quantity);
}

export function decidePartCostChangeRequest(input: DecidePartCostChangeRequestInput) {
  const database = getDb();
  return database.transaction(() => {
    const partRow = selectPartNumberByNumber(database, input.partNumber.trim());
    if (!partRow) throw new Error(`PART_NUMBER_NOT_FOUND: ${input.partNumber}`);
    const request = selectPartCostChangeRequestById(database, input.requestId);
    if (!request || request.part_number_id !== partRow.id) throw new Error(`PART_COST_CHANGE_REQUEST_NOT_FOUND: ${input.requestId}`);
    if (request.review_status !== "pending") throw new Error(`PART_COST_CHANGE_REQUEST_ALREADY_DECIDED: ${request.review_status}`);
    const now = new Date().toISOString();
    const decisionStatus: PartCostChangeRequestStatus = input.decision === "approve" ? "approved" : "rejected";
    database
      .prepare(
        `
        UPDATE part_cost_change_requests
        SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_comment = ?
        WHERE id = ?
      `
      )
      .run(decisionStatus, input.reviewedBy ?? null, now, normalizeNullableText(input.reviewComment), request.id);

    const profile = request.proposed_cost_profile_id ? selectPartCostProfileById(database, request.proposed_cost_profile_id) : undefined;
    if (profile && profile.part_number_id !== partRow.id) throw new Error("PART_COST_PROFILE_PART_MISMATCH");

    if (input.decision === "reject") {
      if (profile) {
        database.prepare("UPDATE part_cost_profiles SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending_review'").run(now, profile.id);
      }
      insertAudit(database, {
        actorId: input.reviewedBy,
        action: "numbering.part_cost_change.reject",
        detail: { partNumber: partRow.part_number, requestId: request.id, costProfileId: profile?.id ?? null, reviewComment: normalizeNullableText(input.reviewComment) }
      });
      return getPartModuleDetail(partRow.part_number);
    }

    if (!profile) throw new Error("PART_COST_CHANGE_REQUEST_PROFILE_REQUIRED");
    database.prepare("UPDATE part_cost_profiles SET status = 'approved', approved_by = ?, updated_at = ? WHERE id = ?").run(input.reviewedBy ?? null, now, profile.id);
    if (request.request_type === "set_standard") {
      const basisQty = normalizePositiveInteger(input.basisQty, 1, "INVALID_PART_STANDARD_COST_BASIS_QTY");
      const tiers = selectPartCostTiersByProfileId(database, profile.id);
      if (!selectCostTierForQuantity(tiers, basisQty)) throw new Error("NO_PART_COST_TIER_FOR_STANDARD_BASIS_QTY");
      database.prepare("UPDATE part_standard_costs SET effective_to = ?, updated_at = ? WHERE part_number_id = ? AND effective_to IS NULL").run(now, now, partRow.id);
      database
        .prepare(
          `
          INSERT INTO part_standard_costs (
            id, part_number_id, cost_profile_id, basis_qty, standard_reason, selected_by, approved_by, effective_from, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          crypto.randomUUID(),
          partRow.id,
          profile.id,
          basisQty,
          normalizeNullableText(input.reviewComment) ?? request.change_reason,
          input.reviewedBy ?? null,
          input.reviewedBy ?? null,
          now,
          now,
          now
        );
    }

    insertAudit(database, {
      actorId: input.reviewedBy,
      action: "numbering.part_cost_change.approve",
      detail: { partNumber: partRow.part_number, requestId: request.id, costProfileId: profile.id, requestType: request.request_type }
    });
    return getPartModuleDetail(partRow.part_number);
  })();
}

export function createNumberingRecord(input: CreateNumberingRecordInput) {
  const database = getDb();
  const companyId = input.companyId ?? "company-jenfu";
  const developmentPhase = input.developmentPhase ?? "EVT";
  const recordStatus = input.recordStatus ?? "Draft";
  const ruleVersionId = input.ruleVersionId ?? DEFAULT_RULE_VERSION_ID;
  const isUniversal = input.isUniversal ?? false;
  const rootName = input.coreName.trim();

  return database.transaction(() => {
    const root = insertPartRoot(database, {
      coreName: rootName,
      itemKind: input.itemKind,
      developmentPhase,
      recordStatus,
      ruleVersionId,
      createdBy: input.createdBy
    });
    const partNumber = insertPartNumber(database, root, {
      partName: root.coreName,
      itemKind: input.itemKind,
      developmentPhase,
      recordStatus,
      isUniversal,
      universalReason: input.universalReason,
      customSpecification: input.customSpecification,
      ruleVersionId,
      createdBy: input.createdBy
    });
    const drawingNumber = input.drawingPurposeCode
      ? insertDrawingNumber(database, root, {
          purposeCode: input.drawingPurposeCode,
          purposeDescription: input.drawingPurposeDescription,
          developmentPhase,
          recordStatus,
          ruleVersionId,
          createdBy: input.createdBy
        })
      : null;

    if (drawingNumber) {
      linkDrawingToPart(database, { drawing: drawingNumber, part: partNumber, createdBy: input.createdBy });
    }

    insertAudit(database, {
      actorId: input.createdBy,
      action: "numbering.create",
      detail: {
        companyId,
        rootCode: root.rootCode,
        partNumber: partNumber.partNumber,
        customSpecification: partNumber.customSpecification,
        drawingNumber: drawingNumber?.drawingNumber ?? null,
        ruleVersionId
      }
    });

    return { root, partNumber, drawingNumber };
  })();
}

export function addPartNumberToRoot(input: AddPartNumberInput) {
  const database = getDb();
  const isUniversal = input.isUniversal ?? false;
  return database.transaction(() => {
    const rootRow = selectPartRootByCode(database, input.rootCode);
    if (!rootRow) {
      throw new Error(`PART_ROOT_NOT_FOUND: ${input.rootCode}`);
    }
    const root = mapPartRoot(rootRow);
    const partNumber = insertPartNumber(database, root, {
      partName: root.coreName,
      itemKind: input.itemKind ?? root.itemKind,
      developmentPhase: input.developmentPhase ?? root.developmentPhase,
      recordStatus: input.recordStatus ?? "Draft",
      isUniversal,
      universalReason: input.universalReason,
      customSpecification: input.customSpecification,
      ruleVersionId: input.ruleVersionId ?? root.ruleVersionId,
      createdBy: input.createdBy
    });
    insertAudit(database, {
      actorId: input.createdBy,
      action: "numbering.part_number.create",
      detail: { rootCode: root.rootCode, partNumber: partNumber.partNumber }
    });
    return partNumber;
  })();
}

export function addDrawingNumberToRoot(input: AddDrawingNumberInput) {
  const database = getDb();
  return database.transaction(() => {
    const rootRow = selectPartRootByCode(database, input.rootCode);
    if (!rootRow) {
      throw new Error(`PART_ROOT_NOT_FOUND: ${input.rootCode}`);
    }
    const root = mapPartRoot(rootRow);
    const drawingNumber = insertDrawingNumber(database, root, {
      purposeCode: input.purposeCode,
      purposeDescription: input.purposeDescription,
      developmentPhase: input.developmentPhase ?? root.developmentPhase,
      recordStatus: input.recordStatus ?? "Draft",
      ruleVersionId: input.ruleVersionId ?? root.ruleVersionId,
      createdBy: input.createdBy
    });
    insertAudit(database, {
      actorId: input.createdBy,
      action: "numbering.drawing_number.create",
      detail: { rootCode: root.rootCode, drawingNumber: drawingNumber.drawingNumber }
    });
    return drawingNumber;
  })();
}

function getNumberingRootBundleInDatabase(database: SqliteDatabase, rootCode: string) {
  const rootRow = selectPartRootByCode(database, rootCode);
  if (!rootRow) return null;
  const root = mapPartRoot(rootRow);
  const partNumbers = database
    .prepare("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY sequence_no ASC")
    .all(root.id) as PartNumberRow[];
  const drawingNumbers = database
    .prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ? ORDER BY purpose_code ASC, sequence_no ASC")
    .all(root.id) as DrawingNumberRow[];
  return {
    root,
    partNumbers: partNumbers.map(mapPartNumber),
    drawingNumbers: drawingNumbers.map(mapDrawingNumber)
  };
}

export function getNumberingRootBundle(rootCode: string) {
  const database = getDb();
  return getNumberingRootBundleInDatabase(database, rootCode);
}

function assertDraftMutableStatus(status: NumberingRecordStatus, label: string) {
  if (status !== "Draft" && status !== "NeedInfo") {
    throw new Error(`NUMBERING_${label}_NOT_DRAFT: ${status}`);
  }
}

export function updateDraftNumberingRecord(input: UpdateDraftNumberingRecordInput) {
  const database = getDb();
  return database.transaction(() => {
    const rootRow = selectPartRootByCode(database, input.rootCode);
    if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${input.rootCode}`);
    assertDraftMutableStatus(rootRow.record_status, "ROOT");
    const before = getNumberingRootBundleInDatabase(database, input.rootCode);
    const now = new Date().toISOString();
    const coreName = input.coreName?.trim();
    if (coreName) {
      database.prepare("UPDATE part_roots SET core_name = ?, updated_at = ? WHERE id = ?").run(coreName, now, rootRow.id);
      database.prepare("UPDATE part_numbers SET part_name = ?, updated_at = ? WHERE part_root_id = ?").run(coreName, now, rootRow.id);
    }
    const effectiveRootName = coreName || rootRow.core_name;

    const partNumberText = input.partNumber?.trim();
    const partRow = partNumberText
      ? selectPartNumberByNumber(database, partNumberText)
      : (database.prepare("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY sequence_no ASC LIMIT 1").get(rootRow.id) as PartNumberRow | undefined);
    if ((input.customSpecification !== undefined || input.universalReason !== undefined) && partRow) {
      if (partRow.part_root_id !== rootRow.id) throw new Error(`PART_NUMBER_ROOT_MISMATCH: ${partNumberText ?? partRow.part_number}`);
      assertDraftMutableStatus(partRow.record_status, "PART");
      const customSpecification = input.customSpecification !== undefined ? input.customSpecification.trim() || null : partRow.custom_specification;
      const universalReason = input.universalReason !== undefined ? input.universalReason.trim() || null : partRow.universal_reason;
      database
        .prepare("UPDATE part_numbers SET part_name = ?, custom_specification = ?, universal_reason = ?, updated_at = ? WHERE id = ?")
        .run(effectiveRootName, customSpecification, universalReason, now, partRow.id);
    }

    const drawingNumberText = input.drawingNumber?.trim();
    const drawingRow = drawingNumberText
      ? selectDrawingNumberByNumber(database, drawingNumberText)
      : (database.prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ? ORDER BY purpose_code ASC, sequence_no ASC LIMIT 1").get(rootRow.id) as
          | DrawingNumberRow
          | undefined);
    if (input.drawingPurposeDescription !== undefined && drawingRow) {
      if (drawingRow.part_root_id !== rootRow.id) throw new Error(`DRAWING_NUMBER_ROOT_MISMATCH: ${drawingNumberText ?? drawingRow.drawing_number}`);
      assertDraftMutableStatus(drawingRow.record_status, "DRAWING");
      const purposeDescription = input.drawingPurposeDescription.trim() || normalizePurposeDescription(drawingRow.purpose_code, drawingRow.purpose_description);
      database.prepare("UPDATE drawing_numbers SET purpose_description = ?, updated_at = ? WHERE id = ?").run(purposeDescription, now, drawingRow.id);
    }

    const after = getNumberingRootBundleInDatabase(database, input.rootCode);
    insertAudit(database, {
      actorId: input.updatedBy,
      action: "numbering.draft.update",
      detail: { rootCode: input.rootCode, before, after }
    });
    return after;
  })();
}

export function obsoleteDraftNumberingRecord(input: ObsoleteDraftNumberingRecordInput) {
  const database = getDb();
  return database.transaction(() => {
    const reason = input.reason.trim();
    if (!reason) throw new Error("OBSOLETE_REASON_REQUIRED");
    const rootRow = selectPartRootByCode(database, input.rootCode);
    if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${input.rootCode}`);
    assertDraftMutableStatus(rootRow.record_status, "ROOT");
    const partRows = database.prepare("SELECT * FROM part_numbers WHERE part_root_id = ?").all(rootRow.id) as PartNumberRow[];
    const drawingRows = database.prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ?").all(rootRow.id) as DrawingNumberRow[];
    for (const row of partRows) assertDraftMutableStatus(row.record_status, "PART");
    for (const row of drawingRows) assertDraftMutableStatus(row.record_status, "DRAWING");

    const before = getNumberingRootBundleInDatabase(database, input.rootCode);
    const now = new Date().toISOString();
    database.prepare("UPDATE drawing_numbers SET record_status = 'Obsolete', updated_at = ? WHERE part_root_id = ?").run(now, rootRow.id);
    database.prepare("UPDATE part_numbers SET record_status = 'Obsolete', updated_at = ? WHERE part_root_id = ?").run(now, rootRow.id);
    database.prepare("UPDATE part_roots SET record_status = 'Obsolete', updated_at = ? WHERE id = ?").run(now, rootRow.id);
    const after = getNumberingRootBundleInDatabase(database, input.rootCode);
    insertAudit(database, {
      actorId: input.obsoletedBy,
      action: "numbering.draft.obsolete",
      detail: { rootCode: input.rootCode, reason, before, after }
    });
    return after;
  })();
}

export function deleteDraftNumberingRecord(input: DeleteDraftNumberingRecordInput): DeleteDraftNumberingRecordResult {
  const database = getDb();
  return database.transaction(() => {
    const rootCode = input.rootCode.trim();
    if (!rootCode) throw new Error("PART_ROOT_REQUIRED");
    const rootRow = selectPartRootByCode(database, rootCode);
    if (!rootRow) throw new Error(`PART_ROOT_NOT_FOUND: ${rootCode}`);
    assertDraftMutableStatus(rootRow.record_status, "ROOT");
    const partRows = database.prepare("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY sequence_no ASC, part_number ASC").all(rootRow.id) as PartNumberRow[];
    const drawingRows = database.prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ? ORDER BY purpose_code ASC, sequence_no ASC, drawing_number ASC").all(rootRow.id) as DrawingNumberRow[];
    for (const row of partRows) assertDraftMutableStatus(row.record_status, "PART");
    for (const row of drawingRows) assertDraftMutableStatus(row.record_status, "DRAWING");

    const dependencyCounts = database
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM approval_requests WHERE entity_id = @rootId OR entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId) OR entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)) AS approval_count,
          (SELECT COUNT(*) FROM drawing_revision_packages WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)) AS revision_package_count,
          (SELECT COUNT(*) FROM shared_cad_model_versions WHERE part_root_id = @rootId OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)) AS shared_model_count,
          (SELECT COUNT(*) FROM manufacturing_baselines WHERE part_root_id = @rootId OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)) AS manufacturing_baseline_count,
          (SELECT COUNT(*) FROM manufacturing_baseline_items WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)) AS manufacturing_baseline_item_count,
          (SELECT COUNT(*) FROM part_replacement_links WHERE old_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId) OR new_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId) OR source_drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)) AS replacement_link_count,
          (SELECT COUNT(*) FROM bom_reconfirmation_flags WHERE old_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId) OR new_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)) AS bom_reconfirmation_count,
          (SELECT COUNT(*) FROM file_assets WHERE (linked_entity_type = 'part_root' AND linked_entity_id = @rootId) OR (linked_entity_type = 'part_number' AND linked_entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)) OR (linked_entity_type = 'drawing_number' AND linked_entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId))) AS file_asset_count
      `
      )
      .get({ rootId: rootRow.id }) as {
      approval_count: number;
      revision_package_count: number;
      shared_model_count: number;
      manufacturing_baseline_count: number;
      manufacturing_baseline_item_count: number;
      replacement_link_count: number;
      bom_reconfirmation_count: number;
      file_asset_count: number;
    };
    const controlledDependencyCount =
      Number(dependencyCounts.approval_count ?? 0) +
      Number(dependencyCounts.revision_package_count ?? 0) +
      Number(dependencyCounts.shared_model_count ?? 0) +
      Number(dependencyCounts.manufacturing_baseline_count ?? 0) +
      Number(dependencyCounts.manufacturing_baseline_item_count ?? 0) +
      Number(dependencyCounts.replacement_link_count ?? 0) +
      Number(dependencyCounts.bom_reconfirmation_count ?? 0);
    if (controlledDependencyCount > 0) throw new Error("NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES");

    const now = new Date().toISOString();
    const reason = input.reason?.trim() || "刪除未送審草稿";
    const params = { rootId: rootRow.id, now, actorId: input.deletedBy ?? null, reason };
    database
      .prepare(
        `UPDATE file_assets
         SET deleted_at = @now, deleted_by = @actorId, deleted_reason = @reason, updated_at = @now
         WHERE deleted_at IS NULL
           AND ((linked_entity_type = 'part_root' AND linked_entity_id = @rootId)
             OR (linked_entity_type = 'part_number' AND linked_entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId))
             OR (linked_entity_type = 'drawing_number' AND linked_entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)))`
      )
      .run(params);
    database
      .prepare(
        `UPDATE numbering_task_items
         SET task_status = 'cancelled', handled_by = @actorId, handled_at = @now, updated_at = @now
         WHERE task_status = 'open'
           AND ((entity_type = 'part_root' AND entity_id = @rootId)
             OR (entity_type = 'part_number' AND entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId))
             OR (entity_type = 'drawing_number' AND entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)))`
      )
      .run(params);
    database
      .prepare(
        `UPDATE numbering_notifications
         SET handled_by = @actorId, handled_at = @now, updated_at = @now
         WHERE handled_at IS NULL
           AND ((entity_type = 'part_root' AND entity_id = @rootId)
             OR (entity_type = 'part_number' AND entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId))
             OR (entity_type = 'drawing_number' AND entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)))`
      )
      .run(params);
    database
      .prepare(
        `DELETE FROM warning_events
         WHERE (entity_type = 'part_root' AND entity_id = @rootId)
            OR (entity_type = 'part_number' AND entity_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId))
            OR (entity_type = 'drawing_number' AND entity_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId))`
      )
      .run(params);
    database
      .prepare(
        `UPDATE part_number_drafts
         SET source_part_number_id = CASE WHEN source_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId) THEN NULL ELSE source_part_number_id END,
             source_drawing_number_id = CASE WHEN source_drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId) THEN NULL ELSE source_drawing_number_id END,
             updated_at = @now
         WHERE source_part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)
            OR source_drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)`
      )
      .run(params);
    database.prepare("DELETE FROM drawing_revision_fff_assessments WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId)").run(params);
    database.prepare("DELETE FROM same_drawing_variants WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId) OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)").run(params);
    database.prepare("DELETE FROM drawing_part_links WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id = @rootId) OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)").run(params);
    database.prepare("DELETE FROM part_variant_attributes WHERE part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)").run(params);
    database.prepare("DELETE FROM part_standard_costs WHERE part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)").run(params);
    database.prepare("DELETE FROM part_cost_change_requests WHERE part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)").run(params);
    database.prepare("DELETE FROM part_cost_tiers WHERE cost_profile_id IN (SELECT id FROM part_cost_profiles WHERE part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId))").run(params);
    database.prepare("DELETE FROM part_cost_profiles WHERE part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id = @rootId)").run(params);
    database.prepare("DELETE FROM drawing_numbers WHERE part_root_id = @rootId").run(params);
    database.prepare("DELETE FROM part_numbers WHERE part_root_id = @rootId").run(params);
    database.prepare("DELETE FROM part_roots WHERE id = @rootId").run(params);

    const result = {
      rootCode,
      deletedRoot: mapPartRoot(rootRow),
      deletedPartNumbers: partRows.map(mapPartNumber),
      deletedDrawingNumbers: drawingRows.map(mapDrawingNumber),
      affectedFileAssets: Number(dependencyCounts.file_asset_count ?? 0)
    };
    insertAudit(database, {
      actorId: input.deletedBy,
      action: "numbering.draft.delete",
      detail: { reason, ...result }
    });
    return result;
  })();
}

export function markOverdueDraftNumberingRecords(input: MarkOverdueDraftNumberingInput = {}): MarkOverdueDraftNumberingResult {
  const database = getDb();
  return database.transaction(() => {
    const olderThanDays = Math.max(1, Math.floor(input.olderThanDays ?? 30));
    const now = input.now ? new Date(input.now) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error("INVALID_NOW");
    const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = database
      .prepare(
        `
        SELECT *
        FROM part_roots
        WHERE record_status IN ('Draft', 'NeedInfo')
          AND updated_at <= ?
        ORDER BY updated_at ASC, root_code ASC
      `
      )
      .all(cutoff) as PartRootRow[];
    const updatedRootCodes: string[] = [];
    for (const row of rows) {
      const before = getNumberingRootBundleInDatabase(database, row.root_code);
      const actedAt = now.toISOString();
      database
        .prepare("UPDATE drawing_numbers SET record_status = 'PendingAdminConfirm', updated_at = ? WHERE part_root_id = ? AND record_status IN ('Draft', 'NeedInfo')")
        .run(actedAt, row.id);
      database
        .prepare("UPDATE part_numbers SET record_status = 'PendingAdminConfirm', updated_at = ? WHERE part_root_id = ? AND record_status IN ('Draft', 'NeedInfo')")
        .run(actedAt, row.id);
      database.prepare("UPDATE part_roots SET record_status = 'PendingAdminConfirm', updated_at = ? WHERE id = ?").run(actedAt, row.id);
      const after = getNumberingRootBundleInDatabase(database, row.root_code);
      const detail = { rootCode: row.root_code, cutoffAt: cutoff };
      insertNumberingTaskItem(database, {
        companyId: row.company_id ?? "company-jenfu",
        taskType: "draft_admin_confirm",
        entityType: "part_root",
        entityId: row.id,
        title: "Draft numbering requires admin confirmation",
        message: `Draft root ${row.root_code} has been open for at least ${olderThanDays} days.`,
        riskLevel: "warning",
        assignedRole: "pdm_admin",
        actionUrl: `/numbering/search?root=${encodeURIComponent(row.root_code)}`,
        detail,
        createdBy: input.actorId
      });
      insertNumberingNotification(database, {
        companyId: row.company_id ?? "company-jenfu",
        notificationType: "draft_admin_confirm",
        entityType: "part_root",
        entityId: row.id,
        title: "Draft numbering requires admin confirmation",
        message: `Draft root ${row.root_code} has been open for at least ${olderThanDays} days.`,
        severity: "warning",
        recipientRole: "pdm_admin",
        dismissible: false,
        actionUrl: `/numbering/search?root=${encodeURIComponent(row.root_code)}`,
        detail,
        createdBy: input.actorId
      });
      insertAudit(database, {
        actorId: input.actorId,
        action: "numbering.draft.pending_admin_confirm",
        detail: { rootCode: row.root_code, olderThanDays, cutoffAt: cutoff, before, after }
      });
      updatedRootCodes.push(row.root_code);
    }
    return { cutoffAt: cutoff, updatedRootCodes, updatedCount: updatedRootCodes.length };
  })();
}
