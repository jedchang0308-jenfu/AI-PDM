PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('Engineer', 'R&D Manager', 'Admin', 'Manufacturing', 'Procurement')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  part_number TEXT NOT NULL UNIQUE,
  part_name TEXT NOT NULL,
  current_revision TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  drawing_number TEXT NOT NULL,
  revision TEXT NOT NULL,
  product_line TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  project_code TEXT NOT NULL DEFAULT '',
  process_name TEXT NOT NULL DEFAULT '',
  machine TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL,
  surface_finish TEXT NOT NULL,
  document_type TEXT NOT NULL,
  change_description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Releasing', 'Released', 'Rejected', 'ReleaseFailed', 'Obsolete')),
  submitted_by TEXT NOT NULL,
  approval_required INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (1, 2)),
  released_at TEXT,
  rejected_at TEXT,
  reject_reason TEXT,
  release_error TEXT,
  superseded_by_submission_id TEXT,
  obsolete_at TEXT,
  obsolete_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (superseded_by_submission_id) REFERENCES submissions(id),
  FOREIGN KEY (obsolete_by) REFERENCES users(id),
  UNIQUE (drawing_number, revision)
);

CREATE TABLE IF NOT EXISTS submission_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  file_role TEXT NOT NULL CHECK (file_role IN ('sldprt', 'sldasm', 'slddrw', 'pdf', 'dwg', 'other')),
  original_filename TEXT NOT NULL,
  local_path TEXT NOT NULL,
  gdrive_file_id TEXT,
  gdrive_status TEXT NOT NULL DEFAULT 'none' CHECK (gdrive_status IN ('none', 'uploading', 'uploaded', 'failed', 'moved')),
  sha256 TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  UNIQUE (submission_id, file_role, original_filename)
);

CREATE TABLE IF NOT EXISTS file_references (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  source_file_id TEXT,
  source_filename TEXT NOT NULL,
  source_file_role TEXT NOT NULL CHECK (source_file_role IN ('sldprt', 'sldasm', 'slddrw', 'pdf', 'dwg', 'other')),
  referenced_filename TEXT NOT NULL,
  referenced_part_number TEXT,
  referenced_drawing_number TEXT,
  referenced_revision TEXT,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('assembly_component', 'drawing_model', 'derived', 'unknown')),
  quantity REAL NOT NULL DEFAULT 1,
  extraction_method TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_file_id) REFERENCES submission_files(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bom_headers (
  id TEXT PRIMARY KEY,
  parent_item_id TEXT NOT NULL,
  parent_submission_id TEXT NOT NULL UNIQUE,
  parent_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'ReleasedSnapshot')),
  source TEXT NOT NULL DEFAULT 'cad_references' CHECK (source IN ('cad_references', 'manual', 'imported')),
  line_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id TEXT PRIMARY KEY,
  bom_header_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  child_part_number TEXT NOT NULL,
  child_revision TEXT,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  source_file_id TEXT,
  source_reference_id TEXT,
  source_filename TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (bom_header_id) REFERENCES bom_headers(id) ON DELETE CASCADE,
  FOREIGN KEY (source_file_id) REFERENCES submission_files(id) ON DELETE SET NULL,
  FOREIGN KEY (source_reference_id) REFERENCES file_references(id) ON DELETE SET NULL,
  UNIQUE (bom_header_id, line_no)
);

CREATE TABLE IF NOT EXISTS bom_drafts (
  id TEXT PRIMARY KEY,
  parent_item_id TEXT NOT NULL,
  parent_submission_id TEXT NOT NULL,
  parent_revision TEXT NOT NULL,
  draft_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'PendingReview', 'Rejected', 'Released', 'Obsolete', 'Archived')),
  source TEXT NOT NULL DEFAULT 'cad_reference' CHECK (source IN ('cad_reference', 'solidworks_xls', 'manual')),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  line_count INTEGER NOT NULL DEFAULT 0,
  review_attempt INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_one_active
ON bom_drafts(parent_item_id, parent_revision)
WHERE is_active = 1 AND status IN ('Draft', 'Rejected');

CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_one_pending_review
ON bom_drafts(parent_item_id, parent_revision)
WHERE status = 'PendingReview';

CREATE TABLE IF NOT EXISTS bom_lines_tree (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL,
  parent_line_id TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('item', 'group')),
  item_id TEXT,
  part_number TEXT,
  revision TEXT,
  group_name TEXT,
  quantity REAL CHECK (quantity IS NULL OR quantity > 0),
  sequence_no INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'cad_reference' CHECK (source IN ('cad_reference', 'solidworks_xls', 'manual')),
  source_priority INTEGER NOT NULL DEFAULT 10,
  source_ref_id TEXT,
  source_filename TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (node_type = 'item' AND part_number IS NOT NULL AND trim(part_number) <> '' AND quantity IS NOT NULL)
    OR
    (node_type = 'group' AND group_name IS NOT NULL AND trim(group_name) <> '' AND quantity IS NULL)
  ),
  FOREIGN KEY (bom_draft_id) REFERENCES bom_drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_line_id) REFERENCES bom_lines_tree(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bom_import_profiles (
  id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'solidworks_xls' CHECK (source_type IN ('solidworks_xls')),
  version TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (profile_name, version)
);

CREATE TABLE IF NOT EXISTS bom_import_jobs (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT,
  parent_submission_id TEXT NOT NULL,
  import_profile_id TEXT NOT NULL,
  source_asset_id TEXT,
  original_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Staged' CHECK (status IN ('Staged', 'Imported', 'Rejected', 'Failed')),
  row_count INTEGER NOT NULL DEFAULT 0,
  error_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (bom_draft_id) REFERENCES bom_drafts(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (import_profile_id) REFERENCES bom_import_profiles(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bom_edit_events (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (bom_draft_id) REFERENCES bom_drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bom_review_requests (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PendingReview' CHECK (status IN ('PendingReview', 'Approved', 'Rejected', 'Cancelled')),
  submitted_by TEXT NOT NULL,
  reviewed_by TEXT,
  change_reason TEXT NOT NULL,
  decision_reason TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  FOREIGN KEY (bom_draft_id) REFERENCES bom_drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bom_release_snapshots (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL,
  parent_item_id TEXT NOT NULL,
  parent_submission_id TEXT NOT NULL,
  parent_revision TEXT NOT NULL,
  line_snapshot_json TEXT NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  released_by TEXT NOT NULL,
  released_at TEXT NOT NULL DEFAULT (datetime('now')),
  obsolete_at TEXT,
  obsolete_by TEXT,
  FOREIGN KEY (bom_draft_id) REFERENCES bom_drafts(id),
  FOREIGN KEY (parent_item_id) REFERENCES items(id),
  FOREIGN KEY (parent_submission_id) REFERENCES submissions(id),
  FOREIGN KEY (released_by) REFERENCES users(id),
  FOREIGN KEY (obsolete_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS item_locks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  locked_by TEXT NOT NULL,
  lock_reason TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS release_packages (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  package_filename TEXT NOT NULL,
  local_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS readonly_shares (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (revoked_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supplier_portal_responses (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  response_kind TEXT NOT NULL CHECK (response_kind IN ('acknowledgement', 'question')),
  supplier_name TEXT NOT NULL,
  supplier_email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (share_id) REFERENCES readonly_shares(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS procurement_sync_runs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  target_system TEXT NOT NULL CHECK (target_system IN ('ERP', 'inventory', 'procurement')),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'acknowledged', 'failed')),
  payload_json TEXT NOT NULL,
  response_json TEXT NOT NULL DEFAULT '{}',
  external_reference TEXT,
  created_by TEXT NOT NULL,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (acknowledged_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sandbox_branches (
  id TEXT PRIMARY KEY,
  source_submission_id TEXT NOT NULL,
  sandbox_submission_id TEXT NOT NULL UNIQUE,
  branch_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'promoted', 'closed')),
  created_by TEXT NOT NULL,
  promoted_by TEXT,
  closed_by TEXT,
  merged_by TEXT,
  merge_summary_json TEXT,
  promoted_at TEXT,
  closed_at TEXT,
  merged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (sandbox_submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (promoted_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id),
  FOREIGN KEY (merged_by) REFERENCES users(id),
  UNIQUE (source_submission_id, branch_name)
);

CREATE TABLE IF NOT EXISTS discussion_comments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  file_id TEXT,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES submission_files(id) ON DELETE SET NULL,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS review_issues (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  file_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  raised_by TEXT NOT NULL,
  assignee_id TEXT,
  resolved_by TEXT,
  resolution TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES submission_files(id) ON DELETE SET NULL,
  FOREIGN KEY (raised_by) REFERENCES users(id),
  FOREIGN KEY (assignee_id) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ECR', 'ECO', 'ECN')),
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  impact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected', 'closed')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decision_comment TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS phase_gate_checks (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  gate_code TEXT NOT NULL CHECK (gate_code IN ('concept', 'design', 'verification', 'release')),
  gate_name TEXT NOT NULL,
  checklist_item TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'waived')),
  created_by TEXT NOT NULL,
  decided_by TEXT,
  decision_comment TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id),
  UNIQUE (submission_id, gate_code, checklist_item)
);

CREATE TABLE IF NOT EXISTS pdf_markups (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  x_percent REAL NOT NULL CHECK (x_percent >= 0 AND x_percent <= 100),
  y_percent REAL NOT NULL CHECK (y_percent >= 0 AND y_percent <= 100),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  author_id TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES submission_files(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  decision TEXT NOT NULL CHECK (decision IN ('Approved', 'Rejected')),
  comment TEXT,
  decided_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  UNIQUE (submission_id, reviewer_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS approval_matrix_requirements (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  required_role TEXT NOT NULL CHECK (required_role IN ('R&D Manager', 'Admin')),
  min_count INTEGER NOT NULL DEFAULT 1 CHECK (min_count BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'satisfied', 'waived')),
  created_by TEXT NOT NULL,
  decided_by TEXT,
  decision_comment TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id),
  UNIQUE (submission_id, required_role)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LOG_APPEND_ONLY');
END;

CREATE TABLE IF NOT EXISTS numbering_sequences (
  sequence_key TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL CHECK (next_value > 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS numbering_rule_versions (
  id TEXT PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  effective_at TEXT NOT NULL DEFAULT (datetime('now')),
  retired_at TEXT,
  rule_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT OR IGNORE INTO numbering_rule_versions (id, rule_code, title, status, rule_json)
VALUES (
  'numbering-rule-v1',
  'PDM-NUMBERING-V1',
  'PDM numbering rule v1',
  'active',
  '{"partRootDigits":4,"partSequenceDigits":3,"drawingPrefix":"D","partPrefix":"P","drawingPurposeCodes":["MA","OT"]}'
);

CREATE TABLE IF NOT EXISTS part_roots (
  id TEXT PRIMARY KEY,
  root_code TEXT NOT NULL UNIQUE,
  core_name TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'shared', 'custom')),
  development_phase TEXT NOT NULL DEFAULT 'EVT' CHECK (development_phase IN ('EVT', 'DVT', 'PVT', 'Release', 'ECR')),
  record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'EVTDisabled', 'PendingAdminConfirm', 'MainDrawingInvalid')),
  rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v1',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS part_numbers (
  id TEXT PRIMARY KEY,
  part_root_id TEXT NOT NULL,
  part_number TEXT NOT NULL UNIQUE,
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
  sequence_code TEXT NOT NULL,
  part_name TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'shared', 'custom')),
  is_universal INTEGER NOT NULL DEFAULT 0 CHECK (is_universal IN (0, 1)),
  bom_usage_policy TEXT NOT NULL DEFAULT 'undecided' CHECK (bom_usage_policy IN ('undecided', 'not_required', 'available', 'restricted', 'obsolete')),
  custom_specification TEXT,
  development_phase TEXT NOT NULL DEFAULT 'EVT' CHECK (development_phase IN ('EVT', 'DVT', 'PVT', 'Release', 'ECR')),
  record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'EVTDisabled', 'PendingAdminConfirm', 'MainDrawingInvalid')),
  universal_reason TEXT,
  rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v1',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (part_root_id) REFERENCES part_roots(id) ON DELETE CASCADE,
  FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE (part_root_id, sequence_code)
);

CREATE TABLE IF NOT EXISTS drawing_numbers (
  id TEXT PRIMARY KEY,
  part_root_id TEXT NOT NULL,
  drawing_number TEXT NOT NULL UNIQUE,
  purpose_code TEXT NOT NULL CHECK (purpose_code IN ('MA', 'OT')),
  purpose_description TEXT NOT NULL DEFAULT '',
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  is_primary_manufacturing INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_manufacturing IN (0, 1)),
  development_phase TEXT NOT NULL DEFAULT 'EVT' CHECK (development_phase IN ('EVT', 'DVT', 'PVT', 'Release', 'ECR')),
  record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'EVTDisabled', 'PendingAdminConfirm', 'MainDrawingInvalid')),
  rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v1',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (part_root_id) REFERENCES part_roots(id) ON DELETE CASCADE,
  FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE (part_root_id, purpose_code, sequence_no)
);

CREATE TABLE IF NOT EXISTS drawing_part_links (
  id TEXT PRIMARY KEY,
  drawing_number_id TEXT NOT NULL,
  part_number_id TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('primary_manufacturing', 'reference')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (drawing_number_id) REFERENCES drawing_numbers(id) ON DELETE CASCADE,
  FOREIGN KEY (part_number_id) REFERENCES part_numbers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE (drawing_number_id, part_number_id, link_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_part_links_primary_per_part
ON drawing_part_links(part_number_id)
WHERE link_type = 'primary_manufacturing';

CREATE TABLE IF NOT EXISTS same_drawing_variants (
  id TEXT PRIMARY KEY,
  drawing_number_id TEXT NOT NULL,
  part_number_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (drawing_number_id) REFERENCES drawing_numbers(id) ON DELETE CASCADE,
  FOREIGN KEY (part_number_id) REFERENCES part_numbers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE (drawing_number_id, part_number_id, field_name)
);

CREATE TABLE IF NOT EXISTS duplicate_check_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('part_root', 'part_number', 'drawing_number', 'mixed')),
  query_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS warning_events (
  id TEXT PRIMARY KEY,
  warning_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'blocker')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (acknowledged_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS numbering_task_items (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'info' CHECK (risk_level IN ('info', 'warning', 'critical')),
  task_status TEXT NOT NULL DEFAULT 'open' CHECK (task_status IN ('open', 'handled', 'cancelled')),
  assigned_to TEXT,
  assigned_role TEXT,
  project_code TEXT,
  action_url TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled_by TEXT,
  handled_at TEXT,
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (handled_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS numbering_notifications (
  id TEXT PRIMARY KEY,
  notification_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  recipient_id TEXT,
  recipient_role TEXT,
  read_at TEXT,
  handled_at TEXT,
  handled_by TEXT,
  dismissible INTEGER NOT NULL DEFAULT 1 CHECK (dismissible IN (0, 1)),
  action_url TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recipient_id) REFERENCES users(id),
  FOREIGN KEY (handled_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rule_templates (
  id TEXT PRIMARY KEY,
  template_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  template_json TEXT NOT NULL DEFAULT '{}',
  system_defined INTEGER NOT NULL DEFAULT 1 CHECK (system_defined IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO rule_templates (id, template_code, title, description)
VALUES
  ('rule-template-rd-efficiency', 'rd_efficiency', '研發效率優先', '草稿幾乎不審核，DVT/發行才審核'),
  ('rule-template-standard-control', 'standard_control', '標準管制', '依圖料號自動化第一版 spec 預設規則'),
  ('rule-template-strict-control', 'strict_control', '嚴格管制', 'DVT 後多數異動都需審核');

CREATE TABLE IF NOT EXISTS approval_rules (
  id TEXT PRIMARY KEY,
  rule_version_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  action_code TEXT NOT NULL,
  phase TEXT,
  record_status TEXT,
  item_kind TEXT,
  risk_flag TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_approval IN (0, 1)),
  approver_role TEXT,
  blocks_usage INTEGER NOT NULL DEFAULT 0 CHECK (blocks_usage IN (0, 1)),
  blocks_release INTEGER NOT NULL DEFAULT 0 CHECK (blocks_release IN (0, 1)),
  shows_warning INTEGER NOT NULL DEFAULT 1 CHECK (shows_warning IN (0, 1)),
  export_marker INTEGER NOT NULL DEFAULT 1 CHECK (export_marker IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT OR IGNORE INTO approval_rules (
  id, rule_version_id, rule_name, action_code, phase, record_status, item_kind, risk_flag,
  requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker
)
VALUES
  ('approval-rule-update-name-dvt', 'numbering-rule-v1', 'DVT item name update', 'update_name', 'DVT', NULL, NULL, NULL, 1, 'pdm_admin', 1, 0, 1, 1),
  ('approval-rule-update-name-release', 'numbering-rule-v1', 'Release item name update', 'update_name', 'Release', NULL, NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-update-name-released', 'numbering-rule-v1', 'Released item name update', 'update_name', NULL, 'Released', NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-update-spec-released', 'numbering-rule-v1', 'Released specification update', 'update_spec', NULL, 'Released', NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-obsolete-part-dvt', 'numbering-rule-v1', 'DVT part obsolescence', 'obsolete_part_number', 'DVT', NULL, NULL, NULL, 1, 'pdm_admin', 1, 0, 1, 1),
  ('approval-rule-obsolete-part-release', 'numbering-rule-v1', 'Release part obsolescence', 'obsolete_part_number', 'Release', NULL, NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-obsolete-ma-drawing-dvt', 'numbering-rule-v1', 'DVT MA drawing obsolescence manager', 'obsolete_ma_drawing', 'DVT', NULL, NULL, NULL, 1, 'rd_manager', 1, 0, 1, 1),
  ('approval-rule-obsolete-ma-drawing-admin', 'numbering-rule-v1', 'MA drawing obsolescence admin', 'obsolete_ma_drawing', NULL, NULL, NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-merge-part-referenced', 'numbering-rule-v1', 'Referenced part merge', 'merge_part_number', NULL, NULL, NULL, 'has_reference', 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-dvt-missing-ma-override', 'numbering-rule-v1', 'DVT missing MA override', 'dvt_missing_ma_override', 'DVT', NULL, 'manufactured', 'missing_primary_ma', 1, 'pdm_admin', 1, 0, 1, 1),
  ('approval-rule-dvt-promotion', 'numbering-rule-v1', 'DVT promotion approval', 'dvt_promotion', 'DVT', 'PendingReview', NULL, NULL, 1, 'rd_manager', 1, 0, 1, 1),
  ('approval-rule-release-missing-ma-confirm', 'numbering-rule-v1', 'Release missing MA confirmation', 'release_missing_ma_confirm', 'Release', NULL, NULL, 'missing_primary_ma', 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-release', 'numbering-rule-v1', 'Release approval', 'release', 'Release', NULL, NULL, NULL, 1, 'rd_manager', 0, 1, 1, 1),
  ('approval-rule-post-release-change-manager', 'numbering-rule-v1', 'Post-release change manager', 'post_release_change', NULL, 'Released', NULL, NULL, 1, 'rd_manager', 1, 1, 1, 1),
  ('approval-rule-post-release-change-admin', 'numbering-rule-v1', 'Post-release change admin', 'post_release_change', NULL, 'Released', NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
  ('approval-rule-released-same-drawing-variant', 'numbering-rule-v1', 'Released same drawing variant', 'same_drawing_variant_after_release', NULL, 'Released', NULL, NULL, 1, 'rd_manager', 1, 1, 1, 1),
  ('approval-rule-main-drawing-restore', 'numbering-rule-v1', 'Main drawing invalid restore', 'main_drawing_restore', NULL, 'MainDrawingInvalid', NULL, NULL, 1, 'pdm_admin', 1, 0, 1, 1);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL DEFAULT 'numbering' CHECK (request_type IN ('numbering')),
  action_code TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('part_root', 'part_number', 'drawing_number', 'same_drawing_variant')),
  entity_id TEXT NOT NULL,
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'approved', 'rejected', 'needs_info', 'cancelled')),
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS approval_decisions (
  id TEXT PRIMARY KEY,
  approval_request_id TEXT NOT NULL,
  approver_role TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'needs_info')),
  comment TEXT,
  decided_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS approval_batches (
  id TEXT PRIMARY KEY,
  batch_code TEXT NOT NULL UNIQUE,
  request_type TEXT NOT NULL DEFAULT 'numbering' CHECK (request_type IN ('numbering')),
  project_code TEXT,
  action_code TEXT,
  batch_status TEXT NOT NULL DEFAULT 'pending' CHECK (batch_status IN ('pending', 'partially_approved', 'approved', 'rejected', 'needs_info', 'cancelled')),
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (submitted_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS approval_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL,
  item_status TEXT NOT NULL DEFAULT 'pending' CHECK (item_status IN ('pending', 'approved', 'rejected', 'needs_info', 'cancelled', 'resubmitted')),
  resubmitted_from_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (batch_id) REFERENCES approval_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (resubmitted_from_item_id) REFERENCES approval_batch_items(id),
  UNIQUE (batch_id, approval_request_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  role_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  system_defined INTEGER NOT NULL DEFAULT 0 CHECK (system_defined IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO roles (id, role_code, title, system_defined)
VALUES
  ('role-rd', 'rd', 'RD', 1),
  ('role-rd-manager', 'rd_manager', 'RD 主管', 1),
  ('role-pdm-admin', 'pdm_admin', 'PDM 管理員', 1),
  ('role-document-admin', 'document_admin', '文件管理員', 1),
  ('role-qa', 'qa', 'QA / 品保', 1),
  ('role-system-admin', 'system_admin', '系統管理員', 1);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  permission_kind TEXT NOT NULL CHECK (permission_kind IN ('page', 'action')),
  permission_code TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1 CHECK (allowed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE (role_id, permission_kind, permission_code)
);

WITH default_role_permissions(role_code, permission_kind, permission_code, allowed) AS (
  VALUES
    ('system_admin', 'page', 'numbering.request', 1),
    ('system_admin', 'page', 'numbering.search', 1),
    ('system_admin', 'page', 'numbering.dvt', 1),
    ('system_admin', 'page', 'numbering.approvals', 1),
    ('system_admin', 'page', 'numbering.impact', 1),
    ('system_admin', 'page', 'numbering.tasks', 1),
    ('system_admin', 'page', 'numbering.imports', 1),
    ('system_admin', 'page', 'numbering.reports', 1),
    ('system_admin', 'page', 'settings.admin_matrix', 1),
    ('system_admin', 'action', 'numbering.create', 1),
    ('system_admin', 'action', 'numbering.duplicate_check', 1),
    ('system_admin', 'action', 'numbering.link_variant', 1),
    ('system_admin', 'action', 'numbering.dvt.submit', 1),
    ('system_admin', 'action', 'numbering.approval.request', 1),
    ('system_admin', 'action', 'numbering.approval.batch.create', 1),
    ('system_admin', 'action', 'numbering.approval.batch.decide', 1),
    ('system_admin', 'action', 'numbering.approval.batch.resubmit', 1),
    ('system_admin', 'action', 'numbering.impact.analyze', 1),
    ('system_admin', 'action', 'numbering.impact.apply', 1),
    ('system_admin', 'action', 'numbering.import.stage', 1),
    ('system_admin', 'action', 'numbering.import.confirm', 1),
    ('system_admin', 'action', 'numbering.export.create', 1),
    ('system_admin', 'action', 'numbering.audit_report.generate', 1),
    ('system_admin', 'action', 'numbering.task.update', 1),
    ('system_admin', 'action', 'numbering.notification.update', 1),
    ('system_admin', 'action', 'settings.admin_matrix', 1),
    ('system_admin', 'action', 'numbering.draft.update', 1),
    ('system_admin', 'action', 'numbering.draft.obsolete', 1),
    ('system_admin', 'action', 'numbering.draft.admin_confirm', 1),
    ('system_admin', 'action', 'update_name', 1),
    ('system_admin', 'action', 'update_spec', 1),
    ('system_admin', 'action', 'obsolete_part_number', 1),
    ('system_admin', 'action', 'obsolete_ma_drawing', 1),
    ('system_admin', 'action', 'merge_part_number', 1),
    ('system_admin', 'action', 'dvt_missing_ma_override', 1),
    ('system_admin', 'action', 'dvt_promotion', 1),
    ('system_admin', 'action', 'release_missing_ma_confirm', 1),
    ('system_admin', 'action', 'release', 1),
    ('system_admin', 'action', 'post_release_change', 1),
    ('system_admin', 'action', 'same_drawing_variant_after_release', 1),
    ('system_admin', 'action', 'main_drawing_restore', 1),
    ('pdm_admin', 'page', 'numbering.request', 1),
    ('pdm_admin', 'page', 'numbering.search', 1),
    ('pdm_admin', 'page', 'numbering.dvt', 1),
    ('pdm_admin', 'page', 'numbering.approvals', 1),
    ('pdm_admin', 'page', 'numbering.impact', 1),
    ('pdm_admin', 'page', 'numbering.tasks', 1),
    ('pdm_admin', 'page', 'numbering.imports', 1),
    ('pdm_admin', 'page', 'numbering.reports', 1),
    ('pdm_admin', 'page', 'settings.admin_matrix', 1),
    ('pdm_admin', 'action', 'numbering.create', 1),
    ('pdm_admin', 'action', 'numbering.duplicate_check', 1),
    ('pdm_admin', 'action', 'numbering.link_variant', 1),
    ('pdm_admin', 'action', 'numbering.dvt.submit', 1),
    ('pdm_admin', 'action', 'numbering.approval.request', 1),
    ('pdm_admin', 'action', 'numbering.approval.batch.create', 1),
    ('pdm_admin', 'action', 'numbering.approval.batch.decide', 1),
    ('pdm_admin', 'action', 'numbering.approval.batch.resubmit', 1),
    ('pdm_admin', 'action', 'numbering.impact.analyze', 1),
    ('pdm_admin', 'action', 'numbering.impact.apply', 1),
    ('pdm_admin', 'action', 'numbering.import.stage', 1),
    ('pdm_admin', 'action', 'numbering.import.confirm', 1),
    ('pdm_admin', 'action', 'numbering.export.create', 1),
    ('pdm_admin', 'action', 'numbering.audit_report.generate', 1),
    ('pdm_admin', 'action', 'numbering.task.update', 1),
    ('pdm_admin', 'action', 'numbering.notification.update', 1),
    ('pdm_admin', 'action', 'settings.admin_matrix', 1),
    ('pdm_admin', 'action', 'numbering.draft.update', 1),
    ('pdm_admin', 'action', 'numbering.draft.obsolete', 1),
    ('pdm_admin', 'action', 'numbering.draft.admin_confirm', 1),
    ('pdm_admin', 'action', 'update_name', 1),
    ('pdm_admin', 'action', 'update_spec', 1),
    ('pdm_admin', 'action', 'obsolete_part_number', 1),
    ('pdm_admin', 'action', 'obsolete_ma_drawing', 1),
    ('pdm_admin', 'action', 'merge_part_number', 1),
    ('pdm_admin', 'action', 'dvt_missing_ma_override', 1),
    ('pdm_admin', 'action', 'dvt_promotion', 1),
    ('pdm_admin', 'action', 'release_missing_ma_confirm', 1),
    ('pdm_admin', 'action', 'release', 1),
    ('pdm_admin', 'action', 'post_release_change', 1),
    ('pdm_admin', 'action', 'same_drawing_variant_after_release', 1),
    ('pdm_admin', 'action', 'main_drawing_restore', 1),
    ('rd_manager', 'page', 'numbering.request', 1),
    ('rd_manager', 'page', 'numbering.search', 1),
    ('rd_manager', 'page', 'numbering.dvt', 1),
    ('rd_manager', 'page', 'numbering.approvals', 1),
    ('rd_manager', 'page', 'numbering.impact', 1),
    ('rd_manager', 'page', 'numbering.tasks', 1),
    ('rd_manager', 'page', 'numbering.reports', 1),
    ('rd_manager', 'action', 'numbering.create', 1),
    ('rd_manager', 'action', 'numbering.duplicate_check', 1),
    ('rd_manager', 'action', 'numbering.link_variant', 1),
    ('rd_manager', 'action', 'numbering.dvt.submit', 1),
    ('rd_manager', 'action', 'numbering.approval.request', 1),
    ('rd_manager', 'action', 'numbering.approval.batch.create', 1),
    ('rd_manager', 'action', 'numbering.approval.batch.decide', 1),
    ('rd_manager', 'action', 'numbering.approval.batch.resubmit', 1),
    ('rd_manager', 'action', 'numbering.impact.analyze', 1),
    ('rd_manager', 'action', 'numbering.impact.apply', 1),
    ('rd_manager', 'action', 'numbering.export.create', 1),
    ('rd_manager', 'action', 'numbering.task.update', 1),
    ('rd_manager', 'action', 'numbering.notification.update', 1),
    ('rd_manager', 'action', 'numbering.draft.update', 1),
    ('rd_manager', 'action', 'numbering.draft.obsolete', 1),
    ('rd_manager', 'action', 'dvt_promotion', 1),
    ('rd_manager', 'action', 'release', 1),
    ('rd_manager', 'action', 'obsolete_ma_drawing', 1),
    ('rd_manager', 'action', 'post_release_change', 1),
    ('rd', 'page', 'numbering.request', 1),
    ('rd', 'page', 'numbering.search', 1),
    ('rd', 'page', 'numbering.dvt', 1),
    ('rd', 'page', 'numbering.impact', 1),
    ('rd', 'page', 'numbering.tasks', 1),
    ('rd', 'page', 'numbering.imports', 1),
    ('rd', 'action', 'numbering.create', 1),
    ('rd', 'action', 'numbering.duplicate_check', 1),
    ('rd', 'action', 'numbering.link_variant', 1),
    ('rd', 'action', 'numbering.draft.update', 1),
    ('rd', 'action', 'numbering.draft.obsolete', 1),
    ('rd', 'action', 'numbering.dvt.submit', 1),
    ('rd', 'action', 'numbering.approval.request', 1),
    ('rd', 'action', 'numbering.approval.batch.create', 1),
    ('rd', 'action', 'numbering.approval.batch.resubmit', 1),
    ('rd', 'action', 'numbering.impact.analyze', 1),
    ('rd', 'action', 'numbering.import.stage', 1),
    ('rd', 'action', 'numbering.task.update', 1),
    ('rd', 'action', 'numbering.notification.update', 1),
    ('document_admin', 'page', 'numbering.search', 1),
    ('document_admin', 'page', 'numbering.tasks', 1),
    ('document_admin', 'page', 'numbering.reports', 1),
    ('document_admin', 'action', 'numbering.task.update', 1),
    ('document_admin', 'action', 'numbering.notification.update', 1),
    ('qa', 'page', 'numbering.search', 1),
    ('qa', 'page', 'numbering.tasks', 1),
    ('qa', 'page', 'numbering.reports', 1),
    ('qa', 'action', 'numbering.task.update', 1),
    ('qa', 'action', 'numbering.notification.update', 1)
)
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_kind, permission_code, allowed)
SELECT
  'default-perm-' || d.role_code || '-' || d.permission_kind || '-' || replace(replace(d.permission_code, '.', '-'), '_', '-'),
  r.id,
  d.permission_kind,
  d.permission_code,
  d.allowed
FROM default_role_permissions d
JOIN roles r ON r.role_code = d.role_code;

CREATE TABLE IF NOT EXISTS role_priority_versions (
  id TEXT PRIMARY KEY,
  version_code TEXT NOT NULL UNIQUE,
  priority_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS role_scope_rules (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('department', 'project', 'action')),
  scope_code TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1 CHECK (allowed IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE (role_id, scope_kind, scope_code)
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  FOREIGN KEY (revoked_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS approval_delegations (
  id TEXT PRIMARY KEY,
  delegated_from TEXT NOT NULL,
  delegated_to TEXT NOT NULL,
  project_code TEXT,
  action_code TEXT,
  starts_at TEXT,
  ends_at TEXT,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by TEXT,
  FOREIGN KEY (delegated_from) REFERENCES users(id),
  FOREIGN KEY (delegated_to) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (revoked_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  source_filename TEXT NOT NULL,
  source_hash TEXT,
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'confirmed', 'rejected')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  imported_by TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (imported_by) REFERENCES users(id),
  FOREIGN KEY (confirmed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS import_staging_rows (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL,
  row_no INTEGER NOT NULL CHECK (row_no > 0),
  raw_json TEXT NOT NULL,
  check_status TEXT NOT NULL DEFAULT 'pending' CHECK (check_status IN ('pending', 'valid', 'need_info', 'admin_confirm', 'conflict', 'legacy_keep')),
  issue_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  UNIQUE (import_batch_id, row_no)
);

CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY,
  storage_provider TEXT NOT NULL DEFAULT 'j_drive' CHECK (storage_provider IN ('j_drive', 'supabase_storage', 'external')),
  original_path TEXT,
  storage_key TEXT,
  file_name TEXT NOT NULL,
  file_ext TEXT NOT NULL DEFAULT '',
  file_size INTEGER,
  content_hash TEXT,
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  linked_entity_type TEXT NOT NULL,
  linked_entity_id TEXT NOT NULL,
  revision TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_only' CHECK (sync_status IN ('local_only', 'migrated', 'missing', 'hash_mismatch')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS numbering_export_jobs (
  id TEXT PRIMARY KEY,
  export_mode TEXT NOT NULL CHECK (export_mode IN ('no_audit', 'last_change_summary', 'full_change_summary')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  result_json TEXT NOT NULL DEFAULT '{}',
  generated_by TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (generated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS monthly_audit_reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  report_month TEXT NOT NULL,
  generation_mode TEXT NOT NULL CHECK (generation_mode IN ('auto', 'manual')),
  generated_by TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  query_json TEXT NOT NULL DEFAULT '{}',
  scope_json TEXT NOT NULL DEFAULT '{}',
  rule_version_id TEXT,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_downloaded_by TEXT,
  last_downloaded_at TEXT,
  regenerate_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (generated_by) REFERENCES users(id),
  FOREIGN KEY (last_downloaded_by) REFERENCES users(id),
  FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id)
);

CREATE TABLE IF NOT EXISTS llm_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS llm_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES llm_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_status_created_at ON submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_created_at ON submissions(submitted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_status_created_at ON submissions(submitted_by, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_item_created_at ON submissions(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_drawing_number ON submissions(drawing_number);
CREATE INDEX IF NOT EXISTS idx_submissions_finder_fields ON submissions(product_line, customer, project_code, process_name, machine, material, surface_finish, status);
CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id ON submission_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_files_original_filename ON submission_files(original_filename);
CREATE INDEX IF NOT EXISTS idx_file_references_submission_id ON file_references(submission_id);
CREATE INDEX IF NOT EXISTS idx_file_references_referenced_part_number ON file_references(referenced_part_number);
CREATE INDEX IF NOT EXISTS idx_file_references_referenced_drawing_number ON file_references(referenced_drawing_number);
CREATE INDEX IF NOT EXISTS idx_bom_headers_parent_item_id ON bom_headers(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_parent_submission_id ON bom_headers(parent_submission_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_header_id ON bom_lines(bom_header_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_child_part_number ON bom_lines(child_part_number);
CREATE INDEX IF NOT EXISTS idx_bom_lines_child_part_revision ON bom_lines(child_part_number, child_revision);
CREATE INDEX IF NOT EXISTS idx_bom_drafts_parent_submission_id ON bom_drafts(parent_submission_id, status, is_active);
CREATE INDEX IF NOT EXISTS idx_bom_drafts_parent_item_revision ON bom_drafts(parent_item_id, parent_revision, status);
CREATE INDEX IF NOT EXISTS idx_bom_lines_tree_draft_parent ON bom_lines_tree(bom_draft_id, parent_line_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_bom_lines_tree_part_revision ON bom_lines_tree(part_number, revision);
CREATE INDEX IF NOT EXISTS idx_bom_import_jobs_parent_submission_id ON bom_import_jobs(parent_submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bom_edit_events_draft_id ON bom_edit_events(bom_draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bom_review_requests_draft_status ON bom_review_requests(bom_draft_id, status);
CREATE INDEX IF NOT EXISTS idx_bom_release_snapshots_parent_item_revision ON bom_release_snapshots(parent_item_id, parent_revision, released_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_locks_item_id ON item_locks(item_id, released_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_release_packages_submission_id ON release_packages(submission_id);
CREATE INDEX IF NOT EXISTS idx_readonly_shares_submission_id ON readonly_shares(submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_readonly_shares_token_hash ON readonly_shares(token_hash);
CREATE INDEX IF NOT EXISTS idx_supplier_portal_responses_submission_id ON supplier_portal_responses(submission_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_portal_responses_share_id ON supplier_portal_responses(share_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_sync_runs_submission_id ON procurement_sync_runs(submission_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_sync_runs_target_status ON procurement_sync_runs(target_system, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_branches_source_submission_id ON sandbox_branches(source_submission_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_branches_sandbox_submission_id ON sandbox_branches(sandbox_submission_id);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_submission_id ON discussion_comments(submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_file_id ON discussion_comments(file_id);
CREATE INDEX IF NOT EXISTS idx_review_issues_submission_id ON review_issues(submission_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_issues_file_id ON review_issues(file_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_submission_id ON change_requests(submission_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase_gate_checks_submission_id ON phase_gate_checks(submission_id, status, gate_code);
CREATE INDEX IF NOT EXISTS idx_approval_matrix_submission_id ON approval_matrix_requirements(submission_id, status, required_role);
CREATE INDEX IF NOT EXISTS idx_pdf_markups_submission_id ON pdf_markups(submission_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_markups_file_id ON pdf_markups(file_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_submission_id ON audit_logs(submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_roots_status_phase ON part_roots(record_status, development_phase);
CREATE INDEX IF NOT EXISTS idx_part_numbers_root_id ON part_numbers(part_root_id);
CREATE INDEX IF NOT EXISTS idx_part_numbers_status_phase ON part_numbers(record_status, development_phase);
CREATE INDEX IF NOT EXISTS idx_drawing_numbers_root_id ON drawing_numbers(part_root_id);
CREATE INDEX IF NOT EXISTS idx_drawing_numbers_status_phase ON drawing_numbers(record_status, development_phase);
CREATE INDEX IF NOT EXISTS idx_drawing_part_links_drawing_id ON drawing_part_links(drawing_number_id);
CREATE INDEX IF NOT EXISTS idx_same_drawing_variants_part_id ON same_drawing_variants(part_number_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_check_events_created_at ON duplicate_check_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warning_events_entity ON warning_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warning_events_code ON warning_events(warning_code, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_numbering_task_items_scope ON numbering_task_items(task_status, assigned_role, assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_numbering_notifications_scope ON numbering_notifications(recipient_role, recipient_id, read_at, handled_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_rules_version_action ON approval_rules(rule_version_id, action_code);
CREATE INDEX IF NOT EXISTS idx_approval_requests_entity ON approval_requests(entity_type, entity_id, request_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_action ON approval_requests(action_code, request_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_request_id ON approval_decisions(approval_request_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_batches_status ON approval_batches(request_type, batch_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_batch_items_batch_status ON approval_batch_items(batch_id, item_status);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_scope_rules_role_kind ON role_scope_rules(role_id, scope_kind);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_active ON user_role_assignments(user_id, revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_role_assignments_active_unique
  ON user_role_assignments(user_id, role_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_approval_delegations_from_to ON approval_delegations(delegated_from, delegated_to, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_import_staging_rows_batch_status ON import_staging_rows(import_batch_id, check_status);
CREATE INDEX IF NOT EXISTS idx_file_assets_linked_entity ON file_assets(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_numbering_export_jobs_generated ON numbering_export_jobs(export_mode, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_audit_reports_month ON monthly_audit_reports(report_type, report_month);
