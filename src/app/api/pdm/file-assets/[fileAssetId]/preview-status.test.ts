import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { MasterAttachmentPreviewJob } from "@/lib/repositories/master-attachment-repository";
import { canonicalPreviewJobResponse, readLatestPreviewJobForSourceAsync } from "@/lib/preview-derivatives";

describe("canonical file preview terminal contract", () => {
  it.each(["queued", "running"] as const)("only %s remains pending", status => {
    const response = canonicalPreviewJobResponse({ status } as MasterAttachmentPreviewJob);
    expect(response).toMatchObject({ status: 202, headers: { "retry-after": "2", "x-pdm-preview-state": "pending" }, body: { error: { retryable: true } } });
  });
  it.each([
    ["skipped", 422, "PREVIEW_UNSUPPORTED", "unsupported"], ["failed", 409, "PREVIEW_FAILED", "failed"],
    ["cancelled", 409, "PREVIEW_CANCELLED", "failed"], ["succeeded", 409, "PREVIEW_OUTPUT_MISSING", "failed"]
  ] as const)("%s stops retries", (status, http, code, state) => {
    const response = canonicalPreviewJobResponse({ status, errorCode: "unsupported_preview_source" } as MasterAttachmentPreviewJob);
    expect(response).toMatchObject({ status: http, headers: { "x-pdm-preview-state": state, "cache-control": "private, no-store" },
      body: { error: { code, retryable: false } } });
    expect(response.headers).not.toHaveProperty("retry-after");
    expect(response.body.error.message).toContain("下載原檔");
  });
  it("reads only the authorized same source hash/kind/company without a write", async () => {
    const queryOne = vi.fn(async (_sql: string, _params?: unknown) => null),execute = vi.fn();
    const client = { queryOne, execute } as unknown as AsyncDatabaseClient;
    const scope = { companyId: "company-one", sourceFileAssetId: "asset-one", sourceContentHash: "a".repeat(64), requestedKind: "drawing_pdf" as const };
    expect(await readLatestPreviewJobForSourceAsync(client, scope)).toBeNull();
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("source_content_hash=:sourceContentHash"), scope);
    expect(queryOne.mock.calls[0]?.[0]).toContain("company_id=:companyId");
    expect(execute).not.toHaveBeenCalled();
  });
});
