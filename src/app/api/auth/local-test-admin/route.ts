import { isLocalTestAdminAvailable, issueLocalTestAdminSession } from "@/lib/local-test-admin";
import { LocalSandboxError } from "../../../../../contracts/local-principal-sandbox/v1/protocol.mjs";

export const runtime = "nodejs";

const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

export async function POST(request: Request) {
  if (!isLocalTestAdminAvailable(request)) {
    return Response.json({ code: "local_test_admin_disabled" }, { status: 404, headers });
  }
  try {
    const issued = await issueLocalTestAdminSession(request);
    return Response.json({ authenticated: true, localTestAdmin: true },
      { headers: { ...headers, "set-cookie": issued.cookie } });
  } catch (error) {
    if (error instanceof LocalSandboxError && [400, 403, 413, 415].includes(error.status)) {
      return Response.json({ code: error.status === 403 ? "local_test_admin_origin_invalid" : "local_test_admin_request_invalid" },
        { status: error.status, headers });
    }
    return Response.json({ code: "local_test_admin_unavailable",
      error: "本機測試超級管理員尚未就緒，請確認隔離資料庫已安裝測試帳戶。" },
      { status: 503, headers });
  }
}
