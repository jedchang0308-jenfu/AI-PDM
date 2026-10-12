import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0,
  effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.slots)) hooks.slots[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [hooks.slots[i], (next: unknown) => {
      hooks.slots[i] = typeof next === "function" ? (next as (old: unknown) => unknown)(hooks.slots[i]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.slots)) hooks.slots[i] = { current: initial };
    return hooks.slots[i];
  },
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect)
}));
vi.mock("@/components/drawing-recognition-pdf-ocr", () => ({useDrawingRecognitionBrowserOcr: () => {}}));
import { DrawingRecognitionWorkspacePanel } from "./drawing-recognition-workspace-panel";
const props = {drawingNumber: "drawing-one", sourceContextType: "drawing_revision" as const,
  sourceContextId: "revision-one", sourceAssetIds: ["asset-one"], auxiliarySourceAssetIds: []};
function render(input = props) { hooks.cursor=0; hooks.effects=[]; return DrawingRecognitionWorkspacePanel(input); }
function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (React.isValidElement<{children?: React.ReactNode}>(node)) return text(node.props.children);
  return "";
}
const reply = (status: number, body: object) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json"}});
let cleanups: Array<() => void> = [];
async function load(fetcher: ReturnType<typeof vi.fn>, input = props) {
  vi.stubGlobal("fetch",fetcher);render(input);
  for (const effect of hooks.effects) {const cleanup=effect();if(typeof cleanup==="function")cleanups.push(cleanup);}
  await vi.waitFor(() => expect(text(render(input))).not.toContain("正在讀取辨識結果"));
  return text(render(input));
}
beforeEach(() => {hooks.slots=[];hooks.cursor=0;hooks.effects=[];cleanups=[];});
afterEach(() => {for(const cleanup of cleanups)cleanup();vi.unstubAllGlobals();});
describe("B43 original panel request-stage contract, captured hooks (not mounted/native evidence)", () => {
  it("reports actual review GET denial without starting a new recognition", async () => {
    const fetcher=vi.fn(async()=>reply(403,{error:"permission_not_granted"}));
    const html=await load(fetcher);
    expect(html).toContain("目前無辨識核對權限");expect(fetcher).toHaveBeenCalledTimes(1);
    expect(html).not.toContain("目前無法啟動智慧辨識");
  });
  it("reports run/create denial separately after a successful review read", async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(reply(200,{session:null,feature:{enabled:true}}))
      .mockResolvedValueOnce(reply(403,{error:"permission_not_granted"}));
    const html=await load(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(html).toContain("目前無法啟動智慧辨識");
    expect(html).not.toContain("目前無辨識核對權限");
  });
  it("uses a non-enumerating result access message for session forbidden", async () => {
    const fetcher=vi.fn(async()=>reply(403,{error:{code:"RECOGNITION_SESSION_FORBIDDEN",message:"DO_NOT_ECHO_IDENTITY"}}));
    const html=await load(fetcher);
    expect(html).toContain("目前無法讀取辨識結果");
    expect(html).not.toMatch(/目前無辨識核對權限|DO_NOT_ECHO_IDENTITY/u);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["RECOGNITION_REQUEST_PROOF_INVALID","RECOGNITION_VERIFIED_ACTOR_MISMATCH","platform_actor_company_mismatch"])("does not mislabel %s as missing review permission",async code=>{
    const fetcher=vi.fn().mockResolvedValueOnce(reply(200,{session:null}))
      .mockResolvedValueOnce(reply(403,{error:{code,message:"DO_NOT_ECHO_IDENTITY"}}));
    const html=await load(fetcher);
    expect(html).toContain("辨識驗證未通過");
    expect(html).not.toMatch(/目前無辨識核對權限|DO_NOT_ECHO_IDENTITY/u);
  });
  it("does not infer a missing grant from an unknown run denial",async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(reply(200,{session:null}))
      .mockResolvedValueOnce(reply(403,{error:"UNTRUSTED_REASON"}));
    const html=await load(fetcher);
    expect(html).toContain("目前無法啟動智慧辨識");
    expect(html).not.toMatch(/請管理員確認此工作區|無辨識核對權限|UNTRUSTED_REASON/u);
  });
  it("clears an old denial when a new source context loads successfully (captured effect replay)",async()=>{
    expect(await load(vi.fn(async()=>reply(403,{error:"permission_not_granted"})))).toContain("目前無辨識核對權限");
    const html=await load(vi.fn(async()=>reply(200,{session:null,feature:{enabled:false}})),
      {...props,sourceContextId:"revision-two"});
    expect(html).not.toMatch(/無辨識核對權限|目前無法讀取辨識結果/u);
    expect(html).toContain("智慧辨識尚未啟用");
  });
  it("does not diagnose an unknown 403 as a role or grant failure",async()=>{
    const html=await load(vi.fn(async()=>reply(403,{error:"UNTRUSTED_REASON"})));
    expect(html).toContain("目前無法讀取辨識結果");
    expect(html).not.toMatch(/無辨識核對權限|UNTRUSTED_REASON/u);
  });
});
