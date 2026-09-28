import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), metadata: vi.fn(), cad: vi.fn(), ocr: vi.fn()
}));

vi.mock("@/lib/principal-company-read", () => ({
  authorizePrincipalWorkspaceExternalRead: mocks.authorize
}));
vi.mock("@/lib/metadata-adapter-profile", () => ({
  resolveMetadataAdapterProfile: () => ({ metadataExtractor: "fixture", cadReferenceExtractor: "fixture", warnings: [] }),
  serializeMetadataAdapterProfile: () => ({})
}));
vi.mock("@/lib/pdm-metadata", () => ({ detectPdmMetadata: mocks.metadata }));
vi.mock("@/lib/cad-extraction", () => ({ extractCadReferences: mocks.cad }));
vi.mock("@/lib/ai-ocr-adapter", () => ({ detectAiOcrCandidates: mocks.ocr }));

import { POST } from "@/app/api/file-metadata/detect/route";

const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

function request(companyCode = "JENFU") {
  const form = new FormData();
  form.set("company_code", companyCode);
  form.set("files", new File(["drawing"], "drawing.pdf", { type: "application/pdf" }));
  return new Request("https://ai-pdm.test/api/file-metadata/detect", { method: "POST", body: form });
}

describe("file metadata Principal authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ principalId: "principal-one", profileId: "profile-one", company });
    mocks.metadata.mockResolvedValue({ warnings: [] });
    mocks.cad.mockResolvedValue({ cadReferences: [], warnings: [] });
    mocks.ocr.mockResolvedValue({ candidates: [], warnings: [] });
  });

  it("does not parse files or invoke detectors when the Principal grant is denied", async () => {
    mocks.authorize.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request),
      "src/app/api/file-metadata/detect/route.ts", "pdm.file_metadata.detect", "POST");
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.cad).not.toHaveBeenCalled();
    expect(mocks.ocr).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin upload before authorization or file parsing", async () => {
    const unsafe = request();
    unsafe.headers.set("origin", "https://other.test");
    const response = await POST(unsafe);
    expect(response.status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
  });

  it("rejects an uploaded form selecting a different company after authentication", async () => {
    const response = await POST(request("MAXIMA"));
    expect(response.status).toBe(403);
    expect(mocks.metadata).not.toHaveBeenCalled();
  });

  it("runs the detectors for the verified company and grant", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).pdmCompany).toMatchObject({ companyId: "company-jenfu" });
    expect(mocks.metadata).toHaveBeenCalledOnce();
  });
});
