import type {
  ApprovalMatrixRequirement,
  BomDetail,
  BomDiffResult,
  BomImportJob,
  BomReleaseSnapshotDetail,
  BomWorkbenchDraftDetail,
  BomWorkbenchSummary,
  ChangeRequest,
  DiscussionComment,
  ItemLock,
  ItemRevisionHistoryEntry,
  NotificationItem,
  PdfMarkup,
  ReadonlyShare,
  ReleasePackage,
  ReviewIssue,
  SandboxBranch,
  SubmissionDetail,
  SubmissionSummary,
  SupplierPortalResponse,
  WhereUsedEntry
} from "@/lib/types";

export type SubmissionListOptions = {
  status?: string;
  submittedBy?: string;
  limit?: number;
  offset?: number;
};

export type SubmissionSearchFilters = {
  productLine?: string;
  customer?: string;
  projectCode?: string;
  processName?: string;
  machine?: string;
  material?: string;
  surfaceFinish?: string;
  status?: string;
  parentDrawing?: string;
  childDrawingNumber?: string;
  childPartNumber?: string;
  bomIssue?: string;
};

export type SubmissionSearchInput = {
  query?: string;
  status?: string;
  submittedBy?: string;
  filters?: SubmissionSearchFilters;
  limit?: number;
};

export type SubmissionCreateInput = {
  submittedBy: string;
  drawingNumber: string;
  partNumber: string;
  partName: string;
  revision: string;
  material: string;
  surfaceFinish: string;
  documentType: string;
  changeDescription: string;
  files?: Array<{
    id?: string;
    fileRole: string;
    originalFilename: string;
    storedPath: string;
    mimeType?: string | null;
    sizeBytes: number;
    sha256?: string | null;
  }>;
};

export interface SubmissionRepository {
  list(input?: SubmissionListOptions): SubmissionSummary[];
  search(input: SubmissionSearchInput): SubmissionSummary[];
  getById(id: string): SubmissionDetail | null;
  create(input: SubmissionCreateInput): SubmissionDetail;
  updateStatus(input: { id: string; status: string; actorId: string; reason?: string }): void;
  revisionExists(input: { drawingNumber: string; revision: string }): boolean;
  history(input: { partNumber: string; submittedBy?: string }): ItemRevisionHistoryEntry[];
}

export interface ReviewRepository {
  listIssues(submissionId: string): ReviewIssue[];
  createIssue(input: { submissionId: string; fileId?: string | null; authorId: string; body: string; assigneeId?: string | null }): ReviewIssue;
  resolveIssue(input: { submissionId: string; issueId: string; resolvedBy: string; resolution: string }): ReviewIssue | null;
  listComments(submissionId: string): DiscussionComment[];
  createComment(input: { submissionId: string; fileId?: string | null; authorId: string; body: string }): DiscussionComment;
  listChangeRequests(submissionId: string): ChangeRequest[];
  listApprovalRequirements(submissionId: string): ApprovalMatrixRequirement[];
  listPdfMarkups(submissionId: string): PdfMarkup[];
}

export interface BomRepository {
  getBySubmissionId(submissionId: string): BomDetail | null;
  materializeDraftFromReferences(submissionId: string): BomDetail | null;
  createWorkbenchDraftFromAssembly(input: { submissionId: string; actorId: string | null; draftName?: string; setActive?: boolean }): BomWorkbenchDraftDetail | null;
  createWorkbenchDraftFromSolidWorksXls(input: {
    submissionId: string;
    actorId: string | null;
    draftName?: string;
    setActive?: boolean;
    originalFilename: string;
    fileBuffer: Uint8Array;
    contentType?: string | null;
  }): { draft: BomWorkbenchDraftDetail; importJob: BomImportJob } | null;
  getImportJobById(importJobId: string): BomImportJob | null;
  saveWorkbenchDraftTree(input: {
    draftId: string;
    actorId: string | null;
    reason?: string;
    lines: Array<{
      id?: string;
      parentLineId?: string | null;
      nodeType: "item" | "group";
      partNumber?: string | null;
      revision?: string | null;
      groupName?: string | null;
      quantity?: number | null;
      sequenceNo?: number | null;
    }>;
  }): BomWorkbenchDraftDetail | null;
  setWorkbenchActiveDraft(input: { draftId: string; actorId: string | null }): BomWorkbenchDraftDetail | null;
  submitWorkbenchDraftReview(input: { draftId: string; actorId: string; changeReason: string }): unknown;
  approveWorkbenchReview(input: { reviewId: string; actorId: string; decisionReason?: string }): unknown;
  rejectWorkbenchReview(input: { reviewId: string; actorId: string; decisionReason?: string }): unknown;
  getWorkbenchBySubmissionId(submissionId: string): BomWorkbenchSummary | null;
  getWorkbenchDraftById(draftId: string): BomWorkbenchDraftDetail | null;
  getReleaseSnapshotById(snapshotId: string): BomReleaseSnapshotDetail | null;
  findPreviousSubmissionId(targetSubmissionId: string): string | null;
  diff(input: { baseSubmissionId: string; targetSubmissionId: string }): BomDiffResult | null;
  whereUsed(input: { partNumber: string; submittedBy?: string }): WhereUsedEntry[];
}

export interface ReleaseRepository {
  getPackageBySubmissionId(submissionId: string): ReleasePackage | null;
  upsertPackage(input: { submissionId: string; releasedBy: string; packagePath: string; fileCount: number }): ReleasePackage;
  markReleasedAndObsoletePrevious(input: { id: string; actorId: string }): SubmissionDetail | null;
  listReadonlyShares(submissionId: string): ReadonlyShare[];
  listSupplierResponses(input: { submissionId: string; shareId?: string }): SupplierPortalResponse[];
}

export interface SandboxRepository {
  listForSubmission(submissionId: string): SandboxBranch[];
  getById(branchId: string): SandboxBranch | null;
  getActiveForSubmission(submissionId: string): SandboxBranch | null;
  merge(input: { branchId: string; userId: string }): SandboxBranch;
}

export interface ItemLockRepository {
  getActive(itemId: string): ItemLock | null;
  create(input: { submissionId: string; userId: string; reason: string; hours?: number }): ItemLock;
  release(input: { submissionId: string; userId: string; force?: boolean }): ItemLock | null;
  expire(): number;
}

export interface SystemRepository {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string, updatedBy: string): void;
  getAllSettings(): Record<string, string>;
  listNotifications(input: { userId: string; role: string }): NotificationItem[];
}

export interface RepositorySet {
  submissions: SubmissionRepository;
  reviews: ReviewRepository;
  bom: BomRepository;
  release: ReleaseRepository;
  sandbox: SandboxRepository;
  itemLocks: ItemLockRepository;
  system: SystemRepository;
}
