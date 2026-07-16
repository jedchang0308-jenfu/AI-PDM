import { NextResponse } from "next/server";
import { AccountSessionError, revokeAccountSessionRecordAsync } from "@/lib/account-session-registry";
import { getLegacySessionPayload, getSessionToken } from "@/lib/auth";
import { requireAuthAsync } from "@/lib/auth-async";
import { getAuthMode } from "@/lib/auth-config";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = String(process.env.PDM_PUBLIC_BASE_URL ?? "").trim();
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  return origin === expected;
}

function currentSessionId(request: Request) {
  if (getAuthMode() === "firebase_bff") {
    const token = getSessionToken(request);
    if (!token) return null;
    try {
      return verifyPlatformSessionV2(token, getPlatformSessionKeyRing()).sessionId;
    } catch {
      return null;
    }
  }
  return getLegacySessionPayload(request)?.sessionId ?? null;
}

function sessionError(error: unknown) {
  if (error instanceof AccountSessionError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "session_revoke_failed", message: "工作階段撤銷失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth.response;
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin", message: "要求來源不正確。" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "json_body_required", message: "要求格式不正確。" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 8 * 1024) {
    return NextResponse.json({ error: "request_too_large", message: "要求內容過大。" }, { status: 413 });
  }

  const { sessionId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await revokeAccountSessionRecordAsync({
      actorId: auth.user.id,
      userId: auth.user.id,
      recordId: sessionId,
      currentSessionId: currentSessionId(request),
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return sessionError(error);
  }
}
