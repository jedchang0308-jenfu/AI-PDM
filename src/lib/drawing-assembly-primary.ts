import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
export type AssemblyPrimaryBinding = { packageId:string; selectionVersion:number; mainEntryKey:string; confirmPrimaryReplacement:boolean; expectedPrimaryBindingId?:string|null };
export async function assertAssemblyPrimaryUpload(client:AsyncDatabaseClient,input:{companyId:string;workId:string;contentHash:string;packageBinding?:AssemblyPrimaryBinding}) {
  if(client.kind!=="postgres") return;
  const pkg=await client.queryOne<{id:string;selection_version:number;main_entry_key:string|null;manifest_json:string}>(`SELECT id,selection_version,main_entry_key,manifest_json FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND active_at IS NOT NULL AND superseded_at IS NULL FOR UPDATE`,input);
  if(!pkg) {if(input.packageBinding) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT","組立包來源已改變",409);return;}
  const manifest=JSON.parse(pkg.manifest_json) as {entries:{entryKey:string;sha256:string}[]};
  const selected=manifest.entries.find(entry=>entry.entryKey===pkg.main_entry_key);
  if(input.packageBinding) {
    const basis=input.packageBinding;
    if(pkg.id!==basis.packageId || Number(pkg.selection_version)!==basis.selectionVersion || pkg.main_entry_key!==basis.mainEntryKey || selected?.sha256!==input.contentHash) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT","組立包主件來源已改變",409);
    const current=await client.queryOne<{id:string;content_hash:string}>(`SELECT file.id,asset.content_hash FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id=binding.file_binding_id JOIN file_assets asset ON asset.id=file.source_file_asset_id WHERE binding.work_id=:workId AND file.role='cad_3d' AND file.is_primary=1 AND file.removed_at IS NULL AND asset.deleted_at IS NULL`,input);
    if(current && current.content_hash!==input.contentHash && !basis.confirmPrimaryReplacement) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT","請確認切換為組立包內的 3D 主檔",409);
    if(current && current.content_hash!==input.contentHash && current.id!==basis.expectedPrimaryBindingId) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT","3D 主檔已改變，請重新確認切換",409);
  } else if(!selected || selected.sha256!==input.contentHash) {
    throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT","此工作使用組立包主檔，請從組立包選擇或補正來源",409);
  }
}
export async function recordAssemblyPrimaryBinding(client:AsyncDatabaseClient,binding:AssemblyPrimaryBinding|undefined,file:{id:string;sourceFileAssetId:string}) {
  if(!binding) return;
  await client.execute(`UPDATE drawing_assembly_packages SET primary_binding_id=:bindingId,primary_asset_id=:assetId,primary_conflict=0,primary_conflict_binding_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=:packageId AND selection_version=:selectionVersion AND main_entry_key=:mainEntryKey`,{...binding,bindingId:file.id,assetId:file.sourceFileAssetId});
}
