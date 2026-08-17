import { NextResponse } from "next/server";
import { getAuthMode } from "@/lib/auth-config";
import {
  EmployeeLoginAliasError,
  issueEmployeeLoginIntentAsync
} from "@/lib/employee-login-aliases";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${address}|${request.headers.get("user-agent")?.slice(0, 160) ?? "unknown"}`;
}

export async function POST(request: Request) {
  if (getAuthMode() !== "firebase_bff") {
    return NextResponse.json({ error: "Employee login routing is disabled" }, { status: 404 });
  }
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON body required" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 8 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const body = await request.json().catch(() => ({}));
  const identifier = String(body.identifier ?? "");
  if (!identifier.trim() || identifier.length > 128) {
    return NextResponse.json({ error: "請輸入公司帳號或工號。", code: "identifier_required" }, { status: 400 });
  }

  try {
    const challenge = await issueEmployeeLoginIntentAsync({
      identifier,
      clientKey: clientKey(request),
      returnPath: String(body.returnPath ?? "/")
    });
    return NextResponse.json(challenge, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EmployeeLoginAliasError && error.code === "employee_login_rate_limited") {
      return NextResponse.json({ error: error.message, code: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store" } });
    }
    const code = error instanceof Error ? error.message : "EMPLOYEE_LOGIN_INTENT_FAILED";
    if (code === "EMPLOYEE_LOGIN_RATE_LIMIT_PEPPER_REQUIRED") {
      return NextResponse.json({ error: "公司登入尚未完成伺服器設定。", code: "server_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "登入要求目前無法處理，請稍後再試。", code: "intent_failed" }, { status: 500 });
  }
}
