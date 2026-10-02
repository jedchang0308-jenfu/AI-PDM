import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isProductionSliceAllowedApiMutation, isProductionSliceOpenPagePath } from "@/lib/production-slice";
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
  for(const path of ["/parts/part-one/attachments","/parts/part-one/workspace/extra",
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
