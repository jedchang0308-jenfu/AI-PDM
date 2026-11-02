import { NextResponse } from "next/server";
import { reportLocalPrincipalDiagnostic } from "@/lib/local-principal-diagnostics";
import {
  createLocalPrincipalSessionCookie,
  isLocalPrincipalSandboxRequested,
} from "@/lib/local-sandbox-principal-runtime";
import {
  getLocalSandboxPrincipalRuntime,
  isLocalQuickLoginAvailable,
  issueLocalPrincipalQuickLoginSession,
} from "@/lib/local-quick-login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isLocalPrincipalSandboxRequested() || !isLocalQuickLoginAvailable(request)) {
      return NextResponse.json({ error: "本機 Principal v2 快速登入未開放" }, { status: 404,
        headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }

    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
      return NextResponse.json({ error: "本機快速登入不接受角色或 claims" }, { status: 400,
        headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }

    const runtime = await getLocalSandboxPrincipalRuntime();
    const issued = await issueLocalPrincipalQuickLoginSession(request, runtime);
    const response = NextResponse.json({
      authenticated: true,
      principalId: issued.claims.principalId,
      employeeId: issued.claims.employeeId,
      sessionExpiresAt: new Date(issued.claims.expiresAt * 1000).toISOString(),
    }, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    response.headers.append("set-cookie", createLocalPrincipalSessionCookie(
      issued.token,
      runtime.config.sandboxId,
      new Date(issued.claims.expiresAt * 1000).toISOString(),
      runtime.config.origin,
    ));
    return response;
  } catch (error) {
    reportLocalPrincipalDiagnostic("local_sandbox_quick_login", error);
    return NextResponse.json({ error: "本機 Principal v2 快速登入暫時無法使用" }, { status: 503,
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
}
