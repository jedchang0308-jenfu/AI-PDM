import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { refreshRegisteredLegacySessionCookieAsync } from "@/lib/account-session-registry";
import { requireAuthAsync } from "@/lib/auth-async";
import { getAuthMode } from "@/lib/auth-config";
import { serializeAuthUserAsync } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const headers = hasSessionCookie(request) && getAuthMode() !== "firebase_bff"
    ? { "set-cookie": await refreshRegisteredLegacySessionCookieAsync({ request, user }) }
    : undefined;
  return NextResponse.json({ user: await serializeAuthUserAsync(user) }, { headers });
}

function hasSessionCookie(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .some((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE_NAME}=`)) ?? false
  );
}
