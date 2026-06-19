import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { buildFileResponse, getStoredSubmissionFile, isPdfFile } from "@/lib/file-response";
import { createFileStorageService } from "@/lib/file-storage";
import { auditStorageAccess, resolveStorageAccessAuditProvenance } from "@/lib/storage-access-audit";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; filePath: string[] }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id, filePath } = await params;
  const mode = resolveFileRouteMode(filePath);
  if (!mode) {
    return NextResponse.json({ error: "Invalid file route" }, { status: 404 });
  }

  const result = await getStoredSubmissionFile(id, mode.fileId, auth.user);
  if (result.response) return result.response;

  if (mode.disposition === "inline" && !isPdfFile(result.file)) {
    return NextResponse.json({ error: "Only PDF files can be previewed" }, { status: 415 });
  }

  const access = await createFileStorageService().createDownloadUrl({
    key: result.storageKey,
    filename: result.file.original_filename,
    forceDownload: mode.disposition === "attachment",
    purpose: mode.disposition === "inline" ? "preview" : "download"
  });
  await auditStorageAccess({
    actorId: auth.user.id,
    submissionId: id,
    accessKind: mode.disposition === "inline" ? "submission_file_preview" : "submission_file",
    fileId: result.file.id,
    filename: result.file.original_filename,
    bytes: result.bytes.byteLength,
    disposition: mode.disposition,
    provider: access.provider,
    storageKey: result.storageKey,
    bucket: access.bucket ?? null,
    access,
    route: "/api/submissions/[id]/files/[...filePath]",
    provenance: resolveStorageAccessAuditProvenance(request.headers)
  });

  return buildFileResponse({
    file: result.file,
    bytes: result.bytes,
    disposition: mode.disposition
  });
}

function resolveFileRouteMode(filePath: string[]) {
  if (filePath.length === 1) {
    return { fileId: filePath[0], disposition: "attachment" as const };
  }

  if (filePath.length === 2 && filePath[0] === "preview") {
    return { fileId: filePath[1], disposition: "inline" as const };
  }

  return null;
}
