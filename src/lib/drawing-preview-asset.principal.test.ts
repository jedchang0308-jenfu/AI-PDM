import { describe, expect, it, vi } from "vitest";
import { resolveDrawingPreviewAsync } from "@/lib/drawing-preview-asset";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
const source = { id:"asset-one", company_id:"company-one", storage_provider:"local_repository",
  storage_bucket:null, storage_key:"source", original_path:"source", file_name:"model.sldprt",
  file_ext:"sldprt", mime_type:"application/octet-stream", content_hash:"source-hash" };
describe("canonical preview company boundary", () => {
  it.each(["company-one", "company-two"])("binds derivative lookup and readback to source company: %s", async (company) => {
    const queryOne = vi.fn().mockResolvedValue({ id:"preview", company_id:company,
      source_content_hash:"source-hash", file_name:"preview.png", mime_type:"image/png" });
    const result = await resolveDrawingPreviewAsync({queryOne} as unknown as AsyncDatabaseClient, source);
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("AND company_id = :companyId"),
      expect.objectContaining({companyId:"company-one", sourceFileAssetId:"asset-one"}));
    expect(Boolean(result)).toBe(company === "company-one");
  });
});