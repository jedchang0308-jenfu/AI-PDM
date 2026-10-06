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
/** Actual Google signature verification precedes the fixed purpose identity check. Unknown subject fails closed. */
export async function authenticateOpenSwxScheduler(request: Request, verify: Verify = verifyGoogle, now: number | (() => number) = Date.now, subject = OPENSWX_SCHEDULER_SUBJECT) {
  const denied = (code: string, status = 403) => Response.json({ code }, { status, headers: openSwxPrivateHeaders });
  if (!subject || !/^[1-9][0-9]{5,30}$/u.test(subject)) return denied("OPENSWX_SCHEDULER_NOT_CONFIGURED", 503);
  if (request.method !== "POST" || new URL(request.url).origin !== OPENSWX_SCHEDULER_AUDIENCE || new URL(request.url).pathname !== "/api/openswx-metadata-dispatch/recover" || request.headers.has("cookie")) return denied("OPENSWX_SCHEDULER_FORBIDDEN");
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u)?.[1];
  if (!token || token.length > 8192) return denied("OPENSWX_SCHEDULER_FORBIDDEN");
  try {
    const c = await verify(token), observedNow = typeof now === "function" ? now() : now, seconds = observedNow / 1000;
    if (!c || c.iss !== "https://accounts.google.com" || c.aud !== OPENSWX_SCHEDULER_AUDIENCE || c.sub !== subject || c.email !== OPENSWX_SCHEDULER_EMAIL || c.email_verified !== true || !Number.isSafeInteger(c.exp) || c.exp! <= seconds || !Number.isSafeInteger(c.iat) || c.iat! > seconds + 30 || c.iat! < seconds - 3600 || c.exp! - c.iat! > 3600) return denied("OPENSWX_SCHEDULER_FORBIDDEN");
    const scheduleTime = request.headers.get("x-cloudscheduler-scheduletime");
    const scheduled = scheduleTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(scheduleTime) ? Date.parse(scheduleTime) : NaN;
    if (!Number.isFinite(scheduled) || scheduled < observedNow - 60_000 || scheduled > observedNow + 5000) return denied("OPENSWX_SCHEDULER_STALE");
    return null;
  } catch { return denied("OPENSWX_SCHEDULER_FORBIDDEN"); }
}
