import { NextResponse, type NextRequest } from "next/server";
import {
  getProductionSliceState,
  isProductionSliceAllowedApiMutation,
  isWriteMethod,
  productionSliceDeniedPayload,
  shouldBlockProductionSlicePagePath
} from "@/lib/production-slice";

export function middleware(request: NextRequest) {
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
