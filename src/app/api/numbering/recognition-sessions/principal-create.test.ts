import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const mocks = vi.hoisted(() => ({ access: vi.fn(), guard: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.access
}));
vi.mock("@/lib/drawing-recognition-principal-mutation", () => ({
  withPrincipalDrawingRecognitionMutation: mocks.guard
}));
vi.mock("@/lib/drawing-recognition", () => ({
  createDrawingRecognitionSession: mocks.create
}));

import { POST } from "@/app/api/numbering/recognition-sessions/route";

const snapshot = { kind: "postgres", transactionScope: "postgres" } as AsyncDatabaseClient;
const metadata = { actor: { principalId: "principal-one", pdmUserId: "profile-one" } };
function request() {
  return new Request("https://ai-pdm.test/api/numbering/recognition-sessions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceContextType: "drawing_number", sourceContextId: "drawing-one" })
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function dispatch(request: Request) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
  expect(middleware(new NextRequest(request.clone())).headers.get("x-middleware-next")).toBe("1");
  return request;
}

function diagnostic(response: Response, stage: string, reason: string) {
  expect(console.warn).toHaveBeenCalledTimes(1);
  const args = vi.mocked(console.warn).mock.calls[0];
  expect(args).toHaveLength(1);
  const event = JSON.parse(String(args[0]));
  expect(event).toEqual({severity: "WARNING", event: "recognition_create_denied", stage, reason, requestId: expect.any(String)});
  expect(event.requestId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u);
  expect(response.headers.get("x-recognition-request-id")).toBe(event.requestId);
  return event;
}

describe("recognition queue entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.access.mockResolvedValue({ response: null,
      actor: { pdmUserId: "profile-one" }, company: { companyId: "company-one" }, metadata });
    mocks.create.mockResolvedValue({ id: "recognition-one" });
    mocks.guard.mockImplementation(async (input) => input.execute(snapshot, {
      allowed: true, principalId: "principal-one", permissionCode: "numbering.recognition.run"
    }, { session: { principalId: "principal-one" } }));
  });

  it("queues in the same write snapshot that rechecked the verified Principal grant", async () => {
    const response = await POST(dispatch(request()));
    expect(response.status).toBe(201);
    expect(mocks.guard).toHaveBeenCalledWith(expect.objectContaining({
      metadata, permissionCode: "numbering.recognition.run",
      actorId: "profile-one", companyId: "company-one"
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "profile-one", companyId: "company-one", client: snapshot,
      initiatorPrincipalId: "principal-one"
    }));
  });

  it("does not queue after the grant is revoked in the write snapshot", async () => {
    mocks.guard.mockRejectedValueOnce(new DrawingRecognitionError(
      "RECOGNITION_PERMISSION_DENIED", "目前帳號沒有此辨識操作權限。", 403));
    const response = await POST(dispatch(request()));
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("emits one sanitized diagnosis for an initial run denial and preserves its response", async () => {
    mocks.access.mockResolvedValueOnce({response: Response.json({error:"permission_not_granted"},
      {status:403,headers:{"cache-control":"no-store"}}),company:null,actor:null,metadata:null});
    const response=await POST(dispatch(request()));
    expect(response.status).toBe(403);expect(await response.json()).toEqual({error:"permission_not_granted"});
    expect(response.headers.get("cache-control")).toBe("no-store");
    diagnostic(response,"initial_guard","permission_not_granted");
    expect(mocks.guard).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();
  });
  it("records the existing initial actor-company mismatch as a closed reason",async()=>{
    mocks.access.mockResolvedValueOnce({response:Response.json({error:"platform_actor_company_mismatch"},{status:403}),company:null,actor:null});
    const response=await POST(request());expect(response.status).toBe(403);
    diagnostic(response,"initial_guard","platform_actor_company_mismatch");
    expect(mocks.guard).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not copy an unknown guard message or caller correlation ID into its diagnostic", async () => {
    const value="NEVER_LOG_TOKEN_OR_IDENTITY";
    mocks.access.mockResolvedValueOnce({response:Response.json({error:value},{status:403}),company:null,actor:null});
    const input=request();input.headers.set("x-request-id",value);
    const response=await POST(input);
    const event=diagnostic(response,"initial_guard","unclassified_denial");
    expect(JSON.stringify(event)).not.toContain(value);expect(event.requestId).not.toBe(value);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["RECOGNITION_PERMISSION_DENIED","RECOGNITION_REQUEST_PROOF_INVALID","RECOGNITION_VERIFIED_ACTOR_MISMATCH"])("records write snapshot %s once without queueing",async code=>{
    mocks.guard.mockRejectedValueOnce(new DrawingRecognitionError(code,"Fixed public message",403));
    const response=await POST(request());expect(response.status).toBe(403);
    diagnostic(response,"write_snapshot",code);expect(mocks.create).not.toHaveBeenCalled();
  });
  it("identifies a business-stage initiator rejection without logging identity",async()=>{
    mocks.create.mockRejectedValueOnce(new DrawingRecognitionError("RECOGNITION_PRINCIPAL_REQUIRED","Principal required",403));
    const response=await POST(request());expect(response.status).toBe(403);
    diagnostic(response,"business","RECOGNITION_PRINCIPAL_REQUIRED");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it.each([401,503])("does not label status %s as a permission denial",async status=>{
    mocks.access.mockResolvedValueOnce({response:Response.json({code:"service_or_session_failure"},{status}),company:null,actor:null});
    const response=await POST(request());expect(response.status).toBe(status);
    expect(console.warn).not.toHaveBeenCalled();expect(response.headers.get("x-recognition-request-id")).toBeNull();
    expect(mocks.guard).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not emit a denial on success",async()=>{
    const response=await POST(request());expect(response.status).toBe(201);
    expect(console.warn).not.toHaveBeenCalled();expect(response.headers.get("x-recognition-request-id")).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

});
