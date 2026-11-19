import {describe,it,expect} from "vitest";
import {pdmFileReadHref,PDM_FILE_READ_CONTEXTS} from "./pdm-file-read-contract";
import {canonicalPreviewSlot} from "./pdm-canonical-workbench";
import type {CanonicalPreviewSourceRow} from "./pdm-canonical-preview";

describe("file read context links while a work is under review",()=>{
 it.each(PDM_FILE_READ_CONTEXTS.filter(context=>context!=="review_package"))("keeps %s on its existing authority without review-package parameters",context=>{
  const url=new URL(pdmFileReadHref({fileAssetId:"asset",context,contextId:"revision",bindingId:"binding",reviewRequestId:"pending-review"}),"http://localhost");
  expect(url.searchParams.get("context")).toBe(context);
  expect(url.searchParams.get("contextId")).toBe("revision");
  expect(url.searchParams.get("bindingId")).toBe("binding");
  expect(url.searchParams.has("reviewRequestId")).toBe(false);
 });
 it("preserves assignment identity on a real review-package link",()=>{
  const url=new URL(pdmFileReadHref({fileAssetId:"asset",context:"review_package",contextId:"drawing",bindingId:"binding",reviewRequestId:"pending-review"}),"http://localhost");
  expect(url.searchParams.get("reviewRequestId")).toBe("pending-review");
  expect(url.searchParams.get("context")).toBe("review_package");
 });
 it.each(["two-d","three-d"] as const)("produces readable %s preview and download links from a pending-review drawing row",kind=>{
  const source={rowId:"row",revisionId:"revision",dataLayer:"drawing_rd",reviewRequestId:"pending-review",bindingId:"binding",assetId:"asset",role:kind==="two-d"?"drawing_2d":"cad_3d",displayName:"drawing",fileName:kind==="two-d"?"drawing.pdf":"drawing.sldasm",fileExt:kind==="two-d"?"pdf":"sldasm",mimeType:kind==="two-d"?"application/pdf":"application/octet-stream",contentHash:"hash",isPrimary:1,sortOrder:0} as CanonicalPreviewSourceRow;
  const derivative={id:"preview",sourceFileAssetId:"asset",sourceContentHash:"hash",derivativeKind:"model_preview_png",status:"ready",mimeType:"image/png",storageKey:"preview.png",generatorProfile:"solidworks_document_manager",generatorVersion:"1",createdAt:null};
  const slot=canonicalPreviewSlot(kind,"preview",source,[derivative],[],"candidate_revision","pending-review");
  expect(slot.mediaHref).toBeTruthy();
  for(const href of [slot.mediaHref,slot.downloadHref]){
   const url=new URL(href!,"http://localhost");
   expect(url.searchParams.get("context")).toBe("candidate_revision");
   expect(url.searchParams.has("reviewRequestId")).toBe(false);
   expect(url.searchParams.get("bindingId")).toBe("binding");
  }
 });
});
