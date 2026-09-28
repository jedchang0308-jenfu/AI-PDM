import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireAuthAsync } from "@/lib/auth-async";
import { buildFileResponse, getStoredSubmissionFile, isPdfFile } from "@/lib/file-response";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";
import { auditStorageAccess, resolveStorageAccessAuditProvenance } from "@/lib/storage-access-audit";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { authorizePrincipalSubmissionReadInSnapshot } from "@/lib/principal-submission-access";
import { AsyncSubmissionFileRepository } from "@/lib/repositories/submission-file-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; filePath: string[] }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token || (getAuthMode() === "firebase_bff" && getJenfuPlatformAuthMode() === "on")) {
    const path = "src/app/api/submissions/[id]/files/[...filePath]/route.ts";
    const policy = resolveJenfuRoutePolicy(path, "GET", { expectedPermissionCode: "submission.view" });
    if (policy?.path !== path || policy.authorizationMode !== "permission" ||
        policy.scopeResolver !== "submission company") {
      return NextResponse.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (!token) return NextResponse.json({ code: "auth_session_invalid" },
      { status: 401, headers: { "cache-control": "no-store" } });
    if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
      return NextResponse.json({ code: "principal_authorization_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const { id, filePath } = await params;
    const mode = resolveFileRouteMode(filePath);
    if (!mode) return NextResponse.json({ error: "Invalid file route" }, { status: 404 });
    try {
      const authorized = await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
        async (snapshot, verified) => {
          const resource = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, id);
          if (resource instanceof Response) return resource;
          const file = await new AsyncSubmissionFileRepository(snapshot)
            .getSubmissionFile({ submissionId: id, fileId: mode.fileId });
          if (!file) return NextResponse.json({ error: "Submission file not found" }, { status: 404 });
          if (file.submission_id !== id) return NextResponse.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
          return { file, pointer: storagePointerFromRecord(file),
            principalId: verified.session.principalId, profileId: verified.profile.pdmUserId,
            companyId: resource.company_id };
        });
      if (authorized instanceof Response) return authorized;
      if (mode.disposition === "inline" && !isPdfFile(authorized.file)) {
        return NextResponse.json({ error: "Only PDF files can be previewed" }, { status: 415 });
      }
      const storage = createFileStorageServiceForPointer(authorized.pointer);
      let bytes: Buffer;
      try { bytes = await storage.readObject(authorized.pointer.key); }
      catch { return NextResponse.json({ error: "Stored file is missing" }, { status: 404 }); }
      if (bytes.byteLength !== Number(authorized.file.file_size) ||
          !/^[0-9a-f]{64}$/i.test(authorized.file.sha256) ||
          createHash("sha256").update(bytes).digest("hex") !== authorized.file.sha256.toLowerCase()) {
        return NextResponse.json({ code: "stored_file_integrity_mismatch" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      const access = await storage.createDownloadUrl({ key: authorized.pointer.key,
        filename: authorized.file.original_filename,
        forceDownload: mode.disposition === "attachment",
        purpose: mode.disposition === "inline" ? "preview" : "download" });
      await auditStorageAccess({
        principalId: authorized.principalId, historicalProfileId: authorized.profileId,
        companyId: authorized.companyId, submissionId: id,
        accessKind: mode.disposition === "inline" ? "submission_file_preview" : "submission_file",
        fileId: authorized.file.id, filename: authorized.file.original_filename,
        bytes: bytes.byteLength, disposition: mode.disposition, provider: access.provider,
        storageKey: authorized.pointer.key, bucket: access.bucket ?? null, access,
        route: "/api/submissions/[id]/files/[...filePath]",
        provenance: resolveStorageAccessAuditProvenance(request.headers)
      });
      return buildFileResponse({ file: authorized.file, bytes, disposition: mode.disposition });
    } catch (error) { return principalRequestFailure(error); }
  }
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

  const access = await createFileStorageServiceForPointer(result.storagePointer).createDownloadUrl({
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
