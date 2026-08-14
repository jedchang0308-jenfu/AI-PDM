import type { NextResponse } from "next/server";
import {
  FIREBASE_BFF_SESSION_COOKIE_MAX_AGE_SECONDS,
  FIREBASE_HOSTING_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  isSecureCookieEnabled
} from "@/lib/auth";

const HTTP_ONLY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isSecureCookieEnabled(),
  path: "/"
};

function assertPlatformCookieToken(token: string, code: string) {
  if (!/^[A-Za-z0-9_.-]+$/u.test(token)) throw new Error(code);
}

export function setFirebaseBffSessionResponseCookie(response: NextResponse, token: string) {
  assertPlatformCookieToken(token, "SESSION_V2_COOKIE_TOKEN_INVALID");
  response.cookies.set(FIREBASE_HOSTING_SESSION_COOKIE_NAME, token, {
    ...HTTP_ONLY_COOKIE_OPTIONS,
    maxAge: FIREBASE_BFF_SESSION_COOKIE_MAX_AGE_SECONDS
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...HTTP_ONLY_COOKIE_OPTIONS,
    maxAge: FIREBASE_BFF_SESSION_COOKIE_MAX_AGE_SECONDS
  });
}

export function clearFirebaseBffSessionResponseCookies(response: NextResponse) {
  response.cookies.set(FIREBASE_HOSTING_SESSION_COOKIE_NAME, "", {
    ...HTTP_ONLY_COOKIE_OPTIONS,
    maxAge: 0
  });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...HTTP_ONLY_COOKIE_OPTIONS,
    maxAge: 0
  });
}
