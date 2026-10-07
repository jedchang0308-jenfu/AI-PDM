import crypto from "node:crypto";
import { Readable } from "node:stream";
import NextNodeServer from "next/dist/server/next-server";
import { NodeNextRequest } from "next/dist/server/base-http/node";
import { NextRequestAdapter } from "next/dist/server/web/spec-extension/adapters/next-request";
import { OAuth2Client } from "google-auth-library";
import { describe, expect, it, vi } from "vitest";
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
  const internalRequest = (url = "https://0.0.0.0:8080", overrides: Partial<Record<string, string | null>> = {}, jwt = token()) => {
    const headers = new Headers({ host: new URL(audience).host, "x-forwarded-proto": "https", authorization: `Bearer ${jwt}`, "x-cloudscheduler-scheduletime": new Date(now).toISOString() });
    for (const [name, value] of Object.entries(overrides)) { if (value === undefined) continue; if (value === null) headers.delete(name); else headers.set(name, value); }
    return new Request(url + "/api/openswx-metadata-dispatch/recover", { method: "POST", headers });
  };
  async function inCloudRun(run: () => Promise<void>) {
    const service = process.env.K_SERVICE, port = process.env.PORT;
    process.env.K_SERVICE = "ai-pdm-prod"; process.env.PORT = "8080";
    try { await run(); }
    finally { if (service === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = service; if (port === undefined) delete process.env.PORT; else process.env.PORT = port; }
  }
  it("rejects mismatched runtime and canonical transport before Google verification", async () => {
    await inCloudRun(async () => {
      let calls = 0; const unused = async () => { calls++; return claims; };
      for (const overrides of [{ host: null }, { host: "foreign.example" }, { host: new URL(audience).host + ",foreign.example" }, { "x-forwarded-proto": null }, { "x-forwarded-proto": "http" }, { "x-forwarded-proto": "https,http" }]) expect((await authenticateOpenSwxScheduler(internalRequest(undefined, overrides), unused, now))?.status).toBe(403);
      for (const url of ["http://0.0.0.0:8080", "https://0.0.0.0:8081", "https://localhost:8080", "https://127.0.0.1:8080", "https://foreign.example"]) expect((await authenticateOpenSwxScheduler(internalRequest(url), unused, now))?.status).toBe(403);
      for (const [service, port] of [["other-service", "8080"], ["", "8080"], ["ai-pdm-prod", "3000"], ["ai-pdm-prod", ""]]) { process.env.K_SERVICE = service; process.env.PORT = port; expect((await authenticateOpenSwxScheduler(internalRequest(), unused, now))?.status).toBe(403); }
      expect(calls).toBe(0);
    });
  });
  it("a canonical URL cannot hide conflicting Host or protocol headers", async () => {
    let calls = 0; const unused = async () => { calls++; return claims; };
    for (const overrides of [{ host: "foreign.example" }, { host: new URL(audience).host + ",foreign.example" }, { "x-forwarded-proto": "http" }, { "x-forwarded-proto": "https,http" }]) expect((await authenticateOpenSwxScheduler(internalRequest(audience, overrides), unused, now))?.status).toBe(403);
    expect(calls).toBe(0);
  });
  it("forwarded host cannot replace the incoming canonical Host", async () => {
    await inCloudRun(async () => {
      for (const host of [null, "foreign.example"]) expect((await authenticateOpenSwxScheduler(internalRequest(undefined, { host, "x-forwarded-host": new URL(audience).host }), verify, now))?.status).toBe(403);
    });
  });
  it("the standalone transport still requires valid RSA, fixed claims and schedule freshness", async () => {
    await inCloudRun(async () => {
      expect(await authenticateOpenSwxScheduler(internalRequest(), verify, now)).toBeNull();
      const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      expect((await authenticateOpenSwxScheduler(internalRequest(undefined, {}, token({}, other.privateKey)), verify, now))?.status).toBe(403);
      for (const bad of [{ aud: audience + "/" }, { sub: "999999999" }, { email: "other@jenfu-platform-prod.iam.gserviceaccount.com" }, { email_verified: false }, { exp: seconds - 1 }]) expect((await authenticateOpenSwxScheduler(internalRequest(undefined, {}, token(bad)), verify, now))?.status).toBe(403);
      for (const scheduleTime of [null, new Date(now - 60001).toISOString(), new Date(now + 5001).toISOString()]) expect((await authenticateOpenSwxScheduler(internalRequest(undefined, { "x-cloudscheduler-scheduletime": scheduleTime }), verify, now))?.status).toBe(403);
      expect((await authenticateOpenSwxScheduler(internalRequest(undefined, { cookie: "fixture" }), verify, now))?.status).toBe(403);
    });
  });

  it("accepts the canonical Scheduler destination through the installed standalone adapter", async () => {
    const originalService = process.env.K_SERVICE, originalPort = process.env.PORT;
    process.env.K_SERVICE = "ai-pdm-prod"; process.env.PORT = "8080";
    try {
      const incoming = Object.assign(Readable.from([Buffer.from("{}")]), {
        method: "POST", url: "/api/openswx-metadata-dispatch/recover",
        headers: { host: new URL(audience).host, "x-forwarded-proto": "https", authorization: `Bearer ${token()}`, "x-cloudscheduler-scheduletime": new Date(now).toISOString() }
      });
      // Use the installed production adapter and the exact Docker hostname/port.
      const nodeRequest = new NodeNextRequest(incoming as never);
      const server = { fetchHostname: "0.0.0.0", port: 8080, nextConfig: { experimental: { trustHostHeader: false } } };
      Reflect.apply(Reflect.get(NextNodeServer.prototype, "attachRequestMeta"), server, [nodeRequest, { query: {} }, false]);
      const adapted = NextRequestAdapter.fromNodeNextRequest(nodeRequest, new AbortController().signal);
      expect(new URL(adapted.url).origin).toBe("https://0.0.0.0:8080");
      expect(adapted.headers.get("host")).toBe(new URL(audience).host);
      let verified = 0;
      const signed = async (jwt: string) => { verified++; return verify(jwt); };
      expect(await authenticateOpenSwxScheduler(adapted, signed, now)).toBeNull();
      expect(verified).toBe(1);
    } finally {
      if (originalService === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = originalService;
      if (originalPort === undefined) delete process.env.PORT; else process.env.PORT = originalPort;
    }
  });
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

describe("OpenSWX strict RFC3339 schedule instant", () => {
  const encoded = (millis: number, offsetMinutes: number, extraNanos = 0n) => {
    const nanos = BigInt(millis) * 1_000_000n + extraNanos;
    const local = new Date(Number(nanos / 1_000_000_000n) * 1000 + offsetMinutes * 60_000).toISOString().slice(0, 19);
    const magnitude = Math.abs(offsetMinutes), offset = `${offsetMinutes < 0 ? "-" : "+"}${String(Math.floor(magnitude / 60)).padStart(2, "0")}:${String(magnitude % 60).padStart(2, "0")}`;
    return `${local}.${String(nanos % 1_000_000_000n).padStart(9, "0")}${offset}`;
  };
  it("accepts equivalent signed UTC and positive/negative offset instants", async () => {
    for (const offset of [0, 480, -240]) expect(await authenticateOpenSwxScheduler(request(token(), false, encoded(now, offset)), verify, now)).toBeNull();
    const base = new Date(Math.floor(now / 1000) * 1000).toISOString().slice(0, 19);
    for (let digits = 1; digits <= 9; digits++) expect(await authenticateOpenSwxScheduler(request(token(), false, `${base}.${"1".repeat(digits)}Z`), verify, now)).toBeNull();
  });
  it("preserves inclusive boundaries and rejects even one nanosecond outside", async () => {
    for (const offset of [0, 480, -240]) {
      for (const boundary of [now - 60_000, now + 5000]) expect(await authenticateOpenSwxScheduler(request(token(), false, encoded(boundary, offset)), verify, now)).toBeNull();
      for (const [boundary, extra] of [[now - 60_000, -1n], [now + 5000, 1n], [now - 60_001, 0n], [now + 5001, 0n]] as const) expect((await authenticateOpenSwxScheduler(request(token(), false, encoded(boundary, offset, extra)), verify, now))?.status).toBe(403);
    }
  });
  it("accepts offset headers through the installed standalone adapter with real RSA", async () => {
    const service = process.env.K_SERVICE, port = process.env.PORT;
    process.env.K_SERVICE = "ai-pdm-prod"; process.env.PORT = "8080";
    try {
      for (const offset of [0, 480, -240]) {
        const incoming = Object.assign(Readable.from([Buffer.from("{}")]), { method: "POST", url: "/api/openswx-metadata-dispatch/recover", headers: { host: new URL(audience).host, "x-forwarded-proto": "https", authorization: `Bearer ${token()}`, "x-cloudscheduler-scheduletime": encoded(now, offset) } });
        const nodeRequest = new NodeNextRequest(incoming as never);
        Reflect.apply(Reflect.get(NextNodeServer.prototype, "attachRequestMeta"), { fetchHostname: "0.0.0.0", port: 8080, nextConfig: { experimental: { trustHostHeader: false } } }, [nodeRequest, { query: {} }, false]);
        const adapted = NextRequestAdapter.fromNodeNextRequest(nodeRequest, new AbortController().signal);
        expect(await authenticateOpenSwxScheduler(adapted, verify, now)).toBeNull();
      }
    } finally { if (service === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = service; if (port === undefined) delete process.env.PORT; else process.env.PORT = port; }
  });
  it("fails closed on malformed dates, offsets and lists with only safe categories", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cases: Array<[string | null, string]> = [
      [null, "MISSING"], ["", "MISSING"], ["B17_PRIVATE_SENTINEL", "FORMAT"], ["2026-10-07T08:55:00.Z", "FORMAT"], ["2026-10-07T08:55:00+8:00", "FORMAT"], ["2026-10-07T08:55:00+0800", "FORMAT"], ["2026-10-07T08:55:00*08:00", "FORMAT"], ["2026-10-07T08:55:61Z", "INVALID_TIMESTAMP"], ["2026-10-07T08:55:00", "FORMAT"], ["2026-10-07T08:55:00Z,2026-10-07T08:55:00Z", "FORMAT"], ["2026-10-07T08:55:00.1234567890Z", "FORMAT"],
      ["2026-02-30T08:55:00Z", "INVALID_TIMESTAMP"], ["2025-02-29T08:55:00Z", "INVALID_TIMESTAMP"], ["2026-13-01T08:55:00Z", "INVALID_TIMESTAMP"], ["2026-10-00T08:55:00Z", "INVALID_TIMESTAMP"], ["2026-10-07T24:55:00Z", "INVALID_TIMESTAMP"], ["2026-10-07T08:60:00Z", "INVALID_TIMESTAMP"], ["2026-10-07T08:55:60Z", "INVALID_TIMESTAMP"],
      ["2026-10-07T08:55:00+24:00", "INVALID_TIMESTAMP"], ["2026-10-07T08:55:00+00:60", "INVALID_TIMESTAMP"], ["2026-10-07T08:55:00-00:00", "INVALID_TIMESTAMP"], [encoded(now - 60_000, 480, -1n), "TOO_OLD"], [encoded(now + 5000, -240, 1n), "TOO_FUTURE"]
    ];
    try {
      for (const [value, category] of cases) {
        warn.mockClear(); const current = request(token(), false, value); if (value === "") current.headers.set("x-cloudscheduler-scheduletime", ""); const response = await authenticateOpenSwxScheduler(current, verify, now);
        expect(response?.status).toBe(403); expect(await response?.json()).toEqual({ code: "OPENSWX_SCHEDULER_STALE" });
        expect(warn).toHaveBeenCalledTimes(1); expect(JSON.parse(warn.mock.calls[0][0])).toEqual({ schemaVersion: "aipdm.openswx-scheduler-rejection.v1", reason: "schedule_time", category });
        expect(warn.mock.calls[0][0]).not.toContain("B17_PRIVATE_SENTINEL"); expect(warn.mock.calls[0][0]).not.toContain(token());
      }
      const duplicate = request(); duplicate.headers.append("x-cloudscheduler-scheduletime", new Date(now).toISOString());
      expect((await authenticateOpenSwxScheduler(duplicate, verify, now))?.status).toBe(403);
    } finally { warn.mockRestore(); }
  });
  it("rejects an invalid freshness clock rather than converting it to an instant", async () => {
    for (const clock of [NaN, Infinity, now + 0.5]) expect((await authenticateOpenSwxScheduler(request(), async () => claims, clock))?.status).toBe(403);
  });
});
