import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import type { NumberingRootBundleRecord } from "@/lib/repositories/numbering-async-repository";
import type {
  DuplicateCheckInput,
  DuplicateCheckResult,
  ConfirmNumberingImportBatchInput,
  ApplyNumberingRuleTemplateInput,
  CreateNumberingApprovalBatchInput,
  CreateNumberingImportBatchInput,
  CreateNumberingRecordInput,
  CreatePartCostProfileInput,
  CreateNumberingExportJobInput,
  DecideNumberingApprovalBatchInput,
  DecideNumberingApprovalInput,
  DecidePartCostChangeRequestInput,
  DrawingModuleListInput,
  DrawingModuleListRecord,
  GenerateMonthlyNumberingAuditReportInput,
  ListNumberingApprovalBatchesInput,
  ListDvtPromotionCandidatesInput,
  ListNumberingExportJobsInput,
  ListNumberingImportBatchesInput,
  ListMonthlyNumberingAuditReportsInput,
  ListNumberingNotificationsInput,
  ListNumberingTasksInput,
  MarkOverdueDraftNumberingInput,
  MarkOverdueDraftNumberingResult,
  MonthlyAuditReportRecord,
  MainDrawingImpactAnalysis,
  MainDrawingImpactInput,
  NumberingApprovalBatchRecord,
  NumberingApprovalRecord,
  NumberingApprovalReviewBatchRecord,
  NumberingAdminApprovalRuleRecord,
  NumberingAdminMatrixRecord,
  NumberingAdminPermissionRecord,
  NumberingAdminRoleRecord,
  NumberingAdminRoleScopeRecord,
  NumberingApprovalDelegationRecord,
  NumberingExportJobRecord,
  NumberingImportBatchRecord,
  NumberingNotificationRecord,
  NumberingGateEvaluation,
  NumberingRolePriorityVersionRecord,
  NumberingRootDetailRecord,
  NumberingSearchInput,
  NumberingSearchResultRecord,
  NumberingTaskRecord,
  NumberingUserRoleAssignmentRecord,
  DrawingNumberRecord,
  DvtPromotionCandidateRecord,
  DvtPromotionSubmissionRecord,
  ApprovalRuleEvaluation,
  EvaluateApprovalRuleInput,
  EvaluateNumberingGateInput,
  LinkPartNumberToDrawingInput,
  ObsoleteDraftNumberingRecordInput,
  PartCostResolutionRecord,
  PartModuleDetailRecord,
  PartModuleListInput,
  PartModuleListRecord,
  ResolvePartCostInput,
  RevokeNumberingApprovalDelegationInput,
  RevokeNumberingUserRoleAssignmentInput,
  SaveNumberingRolePriorityInput,
  SubmitDvtPromotionInput,
  UpsertNumberingAdminRoleInput,
  UpsertNumberingApprovalDelegationInput,
  UpsertNumberingApprovalRuleInput,
  UpsertNumberingRolePermissionInput,
  UpsertNumberingRoleScopeInput,
  UpsertNumberingUserRoleAssignmentInput,
  PartNumberRecord,
  PartRootRecord,
  RequestMainDrawingRestoreApprovalInput,
  RequestNumberingApprovalInput,
  RequestSameDrawingVariantApprovalInput,
  ResubmitRejectedNumberingApprovalBatchItemsInput,
  UpsertPartVariantAttributesInput,
  UpdateDraftNumberingRecordInput,
  UpdateNumberingNotificationStateInput,
  UpdateNumberingTaskStatusInput
} from "@/lib/repositories/numbering-repository";

export type { NumberingRootBundleRecord } from "@/lib/repositories/numbering-async-repository";

export async function createNumberingRecordAsync(input: CreateNumberingRecordInput): Promise<{
  root: PartRootRecord;
  partNumber: PartNumberRecord;
  drawingNumber: DrawingNumberRecord | null;
}> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.createNumberingRecord(input);
}

export async function updateDraftNumberingRecordAsync(
  input: UpdateDraftNumberingRecordInput
): Promise<NumberingRootBundleRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.updateDraftNumberingRecord(input);
}

export async function obsoleteDraftNumberingRecordAsync(
  input: ObsoleteDraftNumberingRecordInput
): Promise<NumberingRootBundleRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.obsoleteDraftNumberingRecord(input);
}

export async function checkNumberingDuplicatesAsync(input: DuplicateCheckInput): Promise<DuplicateCheckResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.checkNumberingDuplicates(input);
}

export async function requestNumberingApprovalAsync(input: RequestNumberingApprovalInput): Promise<NumberingApprovalRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.requestNumberingApproval(input);
}

export async function requestSameDrawingVariantApprovalAsync(input: RequestSameDrawingVariantApprovalInput): Promise<NumberingApprovalRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.requestSameDrawingVariantApproval(input);
}

export async function requestMainDrawingRestoreApprovalAsync(input: RequestMainDrawingRestoreApprovalInput): Promise<NumberingApprovalRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.requestMainDrawingRestoreApproval(input);
}

export async function decideNumberingApprovalAsync(input: DecideNumberingApprovalInput): Promise<NumberingApprovalRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.decideNumberingApproval(input);
}

export async function getNumberingApprovalBatchAsync(batchId: string, companyId?: string): Promise<NumberingApprovalBatchRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.getNumberingApprovalBatch(batchId, companyId);
}

export async function listNumberingApprovalBatchesAsync(
  input: ListNumberingApprovalBatchesInput = {}
): Promise<NumberingApprovalReviewBatchRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listNumberingApprovalBatches(input);
}

export async function createNumberingApprovalBatchAsync(input: CreateNumberingApprovalBatchInput): Promise<NumberingApprovalBatchRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.createNumberingApprovalBatch(input);
}

export async function decideNumberingApprovalBatchAsync(
  input: DecideNumberingApprovalBatchInput
): Promise<{ batch: NumberingApprovalBatchRecord; decisions: NumberingApprovalRecord[] }> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.decideNumberingApprovalBatch(input);
}

export async function resubmitRejectedNumberingApprovalBatchItemsAsync(
  input: ResubmitRejectedNumberingApprovalBatchItemsInput
): Promise<{ batch: NumberingApprovalBatchRecord; requests: NumberingApprovalRecord[] }> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.resubmitRejectedNumberingApprovalBatchItems(input);
}

export async function createNumberingImportBatchAsync(input: CreateNumberingImportBatchInput): Promise<NumberingImportBatchRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.createNumberingImportBatch(input);
}

export async function getNumberingImportBatchAsync(batchId: string, companyId?: string): Promise<NumberingImportBatchRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.getNumberingImportBatch(batchId, companyId);
}

export async function listNumberingImportBatchesAsync(
  input: ListNumberingImportBatchesInput = {}
): Promise<NumberingImportBatchRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listNumberingImportBatches(input);
}

export async function confirmNumberingImportBatchAsync(input: ConfirmNumberingImportBatchInput): Promise<NumberingImportBatchRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.confirmNumberingImportBatch(input);
}

export async function listNumberingAdminMatrixAsync(): Promise<NumberingAdminMatrixRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listNumberingAdminMatrix();
}

export async function upsertNumberingAdminRoleAsync(input: UpsertNumberingAdminRoleInput): Promise<NumberingAdminRoleRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.upsertNumberingAdminRole(input);
}

export async function upsertNumberingRolePermissionAsync(input: UpsertNumberingRolePermissionInput): Promise<NumberingAdminPermissionRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.upsertNumberingRolePermission(input);
}

export async function upsertNumberingRoleScopeAsync(input: UpsertNumberingRoleScopeInput): Promise<NumberingAdminRoleScopeRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.upsertNumberingRoleScope(input);
}

export async function upsertNumberingUserRoleAssignmentAsync(
  input: UpsertNumberingUserRoleAssignmentInput
): Promise<NumberingUserRoleAssignmentRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.upsertNumberingUserRoleAssignment(input);
}

export async function revokeNumberingUserRoleAssignmentAsync(
  input: RevokeNumberingUserRoleAssignmentInput
): Promise<NumberingUserRoleAssignmentRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.revokeNumberingUserRoleAssignment(input);
}

export async function saveNumberingRolePriorityAsync(input: SaveNumberingRolePriorityInput): Promise<NumberingRolePriorityVersionRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.saveNumberingRolePriority(input);
}

export async function upsertNumberingApprovalDelegationAsync(
  input: UpsertNumberingApprovalDelegationInput
): Promise<NumberingApprovalDelegationRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.upsertNumberingApprovalDelegation(input);
}

export async function revokeNumberingApprovalDelegationAsync(
  input: RevokeNumberingApprovalDelegationInput
): Promise<NumberingApprovalDelegationRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.revokeNumberingApprovalDelegation(input);
}

export async function upsertNumberingApprovalRuleAsync(input: UpsertNumberingApprovalRuleInput): Promise<NumberingAdminApprovalRuleRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.upsertNumberingApprovalRule(input);
}

export async function applyNumberingRuleTemplateAsync(input: ApplyNumberingRuleTemplateInput): Promise<NumberingAdminMatrixRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.applyNumberingRuleTemplate(input);
}

export async function evaluateApprovalRulesAsync(input: EvaluateApprovalRuleInput): Promise<ApprovalRuleEvaluation> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.evaluateApprovalRules(input);
}

export async function evaluateNumberingGateAsync(input: EvaluateNumberingGateInput): Promise<NumberingGateEvaluation> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.evaluateNumberingGate(input);
}

export async function listDvtPromotionCandidatesAsync(input: ListDvtPromotionCandidatesInput = {}): Promise<DvtPromotionCandidateRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listDvtPromotionCandidates(input);
}

export async function submitDvtPromotionDecisionsAsync(input: SubmitDvtPromotionInput): Promise<DvtPromotionSubmissionRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.submitDvtPromotionDecisions(input);
}

export async function analyzeMainDrawingObsolescenceAsync(input: MainDrawingImpactInput): Promise<MainDrawingImpactAnalysis> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.analyzeMainDrawingObsolescence(input);
}

export async function linkPartNumberToDrawingAsync(input: LinkPartNumberToDrawingInput) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.linkPartNumberToDrawing(input);
}

export async function listNumberingTasksAsync(input: ListNumberingTasksInput): Promise<NumberingTaskRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listNumberingTasks(input);
}

export async function updateNumberingTaskStatusAsync(input: UpdateNumberingTaskStatusInput): Promise<NumberingTaskRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.updateNumberingTaskStatus(input);
}

export async function listNumberingNotificationsAsync(input: ListNumberingNotificationsInput): Promise<NumberingNotificationRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listNumberingNotifications(input);
}

export async function updateNumberingNotificationStateAsync(
  input: UpdateNumberingNotificationStateInput
): Promise<NumberingNotificationRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.updateNumberingNotificationState(input);
}

export async function createNumberingExportJobAsync(input: CreateNumberingExportJobInput): Promise<NumberingExportJobRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.createNumberingExportJob(input);
}

export async function getNumberingExportJobAsync(jobId: string, companyId?: string): Promise<NumberingExportJobRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.getNumberingExportJob(jobId, companyId);
}

export async function listNumberingExportJobsAsync(input: ListNumberingExportJobsInput = {}): Promise<NumberingExportJobRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listNumberingExportJobs(input);
}

export async function generateMonthlyNumberingAuditReportAsync(
  input: GenerateMonthlyNumberingAuditReportInput
): Promise<MonthlyAuditReportRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.generateMonthlyNumberingAuditReport(input);
}

export async function getMonthlyNumberingAuditReportAsync(reportId: string, companyId?: string): Promise<MonthlyAuditReportRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.getMonthlyNumberingAuditReport(reportId, companyId);
}

export async function listMonthlyNumberingAuditReportsAsync(
  input: ListMonthlyNumberingAuditReportsInput = {}
): Promise<MonthlyAuditReportRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listMonthlyNumberingAuditReports(input);
}

export async function markOverdueDraftNumberingRecordsAsync(
  input: MarkOverdueDraftNumberingInput = {}
): Promise<MarkOverdueDraftNumberingResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.markOverdueDraftNumberingRecords(input);
}

export async function getNumberingRootDetailAsync(rootCode: string, companyId?: string): Promise<NumberingRootDetailRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.getNumberingRootDetail(rootCode, companyId);
}

export async function searchNumberingRecordsAsync(input: NumberingSearchInput = {}): Promise<NumberingSearchResultRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.searchNumberingRecords(input);
}

export async function listDrawingModuleRecordsAsync(input: DrawingModuleListInput = {}): Promise<DrawingModuleListRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listDrawingModuleRecords(input);
}

export async function listPartModuleRecordsAsync(input: PartModuleListInput = {}): Promise<PartModuleListRecord[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listPartModuleRecords(input);
}

export async function getPartModuleDetailAsync(partNumber: string, companyId?: string): Promise<PartModuleDetailRecord | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.getPartModuleDetail(partNumber, companyId);
}

export async function upsertPartVariantAttributesAsync(input: UpsertPartVariantAttributesInput): Promise<PartModuleDetailRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.upsertPartVariantAttributes(input);
}

export async function createPartCostProfileAsync(input: CreatePartCostProfileInput): Promise<PartModuleDetailRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.createPartCostProfile(input);
}

export async function decidePartCostChangeRequestAsync(input: DecidePartCostChangeRequestInput): Promise<PartModuleDetailRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.decidePartCostChangeRequest(input);
}

export async function resolvePartCostAsync(input: ResolvePartCostInput): Promise<PartCostResolutionRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.resolvePartCost(input);
}
