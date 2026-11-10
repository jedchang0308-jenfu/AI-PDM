import type { LocalSandboxConfig } from "../../../contracts/local-principal-sandbox/v1/protocol.mjs";

/**
 * Next dev rewrites the internal Request URL host to localhost even when the
 * listener and browser use the pinned 127.0.0.1 origin. Canonicalize only that
 * loopback representation, on the same port, while requiring the original
 * Host to remain exactly pinned. External and forwarded hosts stay untouched
 * for the shared request guard to reject.
 */
export function canonicalLocalSandboxRequest(request: Request, config: LocalSandboxConfig): Request {
  const requested = new URL(request.url);
  const configured = new URL(config.origin);
  if (requested.origin === configured.origin) return request;
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (requested.protocol !== "http:" || configured.protocol !== "http:"
    || requested.port !== configured.port
    || !loopback.has(requested.hostname) || !loopback.has(configured.hostname)
    || request.headers.get("host") !== configured.host) return request;
  return new Request(new URL(`${requested.pathname}${requested.search}`, configured.origin), request);
}
