import { afterEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(()=>({effects:[] as Array<()=>void|(()=>void)>,states:[] as unknown[]}));
vi.mock("react",()=>({useState:(initial:unknown)=>[initial,(value:unknown)=>hooks.states.push(value)],useEffect:(effect:()=>void|(()=>void))=>hooks.effects.push(effect)}));
vi.mock("@/components/pdf-page-viewport",()=>({PdfPageViewport:()=>null}));
import { CanonicalPreviewMedia, canonicalPreviewResponseDisposition } from "@/components/canonical-preview-media";
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();hooks.effects.length=0;hooks.states.length=0;});

describe("DEV122 mounted canonical preview polling contract", () => {
  it("polls only an explicit pending 202 with a safe retryable envelope", () => {
    expect(canonicalPreviewResponseDisposition(202, "pending", { error: { retryable: true } })).toBe("pending");
  });
  it.each([
    [409, "failed", { error: { retryable: false } }],
    [409, "cancelled", { error: { retryable: false } }],
    [422, "unsupported", { error: { retryable: false } }],
    [409, "failed", { error: { retryable: true } }],
    [503, "pending", { error: { retryable: true } }],
    [202, "pending", null],
    [202, "pending", { error: { retryable: "true" } }],
    [202, null, { error: { retryable: true } }]
  ])("stops on terminal or malformed response %s/%s", (status, state, body) => {
    expect(canonicalPreviewResponseDisposition(status as number, state as string | null, body)).toBe("terminal");
  });
  // The native Next/browser gate verifies two real 2-second periods, download
  // availability and gallery rendering; these focused cases cannot substitute it.
});

describe("DEV122 original preview effect timer layer; captured React hooks, not DOM or native route evidence",()=>{
  it.each([true,false])("interactive=%s stops after exactly 30 scheduled pending retries",async interactive=>{
    vi.useFakeTimers();const fetch=vi.fn(async()=>new Response(JSON.stringify({error:{retryable:true}}),{status:202,headers:{"x-pdm-preview-state":"pending"}}));vi.stubGlobal("fetch",fetch);
    CanonicalPreviewMedia({media:{href:"/dev122-owned-pending",mode:"image",title:"Timer fixture"},interactive});
    expect(hooks.effects).toHaveLength(1);const cleanup=hooks.effects[0]();
    await vi.advanceTimersByTimeAsync(0);expect(fetch).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);expect(fetch).toHaveBeenCalledTimes(31);expect(vi.getTimerCount()).toBe(0);expect(hooks.states.at(-1)).toBe("failed");
    await vi.advanceTimersByTimeAsync(120_000);expect(fetch).toHaveBeenCalledTimes(31);
    if(typeof cleanup==="function")cleanup();
  });
  it.each([true,false])("interactive=%s unmount clears its pending retry without another request or state mutation",async interactive=>{
    vi.useFakeTimers();const fetch=vi.fn(async()=>new Response(JSON.stringify({error:{retryable:true}}),{status:202,headers:{"x-pdm-preview-state":"pending"}}));vi.stubGlobal("fetch",fetch);
    CanonicalPreviewMedia({media:{href:"/dev122-owned-unmount",mode:"image",title:"Unmount fixture"},interactive});
    const cleanup=hooks.effects[0]();await vi.advanceTimersByTimeAsync(0);expect(fetch).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(1);
    const states=[...hooks.states];expect(typeof cleanup).toBe("function");if(typeof cleanup==="function")cleanup();
    expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(120_000);expect(fetch).toHaveBeenCalledTimes(1);expect(hooks.states).toEqual(states);
  });
});
