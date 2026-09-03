import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import {
  createEmployeeLoginAliasAsync,
  EmployeeLoginAliasError
} from "@/lib/employee-login-aliases";

export const runtime = "nodejs";

function validMutationRequest(request: Request) {
  const origin = request.headers.get("origin");
  const configured = String(process.env.PDM_PUBLIC_BASE_URL ?? "").trim();
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  return origin === expected && request.headers.get("content-type")?.toLowerCase().startsWith("application/json") === true && Number.isFinite(contentLength) && contentLength <= 8 * 1024;
}

function aliasError(error: unknown) {
  if (error instanceof EmployeeLoginAliasError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  const code = error instanceof Error ? error.message : "employee_login_alias_create_failed";
  if (code === "EMPLOYEE_LOGIN_RATE_LIMIT_PEPPER_REQUIRED") {
    return NextResponse.json({ error: "server_not_configured", message: "工號登入尚未完成伺服器設定。" }, { status: 503 });
  }
  return NextResponse.json({ error: "employee_login_alias_create_failed", message: "工號別名新增失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!validMutationRequest(request)) {
    return NextResponse.json({ error: "invalid_mutation_request", message: "要求來源或格式不正確。" }, { status: 403 });
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;
  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const loginAlias = await createEmployeeLoginAliasAsync({
      actorId: auth.user.id,
      actorCompanyId: auth.user.company_id,
      pdmUserId: userId,
      alias: String(body.alias ?? ""),
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ loginAlias }, { status: 201 });
  } catch (error) {
    return aliasError(error);
  }
}
