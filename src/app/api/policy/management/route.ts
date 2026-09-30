import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

const ROUTE_PATH = "src/app/api/policy/management/route.ts";
const POLICY_SOURCE_PATH = ".ai-doc/reference/pdm-management-policy-draft.md";
const policyFilePath = path.join(process.cwd(), ".ai-doc", "reference", "pdm-management-policy-draft.md");
const noStore = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const policy = resolveJenfuRoutePolicy(ROUTE_PATH, "GET", {});
  if (policy?.authorizationMode !== "authenticated_domain" ||
      policy.scopeResolver !== "verified session" ||
      getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: noStore });
  }
  try {
    await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
      async () => true);
    const [content, metadata] = await Promise.all([
      readFile(policyFilePath, "utf8"), stat(policyFilePath)
    ]);
    return NextResponse.json({
      content, sourcePath: POLICY_SOURCE_PATH, canEdit: false,
      userRole: "", updatedAt: metadata.mtime.toISOString()
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof JenfuPrincipalRequestError) return principalRequestFailure(error);
    console.error("POLICY_READ_FAILED", error);
    return NextResponse.json({ code: "POLICY_READ_FAILED" },
      { status: 503, headers: noStore });
  }
}

/** The old container-file editor has no durable production write contract. */
export async function PUT() {
  return NextResponse.json({
    code: "PDM_POLICY_FILE_EDITOR_RETIRED",
    message: "管理辦法由版本化來源文件發布。"
  }, { status: 410, headers: noStore });
}
