import { NextResponse } from "next/server";
import { requestProviderRecoveryHandoffByEmailAsync } from "@/lib/account-recovery-handoff";
import { getAuthMode } from "@/lib/auth-config";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = String(process.env.PDM_PUBLIC_BASE_URL ?? "").trim();
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  return origin === expected;
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  if (getAuthMode() === "firebase_bff") {
    await requestProviderRecoveryHandoffByEmailAsync({
      request,
      email: String(body.email ?? "")
    });
  }

  return NextResponse.json(
    {
      ok: true,
      message: "如果帳號符合復原條件，系統會寄出供應商管理的帳號復原郵件。"
    },
    { status: 202, headers: { "cache-control": "no-store" } }
  );
}
