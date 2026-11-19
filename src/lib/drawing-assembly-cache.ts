import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { AssemblyAnalysisResult } from "@/lib/assembly-analysis-result";
import { assemblyResultDigest } from "@/lib/assembly-analysis-result";
import { assemblyJson,readAssemblyAnalysis,type AssemblyPackageRow,type AssemblyAnalysisRow } from "@/lib/drawing-assembly-package";
import { projectAssemblyAnalysisResult } from "@/lib/drawing-assembly-bom";
export type AssemblyRawCache = {parserVersion:string|null;mainEntryKey:string|null;configurationNames:string[];configurations:AssemblyAnalysisResult["configurations"]};
/** Cache identity includes immutable archive, selected main and exact parser version. */
export async function readAssemblyRawCache(client:AsyncDatabaseClient,pkg:AssemblyPackageRow,parserVersion?:string):Promise<AssemblyRawCache> {
  const rows=await client.query<{raw_result_json:string}>(`SELECT raw_result_json FROM drawing_assembly_analysis WHERE company_id=:companyId AND package_id=:packageId AND raw_result_json IS NOT NULL ORDER BY selection_version DESC`,{companyId:pkg.company_id,packageId:pkg.id});
  const cache:AssemblyRawCache={parserVersion:parserVersion??null,mainEntryKey:pkg.main_entry_key,configurationNames:[],configurations:[]};
  for(const row of rows) {
    const raw=assemblyJson<AssemblyAnalysisResult|null>(row.raw_result_json,null);
    if(!raw || raw.version!==1 || raw.mainEntryKey!==pkg.main_entry_key || !raw.parserVersion || !Array.isArray(raw.configurations))continue;
    cache.parserVersion??=raw.parserVersion;if(raw.parserVersion!==cache.parserVersion)continue;
    for(const name of raw.configurationNames)if(!cache.configurationNames.includes(name))cache.configurationNames.push(name);
    for(const config of raw.configurations)if(config.references.status==="passed" && !cache.configurations.some(value=>value.name===config.name))cache.configurations.push(config);
  }
  return cache;
}
export function mergeAssemblyRawCache(cache:AssemblyRawCache,fresh:AssemblyAnalysisResult,configurations:string[]):AssemblyAnalysisResult {
  if(cache.mainEntryKey!==fresh.mainEntryKey || cache.parserVersion!==fresh.parserVersion)return fresh;
  const merged=[...fresh.configurations,...cache.configurations.filter(config=>!fresh.configurations.some(value=>value.name===config.name))].filter(config=>configurations.includes(config.name));
  const allPassed=configurations.length>0 && configurations.every(name=>merged.some(config=>config.name===name && config.references.status==="passed"));
  return {...fresh,status:allPassed?"complete":fresh.status,configurationNames:[...new Set([...fresh.configurationNames,...cache.configurationNames])],configurations:merged};
}
/** Selection can complete without another device download when every chosen configuration is already proved. */
export async function deriveAssemblySelectionFromCache(client:AsyncDatabaseClient,pkg:AssemblyPackageRow,previous:AssemblyAnalysisRow|null) {
  const selected=assemblyJson<string[]>(pkg.configurations_json,[]);
  const current=await readAssemblyAnalysis(client,pkg);if(!current)return false;
  const previousResult=assemblyJson<AssemblyAnalysisResult|null>(previous?.raw_result_json??previous?.result_json,null);
  const overrides=previousResult?.mainEntryKey===pkg.main_entry_key?assemblyJson<Record<string,unknown>>(previous?.overrides_json,{}):{};
  const relevant=Object.fromEntries(selected.filter(name=>Object.hasOwn(overrides,name)).map(name=>[name,overrides[name]]));
  await client.execute(`UPDATE drawing_assembly_analysis SET overrides_json=:overrides,draft_version=:version WHERE id=:id AND status='queued'`,{id:current.id,overrides:JSON.stringify(relevant),version:Number(previous?.draft_version??1)});
  if(!pkg.main_entry_key || !selected.length)return false;
  const cache=await readAssemblyRawCache(client,pkg);
  if(!cache.parserVersion || selected.some(name=>!cache.configurations.some(config=>config.name===name)))return false;
  const raw:AssemblyAnalysisResult={version:1,parserVersion:cache.parserVersion,status:"complete",mainEntryKey:pkg.main_entry_key,mainCandidates:[pkg.main_entry_key],configurationNames:cache.configurationNames,configurations:selected.map(name=>cache.configurations.find(config=>config.name===name)!)};
  const projected=await projectAssemblyAnalysisResult(client,pkg,raw);
  // Row keys are source-bound. Unrelated manual edits never become raw CAD data.
  await client.execute(`UPDATE drawing_assembly_analysis SET status='complete',raw_result_json=:raw,result_json=:projected,result_digest=:digest,parser_version=:parser,overrides_json=:overrides,draft_version=:draftVersion,updated_at=CURRENT_TIMESTAMP WHERE id=:id AND status='queued'`,{id:current.id,raw:JSON.stringify(raw),projected:JSON.stringify(projected),digest:assemblyResultDigest(raw),parser:raw.parserVersion,overrides:JSON.stringify(relevant),draftVersion:Number(previous?.draft_version??1)});
  return true;
}
