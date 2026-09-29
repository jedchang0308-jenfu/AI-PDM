import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { authorizePrincipalSubmissionReadInSnapshot } from "@/lib/principal-submission-access";
import type { ReleasePackage } from "@/lib/types";
import {
  contentDispositionFilename,
  createReleasePackageStorageServiceForRecord,
  getReleasePackageStorageKey,
  readReleasePackage
} from "@/lib/release-package-file";
import { auditStorageAccess, resolveStorageAccessAuditProvenance } from "@/lib/storage-access-audit";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const path = "src/app/api/submissions/[id]/release-package/route.ts";
  const policy = resolveJenfuRoutePolicy(path, "GET", { expectedPermissionCode: "submission.view" });
  if (policy?.path !== path || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "submission company") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const { id } = await params;
  try {
    const authorized = await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
      async (snapshot, verified) => {
        const resource = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, id);
        if (resource instanceof Response) return resource;
        const submission = await snapshot.queryOne<{ status: string }>(
          "SELECT status FROM ai_pdm_core.submissions WHERE id=:id", { id });
        if (!submission) {
          return NextResponse.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        if (submission.status !== "Released" && submission.status !== "Obsolete") {
          return NextResponse.json({ error: "Only Released or Obsolete submissions can download release packages" },
            { status: 409 });
        }
        const releasePackage = await snapshot.queryOne<ReleasePackage>(
          "SELECT * FROM ai_pdm_core.release_packages WHERE submission_id=:id", { id });
        if (!releasePackage) return NextResponse.json({ error: "Release package not found" }, { status: 404 });
        if (releasePackage.submission_id !== id) {
          return NextResponse.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        return { releasePackage, principalId: verified.session.principalId,
          profileId: verified.profile.pdmUserId, companyId: resource.company_id };
      });
    if (authorized instanceof Response) return authorized;
    const storageKey = getReleasePackageStorageKey(authorized.releasePackage);
    const bytes = await readReleasePackage(authorized.releasePackage);
    if (bytes.byteLength !== Number(authorized.releasePackage.file_size) ||
        !/^[0-9a-f]{64}$/i.test(authorized.releasePackage.sha256) ||
        createHash("sha256").update(bytes).digest("hex") !== authorized.releasePackage.sha256.toLowerCase()) {
      return NextResponse.json({ code: "stored_file_integrity_mismatch" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const access = await createReleasePackageStorageServiceForRecord(authorized.releasePackage)
      .createDownloadUrl({ key: storageKey, filename: authorized.releasePackage.package_filename,
        forceDownload: true, purpose: "release_package" });
    await auditStorageAccess({
      principalId: authorized.principalId, historicalProfileId: authorized.profileId,
      companyId: authorized.companyId, submissionId: id, accessKind: "release_package",
      fileId: authorized.releasePackage.id, filename: authorized.releasePackage.package_filename,
      bytes: bytes.byteLength, disposition: "attachment", provider: access.provider,
      storageKey, bucket: access.bucket ?? null, access,
      route: "/api/submissions/[id]/release-package",
      provenance: resolveStorageAccessAuditProvenance(request.headers)
    });
    return new Response(new Uint8Array(bytes), { headers: {
      "content-type": "application/zip", "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${contentDispositionFilename(authorized.releasePackage.package_filename)}"`,
      "x-content-type-options": "nosniff", "cache-control": "private, no-store"
    } });
  } catch (error) { return principalRequestFailure(error); }
}

