import { NextResponse } from "next/server";
import { listAccountSessionsAsync, touchAccountSessionAsync } from "@/lib/account-session-registry";
import { getLegacySessionPayload, getSessionToken } from "@/lib/auth";
import { requireAuthAsync } from "@/lib/auth-async";
import { getAuthMode } from "@/lib/auth-config";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth.response;
  const sessionId = currentSessionId(request);
  if (sessionId) await touchAccountSessionAsync({ userId: auth.user.id, sessionId });
  const sessions = await listAccountSessionsAsync({
    userId: auth.user.id,
    currentSessionId: sessionId,
    limit: 20
  });
  return NextResponse.json({ sessions }, { headers: { "cache-control": "no-store" } });
}
