import type { RevisionPackageFileRole, RevisionPackageWarning } from "@/lib/revision-package";

export type SubmissionStatus = "Pending" | "Releasing" | "Released" | "Rejected" | "ReleaseFailed" | "Obsolete" | "Cancelled";
export type FileRole = "sldprt" | "sldasm" | "slddrw" | "pdf" | "dwg" | "other";

export type SubmissionReleaseActionability = {
  allowed: boolean;
  code:
    | "SUBMISSION_RELEASE_ALLOWED"
    | "SUBMISSION_RELEASE_TERMINAL_MASTER"
    | "SUBMISSION_RELEASE_TERMINAL_SANDBOX"
    | "SUBMISSION_RELEASE_MASTER_SCOPE_INVALID"
    | "SUBMISSION_NOT_FOUND";
  message: string;
  recovery_href: string;
  terminal_entities: Array<{
    kind: "part_root" | "drawing_number" | "part_number";
    id: string;
    code: string;
    record_status: "Obsolete" | "Merged";
  }>;
};

export type SubmissionSummary = {
  id: string;
  company_id?: string;
  item_id: string;
  part_number: string;
  part_name: string;
  drawing_number: string;
  revision: string;
  product_line: string;
  customer: string;
  project_code: string;
  process_name: string;
  machine: string;
  material: string;
  surface_finish: string;
  document_type: string;
  change_description: string;
  status: SubmissionStatus;
  submitted_by: string;
  submitted_by_name: string;
  approval_required: number;
  file_count: number;
  file_roles?: string | null;
  has_release_package?: number;
  has_active_lock?: number;
  created_at: string;
  updated_at: string;
  released_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  release_error: string | null;
  superseded_by_submission_id: string | null;
  obsolete_at: string | null;
  obsolete_by: string | null;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  returned_for_correction_at?: string | null;
  returned_for_correction_by?: string | null;
  returned_for_correction_reason?: string | null;
  corrects_submission_id?: string | null;
  resolved_by_submission_id?: string | null;
  resolved_at?: string | null;
};

export type SubmissionFile = {
  id: string;
  submission_id: string;
  file_role: FileRole;
  original_filename: string;
  local_path: string;
  storage_provider?: "local_repository" | "supabase_storage" | "s3_compatible" | "google_cloud_storage";
  storage_bucket?: string | null;
  storage_key?: string | null;
  gdrive_file_id: string | null;
  gdrive_status: "none" | "uploading" | "uploaded" | "failed" | "moved";
  sha256: string;
  file_size: number;
  source_master_attachment_id?: string | null;
  created_at: string;
};

export type SubmissionPartScope = {
  id: string;
  submission_id: string;
  company_id: string;
  item_id: string;
  part_number_id: string;
  part_number: string;
  part_name: string;
  link_type: "primary_manufacturing" | "reference";
  form_state: "no_impact" | "suspected_impact" | "confirmed_impact";
  fit_state: "no_impact" | "suspected_impact" | "confirmed_impact";
  function_state: "no_impact" | "suspected_impact" | "confirmed_impact";
  fff_outcome: "no_impact" | "suspected_impact" | "confirmed_impact";
  created_at: string;
};

export type FileReference = {
  id: string;
  submission_id: string;
  source_file_id: string | null;
  source_filename: string;
  source_file_role: FileRole;
  referenced_filename: string;
  referenced_part_number: string | null;
  referenced_drawing_number: string | null;
  referenced_revision: string | null;
  reference_type: "drawing_model" | "derived" | "unknown";
  quantity: number;
  extraction_method: string;
  confidence: "high" | "medium" | "low";
  created_at: string;
};

export type BomLine = {
  id: string;
  bom_header_id: string;
  line_no: number;
  child_part_number: string;
  child_revision: string | null;
  quantity: number;
  source_file_id: string | null;
  source_reference_id: string | null;
  source_filename: string | null;
  child_submission_id?: string | null;
  child_drawing_number?: string | null;
  child_part_name?: string | null;
  child_material?: string | null;
  child_surface_finish?: string | null;
  child_submission_revision?: string | null;
  child_status?: SubmissionStatus | null;
  child_latest_revision?: string | null;
  child_latest_released_revision?: string | null;
  created_at: string;
};

export type BomHeader = {
  id: string;
  parent_item_id: string;
  parent_submission_id: string;
  parent_revision: string;
  status: "Draft" | "ReleasedSnapshot";
  source: "manual" | "imported";
  line_count: number;
  created_at: string;
  updated_at: string;
};

export type BomDetail = BomHeader & {
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_material: string;
  parent_surface_finish: string;
  parent_status: SubmissionStatus;
  lines: BomLine[];
};

export type BomWorkbenchDraftStatus = "Draft" | "PendingReview" | "Rejected" | "Released" | "Obsolete" | "Archived";
export type BomWorkbenchSource = "manual";
export type BomWorkbenchNodeType = "item" | "group";
export type BomPurpose = "manufacturing" | "sales_kit";
/** @deprecated Kept only for decoding immutable v1/v2 evidence. Current BOM APIs are purpose-free. */
export type LegacyBomPurpose = BomPurpose;
export type { BomUomCode } from "@/lib/bom-unit-of-measure";

export type BomWorkbenchDraftSummary = {
  id: string;
  company_id: string | null;
  definition_id?: string | null;
  bom_purpose: BomPurpose;
  base_release_snapshot_id?: string | null;
  owner_part_number_id: string | null;
  bom_revision: string | null;
  source_submission_id: string | null;
  identity_authority: "canonical_part_number" | "legacy_submission_bound" | "manual_review";
  parent_item_id: string;
  parent_submission_id: string;
  parent_revision: string;
  draft_name: string;
  status: BomWorkbenchDraftStatus;
  source: BomWorkbenchSource;
  is_active: number;
  line_count: number;
  review_attempt: number;
  editor_version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BomWorkbenchListRecord = BomWorkbenchDraftSummary & {
  parent_part_number: string;
  parent_part_name: string;
  definitionId?: string | null;
  draftId?: string;
  releaseSnapshotId?: string | null;
  bomRevision?: string;
  applicableParentCount?: number;
  applicableParents?: Array<{ partNumberId: string; partNumber: string; name: string }>;
  unresolvedMappingCount?: number;
  baseReleaseSnapshotId?: string | null;
  updatedAt?: string;
};

export type BomReconfirmationFlag = {
  id: string;
  bom_draft_id: string;
  old_part_number_id: string;
  old_part_number: string;
  new_part_number_id: string;
  new_part_number: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type BomWorkbenchLine = {
  id: string;
  bom_draft_id: string;
  logical_line_id?: string | null;
  parent_line_id: string | null;
  node_type: BomWorkbenchNodeType;
  item_id: string | null;
  part_number: string | null;
  part_name?: string | null;
  revision: string | null;
  group_name: string | null;
  /** v3 returns a canonical decimal string; number remains for legacy v1/v2 rows. */
  quantity: number | string | null;
  quantity_uom_code?: import("@/lib/bom-unit-of-measure").BomUomCode | null;
  quantity_requires_reconfirmation?: boolean;
  quantity_scaled_6?: number | bigint | string | null;
  sequence_no: number;
  source: BomWorkbenchSource;
  source_priority: number;
  source_ref_id: string | null;
  source_filename: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BomDraftFloatingTopic = {
  id: string;
  bom_draft_id: string;
  logical_line_id?: string | null;
  parent_floating_topic_id: string | null;
  node_type: BomWorkbenchNodeType;
  item_id: string | null;
  part_number: string | null;
  part_name?: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | string | null;
  quantity_uom_code?: import("@/lib/bom-unit-of-measure").BomUomCode | null;
  quantity_requires_reconfirmation?: boolean;
  quantity_scaled_6?: number | bigint | string | null;
  sequence_no: number;
  root_position_x: number;
  root_position_y: number;
  source: BomWorkbenchSource;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BomWorkbenchDraftDetail = BomWorkbenchDraftSummary & {
  lines: BomWorkbenchLine[];
  floating_topics: BomDraftFloatingTopic[];
  reconfirmation_flags: BomReconfirmationFlag[];
  applicable_parents?: BomApplicableParent[];
  components?: BomSharedComponent[];
  unresolved_mappings?: BomUnresolvedMapping[];
  context_parent_part_number_id?: string | null;
  release_snapshot_id?: string | null;
  latest_review?: {
    id: string;
    status: "PendingReview" | "Approved" | "Rejected" | "Cancelled";
    lifecycle_action: "release" | "obsolete";
    change_reason: string;
    decision_reason: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  } | null;
};

export type BomApplicableParent = {
  part_number_id: string;
  part_number: string;
  part_name: string;
  selection_order: number;
};

export type BomSharedComponent = {
  node_id: string;
  logical_line_id: string;
  node_location: "tree" | "floating";
  component_mode: "fixed" | "by_parent";
  child_part_root_id: string;
  child_part_number_ids: string[];
  child_candidates?: Array<{ part_number_id: string; part_number: string; part_name: string; part_root_id: string }>;
  parent_selections: Array<{ parent_part_number_id: string; child_part_number_id: string }>;
};

export type BomUnresolvedMapping = {
  logical_line_id: string;
  parent_part_number_id: string;
};

export type BomWorkbenchSummary = {
  parent_submission_id: string;
  parent_item_id: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_revision: string;
  parent_status: SubmissionStatus;
  drafts: BomWorkbenchDraftSummary[];
  active_draft: BomWorkbenchDraftDetail | null;
};

export type BomReleaseGateIssueCode =
  | "missing_child_item"
  | "missing_child_revision"
  | "child_not_released"
  | "child_outdated_revision";

export type BomReleaseGateIssue = {
  code: BomReleaseGateIssueCode;
  line_id: string;
  part_number: string;
  revision: string | null;
  child_status?: string | null;
  latest_released_revision?: string | null;
  message: string;
};

export type BomReleaseSnapshotDetail = {
  id: string;
  bom_draft_id: string;
  company_id: string | null;
  definition_id?: string | null;
  bom_purpose: BomPurpose;
  snapshot_schema_version?: number;
  parent_snapshot_json?: string | null;
  mapping_snapshot_json?: string | null;
  resolved_projection_json?: string | null;
  snapshot_hash?: string | null;
  applicable_parents?: BomApplicableParent[];
  resolved_lines?: Array<{
    id: string;
    release_snapshot_id: string;
    definition_id: string;
    parent_part_number_id: string;
    logical_line_id: string;
    parent_logical_line_id: string | null;
    node_type: BomWorkbenchNodeType;
    child_part_number_id: string | null;
    child_part_number: string | null;
    child_part_name: string | null;
    group_name: string | null;
    quantity: number | string | null;
    quantity_uom_code?: import("@/lib/bom-unit-of-measure").BomUomCode | null;
    quantity_scaled_6?: number | bigint | string | null;
    sequence_no: number;
    level: number;
    source: BomWorkbenchSource;
  }>;
  owner_part_number_id: string | null;
  bom_revision: string | null;
  source_submission_id: string | null;
  parent_item_id: string;
  parent_submission_id: string;
  parent_revision: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  line_count: number;
  released_by: string;
  released_by_name: string | null;
  released_at: string;
  obsolete_at: string | null;
  obsolete_by: string | null;
  lines: BomWorkbenchLine[];
};

export type BomDiffChangeType = "added" | "removed" | "changed" | "unchanged";

export type BomDiffLine = {
  key: string;
  change_type: BomDiffChangeType;
  child_part_number: string;
  from_revision: string | null;
  to_revision: string | null;
  from_quantity: number | null;
  to_quantity: number | null;
  from_source_filename: string | null;
  to_source_filename: string | null;
};

export type BomDiffResult = {
  base_submission_id: string;
  target_submission_id: string;
  base_revision: string;
  target_revision: string;
  base_created_at: string;
  target_created_at: string;
  added_count: number;
  removed_count: number;
  changed_count: number;
  unchanged_count: number;
  lines: BomDiffLine[];
};

export type WhereUsedEntry = {
  parent_submission_id: string;
  parent_item_id: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_revision: string;
  parent_status: SubmissionStatus;
  parent_submitted_by: string;
  parent_submitted_by_name: string;
  bom_header_id: string;
  bom_purpose: BomPurpose;
  bom_status: BomHeader["status"];
  child_part_number: string;
  child_revision: string | null;
  child_submission_id?: string | null;
  child_drawing_number?: string | null;
  child_status?: SubmissionStatus | null;
  child_latest_released_revision?: string | null;
  child_is_outdated?: number;
  quantity: number;
  source_filename: string | null;
  parent_created_at: string;
  parent_released_at: string | null;
};

export type DesignReuseCandidate = SubmissionSummary & {
  score: number;
  match_reasons: string[];
  matched_files: string[];
};

export type DuplicateGeometryCandidate = SubmissionSummary & {
  fingerprint_score: number;
  duplicate_level: "exact" | "strong" | "possible";
  fingerprint_signals: string[];
  matched_files: string[];
};

export type SandboxBranch = {
  id: string;
  source_submission_id: string;
  sandbox_submission_id: string;
  branch_name: string;
  reason: string;
  status: "active" | "promoted" | "closed";
  created_by: string;
  created_by_name: string;
  promoted_by: string | null;
  promoted_by_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  merged_by: string | null;
  merged_by_name: string | null;
  merge_summary_json: string | null;
  promoted_at: string | null;
  closed_at: string | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  source_drawing_number: string;
  source_revision: string;
  sandbox_drawing_number: string;
  sandbox_revision: string;
  sandbox_status: SubmissionStatus;
};

export type ItemLock = {
  id: string;
  item_id: string;
  part_number: string;
  part_name: string;
  locked_by: string;
  locked_by_name: string;
  lock_reason: string;
  expires_at: string;
  released_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReleasePackage = {
  id: string;
  submission_id: string;
  package_filename: string;
  local_path: string;
  storage_provider?: "local_repository" | "supabase_storage" | "s3_compatible" | "google_cloud_storage";
  storage_bucket?: string | null;
  storage_key?: string | null;
  sha256: string;
  file_size: number;
  manifest_json: string;
  created_by: string | null;
  created_at: string;
};

export type SubmissionLifecycleRequest = {
  id: string;
  submission_id: string;
  action_code: "obsolete_submission";
  request_status: "pending" | "approved" | "rejected" | "cancelled";
  requested_by: string;
  requested_by_name: string;
  reason: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decision_reason: string | null;
  requested_at: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ControlledHistoryEntry = {
  id: string;
  entity_type: "submission" | "numbering_part_number" | "numbering_drawing_number" | "bom_release";
  target_id: string;
  display_code: string;
  secondary_code: string;
  title: string;
  stage_label: "歷史";
  result_label: "已作廢";
  traceability_class: "controlled_history";
  history_reason: string;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  requested_at: string | null;
  decided_at: string | null;
  history_at: string | null;
  decision_reason: string | null;
  source_status: string;
  release_package_available: boolean;
  actions: {
    delete: false;
    restore: false;
    obsolete: false;
  };
};

export type ReadonlyShare = {
  id: string;
  submission_id: string;
  label: string;
  expires_at: string;
  created_by: string;
  created_by_name: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
  status: "active" | "expired" | "revoked";
  response_count: number;
  open_response_count: number;
  latest_response_at: string | null;
};

export type SupplierPortalResponse = {
  id: string;
  share_id: string;
  submission_id: string;
  share_label: string;
  response_kind: "acknowledgement" | "question";
  supplier_name: string;
  supplier_email: string;
  message: string;
  status: "open" | "closed";
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcurementSyncRun = {
  id: string;
  submission_id: string;
  drawing_number: string;
  revision: string;
  part_number: string;
  part_name: string;
  target_system: "ERP" | "inventory" | "procurement";
  status: "sent" | "acknowledged" | "failed";
  payload_json: string;
  response_json: string;
  external_reference: string | null;
  created_by: string;
  created_by_name: string;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DiscussionComment = {
  id: string;
  submission_id: string;
  file_id: string | null;
  file_original_filename: string | null;
  author_id: string;
  author_name: string;
  body: string;
  status: "open" | "resolved";
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewIssue = {
  id: string;
  submission_id: string;
  file_id: string | null;
  file_original_filename: string | null;
  title: string;
  description: string;
  status: "open" | "resolved";
  raised_by: string;
  raised_by_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChangeRequest = {
  id: string;
  submission_id: string;
  kind: "ECR" | "ECO" | "ECN";
  title: string;
  reason: string;
  impact: string;
  status: "open" | "approved" | "rejected" | "closed";
  requested_by: string;
  requested_by_name: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decision_comment: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApprovalMatrixRequirement = {
  id: string;
  submission_id: string;
  required_role: "R&D Manager" | "Admin";
  min_count: number;
  status: "open" | "satisfied" | "waived";
  created_by: string;
  created_by_name: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decision_comment: string | null;
  decided_at: string | null;
  approved_count: number;
  created_at: string;
  updated_at: string;
};

export type PdfMarkup = {
  id: string;
  submission_id: string;
  file_id: string;
  file_original_filename: string;
  page_number: number;
  x_percent: number;
  y_percent: number;
  body: string;
  status: "open" | "resolved";
  author_id: string;
  author_name: string;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubmissionDetail = SubmissionSummary & {
  release_actionability?: SubmissionReleaseActionability;
  files: SubmissionFile[];
  part_scopes: SubmissionPartScope[];
  references: FileReference[];
  revision_package?: {
    effective_status?: "Pending" | "ReviewApproved" | "Released" | "Cancelled" | null;
    files: Array<{
      source_attachment_id: string | null;
      submission_file_id: string | null;
      filename: string;
      default_role: RevisionPackageFileRole;
      role: RevisionPackageFileRole;
      source: "extension" | "user";
    }>;
    warnings: RevisionPackageWarning[];
  } | null;
  bom: BomDetail | null;
  active_lock: ItemLock | null;
  release_package: ReleasePackage | null;
  approvals: Array<{
    id: string;
    reviewer_id: string;
    reviewer_name: string;
    sequence_no: number;
    decision: string;
    comment: string | null;
    decided_at: string;
  }>;
  audit_logs: Array<{
    id: string;
    actor_id: string | null;
    action: string;
    detail_json: string;
    created_at: string;
  }>;
  lifecycle_requests: SubmissionLifecycleRequest[];
};

export type ItemRevisionHistoryEntry = {
  submission_id: string;
  item_id: string;
  part_number: string;
  part_name: string;
  drawing_number: string;
  revision: string;
  status: SubmissionStatus;
  submitted_by: string;
  submitted_by_name: string;
  approval_required: number;
  created_at: string;
  released_at: string | null;
  rejected_at: string | null;
  superseded_by_submission_id: string | null;
  obsolete_at: string | null;
  obsolete_by: string | null;
};

export type NotificationSeverity = "critical" | "warning" | "info";
export type NotificationKind =
  | "release_failed"
  | "pending_review"
  | "awaiting_review"
  | "active_lock"
  | "drive_upload_failed"
  | "release_package_missing"
  | "storage_evidence_alert";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  submission_id: string | null;
  drawing_number: string | null;
  revision: string | null;
  part_number: string | null;
  part_name: string | null;
  created_at: string;
  action_url: string | null;
};

export type NotificationSummary = {
  total: number;
  critical: number;
  warning: number;
  info: number;
};

export type AiSubmissionSummarySource = {
  type: "submission" | "file" | "revision" | "bom" | "where_used";
  label: string;
  detail: string;
};

export type AiSubmissionSummarySection = {
  key: "change_reason" | "files" | "revision_history" | "bom_diff" | "where_used" | "missing_files";
  title: string;
  body: string;
  facts: string[];
  severity: "info" | "warning" | "critical";
};

export type AiSubmissionSummary = {
  submission_id: string;
  title: string;
  generated_at: string;
  sections: AiSubmissionSummarySection[];
  missing_file_roles: FileRole[];
  source_count: number;
  sources: AiSubmissionSummarySource[];
};

export type AiRiskCode =
  | "missing_handoff_file"
  | "newer_revision_exists"
  | "where_used_impact"
  | "released_filename_conflict"
  | "bom_child_missing"
  | "bom_child_not_released"
  | "bom_child_outdated"
  | "bom_duplicate_child_part"
  | "submission_required_fields_missing";

export type AiRiskHint = {
  code: AiRiskCode;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  action: string;
  sources: AiSubmissionSummarySource[];
};

export type AiRiskReport = {
  submission_id: string;
  generated_at: string;
  risk_count: number;
  risks: AiRiskHint[];
};
