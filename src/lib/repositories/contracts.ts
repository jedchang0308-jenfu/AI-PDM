import type {
  ApprovalMatrixRequirement,
  BomDetail,
  BomDiffResult,
  ChangeRequest,
  DiscussionComment,
  ItemLock,
  ItemRevisionHistoryEntry,
  NotificationItem,
  PhaseGateCheck,
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
  listPhaseGateChecks(submissionId: string): PhaseGateCheck[];
  listApprovalRequirements(submissionId: string): ApprovalMatrixRequirement[];
  listPdfMarkups(submissionId: string): PdfMarkup[];
}

export interface BomRepository {
  getBySubmissionId(submissionId: string): BomDetail | null;
  materializeDraftFromReferences(submissionId: string): BomDetail | null;
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
