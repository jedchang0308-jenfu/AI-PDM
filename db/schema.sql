PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('Engineer', 'R&D Manager', 'Admin')),
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
