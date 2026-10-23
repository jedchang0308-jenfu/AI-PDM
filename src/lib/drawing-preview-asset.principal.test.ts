import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDrawingPreviewAsync } from "@/lib/drawing-preview-asset";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
const source = { id:"asset-one", company_id:"company-one", storage_provider:"local_repository",
  storage_bucket:null, storage_key:"source", original_path:"source", file_name:"model.sldprt",
  file_ext:"sldprt", mime_type:"application/octet-stream", content_hash:"source-hash" };
describe("canonical preview company boundary", () => {
  it.each(["application/pdf; charset=binary", " Application/PDF "])("reads a source PDF directly for normalized media type %s", async mime => {
    const queryOne = vi.fn();
    const result = await resolveDrawingPreviewAsync({ queryOne } as unknown as AsyncDatabaseClient,
      { ...source, file_ext: "pdf", file_name: "drawing.pdf", mime_type: mime });
    expect(result).toMatchObject({ record: { id: source.id }, mimeType: "application/pdf" });
    expect(queryOne).not.toHaveBeenCalled();
  });
  it.each(["company-one", "company-two"])("binds derivative lookup and readback to source company: %s", async (company) => {
    const queryOne = vi.fn().mockResolvedValue({ id:"preview", company_id:company,
      source_content_hash:"source-hash", file_name:"preview.png", mime_type:"image/png" });
    const result = await resolveDrawingPreviewAsync({queryOne} as unknown as AsyncDatabaseClient, source);
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("AND company_id = :companyId"),
      expect.objectContaining({companyId:"company-one", sourceFileAssetId:"asset-one"}));
    expect(Boolean(result)).toBe(company === "company-one");
  });
});
afterEach(()=>vi.unstubAllEnvs());
it.each([{generator_profile:"fake_preview_worker",generator_version:"other"},{generator_profile:"other",generator_version:"fake-local-pipeline"}])("never permits old fake derivative via environment: %j",async fake=>{
 vi.stubEnv("PDM_LOCAL_FAKE_PREVIEW_WORKER","1");const queryOne=vi.fn().mockResolvedValue({...fake,id:"preview",company_id:source.company_id,source_content_hash:source.content_hash});
 expect(await resolveDrawingPreviewAsync({queryOne} as unknown as AsyncDatabaseClient,source)).toBeNull();
 expect(queryOne.mock.calls[0][0]).not.toContain(":allowFake");
});
