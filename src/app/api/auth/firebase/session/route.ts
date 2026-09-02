import { NextResponse } from "next/server";
import { registerFirebaseAccountSessionAsync, registerJenfuAccountSessionAsync } from "@/lib/account-session-registry";
import { createAuditLogAsync } from "@/lib/audit-async";
import {
  setFirebaseBffSessionResponseCookie,
  setJenfuPlatformSessionResponseCookie
} from "@/lib/auth-response-cookies";
import { getUserByIdAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuIdentityConfig, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { serializeAuthUserAsync } from "@/lib/company-context";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { consumeEmployeeLoginIntentAsync, EmployeeLoginAliasError } from "@/lib/employee-login-aliases";
import { FirebaseAdminIdentityProvider } from "@/lib/firebase-admin-identity-provider";
import { FirebasePlatformPrincipalRepository } from "@/lib/firebase-platform-principal-repository";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import {
  exchangeFirebaseIdTokenForJenfuPlatformSession,
  normalizeJenfuPlatformAuthError
} from "@/lib/jenfu-platform-identity-contract";
import { JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
import { toVerifiedJenfuAppSessionV1, verifyJenfuPlatformSessionV1 } from "@/lib/jenfu-platform-session-v1";
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

function jenfuExchangeFailure(error: unknown) {
  if (error instanceof EmployeeLoginAliasError && error.code === "employee_login_intent_invalid") {
    return NextResponse.json({ error: "登入要求無效或已失效。", code: "login_intent_invalid" }, { status: 403 });
  }
  const normalized = normalizeJenfuPlatformAuthError(error);
  const messages = {
    auth_token_invalid: "登入憑證無效或已失效。",
    principal_not_active: "此帳號尚未由系統管理員開通。",
    principal_ambiguous: "此帳號的員工對應需要系統管理員處理。",
    principal_directory_unavailable: "員工身分服務暫時無法使用。",
    auth_epoch_unavailable: "登入撤銷服務暫時無法使用。",
    auth_contract_mismatch: "登入契約版本不相容。",
    auth_server_not_configured: "平台登入尚未完成伺服器設定。"
  } as const;
  return NextResponse.json(
    { error: messages[normalized.code as keyof typeof messages] ?? "登入驗證失敗。", code: normalized.code },
    { status: normalized.httpStatus, headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: Request) {
  if (getAuthMode() !== "firebase_bff") {
    return NextResponse.json({ error: "Firebase BFF is disabled" }, { status: 404 });
  }
  let jenfuAuthEnabled: boolean;
  try {
    jenfuAuthEnabled = getJenfuPlatformAuthMode() === "on";
  } catch (error) {
    return jenfuExchangeFailure(error);
  }
  if (!isAllowedRequestOrigin(request)) {
    return jenfuAuthEnabled
      ? NextResponse.json({ error: "登入要求來源無效。", code: "auth_origin_invalid" }, { status: 403 })
      : NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jenfuAuthEnabled
      ? NextResponse.json({ error: "登入要求必須使用 JSON。", code: "auth_json_required" }, { status: 415 })
      : NextResponse.json({ error: "JSON body required" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 32 * 1024) {
    return jenfuAuthEnabled
      ? NextResponse.json({ error: "登入要求過大。", code: "auth_request_too_large" }, { status: 413 })
      : NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const body = await request.json().catch(() => ({}));
  const idToken = String(body.idToken ?? "").trim();
  const loginIntentToken = String(body.loginIntentToken ?? "").trim();
  if (!idToken || idToken.length > 16384) {
    return jenfuAuthEnabled
      ? NextResponse.json({ error: "登入要求無效。", code: "auth_request_invalid" }, { status: 400 })
      : NextResponse.json({ error: "Firebase ID token required" }, { status: 400 });
  }
  if (loginIntentToken.length > 256) {
    return jenfuAuthEnabled
      ? NextResponse.json({ error: "登入要求無效。", code: "auth_request_invalid" }, { status: 400 })
      : NextResponse.json({ error: "Login intent token is invalid" }, { status: 400 });
  }

  try {
    const keyRing = getPlatformSessionKeyRing();
    if (jenfuAuthEnabled) {
      const client = getAsyncDatabaseClient();
      const sessionToken = await exchangeFirebaseIdTokenForJenfuPlatformSession({
        idToken,
        firebase: new FirebaseAdminIdentityProvider(),
        localPrincipalRepository: new FirebasePlatformPrincipalRepository(client),
        principalAdmissionRepository: new JenfuPrincipalAdmissionRepository(client),
        authEpochRepository: new JenfuAuthEpochRepository(client),
        identityConfig: getJenfuIdentityConfig(),
        keyRing
      });
      const claims = verifyJenfuPlatformSessionV1(sessionToken, keyRing);
      const user = await getUserByIdAsync(claims.localPrincipalId);
      if (!user) throw new Error("PLATFORM_PRINCIPAL_NOT_ACTIVE");

      if (loginIntentToken) {
        await consumeEmployeeLoginIntentAsync({
          intentToken: loginIntentToken,
          pdmUserId: claims.localPrincipalId,
          companyId: claims.companyId
        });
      }

      await createAuditLogAsync({
        actorId: user.id,
        action: "Login",
        detail: { email: user.email, role: user.role, provider: "jenfu_firebase_bff", assuranceLevel: claims.assuranceLevel }
      });
      await registerJenfuAccountSessionAsync({ request, claims });
      const verifiedSession = toVerifiedJenfuAppSessionV1(claims);
      const response = NextResponse.json(
        {
          user: await serializeAuthUserAsync(user),
          session: { expiresAt: verifiedSession.expiresAt },
          assuranceLevel: claims.assuranceLevel
        },
        { headers: { "cache-control": "no-store" } }
      );
      setJenfuPlatformSessionResponseCookie(response, sessionToken);
      return response;
    }
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
    return jenfuAuthEnabled ? jenfuExchangeFailure(error) : exchangeFailure(error);
  }
}
