import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import type { DrawingWorkRow } from "@/lib/repositories/drawing-revision-work-async-repository";
import { readAssemblyPackage, readAssemblyAnalysis, assemblyJson, assemblyError, type AssemblyPackageRow, requireAssemblyBytesCapabilities, assemblyDownloadResponse } from "@/lib/drawing-assembly-package";
import { assemblyBomProjection, type AssemblyAnalysisResult, type AssemblyBomRow } from "@/lib/drawing-assembly-bom";
import type { AssemblyArchiveManifest } from "@/lib/assembly-archive";
import type { AssemblyStoredObject } from "@/lib/assembly-storage";
import { authorizeDynamicResourceCapabilityInSnapshot } from "@/lib/principal-resource-capability";
import { PdmWorkReviewAsyncRepository, type PdmWorkReviewRequestRecord } from "@/lib/repositories/pdm-work-review-async-repository";
import { canAccessWorkReviewAssignment } from "@/lib/pdm-work-review";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { requirePrincipalReviewResourceCapabilitiesInSnapshot } from "@/lib/pdm-principal-review-resource";
import { readCanonicalDrawingHistoryRevision } from "@/lib/pdm-canonical-drawing-history";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { isSupportedAssemblyParserVersion } from "@/lib/assembly-parser-version";

export type AssemblyReviewSnapshot = { version:1;packageId:string;workId:string;revisionId:string;fileName:string;byteSize:number;
  archiveSha256:string;storageObject:AssemblyStoredObject;mainEntryKey:string;mainRelativePath:string;selectionVersion:number;
  primaryBindingId:string;primaryAssetId:string;deliveryConfigurations:string[];referenceDigest:string;
  result:AssemblyAnalysisResult;bom:Record<string,{rows:AssemblyBomRow[]}>;
  reviewSnapshotHash?:string;reviewAssignment?:PdmWorkReviewRequestRecord;
};
const digest=(value:unknown)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function currentAssemblySubmission(client:AsyncDatabaseClient,work:Pick<DrawingWorkRow,"id"|"company_id"|"revision_id">,strict=true):Promise<AssemblyReviewSnapshot|null> {
  if(client.kind!=="postgres") return null;
  const pending=await client.queryOne(`SELECT id FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND status='uploading'`,{companyId:work.company_id,workId:work.id});
  if(pending) {if(strict) assemblyError("組立包正在上傳，完成必要參照檢查後再送審");return null;}
  const pkg=await client.queryOne<AssemblyPackageRow>(`SELECT * FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND active_at IS NOT NULL AND superseded_at IS NULL`,{companyId:work.company_id,workId:work.id});
  if(!pkg) return null;
  const reject=():null=>{if(strict) assemblyError("組立包尚未通過目前來源的必要參照檢查，請確認主件、交付組態與主檔");return null;};
  if(pkg.status!=="accepted" || pkg.revision_id!==work.revision_id || !pkg.main_entry_key || !pkg.primary_binding_id || !pkg.primary_asset_id || Number(pkg.primary_conflict)) return reject();
  const configs=assemblyJson<string[]>(pkg.configurations_json,[]),analysis=await readAssemblyAnalysis(client,pkg);
  const result=assemblyJson<AssemblyAnalysisResult|null>(analysis?.result_json,null);
  const manifest=assemblyJson<AssemblyArchiveManifest|null>(pkg.manifest_json,null);
  const object=assemblyJson<AssemblyStoredObject|null>(pkg.storage_object_json,null);
  const main=manifest?.entries.find(entry=>entry.entryKey===pkg.main_entry_key);
  if(!configs.length || !result || !isSupportedAssemblyParserVersion(result.parserVersion) || !main || !object || result.mainEntryKey!==pkg.main_entry_key || !analysis?.result_digest || analysis.status==="queued" || analysis.status==="running" || configs.some(name=>result.configurations.find(value=>value.name===name)?.references.status!=="passed")) return reject();
  if(manifest?.sha256!==pkg.archive_sha256 || manifest.byteSize!==Number(pkg.byte_size) || object.byteSize!==Number(pkg.byte_size)) return reject();
  const primary=await client.queryOne<{content_hash:string;source_file_asset_id:string}>(`SELECT asset.content_hash,file.source_file_asset_id FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id=binding.file_binding_id JOIN file_assets asset ON asset.id=file.source_file_asset_id WHERE binding.work_id=:workId AND file.id=:bindingId AND file.company_id=:companyId AND file.drawing_revision_id=:revisionId AND file.role='cad_3d' AND file.is_primary=1 AND file.removed_at IS NULL AND asset.deleted_at IS NULL`,{workId:work.id,companyId:work.company_id,revisionId:work.revision_id,bindingId:pkg.primary_binding_id});
  if(!primary || primary.source_file_asset_id!==pkg.primary_asset_id || primary.content_hash!==main.sha256) return reject();
  const overrides=assemblyJson<Record<string,Record<string,Partial<AssemblyBomRow>>>>(analysis.overrides_json,{});
  const bom=Object.fromEntries(configs.map(name=>[name,assemblyBomProjection(result,overrides,name)!]));
  const references=configs.map(name=>({name,references:result.configurations.find(value=>value.name===name)!.references}));
  return {version:1,packageId:pkg.id,workId:work.id,revisionId:work.revision_id,fileName:pkg.file_name,byteSize:Number(pkg.byte_size),archiveSha256:pkg.archive_sha256!,storageObject:object,mainEntryKey:pkg.main_entry_key,mainRelativePath:main.relativePath,selectionVersion:Number(pkg.selection_version),primaryBindingId:pkg.primary_binding_id,primaryAssetId:pkg.primary_asset_id,deliveryConfigurations:configs,referenceDigest:digest(references),result,bom};
}
export async function assemblySubmitAvailability(client:AsyncDatabaseClient,work:Pick<DrawingWorkRow,"id"|"company_id"|"revision_id">) {
  if(client.kind!=="postgres") return {applicable:false,canSubmit:true,reason:null};
  const exists=await client.queryOne(`SELECT id FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND (status='uploading' OR (active_at IS NOT NULL AND superseded_at IS NULL))`,{companyId:work.company_id,workId:work.id});
  if(!exists) return {applicable:false,canSubmit:true,reason:null};
  try {await currentAssemblySubmission(client,work);return {applicable:true,canSubmit:true,reason:null};}
  catch(error){if(!(error instanceof CanonicalWorkbenchError))throw error;return {applicable:true,canSubmit:false,reason:error.message};}
}
export async function freezeAssemblyReview(client:AsyncDatabaseClient,work:DrawingWorkRow,reviewId:string) {
  const snapshot=await currentAssemblySubmission(client,work);
  if(!snapshot) return;
  const review=await new PdmWorkReviewAsyncRepository(client).get(client,{companyId:work.company_id,requestId:reviewId});
  if(!review) assemblyError("送審資料不存在",404);
  snapshot.reviewSnapshotHash=review.snapshotHash;snapshot.reviewAssignment=review;
  await client.execute(`INSERT INTO drawing_assembly_review_snapshots(id,company_id,review_request_id,work_id,revision_id,package_id,primary_binding_id,primary_asset_id,selection_version,archive_sha256,storage_generation,main_entry_key,configurations_json,reference_digest,review_snapshot_hash,snapshot_json) VALUES(:id,:companyId,:reviewId,:workId,:revisionId,:packageId,:bindingId,:assetId,:selectionVersion,:hash,:generation,:main,:configs,:referenceDigest,:reviewHash,:snapshot)`,{id:crypto.randomUUID(),companyId:work.company_id,reviewId:review.id,workId:work.id,revisionId:work.revision_id,packageId:snapshot.packageId,bindingId:snapshot.primaryBindingId,assetId:snapshot.primaryAssetId,selectionVersion:snapshot.selectionVersion,hash:snapshot.archiveSha256,generation:snapshot.storageObject.generation,main:snapshot.mainEntryKey,configs:JSON.stringify(snapshot.deliveryConfigurations),referenceDigest:snapshot.referenceDigest,reviewHash:review.snapshotHash,snapshot:JSON.stringify(snapshot)});
}
export async function approveAssemblyReview(client:AsyncDatabaseClient,work:DrawingWorkRow,review:PdmWorkReviewRequestRecord) {
  if(client.kind!=="postgres") return;
  const frozen=await client.queryOne<{snapshot_json:string;review_snapshot_hash:string}>(`SELECT snapshot_json,review_snapshot_hash FROM drawing_assembly_review_snapshots WHERE company_id=:companyId AND review_request_id=:reviewId`,{companyId:work.company_id,reviewId:review.id});
  const current=await currentAssemblySubmission(client,work);
  if(!frozen && !current) return;
  const snapshot=assemblyJson<AssemblyReviewSnapshot|null>(frozen?.snapshot_json,null);
  if(!snapshot || !current || frozen?.review_snapshot_hash!==review.snapshotHash || snapshot.reviewSnapshotHash!==review.snapshotHash || ["packageId","selectionVersion","primaryBindingId","primaryAssetId","archiveSha256","mainEntryKey","referenceDigest"].some(key=>current[key as keyof typeof current]!==snapshot[key as keyof typeof snapshot]) || digest(current.deliveryConfigurations)!==digest(snapshot.deliveryConfigurations) || current.storageObject.generation!==snapshot.storageObject.generation) assemblyError("送審組立包來源已改變，請退回修改後重新送審");
  await client.execute(`UPDATE drawing_assembly_review_snapshots SET effective_at=CURRENT_TIMESTAMP WHERE company_id=:companyId AND review_request_id=:reviewId AND effective_at IS NULL`,{companyId:work.company_id,reviewId:review.id});
}
export async function readAssemblyReviewSnapshot(client:AsyncDatabaseClient,companyId:string,reviewId:string) {
  const row=await client.queryOne<{snapshot_json:string}>(`SELECT snapshot_json FROM drawing_assembly_review_snapshots WHERE company_id=:companyId AND review_request_id=:reviewId`,{companyId,reviewId});
  return assemblyJson<AssemblyReviewSnapshot|null>(row?.snapshot_json,null);
}
export async function authorizeAssemblyReview(client:AsyncDatabaseClient,verified:VerifiedPrincipalRequest,requestId:string) {
  const frozen=await readAssemblyReviewSnapshot(client,verified.profile.companyId,requestId);
  if(!frozen?.reviewAssignment) assemblyError("審核組立包不存在",404);
  const current=await new PdmWorkReviewAsyncRepository(client).get(client,{companyId:verified.profile.companyId,requestId});
  const item=current??frozen.reviewAssignment;
  if(item.requestKind!=="drawing_revision" || item.entityType!=="drawing" || item.id!==requestId || item.companyId!==verified.profile.companyId || !canAccessWorkReviewAssignment(item,verified.profile.pdmUserId) || item.snapshotHash!==frozen.reviewSnapshotHash) assemblyError("審核組立包不存在",404);
  const permissions=item.reviewerUserId===null?["approval.inbox.view"]:["approval.inbox.view","approval.request.decide"];
  const decisions=await evaluatePrincipalWorkspacePermissionsInSnapshot(client,verified,permissions.map(permissionCode=>({permissionKind:"action",permissionCode})));
  if(decisions.length!==permissions.length || decisions.some(value=>!value.allowed)) assemblyError("無權限讀取審核組立包",403);
  const envelope=verifyReviewPackageIntegrity(item.snapshotPayload,item.snapshotHash);
  if(item.reviewerUserId===null) await requirePrincipalReviewResourceCapabilitiesInSnapshot(client,verified,{companyId:item.companyId,requestKind:item.requestKind,entityType:"drawing",entityId:item.canonicalEntityId,workId:item.workId,envelope},{shared:true,strictSnapshot:false});
  return frozen;
}
export async function authorizeAssemblyHistory(client:AsyncDatabaseClient,verified:VerifiedPrincipalRequest,drawingId:string,revisionId:string) {
  await readCanonicalDrawingHistoryRevision({client,companyId:verified.profile.companyId,drawingId,revisionId});
  const frozen=await readAssemblyEffectiveSnapshot(client,verified.profile.companyId,revisionId);
  if(!frozen) assemblyError("歷史版次沒有組立包",404);return frozen;
}
export async function readAssemblyEffectiveSnapshot(client:AsyncDatabaseClient,companyId:string,revisionId:string) {
  const row=await client.queryOne<{snapshot_json:string}>(`SELECT snapshot_json FROM drawing_assembly_review_snapshots WHERE company_id=:companyId AND revision_id=:revisionId AND effective_at IS NOT NULL`,{companyId,revisionId});
  return assemblyJson<AssemblyReviewSnapshot|null>(row?.snapshot_json,null);
}
export async function assemblyFrozenResponse(client:AsyncDatabaseClient,verified:VerifiedPrincipalRequest,snapshot:AssemblyReviewSnapshot,mode:"download"|"bom",configuration:string) {
  if(mode==="download") {
    await requireAssemblyBytesCapabilities(client,verified);
    return ()=>assemblyDownloadResponse({status:"accepted",storage_object_json:JSON.stringify(snapshot.storageObject),file_name:snapshot.fileName,byte_size:snapshot.byteSize,archive_sha256:snapshot.archiveSha256});
  }
  const bom=snapshot.bom[configuration];if(!bom) assemblyError("指定組態不存在",404);
  const denied=await authorizeDynamicResourceCapabilityInSnapshot(client,verified,["part"],"view");
  const rows=denied?bom.rows.map(({partId:_id,partNumber:_number,...row})=>row):bom.rows;
  return ()=>Promise.resolve(Response.json({data:{packageId:snapshot.packageId,configuration,rows,readOnly:true}},{headers:{"cache-control":"private, no-store"}}));
}
export function assemblyFrozenSummary(snapshot:AssemblyReviewSnapshot) {
  return {data:{packageId:snapshot.packageId,fileName:snapshot.fileName,byteSize:snapshot.byteSize,archiveSha256:snapshot.archiveSha256,
    mainEntryKey:snapshot.mainEntryKey,mainRelativePath:snapshot.mainRelativePath,selectionVersion:snapshot.selectionVersion,
    primaryBindingId:snapshot.primaryBindingId,deliveryConfigurations:snapshot.deliveryConfigurations,
    references:snapshot.result.configurations.map(config=>({name:config.name,...config.references})),
    bomConfigurations:snapshot.deliveryConfigurations.map(name=>({name,rowCount:snapshot.bom[name]?.rows.length??0})),downloadAvailable:true,readOnly:true}};
}
