import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  checks.push({ name, passed, detail });
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

const authSource = read("src/lib/auth.ts");
const authAsyncSource = read("src/lib/auth-async.ts");
const loginRoute = read("src/app/api/auth/login/route.ts");
const meRoute = read("src/app/api/auth/me/route.ts");
const logoutRoute = read("src/app/api/auth/logout/route.ts");
const managedAuthQc = read("scripts/qc-managed-auth-test.mjs");

record(
  "AUTH-PERSIST-001 session cookie name is centralized",
  includesAll(authSource, ['SESSION_COOKIE_NAME = "pdm_session"', "createSessionCookie", "createLogoutCookie"])
);
record(
  "AUTH-PERSIST-002 session max age is 400 days",
  includesAll(authSource, ["SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400", "Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}"])
);
record(
  "AUTH-PERSIST-003 login route issues centralized persistent session cookie",
  includesAll(loginRoute, ["createSessionCookie", '"set-cookie": createSessionCookie'])
);
record(
  "AUTH-PERSIST-004 auth/me refreshes only existing browser cookie sessions",
  includesAll(meRoute, ["createSessionCookie", "hasSessionCookie(request)", '"set-cookie": createSessionCookie(user.id)', "SESSION_COOKIE_NAME"])
);
record(
  "AUTH-PERSIST-005 auth/me does not refresh bearer-only auth",
  includesAll(meRoute, ["headers = hasSessionCookie(request) ?"])
);
record(
  "AUTH-PERSIST-006 async auth reads centralized cookie name",
  includesAll(authAsyncSource, ["SESSION_COOKIE_NAME", ".get(SESSION_COOKIE_NAME)"])
);
record(
  "AUTH-PERSIST-007 logout still clears browser session cookie",
  includesAll(logoutRoute, ["createLogoutCookie", '"set-cookie": createLogoutCookie()']) &&
    includesAll(authSource, ["Max-Age=0"])
);
record(
  "AUTH-PERSIST-008 managed auth QC covers persistent cookie and refresh contract",
  includesAll(managedAuthQc, [
    "AUTHMODE-019 login issues persistent session cookie",
    "AUTHMODE-020 cookie auth/me refreshes persistent session cookie",
    "AUTHMODE-021 bearer auth/me does not create browser session cookie"
  ])
);

const failed = checks.filter((check) => !check.passed);
console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
process.exitCode = failed.length > 0 ? 1 : 0;
