import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { claimPreviewJob, createPreviewWorkerShutdown, runClaimedPreviewJob } from "../../scripts/lib/preview-worker-lease.mjs";
const basis = { companyId: "company-one", sourceFileAssetId: "asset-one", sourceContentHash: "a".repeat(64),
  attemptCount: 1, lockedAt: "2026-10-23T00:00:00.000Z" };
const claim = { jobId: "job-one", sourceFileAssetId: basis.sourceFileAssetId, sourceContentHash: basis.sourceContentHash, leaseBasis: basis };
const input = { baseUrl: "https://pdm.test", workerId: "worker-one", token: "synthetic-only", supportedExtensions: ["slddrw"] };
function deferred() { let resolve!: (value?: unknown) => void; const promise = new Promise(res => { resolve = res; }); return { promise, resolve }; }
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
it.each([{ job: null }, { leaseProtocolVersion: 1, job: null }, { leaseProtocolVersion: 2, job: {} }])(
  "rejects an old/malformed server rather than treating it as idle: %j", async body => {
    const request = vi.fn(async () => Response.json(body));
    await expect(claimPreviewJob({ ...input, request })).rejects.toMatchObject({ code: "PREVIEW_WORKER_CONFIGURATION_ERROR" });
    expect(request).toHaveBeenCalledOnce();
  });
it("stops on protocol 400 and sends the exact version on valid claims including idle", async () => {
  const request = vi.fn(async (_url: string, _options: RequestInit) => Response.json({ error: "WORKLOAD_LEASE_PROTOCOL_REQUIRED" }, { status: 400 }));
  await expect(claimPreviewJob({ ...input, request })).rejects.toMatchObject({ code: "PREVIEW_WORKER_CONFIGURATION_ERROR" });
  expect(request).toHaveBeenCalledOnce();
  request.mockResolvedValueOnce(Response.json({ leaseProtocolVersion: 2, job: null }));
  expect(await claimPreviewJob({ ...input, request })).toBeNull();
  const options = request.mock.calls[1][1] as unknown as RequestInit;
  expect(JSON.parse(String(options.body))).toMatchObject({ leaseProtocolVersion: 2 });
});
it.each([false, true])("SIGTERM produces one cancelled POST and no failed fallback, unknown=%j", async unknown => {
  const events = new EventEmitter(), shutdown = createPreviewWorkerShutdown(events);
  const entered = deferred(), renderDone = deferred();
  const posts: Array<Record<string, unknown>> = [];
  const request = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/complete")) { posts.push(JSON.parse(String(options.body))); if (unknown) throw new Error("ACK_LOST"); }
    return Response.json({ leaseProtocolVersion: 2, ...(url.endsWith("/heartbeat") ? { ok: true } : { accepted: true }) });
  });
  try {
    const run = runClaimedPreviewJob({ ...input, claim, shutdown, request,
      render: async () => { entered.resolve(); await renderDone.promise; return []; }, rendererFailure: () => ({ errorCode: "render_failed", errorSummary: "failed" }) });
    await entered.promise; events.emit("SIGTERM"); renderDone.resolve();
    expect((await run).status).toBe(unknown ? "unconfirmed" : "cancelled");
    expect(posts).toEqual([{ workerId: input.workerId, leaseProtocolVersion: 2, leaseBasis: basis, status: "cancelled", cancelReason: "operator_shutdown" }]);
    await vi.advanceTimersByTimeAsync(60000); expect(posts).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  } finally { shutdown.dispose(); }
  expect(events.listenerCount("SIGTERM")).toBe(0);
});
it("preserves renderer failure even if shutdown arrives during error reporting", async () => {
  const events = new EventEmitter(), shutdown = createPreviewWorkerShutdown(events);
  const reporting = deferred(), reported = deferred(); const posts: Array<Record<string, unknown>> = [];
  try {
    const run = runClaimedPreviewJob({ ...input, claim, shutdown,
      request: async (url: string, options: RequestInit) => { if (url.endsWith("/complete")) posts.push(JSON.parse(String(options.body))); return Response.json({ leaseProtocolVersion: 2, ...(url.endsWith("/heartbeat") ? { ok: true } : { accepted: true }) }); },
      render: async () => { throw new Error("RENDERER_TIMEOUT"); },
      rendererFailure: async () => { reporting.resolve(); await reported.promise; return { errorCode: "renderer_timeout", errorSummary: "Timeout" }; } });
    await reporting.promise; events.emit("SIGINT"); reported.resolve();
    expect((await run).status).toBe("failed"); expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ status: "failed", errorCode: "renderer_timeout", leaseBasis: basis });
  } finally { shutdown.dispose(); }
});
it("does not send failed after a successful completion loses its acknowledgement", async () => {
  const shutdown = createPreviewWorkerShutdown(new EventEmitter()); let completions = 0;
  try {
    const result = await runClaimedPreviewJob({ ...input, claim, shutdown, render: async () => [],
      rendererFailure: () => { throw new Error("must not run"); }, request: async (url: string) => {
        if (url.endsWith("/complete")) { completions++; throw new Error("ACK_LOST"); } return Response.json({ ok: true, leaseProtocolVersion: 2 }); } });
    expect(result.status).toBe("unconfirmed"); expect(completions).toBe(1); expect(vi.getTimerCount()).toBe(0);
  } finally { shutdown.dispose(); }
});

it.each([409, 500, "network", "malformed"])("aborts render and never sends terminal after heartbeat loses certainty: %j",async failure=>{
 const shutdown=createPreviewWorkerShutdown(new EventEmitter());let aborted=false;let terminals=0;
 try{
  const result=await runClaimedPreviewJob({...input,claim,shutdown,request:async(url:string)=>{
   if(url.endsWith("/complete")){terminals++;return Response.json({accepted:true})}
   if(failure==="network")throw new Error("lost heartbeat");
   return Response.json(failure==="malformed"?{}:{error:"lost"},{status:typeof failure==="number"?failure:200});
  },render:async(signal:AbortSignal)=>{signal.throwIfAborted();return new Promise<unknown[]>((_resolve,reject)=>signal.addEventListener("abort",()=>{aborted=true;reject(signal.reason)},{once:true}))},
  rendererFailure:()=>{throw new Error("must not send failed")}});
  expect(result.status).toBe("unconfirmed");expect(aborted).toBe(true);expect(terminals).toBe(0);expect(vi.getTimerCount()).toBe(0);
 }finally{shutdown.dispose()}
});

it.each([500,"network"])("never blindly retries an unknown claim write outcome: %j",async outcome=>{
 const request=vi.fn(async()=>{if(outcome==="network")throw new Error("lost claim ack");return Response.json({}, {status:500})});
 await expect(claimPreviewJob({...input,request})).rejects.toMatchObject({code:"PREVIEW_WORKER_CONFIGURATION_ERROR"});expect(request).toHaveBeenCalledOnce();
});

it.each(["not-json","null","[]"])("stops an unconfirmed successful claim body instead of retrying: %s",async body=>{
 const request=vi.fn(async()=>new Response(body,{status:200}));
 await expect(claimPreviewJob({...input,request})).rejects.toMatchObject({code:"PREVIEW_WORKER_CONFIGURATION_ERROR"});expect(request).toHaveBeenCalledOnce();
});

it.each([undefined, 1, "2", null])("stops rendering without a terminal write when heartbeat version echo is invalid: %j", async leaseProtocolVersion => {
  const shutdown = createPreviewWorkerShutdown(new EventEmitter());
  let aborted = false; let terminals = 0;
  try {
    const result = await runClaimedPreviewJob({ ...input, claim, shutdown,
      request: async (url: string) => {
        if (url.endsWith("/complete")) { terminals++; return Response.json({ accepted: true, leaseProtocolVersion: 2 }); }
        return Response.json({ ok: true, leaseProtocolVersion });
      },
      render: async (signal: AbortSignal) => new Promise<unknown[]>((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
      }), rendererFailure: () => { throw new Error("must not send failed"); }
    });
    expect(result).toMatchObject({ status: "unconfirmed", reason: "heartbeat_unconfirmed" });
    expect(aborted).toBe(true); expect(terminals).toBe(0); expect(vi.getTimerCount()).toBe(0);
  } finally { shutdown.dispose(); }
});
it.each([undefined, 1, "2", null])("does not retry or send failed when completion version echo is invalid: %j", async leaseProtocolVersion => {
  const shutdown = createPreviewWorkerShutdown(new EventEmitter());
  const posts: Array<Record<string, unknown>> = [];
  try {
    const result = await runClaimedPreviewJob({ ...input, claim, shutdown, render: async () => [],
      request: async (url: string, options: RequestInit) => {
        if (url.endsWith("/heartbeat")) return Response.json({ ok: true, leaseProtocolVersion: 2 });
        posts.push(JSON.parse(String(options.body)));
        return Response.json({ accepted: true, leaseProtocolVersion });
      }, rendererFailure: () => { throw new Error("must not send failed"); }
    });
    expect(result.status).toBe("unconfirmed"); expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ status: "succeeded", leaseProtocolVersion: 2 });
    await vi.advanceTimersByTimeAsync(60000); expect(posts).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  } finally { shutdown.dispose(); }
});

it("stops without completion when content negotiation fails before rendering", async () => {
  const shutdown = createPreviewWorkerShutdown(new EventEmitter()); let terminals = 0;
  try {
    const result = await runClaimedPreviewJob({ ...input, claim, shutdown,
      request: async (url: string) => { if (url.endsWith("/complete")) terminals++; return Response.json({ ok: true, leaseProtocolVersion: 2 }); },
      render: async () => { throw Object.assign(new Error("content protocol mismatch"), { code: "PREVIEW_WORKER_CONFIGURATION_ERROR" }); },
      rendererFailure: () => { throw new Error("must not send failed"); }
    });
    expect(result).toMatchObject({ status: "unconfirmed", reason: "protocol_mismatch" });
    expect(terminals).toBe(0); expect(vi.getTimerCount()).toBe(0);
  } finally { shutdown.dispose(); }
});
