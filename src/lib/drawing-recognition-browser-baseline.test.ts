import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { prepareDrawingRecognitionBrowserBaseline, rerunDrawingRecognition } from "@/lib/drawing-recognition";
import { BROWSER_PDF_OCR_ADAPTER_CODE, SOLIDWORKS_NATIVE_ADAPTER_CODE } from "@/lib/drawing-recognition-adapters";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";

const client = { kind: "postgres" } as AsyncDatabaseClient;

afterEach(() => vi.restoreAllMocks());

describe("DEV-122 browser recognition baseline", () => {
  it("claims only the requested mixed session and records native metadata as unavailable", async () => {
    vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "getProjection").mockResolvedValue({
      id: "recognition-one",
      status: "queued",
      pendingClientAdapters: [{ sourceId: "source-pdf" }]
    } as never);
    const claim = vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "claimJob").mockResolvedValue({
      sessionId: "recognition-one",
      companyId: "company-one",
      initiatorPrincipalId: "principal-one",
      sourceSetFingerprint: "fingerprint-one",
      attemptCount: 1,
      targetContext: { drawingId: null, drawingNumber: null, drawingRevisionId: null, revision: null, parts: [] },
      sources: [
        {
          id: "source-cad", fileAssetId: "asset-cad", contentHash: "a".repeat(64), fileName: "part.sldprt",
          fileExt: "sldprt", fileSize: 1024, mimeType: "application/octet-stream", sourceRole: "native_3d",
          sortOrder: 0, storageGeneration: null, adapterPlan: ["filename.v1", SOLIDWORKS_NATIVE_ADAPTER_CODE],
          originalPath: null, storageProvider: "gcs", storageKey: "parts/part.sldprt"
        },
        {
          id: "source-pdf", fileAssetId: "asset-pdf", contentHash: "b".repeat(64), fileName: "drawing.pdf",
          fileExt: "pdf", fileSize: 2048, mimeType: "application/pdf", sourceRole: "drawing_pdf",
          sortOrder: 1, storageGeneration: null, adapterPlan: ["filename.v1", BROWSER_PDF_OCR_ADAPTER_CODE],
          originalPath: null, storageProvider: "gcs", storageKey: "drawings/drawing.pdf"
        }
      ]
    });
    const complete = vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "completeJob")
      .mockResolvedValue({ id: "recognition-one", status: "extraction_partial" } as never);

    await expect(prepareDrawingRecognitionBrowserBaseline({
      sessionId: "recognition-one",
      companyId: "company-one",
      client
    })).resolves.toMatchObject({ status: "extraction_partial" });

    expect(claim).toHaveBeenCalledWith(expect.objectContaining({
      targetSessionId: "recognition-one",
      targetCompanyId: "company-one",
      allowNativeSources: false
    }));
    const completion = complete.mock.calls[0]?.[0];
    expect(completion?.sessionId).toBe("recognition-one");
    expect(completion?.results.map((result) => [result.sourceId, result.adapterCode, result.status])).toEqual([
      ["source-cad", "filename.v1", "succeeded"],
      ["source-cad", SOLIDWORKS_NATIVE_ADAPTER_CODE, "unsupported"],
      ["source-pdf", "filename.v1", "succeeded"]
    ]);
  });

  it("leaves a CAD-only queued session for the existing worker flow", async () => {
    const projection = { id: "recognition-cad", status: "queued", pendingClientAdapters: [] };
    vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "getProjection").mockResolvedValue(projection as never);
    const claim = vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "claimJob");
    const complete = vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "completeJob");

    await expect(prepareDrawingRecognitionBrowserBaseline({
      sessionId: "recognition-cad",
      companyId: "company-one",
      client
    })).resolves.toBe(projection);
    expect(claim).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("reuses an older queued session when its browser PDF adapter is still pending", async () => {
    const projection = {
      id: "recognition-legacy-pdf",
      status: "queued",
      pendingClientAdapters: [{ sourceId: "source-pdf" }]
    };
    vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "assertSessionScope").mockResolvedValue({} as never);
    vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "getProjection").mockResolvedValue(projection as never);
    const create = vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "createSession");

    await expect(rerunDrawingRecognition({
      sessionId: "recognition-legacy-pdf",
      companyId: "company-one",
      actorId: "profile-one",
      initiatorPrincipalId: "principal-one",
      roles: ["admin"],
      client
    })).resolves.toBe(projection);
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps a CAD-only queued session unavailable for a principal rerun", async () => {
    vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "assertSessionScope").mockResolvedValue({} as never);
    vi.spyOn(DrawingRecognitionAsyncRepository.prototype, "getProjection").mockResolvedValue({
      id: "recognition-cad",
      status: "queued",
      pendingClientAdapters: []
    } as never);

    await expect(rerunDrawingRecognition({
      sessionId: "recognition-cad",
      companyId: "company-one",
      actorId: "profile-one",
      initiatorPrincipalId: "principal-one",
      roles: ["admin"],
      client
    })).rejects.toMatchObject({ code: "RECOGNITION_RERUN_NOT_READY", status: 409 });
  });
});
