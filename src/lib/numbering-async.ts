import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  createFallbackCommandMetadata,
  createPdmCommand,
  type PdmCommandMetadata
} from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import type { NumberingRootBundleRecord } from "@/lib/repositories/numbering-async-repository";
import type {
  DuplicateCheckInput,
  DuplicateCheckResult,
  AddDrawingAndPartToRootInput,
  AddDrawingAndPartToRootResult,
  AddDrawingNumberInput,
  AddDrawingNumberToRootResult,
  AddPartNumberInput,
  AddPartNumberToRootResult,
  ConfirmNumberingImportBatchInput,
  ApplyNumberingRuleTemplateInput,
  CreateNumberingApprovalBatchInput,
  CreateNumberingImportBatchInput,
  DeleteDraftNumberingRecordInput,
  DeleteDraftNumberingRecordResult,
  DeleteNumberingImportBatchInput,
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
  ApprovalRuleEvaluation,
  EvaluateApprovalRuleInput,
  EvaluateNumberingGateInput,
  LinkPartNumberToDrawingInput,
  MaintainDrawingPartRelationInput,
  MaintainDrawingPartRelationResult,
  ObsoleteDraftNumberingRecordInput,
  PartCostResolutionRecord,
  PartModuleDetailRecord,
  PartModuleListInput,
  PartModuleListRecord,
  ResolvePartCostInput,
  RevokeNumberingApprovalDelegationInput,
  RevokeNumberingUserRoleAssignmentInput,
  SaveNumberingRolePriorityInput,
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
  RequestNumberingObsoleteApprovalInput,
  RequestRootObsoleteApprovalInput,
  RootObsoleteApprovalResult,
  RootObsoleteImpactResult,
  RequestSameDrawingVariantApprovalInput,
  NumberingObsoleteApprovalResult,
  ResubmitRejectedNumberingApprovalBatchItemsInput,
  RestoreNumberingImportBatchInput,
  UpsertPartVariantAttributesInput,
  UpdateDraftNumberingRecordInput,
  UpdateNumberingNotificationStateInput,
  UpdateNumberingTaskStatusInput
} from "@/lib/repositories/numbering-repository";

export type { NumberingRootBundleRecord } from "@/lib/repositories/numbering-async-repository";

export async function createNumberingRecordAsync(input: CreateNumberingRecordInput, metadata?: PdmCommandMetadata): Promise<{
  root: PartRootRecord;
  partNumber: PartNumberRecord;
  drawingNumber: DrawingNumberRecord | null;
}> {
  const client = getAsyncDatabaseClient();
  const commandMetadata = metadata ?? createFallbackCommandMetadata({
    pdmUserId: input.createdBy,
    organizationId: input.companyId,
    commandName: "pdm.numbering.create_official_record",
    idempotencyKey: input.idempotencyKey
  });
  const command = createPdmCommand({
    commandName: "pdm.numbering.create_official_record",
    idempotencyKey: commandMetadata.idempotencyKey,
    actor: commandMetadata.actor,
    payload: {
      coreName: input.coreName,
      itemKind: input.itemKind,
      seriesCode: input.seriesCode?.trim() || null,
      drawingPurposeCode: input.drawingPurposeCode ?? null
    }
  });
  const executed = await executePdmCommandWithOutbox({
    client,
    command,
    execute: (transactionClient) => new AsyncNumberingRepository(transactionClient).createNumberingRecord(input),
    event: (result) => ({
      aggregateType: "part_root",
      aggregateId: result.root.id,
      eventType: "pdm.numbering.official_record_created.v1",
      payload: {
        rootCode: result.root.rootCode,
        partNumber: result.partNumber.partNumber,
        seriesCode: result.partNumber.seriesCode,
        drawingNumber: result.drawingNumber?.drawingNumber ?? null
      }
    })
  });
  return executed.result;
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

export async function deleteDraftNumberingRecordAsync(input: DeleteDraftNumberingRecordInput): Promise<DeleteDraftNumberingRecordResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.deleteDraftNumberingRecord(input);
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

export async function requestNumberingObsoleteApprovalAsync(input: RequestNumberingObsoleteApprovalInput): Promise<NumberingObsoleteApprovalResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.requestNumberingObsoleteApproval(input);
}

export async function addDrawingNumberToRootAsync(
  input: AddDrawingNumberInput,
  metadata?: PdmCommandMetadata
): Promise<AddDrawingNumberToRootResult> {
  const client = getAsyncDatabaseClient();
  const commandMetadata = metadata ?? createFallbackCommandMetadata({
    pdmUserId: input.createdBy,
    organizationId: input.companyId,
    commandName: "pdm.numbering.append_drawing",
    idempotencyKey: input.idempotencyKey
  });
  const command = createPdmCommand({
    commandName: "pdm.numbering.append_drawing",
    idempotencyKey: commandMetadata.idempotencyKey,
    actor: commandMetadata.actor,
    payload: { rootCode: input.rootCode, purposeCode: input.purposeCode }
  });
  const executed = await executePdmCommandWithOutbox({
    client,
    command,
    execute: (transactionClient) =>
      new AsyncNumberingRepository(transactionClient).addDrawingNumberToRoot({
        ...input,
        idempotencyKey: commandMetadata.idempotencyKey
      }),
    event: (result) => ({
      aggregateType: "part_root",
      aggregateId: result.root.id,
      eventType: "pdm.numbering.drawing_appended.v1",
      payload: {
        rootCode: result.root.rootCode,
        drawingNumber: result.drawingNumber.drawingNumber,
        linkedPartNumber: result.linkedPart?.partNumber ?? null,
        linkType: result.linkType
      }
    })
  });
  return { ...executed.result, reusedFromIdempotency: executed.reusedFromCommandReceipt || executed.result.reusedFromIdempotency };
}

export async function addPartNumberToRootAsync(
  input: AddPartNumberInput,
  metadata?: PdmCommandMetadata
): Promise<AddPartNumberToRootResult> {
  const client = getAsyncDatabaseClient();
  const commandMetadata = metadata ?? createFallbackCommandMetadata({
    pdmUserId: input.createdBy,
    organizationId: input.companyId,
    commandName: "pdm.numbering.append_part",
    idempotencyKey: input.idempotencyKey
  });
  const command = createPdmCommand({
    commandName: "pdm.numbering.append_part",
    idempotencyKey: commandMetadata.idempotencyKey,
    actor: commandMetadata.actor,
    payload: { rootCode: input.rootCode, itemKind: input.itemKind ?? null, seriesCode: input.seriesCode?.trim() || null }
  });
  const executed = await executePdmCommandWithOutbox({
    client,
    command,
    execute: (transactionClient) =>
      new AsyncNumberingRepository(transactionClient).addPartNumberToRoot({
        ...input,
        idempotencyKey: commandMetadata.idempotencyKey
      }),
    event: (result) => ({
      aggregateType: "part_root",
      aggregateId: result.root.id,
      eventType: "pdm.numbering.part_appended.v1",
      payload: {
        rootCode: result.root.rootCode,
        partNumber: result.partNumber.partNumber,
        seriesCode: result.partNumber.seriesCode,
        linkedDrawingNumber: result.linkedDrawing?.drawingNumber ?? null,
        linkType: result.linkType
      }
    })
  });
  return { ...executed.result, reusedFromIdempotency: executed.reusedFromCommandReceipt || executed.result.reusedFromIdempotency };
}

export async function addDrawingAndPartToRootAsync(
  input: AddDrawingAndPartToRootInput,
  metadata?: PdmCommandMetadata
): Promise<AddDrawingAndPartToRootResult> {
  const client = getAsyncDatabaseClient();
  const commandMetadata = metadata ?? createFallbackCommandMetadata({
    pdmUserId: input.createdBy,
    organizationId: input.companyId,
    commandName: "pdm.numbering.append_drawing_part",
    idempotencyKey: input.idempotencyKey
  });
  const command = createPdmCommand({
    commandName: "pdm.numbering.append_drawing_part",
    idempotencyKey: commandMetadata.idempotencyKey,
    actor: commandMetadata.actor,
    payload: { rootCode: input.rootCode, purposeCode: input.purposeCode, itemKind: input.itemKind ?? null, seriesCode: input.seriesCode?.trim() || null }
  });
  const executed = await executePdmCommandWithOutbox({
    client,
    command,
    execute: (transactionClient) =>
      new AsyncNumberingRepository(transactionClient).addDrawingAndPartToRoot({
        ...input,
        idempotencyKey: commandMetadata.idempotencyKey
      }),
    event: (result) => ({
      aggregateType: "part_root",
      aggregateId: result.root.id,
      eventType: "pdm.numbering.drawing_part_appended.v1",
      payload: {
        rootCode: result.root.rootCode,
        drawingNumber: result.drawingNumber.drawingNumber,
        partNumber: result.partNumber.partNumber,
        seriesCode: result.partNumber.seriesCode,
        linkType: result.linkType
      }
    })
  });
  return { ...executed.result, reusedFromIdempotency: executed.reusedFromCommandReceipt || executed.result.reusedFromIdempotency };
}

export async function getRootObsoleteImpactAsync(input: { companyId?: string; rootCode?: string; rootId?: string }): Promise<RootObsoleteImpactResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.getRootObsoleteImpact(input);
}

export async function requestRootObsoleteApprovalAsync(input: RequestRootObsoleteApprovalInput): Promise<RootObsoleteApprovalResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.requestRootObsoleteApproval(input);
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

export async function deleteNumberingImportBatchAsync(input: DeleteNumberingImportBatchInput): Promise<NumberingImportBatchRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.deleteNumberingImportBatch(input);
}

export async function restoreNumberingImportBatchAsync(input: RestoreNumberingImportBatchInput): Promise<NumberingImportBatchRecord> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.restoreNumberingImportBatch(input);
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

export async function maintainDrawingPartRelationAsync(input: MaintainDrawingPartRelationInput): Promise<MaintainDrawingPartRelationResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.maintainDrawingPartRelation(input);
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

export async function listProductSeriesOptionsAsync(companyId?: string): Promise<string[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listProductSeriesOptions(companyId);
}

export async function listSeriesCodeOptionsAsync(companyId?: string): Promise<string[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncNumberingRepository(client);
  return repository.listSeriesCodeOptions(companyId);
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
