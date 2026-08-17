import { NextResponse } from "next/server";
import { registerFirebaseAccountSessionAsync } from "@/lib/account-session-registry";
import { createAuditLogAsync } from "@/lib/audit-async";
import {
  setFirebaseBffSessionResponseCookie
} from "@/lib/auth-response-cookies";
import { getUserByIdAsync } from "@/lib/auth-async";
import { getAuthMode } from "@/lib/auth-config";
import { serializeAuthUserAsync } from "@/lib/company-context";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { consumeEmployeeLoginIntentAsync, EmployeeLoginAliasError } from "@/lib/employee-login-aliases";
import { FirebaseAdminIdentityProvider } from "@/lib/firebase-admin-identity-provider";
import { FirebasePlatformPrincipalRepository } from "@/lib/firebase-platform-principal-repository";
import { exchangeFirebaseIdTokenForPlatformSession } from "@/lib/platform-identity-contract";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

function exchangeFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "FIREBASE_SESSION_EXCHANGE_FAILED";
  if (error instanceof EmployeeLoginAliasError && error.code === "employee_login_intent_invalid") {
    return NextResponse.json({ error: "登入要求無效或已失效。", code: "login_intent_invalid" }, { status: 403 });
  }
  if (code === "FIREBASE_PRIVILEGED_ASSURANCE_REQUIRED") {
    return NextResponse.json(
      { error: "此帳號需要使用已核准的公司 Google 帳號登入。", code: "privileged_assurance_required" },
      { status: 403 }
    );
  }
  if (code === "FIREBASE_EMAIL_NOT_VERIFIED") {
    return NextResponse.json({ error: "請先完成電子郵件驗證。", code: "email_not_verified" }, { status: 403 });
  }
  if (code === "PLATFORM_PRINCIPAL_NOT_ACTIVE") {
    return NextResponse.json({ error: "此帳號尚未由系統管理員開通。", code: "principal_not_active" }, { status: 403 });
  }
  if (/^(?:SESSION_V2_CONFIG_|SESSION_V2_SECRET_|FIREBASE_PROJECT_ID_REQUIRED)/u.test(code)) {
    return NextResponse.json({ error: "Firebase BFF 尚未完成伺服器設定。", code: "server_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ error: "登入憑證無效或已失效。", code: "firebase_token_invalid" }, { status: 401 });
}

export async function POST(request: Request) {
  if (getAuthMode() !== "firebase_bff") {
    return NextResponse.json({ error: "Firebase BFF is disabled" }, { status: 404 });
  }
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON body required" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 32 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const body = await request.json().catch(() => ({}));
  const idToken = String(body.idToken ?? "").trim();
  const loginIntentToken = String(body.loginIntentToken ?? "").trim();
  if (!idToken || idToken.length > 16384) {
    return NextResponse.json({ error: "Firebase ID token required" }, { status: 400 });
  }
  if (loginIntentToken.length > 256) {
    return NextResponse.json({ error: "Login intent token is invalid" }, { status: 400 });
  }

  try {
    const keyRing = getPlatformSessionKeyRing();
    const sessionToken = await exchangeFirebaseIdTokenForPlatformSession({
      idToken,
      firebase: new FirebaseAdminIdentityProvider(),
      repository: new FirebasePlatformPrincipalRepository(getAsyncDatabaseClient()),
      keyRing
    });
    const claims = verifyPlatformSessionV2(sessionToken, keyRing);
    const user = await getUserByIdAsync(claims.pdmUserId);
    if (!user) throw new Error("PLATFORM_PRINCIPAL_NOT_ACTIVE");

    if (loginIntentToken) {
      await consumeEmployeeLoginIntentAsync({
        intentToken: loginIntentToken,
        pdmUserId: claims.pdmUserId,
        companyId: claims.companyId
      });
    }

    await createAuditLogAsync({
      actorId: user.id,
      action: "Login",
      detail: { email: user.email, role: user.role, provider: "firebase_bff", assuranceLevel: claims.assuranceLevel }
    });
    await registerFirebaseAccountSessionAsync({ request, claims });
    const response = NextResponse.json(
      { user: await serializeAuthUserAsync(user), assuranceLevel: claims.assuranceLevel },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
    setFirebaseBffSessionResponseCookie(response, sessionToken);
    return response;
  } catch (error) {
    return exchangeFailure(error);
  }
}
