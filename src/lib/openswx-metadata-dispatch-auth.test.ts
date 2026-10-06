import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { describe, expect, it } from "vitest";
import { authenticateOpenSwxScheduler, OPENSWX_SCHEDULER_AUDIENCE as audience, OPENSWX_SCHEDULER_EMAIL as email, OPENSWX_SCHEDULER_SUBJECT as fixedSubject } from "./openswx-metadata-dispatch-auth";
// Real RSA verification with a local cert fixture, not Google/provider identity evidence.
const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const subject = fixedSubject, now = Date.now(), seconds = Math.floor(now / 1000);
const claims = { iss: "https://accounts.google.com", sub: subject, email, email_verified: true, aud: audience, iat: seconds, exp: seconds + 3600 };
function token(overrides = {}, key = keys.privateKey) {
  const input = [{ alg: "RS256", kid: "fixture" }, { ...claims, ...overrides }].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
  return `${input}.${crypto.sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
}
const oauth = new OAuth2Client();
const verify = async (jwt: string) => (await oauth.verifySignedJwtWithCertsAsync(jwt, { fixture: keys.publicKey.export({ format: "pem", type: "spki" }).toString() }, audience, ["https://accounts.google.com"])).getPayload();
const request = (jwt = token(), cookie = false, scheduleTime: string | null = new Date(now).toISOString()) => new Request(`${audience}/api/openswx-metadata-dispatch/recover`, { method: "POST", headers: { authorization: `Bearer ${jwt}`, ...(scheduleTime ? { "x-cloudscheduler-scheduletime": scheduleTime } : {}), ...(cookie ? { cookie: "pdm_session=fixture" } : {}) } });
describe("OpenSWX Scheduler signature and exact purpose", () => {
  it("accepts the fixed verified identity through the production default without an environment setting", async () => {
    const previous = process.env.PDM_OPENSWX_SCHEDULER_SUBJECT;
    delete process.env.PDM_OPENSWX_SCHEDULER_SUBJECT;
    try { expect(await authenticateOpenSwxScheduler(request(), verify, now)).toBeNull(); }
    finally { if (previous === undefined) delete process.env.PDM_OPENSWX_SCHEDULER_SUBJECT; else process.env.PDM_OPENSWX_SCHEDULER_SUBJECT = previous; }
  });
  it("the production default rejects a signed same-email token with a different subject", async () => {
    expect((await authenticateOpenSwxScheduler(request(token({ sub: "999999999" })), verify, now))?.status).toBe(403);
  });
  it("an environment override cannot select another production scheduler identity", async () => {
    const previous = process.env.PDM_OPENSWX_SCHEDULER_SUBJECT;
    process.env.PDM_OPENSWX_SCHEDULER_SUBJECT = "999999999";
    try {
      expect(await authenticateOpenSwxScheduler(request(), verify, now)).toBeNull();
      expect((await authenticateOpenSwxScheduler(request(token({ sub: "999999999" })), verify, now))?.status).toBe(403);
    } finally { if (previous === undefined) delete process.env.PDM_OPENSWX_SCHEDULER_SUBJECT; else process.env.PDM_OPENSWX_SCHEDULER_SUBJECT = previous; }
  });
  it("freshness clock is read after the real RSA verification await", async () => {
    let clock = now;
    const delayed = async (jwt: string) => { const signed = await verify(jwt); clock += 60_001; return signed; };
    expect((await authenticateOpenSwxScheduler(request(), delayed, () => clock, subject))?.status).toBe(403);
  });
  it("signed identity still rejects absent/stale/future schedule time", async () => {
    for (const value of [null, "invalid", new Date(now - 60_001).toISOString(), new Date(now + 5001).toISOString()]) expect((await authenticateOpenSwxScheduler(request(token(), false, value), verify, now, subject))?.status).toBe(403);
    for (const value of [new Date(now - 60_000).toISOString(), new Date(now + 5000).toISOString()]) expect(await authenticateOpenSwxScheduler(request(token(), false, value), verify, now, subject)).toBeNull();
  });
  it("rejects actual bad signature", async () => { const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }); expect((await authenticateOpenSwxScheduler(request(token({}, other.privateKey)), verify, now, subject))?.status).toBe(403); });
  it("rejects issuer/audience/subject/email/expiry drift", async () => {
    for (const bad of [{ iss: "accounts.google.com" }, { aud: audience + "/" }, { sub: "999999999" }, { email: "other@jenfu-platform-prod.iam.gserviceaccount.com" }, { email_verified: false }, { exp: seconds - 1 }, { iat: seconds + 90 }]) expect((await authenticateOpenSwxScheduler(request(token(bad)), verify, now, subject))?.status).toBe(403);
  });
  it("unknown subject, reader bearer and cookie reject before signature fetch", async () => {
    let calls = 0; const unused = async () => { calls++; return claims; };
    expect((await authenticateOpenSwxScheduler(request(), unused, now, ""))?.status).toBe(503);
    expect((await authenticateOpenSwxScheduler(request("x".repeat(43)), unused, now, subject))?.status).toBe(403);
    expect((await authenticateOpenSwxScheduler(request(token(), true), unused, now, subject))?.status).toBe(403);
    expect(calls).toBe(0);
  });
});
