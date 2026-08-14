import { NextResponse, type NextRequest } from "next/server";
import {
  getProductionSliceState,
  isProductionSliceAllowedApiMutation,
  isWriteMethod,
  productionSliceDeniedPayload,
  shouldBlockProductionSlicePagePath
} from "@/lib/production-slice";
import { resolveNumberStateLegacyRedirect } from "@/lib/number-state-flow-legacy-route";
import { isUnifiedPartRelationWorkbenchV1Enabled } from "@/lib/number-state-flow-feature";

const RETIRED_PRIVACY_PATH_PREFIX = "/privacy";

function isRetiredPrivacyPath(pathname: string) {
  return pathname === RETIRED_PRIVACY_PATH_PREFIX || pathname.startsWith(`${RETIRED_PRIVACY_PATH_PREFIX}/`);
}

function numberStateLegacyRedirect(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const resolved = resolveNumberStateLegacyRedirect(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
    isUnifiedPartRelationWorkbenchV1Enabled()
  );
  if (!resolved) return null;
  const url = request.nextUrl.clone();
  url.pathname = resolved.pathname;
  url.search = resolved.searchParams.toString();
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const legacyRedirect = numberStateLegacyRedirect(request);
  if (legacyRedirect) return legacyRedirect;

  if ((request.method === "GET" || request.method === "HEAD") && isRetiredPrivacyPath(request.nextUrl.pathname)) {
    return new NextResponse(request.method === "HEAD" ? null : "Not Found", {
      status: 404,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "x-ai-pdm-retired-route": "privacy"
      }
    });
  }

  const slice = getProductionSliceState();
  if (!slice.configured) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    if (!isWriteMethod(request.method)) return NextResponse.next();
    if (isProductionSliceAllowedApiMutation(request.method, pathname)) return NextResponse.next();

    return NextResponse.json(productionSliceDeniedPayload(`${request.method.toUpperCase()} ${pathname}`, slice.mode), {
      status: 403,
      headers: {
        "x-ai-pdm-production-slice": slice.active ? "blocked" : "unknown-mode"
      }
    });
  }

  if ((request.method === "GET" || request.method === "HEAD") && shouldBlockProductionSlicePagePath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/production-slice-blocked";
    url.searchParams.set("from", pathname);
    return NextResponse.rewrite(url, {
      headers: {
        "x-ai-pdm-production-slice": slice.active ? "blocked-route" : "unknown-mode"
      }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
