import type { MasterAttachmentRecord } from "@/lib/repositories/master-attachment-repository";

type RevisionFileIdentity = {
  documentCategory: string;
  revision: string | null;
  fileName: string;
  fileSize: number;
  contentHash: string;
};

export function findExactRevisionFileReuse(
  attachments: MasterAttachmentRecord[],
  input: RevisionFileIdentity
) {
  const revision = normalizeRevision(input.revision);
  const filename = input.fileName.trim();
  const contentHash = input.contentHash.trim().toLowerCase();

  return attachments.find((attachment) =>
    attachment.documentCategory === input.documentCategory
    && normalizeRevision(attachment.revision) === revision
    && attachment.fileName.trim() === filename
    && attachment.fileSize === input.fileSize
    && attachment.contentHash.trim().toLowerCase() === contentHash
  ) ?? null;
}

function normalizeRevision(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
