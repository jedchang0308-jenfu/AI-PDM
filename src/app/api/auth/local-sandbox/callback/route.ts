import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { issueLocalSandboxPrincipalSession } from "@/lib/local-sandbox-principal-session";
import {
  clearLocalStateCookie,
  createLocalPrincipalSessionCookie,
  getLocalSandboxPrincipalRuntime,
  isLocalPrincipalSandboxRequested,
  localStateCookieValue,
  verifyLocalSandboxLoginState,
} from "@/lib/local-sandbox-principal-runtime";
import { assertLocalSandboxRequest } from "../../../../../../contracts/local-principal-sandbox/v1/protocol.mjs";

export const runtime = "nodejs";

function safeFailure(origin: string | null) {
  if (!origin) return NextResponse.json({ code: "local_sandbox_unavailable" }, { status: 503,
    headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  const destination = new URL("/login?auth_error=local_sandbox_unavailable", origin);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  let verifiedOrigin: string | null = null;
  try {
    if (!isLocalPrincipalSandboxRequested()) {
      return NextResponse.json({ code: "local_sandbox_disabled" }, { status: 404,
        headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    const local = await getLocalSandboxPrincipalRuntime();
    verifiedOrigin = local.config.origin;
    assertLocalSandboxRequest(request, local.config, { listenAddress: local.listenAddress });
    const url = new URL(request.url);
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 3 || keys.some((key) => !["code", "state", "iss"].includes(key)) ||
      ["code", "state", "iss"].some((key) => url.searchParams.getAll(key).length !== 1)) {
      throw new Error("LOCAL_SANDBOX_CALLBACK_INVALID");
    }
    const code = url.searchParams.get("code") ?? "";
    const suppliedState = url.searchParams.get("state") ?? "";
    const issuer = url.searchParams.get("iss") ?? "";
    if (code.length > 128 || issuer !== `${local.config.platformOrigin}/api/local-sandbox`) {
      throw new Error("LOCAL_SANDBOX_CALLBACK_INVALID");
    }
    const state = verifyLocalSandboxLoginState(localStateCookieValue(request), suppliedState,
      local.profile.platformClient.key, local.config.origin);
    const callbackUrl = `${local.config.origin}/api/auth/local-sandbox/callback`;
    const assertionExpected = {
      applicationId: local.expected.applicationId,
      sandboxId: local.expected.sandboxId,
      generation: local.expected.generation,
      fixtureVersion: local.expected.fixtureVersion,
      fixtureHash: local.expected.fixtureHash,
      nativeSessionContractVersion: local.expected.nativeSessionContractVersion,
      ...(local.expected.allowSyntheticAal2 === true ? { allowSyntheticAal2: true,
        assurancePolicyHash: local.expected.assurancePolicyHash } : {}),
    };
    const proof = await local.client.tokenProof({ code, redirectUri: callbackUrl, codeVerifier: state.verifier,
      expected: assertionExpected });
    const issued = await issueLocalSandboxPrincipalSession({
      request,
      environment: process.env,
      listenAddress: local.listenAddress,
      verifyCallbackStateAndPkce: async (candidate) => {
        const candidateUrl = new URL(candidate.url);
        if (candidate.method !== "GET" || candidateUrl.pathname !== "/api/auth/local-sandbox/callback" ||
          candidateUrl.searchParams.get("state") !== suppliedState || state.challenge !==
            createHash("sha256").update(state.verifier, "ascii").digest("base64url")) {
          throw new Error("LOCAL_SANDBOX_CALLBACK_STATE_INVALID");
        }
        const repeated = verifyLocalSandboxLoginState(localStateCookieValue(candidate), suppliedState,
          local.profile.platformClient.key, local.config.origin);
        if (repeated.verifier !== state.verifier || repeated.challenge !== state.challenge) {
          throw new Error("LOCAL_SANDBOX_CALLBACK_STATE_INVALID");
        }
      },
      expected: local.expected,
      expectedNonce: proof.nonce,
      signedResponse: { rawBody: proof.rawBody, nonce: proof.nonce, audience: proof.audience,
        clientId: proof.clientId, signature: proof.signature },
      database: local.database,
      keyRing: local.keyRing,
      ports: local.ports,
    });
    const response = NextResponse.redirect(new URL("/", local.config.origin), 303);
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.append("set-cookie", createLocalPrincipalSessionCookie(issued.token, local.config.sandboxId,
      new Date(issued.claims.expiresAt * 1000).toISOString(), local.config.origin));
    response.headers.append("set-cookie", clearLocalStateCookie(local.config.origin));
    return response;
  } catch {
    const response = safeFailure(verifiedOrigin);
    if (verifiedOrigin) response.headers.append("set-cookie", clearLocalStateCookie(verifiedOrigin));
    return response;
  }
}
