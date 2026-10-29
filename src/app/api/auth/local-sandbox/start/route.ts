import { NextResponse } from "next/server";
import { createLocalSandboxLoginState, createLocalStateCookie, getLocalSandboxPrincipalRuntime,
  isLocalPrincipalSandboxRequested } from "@/lib/local-sandbox-principal-runtime";
import { assertLocalSandboxRequest } from "../../../../../../contracts/local-principal-sandbox/v1/protocol.mjs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isLocalPrincipalSandboxRequested()) {
      return NextResponse.json({ code: "local_sandbox_disabled" }, { status: 404,
        headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    const local = await getLocalSandboxPrincipalRuntime();
    assertLocalSandboxRequest(request, local.config, { listenAddress: local.listenAddress });
    const state = createLocalSandboxLoginState(local.profile.platformClient.key, local.config.origin);
    const callback = `${local.config.origin}/api/auth/local-sandbox/callback`;
    const authorize = new URL("/api/local-sandbox/authorize", local.config.platformOrigin);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: local.profile.platformClient.clientId,
      redirect_uri: callback,
      state: state.state,
      code_challenge: state.challenge,
      code_challenge_method: "S256",
    }).toString();
    const response = NextResponse.redirect(authorize, 303);
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.append("set-cookie", createLocalStateCookie(state.cookieValue, local.config.origin, state.expiresAt));
    return response;
  } catch {
    return NextResponse.json({ code: "local_sandbox_unavailable" }, { status: 503,
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
}
