import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isProductionSliceAllowedApiMutation } from "@/lib/production-slice";
const active = { PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft" };
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
    ["POST","/api/parts/part-one/attachments"], ["POST","/api/pdm/drawing-rd-branches/branch-one/void-requests"]]) {
    expect(isProductionSliceAllowedApiMutation(method,path,active)).toBe(false);
  }
 });
});
