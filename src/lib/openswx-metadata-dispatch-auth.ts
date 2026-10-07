import { OAuth2Client } from "google-auth-library";
import { openSwxPrivateHeaders } from "@/lib/openswx-metadata";
export const OPENSWX_SCHEDULER_AUDIENCE = "https://ai-pdm-prod-9536592944.asia-east1.run.app";
export const OPENSWX_SCHEDULER_EMAIL = "aipdm-prod-openswx-dispatch@jenfu-platform-prod.iam.gserviceaccount.com";
// Immutable identity of the existing dispatch account, verified by IAM provider readback.
export const OPENSWX_SCHEDULER_SUBJECT = "107606630865191707245";
const google = new OAuth2Client({ transporterOptions: { timeout: 10_000, retry: false } });
type Claims = { iss?: string; sub?: string; email?: string; email_verified?: boolean; aud?: string; exp?: number; iat?: number };
type Verify = (token: string) => Promise<Claims | undefined>;
const verifyGoogle: Verify = async token => (await google.verifyIdToken({ idToken: token, audience: OPENSWX_SCHEDULER_AUDIENCE })).getPayload();
/** Next standalone reconstructs Request.url with the exact Docker bind address.
 * Accept that transport only behind this Cloud Run service's canonical HTTPS Host.
 * Forwarded host, lists, arbitrary ports and other internal origins never select a destination.
 */
function isCanonicalSchedulerDestination(request: Request) {
  const url = new URL(request.url), canonical = new URL(OPENSWX_SCHEDULER_AUDIENCE);
  const host = request.headers.get("host"), protocol = request.headers.get("x-forwarded-proto");
  if ((host !== null && host !== canonical.host) || (protocol !== null && protocol !== "https")) return false;
  if (url.origin === canonical.origin) return true;
  return url.origin === "https://0.0.0.0:8080" && process.env.K_SERVICE === "ai-pdm-prod" && process.env.PORT === "8080" && host === canonical.host && protocol === "https";
}
type ScheduleTimeCategory = "MISSING" | "FORMAT" | "INVALID_TIMESTAMP" | "TOO_OLD" | "TOO_FUTURE";
type ScheduleInstant = { nanos: bigint; category?: never } | { nanos?: never; category: ScheduleTimeCategory };
/** Validate ordinary RFC3339 calendar/offset semantics without Date.parse normalization.
 * Keep 1..9 fractional digits as integer nanoseconds so freshness never rounds inward.
 * Unknown local offset (-00:00) and unsupported leap seconds fail closed.
 */
function schedulerInstant(value: string | null): ScheduleInstant {
  if (value === null || value === "") return { category: "MISSING" };
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) return { category: "FORMAT" };
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHour = Number(match[10] ?? 0), offsetMinute = Number(match[11] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59 || match[8] === "-00:00") return { category: "INVALID_TIMESTAMP" };
  const calendar = new Date(0); calendar.setUTCFullYear(year, month - 1, day); calendar.setUTCHours(hour, minute, second, 0);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return { category: "INVALID_TIMESTAMP" };
  const offset = (offsetHour * 60 + offsetMinute) * (match[9] === "-" ? -1 : 1);
  return { nanos: BigInt(calendar.getTime() - offset * 60_000) * 1_000_000n + BigInt((match[7] ?? "").padEnd(9, "0")) };
}
/** Actual Google signature verification precedes the fixed purpose identity check. Unknown subject fails closed. */
export async function authenticateOpenSwxScheduler(request: Request, verify: Verify = verifyGoogle, now: number | (() => number) = Date.now, subject = OPENSWX_SCHEDULER_SUBJECT) {
  const denied = (code: string, reason: string, status = 403, category?: ScheduleTimeCategory) => {
    // Closed reason labels only; never log tokens, cookies, claims or request headers.
    console.warn(JSON.stringify({ schemaVersion: "aipdm.openswx-scheduler-rejection.v1", reason, ...(category ? { category } : {}) }));
    return Response.json({ code }, { status, headers: openSwxPrivateHeaders });
  };
  if (!subject || !/^[1-9][0-9]{5,30}$/u.test(subject)) return denied("OPENSWX_SCHEDULER_NOT_CONFIGURED", "configuration", 503);
  if (request.method !== "POST" || new URL(request.url).pathname !== "/api/openswx-metadata-dispatch/recover" || request.headers.has("cookie")) return denied("OPENSWX_SCHEDULER_FORBIDDEN", "request_envelope");
  if (!isCanonicalSchedulerDestination(request)) return denied("OPENSWX_SCHEDULER_FORBIDDEN", "destination");
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u)?.[1];
  if (!token || token.length > 8192) return denied("OPENSWX_SCHEDULER_FORBIDDEN", "token_format");
  try {
    const c = await verify(token), observedNow = typeof now === "function" ? now() : now, seconds = observedNow / 1000;
    if (!Number.isSafeInteger(observedNow) || !c || c.iss !== "https://accounts.google.com" || c.aud !== OPENSWX_SCHEDULER_AUDIENCE || c.sub !== subject || c.email !== OPENSWX_SCHEDULER_EMAIL || c.email_verified !== true || !Number.isSafeInteger(c.exp) || c.exp! <= seconds || !Number.isSafeInteger(c.iat) || c.iat! > seconds + 30 || c.iat! < seconds - 3600 || c.exp! - c.iat! > 3600) return denied("OPENSWX_SCHEDULER_FORBIDDEN", "claims");
    const schedule = schedulerInstant(request.headers.get("x-cloudscheduler-scheduletime"));
    if (schedule.category) return denied("OPENSWX_SCHEDULER_STALE", "schedule_time", 403, schedule.category);
    const observedNanos = BigInt(observedNow) * 1_000_000n;
    if (schedule.nanos < observedNanos - 60_000_000_000n) return denied("OPENSWX_SCHEDULER_STALE", "schedule_time", 403, "TOO_OLD");
    if (schedule.nanos > observedNanos + 5_000_000_000n) return denied("OPENSWX_SCHEDULER_STALE", "schedule_time", 403, "TOO_FUTURE");
    return null;
  } catch { return denied("OPENSWX_SCHEDULER_FORBIDDEN", "google_verification"); }
}
