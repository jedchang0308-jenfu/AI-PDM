import crypto from "node:crypto";
import { createAuditLog, getDb, getSubmission, materializeBomDraftFromReferences } from "@/lib/db";
import type { FileReference, SandboxBranch, SubmissionFile } from "@/lib/types";

function sandboxBranchSelectSql() {
  return `
    SELECT
      b.*,
      created_user.display_name AS created_by_name,
      promoted_user.display_name AS promoted_by_name,
      closed_user.display_name AS closed_by_name,
      merged_user.display_name AS merged_by_name,
      source.drawing_number AS source_drawing_number,
      source.revision AS source_revision,
      sandbox.drawing_number AS sandbox_drawing_number,
      sandbox.revision AS sandbox_revision,
      sandbox.status AS sandbox_status
    FROM sandbox_branches b
    JOIN users created_user ON created_user.id = b.created_by
    LEFT JOIN users promoted_user ON promoted_user.id = b.promoted_by
    LEFT JOIN users closed_user ON closed_user.id = b.closed_by
    LEFT JOIN users merged_user ON merged_user.id = b.merged_by
    JOIN submissions source ON source.id = b.source_submission_id
    JOIN submissions sandbox ON sandbox.id = b.sandbox_submission_id
  `;
}

function normalizeFileForMerge(file: SubmissionFile) {
  return {
    file_role: file.file_role,
    original_filename: file.original_filename,
    sha256: file.sha256,
    file_size: file.file_size
  };
}

function normalizeReferenceForMerge(reference: FileReference) {
  return {
    source_filename: reference.source_filename,
    referenced_filename: reference.referenced_filename,
    referenced_part_number: reference.referenced_part_number,
    referenced_drawing_number: reference.referenced_drawing_number,
    referenced_revision: reference.referenced_revision,
    reference_type: reference.reference_type,
    quantity: reference.quantity
  };
}

function keyedDiff<T>(sourceItems: T[], sandboxItems: T[], keyOf: (item: T) => string, normalize: (item: T) => unknown) {
  const sourceByKey = new Map(sourceItems.map((item) => [keyOf(item), item]));
  const sandboxByKey = new Map(sandboxItems.map((item) => [keyOf(item), item]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const [key, sandboxItem] of sandboxByKey) {
    const sourceItem = sourceByKey.get(key);
    if (!sourceItem) {
      added.push(key);
      continue;
    }
    if (JSON.stringify(normalize(sourceItem)) === JSON.stringify(normalize(sandboxItem))) {
      unchanged += 1;
    } else {
      changed.push(key);
    }
  }

  for (const key of sourceByKey.keys()) {
    if (!sandboxByKey.has(key)) removed.push(key);
  }

  return { added, removed, changed, unchanged_count: unchanged };
}

export function getSandboxMergePreview(branchId: string) {
  const branch = getSandboxBranchById(branchId);
  if (!branch) return null;

  const source = getSubmission(branch.source_submission_id);
  const sandbox = getSubmission(branch.sandbox_submission_id);
  if (!source || !sandbox) return null;

  const fields = ["drawing_number", "revision", "material", "surface_finish", "document_type", "change_description", "approval_required"] as const;
  const field_changes = fields
    .map((field) => ({ field, source: String(source[field] ?? ""), sandbox: String(sandbox[field] ?? "") }))
    .filter((change) => change.source !== change.sandbox);

  const files = keyedDiff(
    source.files,
    sandbox.files,
    (file) => `${file.file_role}:${file.original_filename}`,
    normalizeFileForMerge
  );
  const references = keyedDiff(
    source.references,
    sandbox.references,
    (reference) =>
      [
        reference.source_filename,
        reference.referenced_filename,
        reference.referenced_part_number,
        reference.referenced_revision,
        reference.reference_type
      ].join("|"),
    normalizeReferenceForMerge
  );
  const change_count =
    field_changes.length +
    files.added.length +
    files.removed.length +
    files.changed.length +
    references.added.length +
    references.removed.length +
    references.changed.length;

  return {
    branch_id: branch.id,
    source_submission_id: branch.source_submission_id,
    sandbox_submission_id: branch.sandbox_submission_id,
    source_revision: source.revision,
    sandbox_revision: sandbox.revision,
    can_merge: branch.status === "active" && sandbox.status === "Pending",
    change_count,
    field_changes,
    files,
    references
  };
}

export function listSandboxBranchesForSubmission(submissionId: string): SandboxBranch[] {
  return getDb()
    .prepare(
      `
      ${sandboxBranchSelectSql()}
      WHERE b.source_submission_id = ? OR b.sandbox_submission_id = ?
      ORDER BY CASE b.status WHEN 'active' THEN 0 WHEN 'promoted' THEN 1 ELSE 2 END, b.created_at DESC
    `
    )
    .all(submissionId, submissionId) as SandboxBranch[];
}

export function getSandboxBranchById(branchId: string): SandboxBranch | null {
  const row = getDb()
    .prepare(`${sandboxBranchSelectSql()} WHERE b.id = ?`)
    .get(branchId) as SandboxBranch | undefined;
  return row ?? null;
}

export function getActiveSandboxBranchForSubmission(submissionId: string): SandboxBranch | null {
  const row = getDb()
    .prepare(`${sandboxBranchSelectSql()} WHERE b.sandbox_submission_id = ? AND b.status = 'active'`)
    .get(submissionId) as SandboxBranch | undefined;
  return row ?? null;
}

export function createSandboxBranch(input: {
  sourceSubmissionId: string;
  userId: string;
  branchName: string;
  reason: string;
}) {
  const database = getDb();
  const source = getSubmission(input.sourceSubmissionId);
  if (!source) return { ok: false as const, status: 404, error: "找不到送審資料" };
  if (source.status === "Releasing") return { ok: false as const, status: 409, error: "發布中的送審資料不可建立分支" };
  if (getActiveSandboxBranchForSubmission(source.id)) {
    return { ok: false as const, status: 409, error: "啟用中的試作送審不可再建立試作分支" };
  }

  const branchName = input.branchName.trim();
  const reason = input.reason.trim();
  if (branchName.length < 3 || branchName.length > 60) {
    return { ok: false as const, status: 400, error: "分支名稱需為 3 到 60 個字" };
  }
  if (reason.length < 3 || reason.length > 240) {
    return { ok: false as const, status: 400, error: "原因需為 3 到 240 個字" };
  }

  const duplicate = database
    .prepare("SELECT id FROM sandbox_branches WHERE source_submission_id = ? AND lower(branch_name) = lower(?)")
    .get(source.id, branchName) as { id: string } | undefined;
  if (duplicate) return { ok: false as const, status: 409, error: "此送審資料已有相同試作分支名稱" };

  const now = new Date().toISOString();
  const branchId = crypto.randomUUID();
  const sandboxSubmissionId = `SUB-${now.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const sandboxRevision = `${source.revision}-SBX-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const fileIdBySourceId = new Map<string, string>();

  const createBranchTransaction = database.transaction(() => {
    database
      .prepare(
        `
        INSERT INTO submissions (
          id, item_id, drawing_number, revision, product_line, customer, project_code, process_name,
          machine, material, surface_finish, document_type,
          change_description, status, submitted_by, approval_required, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        sandboxSubmissionId,
        source.item_id,
        source.drawing_number,
        sandboxRevision,
        source.product_line,
        source.customer,
        source.project_code,
        source.process_name,
        source.machine,
        source.material,
        source.surface_finish,
        source.document_type,
        `[Sandbox: ${branchName}] ${reason}`,
        "Pending",
        input.userId,
        source.approval_required,
        now,
        now
      );

    const insertFile = database.prepare(
      `
      INSERT INTO submission_files (
        id, submission_id, file_role, original_filename, local_path, storage_provider, storage_bucket, storage_key, gdrive_file_id,
        sha256, file_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    for (const file of source.files) {
      const fileId = crypto.randomUUID();
      fileIdBySourceId.set(file.id, fileId);
      insertFile.run(
        fileId,
        sandboxSubmissionId,
        file.file_role,
        file.original_filename,
        file.local_path,
        file.storage_provider ?? "local_repository",
        file.storage_bucket ?? null,
        file.storage_key ?? null,
        null,
        file.sha256,
        file.file_size,
        now
      );
    }

    const insertReference = database.prepare(
      `
      INSERT INTO file_references (
        id, submission_id, source_file_id, source_filename, source_file_role,
        referenced_filename, referenced_part_number, referenced_drawing_number,
        referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    for (const reference of source.references) {
      insertReference.run(
        crypto.randomUUID(),
        sandboxSubmissionId,
        reference.source_file_id ? fileIdBySourceId.get(reference.source_file_id) ?? null : null,
        reference.source_filename,
        reference.source_file_role,
        reference.referenced_filename,
        reference.referenced_part_number,
        reference.referenced_drawing_number,
        reference.referenced_revision,
        reference.reference_type,
        reference.quantity,
        reference.extraction_method,
        reference.confidence,
        now
      );
    }

    database
      .prepare(
        `
        INSERT INTO sandbox_branches (
          id, source_submission_id, sandbox_submission_id, branch_name, reason,
          status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `
      )
      .run(branchId, source.id, sandboxSubmissionId, branchName, reason, input.userId, now, now);

    if (source.references.some((reference) => reference.reference_type === "assembly_component")) {
      materializeBomDraftFromReferences(sandboxSubmissionId);
    }
  });

  createBranchTransaction();

  createAuditLog({
    submissionId: source.id,
    actorId: input.userId,
    action: "SandboxBranchCreated",
    detail: { branchId, sandboxSubmissionId, branchName, reason }
  });
  createAuditLog({
    submissionId: sandboxSubmissionId,
    actorId: input.userId,
    action: "SandboxSubmissionCreated",
    detail: { branchId, sourceSubmissionId: source.id, branchName }
  });

  const branch = getSandboxBranchById(branchId);
  return { ok: true as const, branch, submissionId: sandboxSubmissionId };
}

export function updateSandboxBranchStatus(input: {
  branchId: string;
  userId: string;
  status: "promoted" | "closed";
}) {
  const branch = getSandboxBranchById(input.branchId);
  if (!branch) return { ok: false as const, status: 404, error: "找不到試作分支" };
  if (branch.status !== "active") {
    return { ok: false as const, status: 409, error: `Only active sandbox branches can be ${input.status}` };
  }

  const now = new Date().toISOString();
  if (input.status === "promoted") {
    getDb()
      .prepare("UPDATE sandbox_branches SET status = 'promoted', promoted_by = ?, promoted_at = ?, updated_at = ? WHERE id = ?")
      .run(input.userId, now, now, input.branchId);
  } else {
    getDb()
      .prepare("UPDATE sandbox_branches SET status = 'closed', closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ?")
      .run(input.userId, now, now, input.branchId);
  }

  createAuditLog({
    submissionId: branch.sandbox_submission_id,
    actorId: input.userId,
    action: input.status === "promoted" ? "SandboxBranchPromoted" : "SandboxBranchClosed",
    detail: { branchId: input.branchId, sourceSubmissionId: branch.source_submission_id }
  });

  return { ok: true as const, branch: getSandboxBranchById(input.branchId) };
}

export function mergeSandboxBranch(input: { branchId: string; userId: string }) {
  const branch = getSandboxBranchById(input.branchId);
  if (!branch) return { ok: false as const, status: 404, error: "找不到試作分支" };
  if (branch.status !== "active") {
    return { ok: false as const, status: 409, error: "只有啟用中的試作分支可以合併" };
  }

  const sandbox = getSubmission(branch.sandbox_submission_id);
  if (!sandbox) return { ok: false as const, status: 404, error: "找不到試作送審資料" };
  if (sandbox.status !== "Pending") {
    return { ok: false as const, status: 409, error: `Only Pending sandbox submissions can be merged. Current status: ${sandbox.status}` };
  }

  const preview = getSandboxMergePreview(input.branchId);
  if (!preview) return { ok: false as const, status: 404, error: "找不到試作合併預覽" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE sandbox_branches
      SET status = 'promoted',
          promoted_by = ?,
          promoted_at = ?,
          merged_by = ?,
          merged_at = ?,
          merge_summary_json = ?,
          updated_at = ?
      WHERE id = ?
    `
    )
    .run(input.userId, now, input.userId, now, JSON.stringify(preview), now, input.branchId);

  createAuditLog({
    submissionId: branch.sandbox_submission_id,
    actorId: input.userId,
    action: "SandboxBranchMerged",
    detail: { branchId: input.branchId, sourceSubmissionId: branch.source_submission_id, changeCount: preview.change_count }
  });

  return { ok: true as const, branch: getSandboxBranchById(input.branchId), preview };
}
