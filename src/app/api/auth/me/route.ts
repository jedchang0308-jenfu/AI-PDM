import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, createSessionCookie } from "@/lib/auth";
import { getSessionUserAsync } from "@/lib/auth-async";
import { serializeAuthUserAsync } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUserAsync(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const headers = hasSessionCookie(request) ? { "set-cookie": createSessionCookie(user.id) } : undefined;
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
