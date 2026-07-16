import { NextResponse } from "next/server";
import { registerFirebaseAccountSessionAsync } from "@/lib/account-session-registry";
import { createAuditLogAsync } from "@/lib/audit-async";
import {
  getPrivacyPendingToken,
  getSessionToken
} from "@/lib/auth";
import {
  clearPrivacyPendingResponseCookie,
  setFirebaseBffSessionResponseCookie
} from "@/lib/auth-response-cookies";
import { getSessionUserAsync, getUserByIdAsync } from "@/lib/auth-async";
import { serializeAuthUserAsync } from "@/lib/company-context";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";
import {
  finalizePrivacyAccessAsync,
  getPrivacyAcknowledgementStatusAsync,
  getPrivacyNoticeContract,
  getPublicPrivacyNotice,
  isPrivacyNoticeEnforced
} from "@/lib/privacy-notice";
import { PrivacyNoticeError } from "@/lib/repositories/privacy-notice-async-repository";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = String(process.env.PDM_PUBLIC_BASE_URL ?? "").trim();
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  return origin === expected;
}

function safeReturnPath(value: unknown) {
  const candidate = String(value ?? "/").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || candidate.length > 512) return "/";
  if (candidate.startsWith("/privacy/acknowledgement")) return "/";
  return candidate;
}

async function resolvePrincipal(request: Request) {
  async function resolvePlatformToken(token: string, pendingToken: string | null) {
    try {
      const keyRing = getPlatformSessionKeyRing();
      const initialClaims = verifyPlatformSessionV2(token, keyRing);
      const user = await getUserByIdAsync(initialClaims.pdmUserId);
      if (!user || user.company_id !== initialClaims.companyId || user.account_status !== "active" || Number(user.system_role_enabled) !== 1) {
        return null;
      }
      const claims = verifyPlatformSessionV2(token, keyRing, {
        currentSessionVersion: Number(user.account_lifecycle_version ?? 1)
      });
      return { user, pendingToken, sessionToken: token, firebaseUid: claims.subject, claims };
    } catch {
      return null;
    }
  }

  const pendingToken = getPrivacyPendingToken(request);
  if (pendingToken) {
    const principal = await resolvePlatformToken(pendingToken, pendingToken);
    if (principal) return principal;
  }

  const sessionToken = getSessionToken(request);
  if (sessionToken) {
    const principal = await resolvePlatformToken(sessionToken, null);
    if (principal) return principal;
  }

  const user = await getSessionUserAsync(request);
  return user ? { user, pendingToken: null, sessionToken: null, firebaseUid: null, claims: null } : null;
}

function privacyError(error: unknown) {
  if (error instanceof PrivacyNoticeError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json(
    { error: "privacy_acknowledgement_failed", message: "確認紀錄未完成，請重試或聯絡系統管理員。" },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  if (!isPrivacyNoticeEnforced()) {
    return NextResponse.json({ enforced: false, required: false, notice: getPublicPrivacyNotice() }, { headers: { "cache-control": "no-store" } });
  }
  const principal = await resolvePrincipal(request);
  if (!principal) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const status = await getPrivacyAcknowledgementStatusAsync({
      userId: principal.user.id,
      companyId: principal.user.company_id
    });
    return NextResponse.json(
      {
        enforced: true,
        required: status.status !== "acknowledged",
        pendingSession: Boolean(principal.pendingToken),
        status,
        notice: getPublicPrivacyNotice()
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return privacyError(error);
  }
}

export async function POST(request: Request) {
  if (!isPrivacyNoticeEnforced()) {
    return NextResponse.json({ error: "privacy_gate_not_enabled", message: "目前登入模式不需要此確認流程。" }, { status: 409 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin", message: "要求來源不正確。" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "json_body_required", message: "要求格式不正確。" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 16 * 1024) {
    return NextResponse.json({ error: "request_too_large", message: "要求內容過大。" }, { status: 413 });
  }

  const principal = await resolvePrincipal(request);
  if (!principal) {
    return NextResponse.json({ error: "authentication_required", message: "確認工作階段已失效，請重新登入。" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const contract = getPrivacyNoticeContract();
  if (body.acknowledged !== true) {
    return NextResponse.json({ error: "acknowledgement_required", message: "請勾選已閱讀並了解後再繼續。" }, { status: 400 });
  }
  if (String(body.noticeVersion ?? "") !== contract.version) {
    return NextResponse.json(
      { error: "privacy_notice_version_stale", message: "告知事項版本已更新，請重新整理後閱讀目前版本。" },
      { status: 409 }
    );
  }

  try {
    const status = await finalizePrivacyAccessAsync({
      userId: principal.user.id,
      companyId: principal.user.company_id,
      firebaseUid: principal.firebaseUid,
      acknowledged: true,
      source: "privacy_acknowledgement_page",
      requestId: String(body.requestId ?? "")
    });
    if (status.status !== "acknowledged") {
      return NextResponse.json({ error: "privacy_acknowledgement_required", message: "確認紀錄尚未完成。" }, { status: 409 });
    }

    if (principal.claims) {
      await createAuditLogAsync({
        actorId: principal.user.id,
        action: "Login",
        detail: { role: principal.user.role, provider: "firebase_bff", privacyAcknowledgement: contract.version }
      });
      await registerFirebaseAccountSessionAsync({ request, claims: principal.claims });
    }
    const response = NextResponse.json({
      ok: true,
      status,
      user: await serializeAuthUserAsync(principal.user),
      returnTo: safeReturnPath(body.returnTo)
    });
    if (principal.sessionToken) setFirebaseBffSessionResponseCookie(response, principal.sessionToken);
    clearPrivacyPendingResponseCookie(response);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return privacyError(error);
  }
}
