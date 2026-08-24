import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import type { FileReference, SandboxBranch, SubmissionDetail, SubmissionFile } from "@/lib/types";

export type SandboxMergePreview = {
  branch_id: string;
  source_submission_id: string;
  sandbox_submission_id: string;
  source_revision: string;
  sandbox_revision: string;
  can_merge: boolean;
  change_count: number;
  field_changes: Array<{ field: string; source: string; sandbox: string }>;
  files: ReturnType<typeof keyedDiff<SubmissionFile>>;
  references: ReturnType<typeof keyedDiff<FileReference>>;
};

export type SandboxBranchResult =
  | { ok: true; branch: SandboxBranch | null; submissionId?: string; preview?: SandboxMergePreview }
  | { ok: false; status: number; error: string };

export const SELECT_ASYNC_SANDBOX_BRANCHES_FOR_SUBMISSION_SQL = `
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
  WHERE b.source_submission_id = :submissionId OR b.sandbox_submission_id = :submissionId
  ORDER BY CASE b.status WHEN 'active' THEN 0 WHEN 'promoted' THEN 1 ELSE 2 END, b.created_at DESC, b.id DESC
`;

export const SELECT_ASYNC_SANDBOX_BRANCH_BY_ID_SQL = `
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
  WHERE b.id = :branchId
`;

export const SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_BY_SOURCE_SQL = `
  SELECT id
  FROM sandbox_branches
  WHERE source_submission_id = :sourceSubmissionId
    AND status = 'active'
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_SANDBOX_BRANCH_DUPLICATE_NAME_SQL = `
  SELECT id
  FROM sandbox_branches
  WHERE source_submission_id = :sourceSubmissionId
    AND lower(branch_name) = lower(:branchName)
  LIMIT 1
`;

export const INSERT_ASYNC_SANDBOX_SUBMISSION_SQL = `
  INSERT INTO submissions (
    id, item_id, drawing_number, revision, product_line, customer, project_code, process_name,
    machine, material, surface_finish, document_type,
    change_description, status, submitted_by, approval_required, created_at, updated_at
  ) VALUES (
    :id, :itemId, :drawingNumber, :revision, :productLine, :customer, :projectCode, :processName,
    :machine, :material, :surfaceFinish, :documentType,
    :changeDescription, 'Pending', :submittedBy, :approvalRequired, :now, :now
  )
`;

export const INSERT_ASYNC_SANDBOX_FILE_SQL = `
  INSERT INTO submission_files (
    id, submission_id, file_role, original_filename, local_path, storage_provider, storage_bucket, storage_key, gdrive_file_id,
    sha256, file_size, created_at
  ) VALUES (
    :id, :submissionId, :fileRole, :originalFilename, :localPath, :storageProvider, :storageBucket, :storageKey, NULL,
    :sha256, :fileSize, :createdAt
  )
`;

export const INSERT_ASYNC_SANDBOX_FILE_REFERENCE_SQL = `
  INSERT INTO file_references (
    id, submission_id, source_file_id, source_filename, source_file_role,
    referenced_filename, referenced_part_number, referenced_drawing_number,
    referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
  ) VALUES (
    :id, :submissionId, :sourceFileId, :sourceFilename, :sourceFileRole,
    :referencedFilename, :referencedPartNumber, :referencedDrawingNumber,
    :referencedRevision, :referenceType, :quantity, :extractionMethod, :confidence, :createdAt
  )
`;

export const INSERT_ASYNC_SANDBOX_BRANCH_SQL = `
  INSERT INTO sandbox_branches (
    id, source_submission_id, sandbox_submission_id, branch_name, reason,
    status, created_by, created_at, updated_at
  ) VALUES (
    :id, :sourceSubmissionId, :sandboxSubmissionId, :branchName, :reason,
    'active', :createdBy, :createdAt, :updatedAt
  )
`;

export const PROMOTE_ASYNC_SANDBOX_BRANCH_SQL = `
  UPDATE sandbox_branches
  SET status = 'promoted',
      promoted_by = :userId,
      promoted_at = :now,
      updated_at = :now
  WHERE id = :branchId
`;

export const CLOSE_ASYNC_SANDBOX_BRANCH_SQL = `
  UPDATE sandbox_branches
  SET status = 'closed',
      closed_by = :userId,
      closed_at = :now,
      updated_at = :now
  WHERE id = :branchId
`;

export const MERGE_ASYNC_SANDBOX_BRANCH_SQL = `
  UPDATE sandbox_branches
  SET status = 'promoted',
      promoted_by = :userId,
      promoted_at = :now,
      merged_by = :userId,
      merged_at = :now,
      merge_summary_json = :mergeSummaryJson,
      updated_at = :now
  WHERE id = :branchId
`;

export class AsyncSandboxRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async listSandboxBranchesForSubmission(submissionId: string): Promise<SandboxBranch[]> {
    return this.client.query<SandboxBranch>(SELECT_ASYNC_SANDBOX_BRANCHES_FOR_SUBMISSION_SQL, { submissionId });
  }

  async getSandboxBranchById(branchId: string): Promise<SandboxBranch | null> {
    return this.client.queryOne<SandboxBranch>(SELECT_ASYNC_SANDBOX_BRANCH_BY_ID_SQL, { branchId });
  }

  async getSandboxMergePreview(branchId: string): Promise<SandboxMergePreview | null> {
    const branch = await this.getSandboxBranchById(branchId);
    if (!branch) return null;

    const source = await this.getSubmission(branch.source_submission_id);
    const sandbox = await this.getSubmission(branch.sandbox_submission_id);
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

  async createSandboxBranch(input: {
    sourceSubmissionId: string;
    userId: string;
    branchName: string;
    reason: string;
  }): Promise<SandboxBranchResult> {
    const source = await this.getSubmission(input.sourceSubmissionId);
    if (!source) return { ok: false, status: 404, error: "Submission not found" };
    if (source.status === "Releasing") return { ok: false, status: 409, error: "Releasing submissions cannot create sandbox branches" };

    const activeBranch = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_BY_SOURCE_SQL, {
      sourceSubmissionId: source.id
    });
    if (activeBranch) return { ok: false, status: 409, error: "An active sandbox branch already exists for this submission" };

    const branchName = input.branchName.trim();
    const reason = input.reason.trim();
    if (branchName.length < 3 || branchName.length > 60) {
      return { ok: false, status: 400, error: "Branch name must be between 3 and 60 characters" };
    }
    if (reason.length < 3 || reason.length > 240) {
      return { ok: false, status: 400, error: "Reason must be between 3 and 240 characters" };
    }

    const duplicate = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_SANDBOX_BRANCH_DUPLICATE_NAME_SQL, {
      sourceSubmissionId: source.id,
      branchName
    });
    if (duplicate) return { ok: false, status: 409, error: "A sandbox branch with the same name already exists" };

    const now = this.clock();
    const branchId = this.idFactory();
    const sandboxSubmissionId = `SUB-${now.slice(0, 10).replaceAll("-", "")}-${this.idFactory().slice(0, 8).toUpperCase()}`;
    const sandboxRevision = `${source.revision}-SBX-${this.idFactory().slice(0, 4).toUpperCase()}`;

    const createBranch = async (client: AsyncDatabaseClient) => {
      await this.insertSandboxSubmission(client, { source, sandboxSubmissionId, sandboxRevision, branchName, reason, userId: input.userId, now });
      const fileIdBySourceId = await this.copyFiles(client, source.files, sandboxSubmissionId, now);
      await this.copyReferences(client, source.references, sandboxSubmissionId, fileIdBySourceId, now);
      await client.execute(INSERT_ASYNC_SANDBOX_BRANCH_SQL, {
        id: branchId,
        sourceSubmissionId: source.id,
        sandboxSubmissionId,
        branchName,
        reason,
        createdBy: input.userId,
        createdAt: now,
        updatedAt: now
      });

    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(createBranch);
    } else {
      await createBranch(this.client);
    }

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: source.id,
      actorId: input.userId,
      action: "SandboxBranchCreated",
      detail: { branchId, sandboxSubmissionId, branchName, reason }
    });
    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: sandboxSubmissionId,
      actorId: input.userId,
      action: "SandboxSubmissionCreated",
      detail: { branchId, sourceSubmissionId: source.id, branchName }
    });

    return { ok: true, branch: await this.getSandboxBranchById(branchId), submissionId: sandboxSubmissionId };
  }

  async updateSandboxBranchStatus(input: {
    branchId: string;
    userId: string;
    status: "promoted" | "closed";
  }): Promise<SandboxBranchResult> {
    const branch = await this.getSandboxBranchById(input.branchId);
    if (!branch) return { ok: false, status: 404, error: "Sandbox branch not found" };
    if (branch.status !== "active") {
      return { ok: false, status: 409, error: `Only active sandbox branches can be ${input.status}` };
    }

    const now = this.clock();
    await this.client.execute(input.status === "promoted" ? PROMOTE_ASYNC_SANDBOX_BRANCH_SQL : CLOSE_ASYNC_SANDBOX_BRANCH_SQL, {
      branchId: input.branchId,
      userId: input.userId,
      now
    });
    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: branch.sandbox_submission_id,
      actorId: input.userId,
      action: input.status === "promoted" ? "SandboxBranchPromoted" : "SandboxBranchClosed",
      detail: { branchId: input.branchId, sourceSubmissionId: branch.source_submission_id }
    });

    return { ok: true, branch: await this.getSandboxBranchById(input.branchId) };
  }

  async mergeSandboxBranch(input: { branchId: string; userId: string }): Promise<SandboxBranchResult> {
    const branch = await this.getSandboxBranchById(input.branchId);
    if (!branch) return { ok: false, status: 404, error: "Sandbox branch not found" };
    if (branch.status !== "active") {
      return { ok: false, status: 409, error: "Only active sandbox branches can be merged" };
    }

    const sandbox = await this.getSubmission(branch.sandbox_submission_id);
    if (!sandbox) return { ok: false, status: 404, error: "Sandbox submission not found" };
    if (sandbox.status !== "Pending") {
      return { ok: false, status: 409, error: `Only Pending sandbox submissions can be merged. Current status: ${sandbox.status}` };
    }

    const preview = await this.getSandboxMergePreview(input.branchId);
    if (!preview) return { ok: false, status: 404, error: "Sandbox merge preview not found" };

    const now = this.clock();
    await this.client.execute(MERGE_ASYNC_SANDBOX_BRANCH_SQL, {
      branchId: input.branchId,
      userId: input.userId,
      now,
      mergeSummaryJson: JSON.stringify(preview)
    });
    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: branch.sandbox_submission_id,
      actorId: input.userId,
      action: "SandboxBranchMerged",
      detail: { branchId: input.branchId, sourceSubmissionId: branch.source_submission_id, changeCount: preview.change_count }
    });

    return { ok: true, branch: await this.getSandboxBranchById(input.branchId), preview };
  }

  private async getSubmission(submissionId: string): Promise<SubmissionDetail | null> {
    return new AsyncSubmissionListRepository(this.client).getSubmission(submissionId);
  }

  private async insertSandboxSubmission(
    client: AsyncDatabaseClient,
    input: {
      source: SubmissionDetail;
      sandboxSubmissionId: string;
      sandboxRevision: string;
      branchName: string;
      reason: string;
      userId: string;
      now: string;
    }
  ) {
    await client.execute(INSERT_ASYNC_SANDBOX_SUBMISSION_SQL, {
      id: input.sandboxSubmissionId,
      itemId: input.source.item_id,
      drawingNumber: input.source.drawing_number,
      revision: input.sandboxRevision,
      productLine: input.source.product_line,
      customer: input.source.customer,
      projectCode: input.source.project_code,
      processName: input.source.process_name,
      machine: input.source.machine,
      material: input.source.material,
      surfaceFinish: input.source.surface_finish,
      documentType: input.source.document_type,
      changeDescription: `[Sandbox: ${input.branchName}] ${input.reason}`,
      submittedBy: input.userId,
      approvalRequired: input.source.approval_required,
      now: input.now
    });
  }

  private async copyFiles(client: AsyncDatabaseClient, files: SubmissionFile[], sandboxSubmissionId: string, now: string) {
    const fileIdBySourceId = new Map<string, string>();
    for (const file of files) {
      const fileId = this.idFactory();
      fileIdBySourceId.set(file.id, fileId);
      await client.execute(INSERT_ASYNC_SANDBOX_FILE_SQL, {
        id: fileId,
        submissionId: sandboxSubmissionId,
        fileRole: file.file_role,
        originalFilename: file.original_filename,
        localPath: file.local_path,
        storageProvider: file.storage_provider ?? "local_repository",
        storageBucket: file.storage_bucket ?? null,
        storageKey: file.storage_key ?? null,
        sha256: file.sha256,
        fileSize: file.file_size,
        createdAt: now
      });
    }
    return fileIdBySourceId;
  }

  private async copyReferences(
    client: AsyncDatabaseClient,
    references: FileReference[],
    sandboxSubmissionId: string,
    fileIdBySourceId: Map<string, string>,
    now: string
  ) {
    for (const reference of references) {
      await client.execute(INSERT_ASYNC_SANDBOX_FILE_REFERENCE_SQL, {
        id: this.idFactory(),
        submissionId: sandboxSubmissionId,
        sourceFileId: reference.source_file_id ? fileIdBySourceId.get(reference.source_file_id) ?? null : null,
        sourceFilename: reference.source_filename,
        sourceFileRole: reference.source_file_role,
        referencedFilename: reference.referenced_filename,
        referencedPartNumber: reference.referenced_part_number,
        referencedDrawingNumber: reference.referenced_drawing_number,
        referencedRevision: reference.referenced_revision,
        referenceType: reference.reference_type,
        quantity: reference.quantity,
        extractionMethod: reference.extraction_method,
        confidence: reference.confidence,
        createdAt: now
      });
    }
  }
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
