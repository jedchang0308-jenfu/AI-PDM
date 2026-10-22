import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import { isProductionSliceAllowedApiMutation, isProductionSliceOpenPagePath } from "@/lib/production-slice";
import { POST as upload } from "@/app/api/parts/[partNumber]/attachments/route";
import { DELETE as remove } from "@/app/api/parts/[partNumber]/attachments/[attachmentId]/route";
import { POST as restore } from "@/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route";
const active = { PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft" };
const recognitionCollection = "/api/numbering/recognition-sessions";
const recognitionSession = `${recognitionCollection}/recognition-fixture`;
const recognitionCommands = [
  ["POST", recognitionCollection, "numbering.recognition.run"],
  ["POST", `${recognitionSession}/reruns`, "numbering.recognition.run"],
  ["POST", `${recognitionSession}/client-adapter-results`, "numbering.recognition.run"],
  ["PATCH", `${recognitionSession}/decisions`, "numbering.recognition.review"],
  ["POST", `${recognitionSession}/amendments`, "numbering.recognition.review"],
  ["POST", `${recognitionSession}/cancel-amendment`, "numbering.recognition.review"],
  ["POST", `${recognitionSession}/write-impact`, "numbering.recognition.formalize"],
  ["POST", `${recognitionSession}/commit`, "numbering.recognition.formalize"],
  ["POST", `${recognitionSession}/formalize`, "numbering.recognition.formalize"],
  ["POST", `${recognitionSession}/handoff`, "numbering.recognition.formalize"],
] as const;

describe("Principal recognition workflow dispatch in the production slice", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["GET", "HEAD"])("dispatches the existing Principal recognition navigation page for %s", method => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
    const path = "/numbering/recognition/recognition-fixture";
    const response = middleware(new NextRequest("https://pdm.example" + path, { method }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(isProductionSliceOpenPagePath(path, { PDM_PRODUCTION_SLICE_MODE: "unknown-mode" })).toBe(false);
    for (const unrelated of ["/numbering/recognition", `${path}/extra`, "/numbering/recognition-extra/session-one"]) {
      expect(isProductionSliceOpenPagePath(unrelated, active)).toBe(false);
    }
  });

  it.each(recognitionCommands)("dispatches %s %s to its existing %s owner guard", (method, path, permission) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
    const request = new NextRequest("https://pdm.example" + path, { method });
    expect(resolveJenfuRoutePolicyFromRequest(request, permission))
      .toMatchObject({ authorizationMode: "permission", scopeResolver: "workspace" });
    const response = middleware(request);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-ai-pdm-production-slice")).toBeNull();
  });

  it.each(recognitionCommands)("keeps %s %s closed in an unknown mode", async (method, path) => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "unknown-mode");
    const response = middleware(new NextRequest("https://pdm.example" + path, { method }));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-ai-pdm-production-slice")).toBe("unknown-mode");
    expect(await response.json()).toMatchObject({ error: "feature_not_open_in_production_slice" });
  });

  it.each([
    ["PUT", recognitionCollection], ["PATCH", recognitionCollection], ["DELETE", recognitionCollection],
    ["POST", `${recognitionCollection}-extra`], ["POST", recognitionSession],
    ["POST", `${recognitionSession}/decisions`], ["DELETE", `${recognitionSession}/decisions`],
    ["PATCH", `${recognitionSession}/formalize`], ["POST", `${recognitionSession}/formalize/extra`],
    ["POST", `${recognitionSession}/unsupported`], ["POST", `${recognitionCollection}/reruns`],
    ["POST", `${recognitionSession}/sources/source-one/content`],
    ["PATCH", `${recognitionSession}/observations/observation-one`],
    ["POST", "/api/numbering/recognition-sessions-import"],
  ])("rejects unsupported %s %s before dispatch", async (method, path) => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
    const response = middleware(new NextRequest("https://pdm.example" + path, { method }));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-ai-pdm-production-slice")).toBe("blocked");
    expect(await response.json()).toMatchObject({ error: "feature_not_open_in_production_slice" });
  });
});

const commands: [string,string][] = [
 ["POST","/api/pdm/parts/part-one/change-works"], ["POST","/api/pdm/drawings/drawing-one/revision-works"],
 ["PATCH","/api/pdm/part-change-works/work-one"], ["PATCH","/api/pdm/drawing-revision-works/work-one"],
 ["POST","/api/pdm/part-change-works/work-one/submit"], ["POST","/api/pdm/part-change-works/work-one/cancel"],
 ["POST","/api/pdm/drawing-revision-works/work-one/submit"], ["POST","/api/pdm/drawing-revision-works/work-one/cancel"],
 ["POST","/api/pdm/review-requests/request-one/decisions"], ["POST","/api/pdm/drawing-revision-works/work-one/files"],
 ["DELETE","/api/pdm/drawing-revision-works/work-one/files/file-one"]
];
describe("Principal canonical work commands reach their owner boundary", () => {
 it.each(commands)("passes the real middleware for %s %s", (method,path) => {
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE","official-numbering-draft");
  try {
   const response=middleware(new NextRequest("https://pdm.example"+path,{method}));
   expect(response.headers.get("x-middleware-next")).toBe("1");
   expect(isProductionSliceAllowedApiMutation(method,path,active)).toBe(true);
   expect(isProductionSliceAllowedApiMutation(method,path,{PDM_PRODUCTION_SLICE_MODE:"unknown-mode"})).toBe(false);
  } finally { vi.unstubAllEnvs(); }
 });
 it("does not open unknown commands, wrong methods, legacy parts or obsolete paths", () => {
  for (const [method,path] of [["PUT","/api/pdm/part-change-works/work-one"],
    ["POST","/api/pdm/part-change-works/work-one/publish"], ["DELETE","/api/pdm/parts/part-one"],
    ["POST","/api/pdm/drawing-rd-branches/branch-one/void-requests"]]) {
    expect(isProductionSliceAllowedApiMutation(method,path,active)).toBe(false);
  }
 });
});

describe("Canonical work destinations use the same production entry boundary", () => {
 it.each([
  "/parts/part-one/workspace?workId=work-one",
  "/numbering/drawings/drawing-one/workspace?workId=work-one",
  "/approvals/00000000-0000-4000-8000-000000000001"
 ])("passes actual GET and HEAD middleware for %s", destination => {
  const pathname=new URL("https://pdm.example"+destination).pathname;
  expect(isProductionSliceOpenPagePath(pathname,active)).toBe(true);
  expect(isProductionSliceOpenPagePath(pathname,{PDM_PRODUCTION_SLICE_MODE:"unknown-mode"})).toBe(false);
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE","official-numbering-draft");
  try {
   for(const method of ["GET","HEAD"]) {
    const response=middleware(new NextRequest("https://pdm.example"+destination,{method}));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
   }
  } finally { vi.unstubAllEnvs(); }
 });
 it("keeps unrelated and historical destinations closed",()=>{
  for(const path of ["/parts/part-one/workspace/extra",
   "/numbering/drawings/drawing-one/admin","/approvals/APR-historical","/approvals/not-a-request"]) {
   expect(isProductionSliceOpenPagePath(path,active)).toBe(false);
  }
 });
});


describe("Principal profile provisioning reaches the existing account owner", () => {
 it("dispatches only the exact provisioning POST in the actual production mode", () => {
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
  vi.stubEnv("NODE_ENV", "production");
  try {
   const response = middleware(new NextRequest("https://pdm.example/api/admin/accounts", { method: "POST" }));
   expect(response.headers.get("x-middleware-next")).toBe("1");
   expect(response.headers.get("x-ai-pdm-production-slice")).toBeNull();
   expect(isProductionSliceAllowedApiMutation("POST", "/api/admin/accounts",
    { ...active, NODE_ENV: "production", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true" })).toBe(true);
  } finally { vi.unstubAllEnvs(); }
 });
 it.each([
  ["PUT", "/api/admin/accounts"], ["PATCH", "/api/admin/accounts"],
  ["DELETE", "/api/admin/accounts"], ["POST", "/api/admin/accounts/unknown"],
  ["POST", "/api/admin/accounts/import"], ["POST", "/api/admin/accounts-extra"]
 ])("keeps unsupported mutations blocked: %s %s", (method, path) => {
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
  try {
   expect(middleware(new NextRequest("https://pdm.example" + path, { method })).status).toBe(403);
  } finally { vi.unstubAllEnvs(); }
 });
 it("does not open provisioning in an unknown mode", () => {
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "unknown-mode");
  try {
   expect(middleware(new NextRequest("https://pdm.example/api/admin/accounts", { method: "POST" })).status).toBe(403);
  } finally { vi.unstubAllEnvs(); }
 });
});

const attachmentMocks = vi.hoisted(() => ({ authorize: vi.fn(), upload: vi.fn(), command: vi.fn() }));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requirePrincipalNumberingPermissionAsync: attachmentMocks.authorize,
  requireNumberingActionAsync: vi.fn(() => { throw new Error("LEGACY_GUARD_MUST_NOT_RUN"); })
}));
vi.mock("@/lib/master-attachments-async", () => ({
  executeMasterAttachmentUploadAsync: attachmentMocks.upload,
  executeMasterAttachmentCommandAsync: attachmentMocks.command,
  listMasterAttachmentsInCompanyAsync: vi.fn(),
  getMasterAttachmentAsync: vi.fn(),
  syncMasterAttachmentToDriveAsync: vi.fn()
}));


const attachmentOrigin = "https://pdm.example";
const attachmentEndpoint = "/api/parts/A0002-P01/attachments";
const attachmentCommands = [
  { method: "POST", path: attachmentEndpoint, route: upload },
  { method: "DELETE", path: `${attachmentEndpoint}/attachment-one`, route: remove },
  { method: "POST", path: `${attachmentEndpoint}/attachment-one/restore`, route: restore }
];


describe("normal Part attachment entry in the active production slice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["GET", "HEAD"])("lets %s reach the attachment manager with its drawer return destination", method => {
    const response = middleware(new NextRequest(
      `${attachmentOrigin}/parts/A0002-P01/attachments?returnTo=%2Fparts%3Fdetail%3Dcw_part-one`, { method }
    ));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it.each(attachmentCommands)("dispatches $method $path to the existing Principal owner", ({ method, path }) => {
    expect(middleware(new NextRequest(attachmentOrigin + path, { method })).headers.get("x-middleware-next")).toBe("1");
  });

  it.each([401, 403])("preserves a Principal %s and never invokes an attachment mutation", async status => {
    attachmentMocks.authorize.mockResolvedValue({
      user: { id: "", role: "" }, permission: null,
      response: Response.json({ code: status === 401 ? "auth_session_invalid" : "permission_not_granted" }, { status })
    });
    for (const { method, path, route } of attachmentCommands) {
      const request = new NextRequest(attachmentOrigin + path, { method });
      expect(middleware(request).headers.get("x-middleware-next")).toBe("1");
      const response = await route(request, { params: Promise.resolve({ partNumber: "A0002-P01", attachmentId: "attachment-one" }) });
      expect(response.status).toBe(status);
    }
    expect(attachmentMocks.authorize).toHaveBeenCalledTimes(attachmentCommands.length);
    for (const call of attachmentMocks.authorize.mock.calls) {
      expect(call.slice(1, 3)).toEqual(["action", "numbering.attachments.manage"]);
    }
    expect(attachmentMocks.upload).not.toHaveBeenCalled();
    expect(attachmentMocks.command).not.toHaveBeenCalled();
  });

  it("keeps attachment entry and writes closed in an unknown production mode", () => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "unknown-mode");
    const page = middleware(new NextRequest(`${attachmentOrigin}/parts/A0002-P01/attachments`));
    expect(new URL(page.headers.get("x-middleware-rewrite")!).pathname).toBe("/production-slice-blocked");
    for (const { method, path } of attachmentCommands) {
      expect(middleware(new NextRequest(attachmentOrigin + path, { method })).status).toBe(403);
    }
  });

  it.each([
    ["PUT", attachmentEndpoint], ["PATCH", attachmentEndpoint], ["DELETE", attachmentEndpoint],
    ["POST", `${attachmentEndpoint}/attachment-one`], // Legacy Drive sync is not opened.
    ["POST", `${attachmentEndpoint}/attachment-one/previews`],
    ["DELETE", `${attachmentEndpoint}/attachment-one/restore`],
    ["POST", `${attachmentEndpoint}/attachment-one/restore/extra`],
    ["POST", "/api/parts/A0002-P01/attachments-extra"],
    ["POST", "/api/numbering/drawings/A0002-M01/attachments"],
    ["POST", "/api/numbering/drawings/A0002-M01/revision-files"],
    ["POST", "/api/parts/A0002-P01/preview-image"],
    ["POST", "/api/parts/A0002-P01/preview-image/reset"]
  ])("keeps unrelated attachment mutations blocked: %s %s", (method, path) => {
    expect(middleware(new NextRequest(attachmentOrigin + path, { method })).status).toBe(403);
  });

  it.each(["/parts/A0002-P01/attachments/extra", "/parts/A0002-P01/attachments-extra"])(
    "does not open a wider Part page prefix: %s", path => {
      expect(middleware(new NextRequest(attachmentOrigin + path)).headers.get("x-middleware-rewrite")).not.toBeNull();
    }
  );
});
