"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Download, Upload } from "lucide-react";
import { AssemblyHttpError, assemblyRequest, uploadAssemblyPackage } from "@/lib/assembly-package-upload-client";
import { AssemblyBomDraft } from "./drawing-assembly-bom-draft";

type PackageSummary = {
  packageId:string; fileName:string; byteSize:number; nextOffset:number; status:string; mainEntryKey:string|null;
  primaryBindingId:string|null; primaryConflict?:boolean; conflictingPrimaryBindingId?:string|null; diagnostic?:string; downloadAvailable:boolean; active?:boolean;
  selectionVersion:number; deliveryConfigurations:string[]; mainRelativePath?:string;
  mainCandidates?:{entryKey:string;relativePath:string}[]; bomConfigurations?:{name:string;rowCount:number}[];
  result?:{mainCandidates:string[]; configurationNames:string[]; diagnostic?:string; configurations:{
    name:string;references:{status:string;issues:{code:string;parentKey:string;parentPath?:string;reference:string}[]};bom?:{exceptionCount:number}
  }[]}|null;
};
type Collection = {data:PackageSummary|null;previousActive?:PackageSummary|null;limits?:{maxArchiveBytes:number}};
const messages:Record<string,string>={uploading:"傳輸中",queued:"等待 Windows 解析",running:"正在檢查參照與建立 BOM",needs_input:"需要選擇",blocked:"參照待處理",complete:"參照檢查通過"};
const ongoing=new Set(["queued","running","uploading"]);
const diagnostics:Record<string,string>={
  assembly_main_selection_required:"有多個可能的主組立，請選擇包內檔案。",
  assembly_active_configuration_unknown:"無法判定儲存時的組態，請選擇交付組態。",
  assembly_document_manager_license_missing:"解析裝置尚未取得 Document Manager 授權。",
  assembly_document_manager_license_invalid:"解析裝置的 Document Manager 授權無法開啟此原生檔。",
  assembly_native_capability_unverified:"部分參照尚待確認，請查看下方明細。",
  assembly_reference_mapping_unknown:"包內參照無法唯一配對",
  assembly_component_reference_ambiguous:"包內有多個同名候選檔",
  assembly_component_source_alias_conflict:"不同來源對到同一個包內檔案，請核對檔名與目錄",
  assembly_component_identity_ambiguous:"無法區分同一父件下的元件實例",
  assembly_document_source_mismatch:"實際讀到的檔案和包內來源不一致",
  assembly_document_open_failed:"無法開啟包內的 CAD 檔案",
  assembly_bom_behavior_unknown:"無法確認此元件的 BOM 展開或排除設定",
  assembly_external_reference_result_incomplete:"未能讀完整外部參照",
  assembly_external_reference_reader_unavailable:"解析裝置無法讀取此檔的外部參照",
  assembly_reference_missing:"缺少必要子檔",
  assembly_external_reference_outside_package:"必要參照位於組立包外",
  assembly_virtual_component_reader_unverified:"內嵌虛擬件的參照尚未確認",
  assembly_child_configuration_missing:"缺少子件引用的組態",
  assembly_external_reference_configuration_unknown:"無法確認外部參照使用的組態"
};
type Props={base:string; frozen?:boolean; editable?:boolean; onChange?:(blocked:boolean,binding:string|null)=>void;
  uploadControl?:(context:{activePackageId:string|null;downloadHref:string|null;archiveName?:string;ready:boolean;setBusy:(value:boolean)=>void})=>ReactNode};

export function DrawingAssemblyPackagePanel({base,frozen=false,editable=false,onChange,uploadControl}:Props) {
  const [collection,setCollection]=useState<Collection>({data:null});
  const [error,setError]=useState("");
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<number|null>(null);
  const [bomOpen,setBomOpen]=useState(false);
  const [draftRevision,setDraftRevision]=useState(0);
  const input=useRef<HTMLInputElement>(null);
  const onChangeRef=useRef(onChange);
  useEffect(()=>{onChangeRef.current=onChange;},[onChange]);
  const refresh=useCallback(async(signal:AbortSignal)=>{
    let response:Collection;
    try { response=await assemblyRequest<Collection>(base,{signal}); }
    catch (reason) {
      if (frozen && reason instanceof AssemblyHttpError && reason.status===404) response={data:null};
      else throw reason;
    }
    if (signal.aborted) return null;
    setCollection(response);setLoaded(true);
    const pkg=response.data;
    if (!frozen) onChangeRef.current?.(!!pkg && (pkg.status!=="complete" || !pkg.primaryBindingId || !!pkg.primaryConflict),pkg?.primaryBindingId??null);
    return pkg;
  },[base,frozen]);
  useEffect(()=>{
    const abort=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const pkg=await refresh(abort.signal);
        if (!frozen && pkg && ongoing.has(pkg.status) && !abort.signal.aborted)
          timer=setTimeout(()=>void poll(),document.hidden || pkg.status==="queued" ? 15000:3000);
      } catch (reason) {
        if (!abort.signal.aborted) {
          const denied=reason instanceof AssemblyHttpError && (reason.status===401 || reason.status===403);
          if (denied) {setCollection({data:null});setLoaded(false);}
          setError(reason instanceof AssemblyHttpError && reason.status===403 ? "目前無權限讀取組立包。" : reason instanceof Error?reason.message:"無法讀取組立包");
          if (!denied) timer=setTimeout(()=>void poll(),15000);
        }
      }
    }
    void poll();
    return ()=>{abort.abort();clearTimeout(timer);};
  },[refresh,frozen,busy,draftRevision]);
  const pkg=collection.data;
  const url=(item:PackageSummary)=>frozen?base:base+"/"+encodeURIComponent(item.packageId);
  const downloadable=pkg?.downloadAvailable?pkg:collection.previousActive;
  const mainPath=pkg?.mainRelativePath || pkg?.mainCandidates?.find(item=>item.entryKey===pkg.mainEntryKey)?.relativePath;
  const diagnostic=pkg?.diagnostic || pkg?.result?.diagnostic;
  const configs=pkg?.result?.configurations?.map(config=>config.name) ?? pkg?.bomConfigurations?.map(config=>config.name) ?? [];
  const exceptions=pkg?.result?.configurations?.reduce((count,config)=>count+(config.bom?.exceptionCount??0),0)??0;
  const choices=pkg?.result?.configurationNames ?? [];
  const issues=pkg?.result?.configurations?.flatMap(config=>config.references.issues.map(issue=>({...issue,configuration:config.name})))??[];
  const issueGroups=new Map<string,typeof issues>();
  for (const issue of issues) {
    const key=JSON.stringify([issue.configuration,issue.reference]);
    const group=issueGroups.get(key);
    if (group) group.push(issue);
    else issueGroups.set(key,[issue]);
  }
  async function run(fn:()=>Promise<unknown>) {
    if (busy) return;
    setBusy(true);setError("");
    try {await fn();}
    catch (reason) {setError(reason instanceof Error?reason.message:"組立包操作失敗");}
    finally {setBusy(false);setProgress(null);}
  }
  function select(change:Record<string,unknown>) {
    if (!pkg) return;
    void run(()=>assemblyRequest(url(pkg),{method:"PATCH",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},
      body:JSON.stringify({...change,selectionVersion:pkg.selectionVersion})}));
  }
  if (frozen && !pkg && !error) return null;
  return <section className="dev129-package" aria-label="組立包">
    {editable && uploadControl?.({activePackageId:pkg?.active?pkg.packageId:null,downloadHref:downloadable?url(downloadable)+"/download":null,archiveName:downloadable?.fileName,ready:loaded,setBusy})}
    <div className="dev129-package-actions">
      {editable && !uploadControl && <><input type="file" accept=".zip" hidden ref={input} onChange={event=>{
        const file=event.target.files?.[0];event.target.value="";
        if (!file) return;
        if (collection.limits && file.size>collection.limits.maxArchiveBytes) {
          setError(`ZIP 上限為 ${Math.floor(collection.limits.maxArchiveBytes/1048576)} MiB`);return;
        }
        setProgress(0);
        void run(()=>uploadAssemblyPackage(base,file,pkg?.active?pkg.packageId:null,{onProgress:n=>setProgress(Math.floor(100*n/file.size))}));
      }} /><button type="button" className="secondary-button" disabled={!loaded || busy || pkg?.status==="uploading"} onClick={()=>input.current?.click()}>
        <Upload size={14}/>{downloadable?"補正組立包":"上傳組立包"}</button></>}
      {downloadable && <a className="secondary-button" href={url(downloadable)+"/download"} download={downloadable.fileName} title={downloadable.fileName}>
        <Download size={14}/>下載組立包</a>}
      {!!configs.length && <button type="button" className="ghost-button" aria-expanded={bomOpen} onClick={()=>setBomOpen(!bomOpen)}>BOM 草稿{exceptions>0 && ` · ${exceptions} 列待處理`}</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {progress!==null && <p role="status">{progress===100?"正在驗證 ZIP":`正在上傳 ${progress}%`}</p>}
    {pkg && <div>
      <p role="status">{pkg.fileName}{messages[pkg.status] && " · "+messages[pkg.status]}{mainPath && " · "+mainPath}</p>
      {downloadable && downloadable.packageId!==pkg.packageId && <p>目前可下載 {downloadable.fileName}</p>}
      {diagnostic && <p>{diagnostics[diagnostic]??diagnostic}</p>}
      {pkg.status==="uploading" && editable && !busy && <button type="button" className="ghost-button"
        onClick={()=>void run(()=>assemblyRequest(url(pkg)+"/upload",{method:"DELETE"}))}>取消未完成的上傳</button>}
      {pkg.status==="needs_input" && !pkg.mainEntryKey && editable && <label>主組立
        <select defaultValue="" disabled={busy} onChange={e=>select({mainEntryKey:e.target.value})}><option value="" disabled>選擇主組立</option>
          {pkg.mainCandidates?.filter(item=>!pkg.result?.mainCandidates?.length || pkg.result.mainCandidates.includes(item.entryKey)).map(item=><option key={item.entryKey} value={item.entryKey}>{item.relativePath}</option>)}</select></label>}
      {pkg.primaryConflict && editable && <p role="status">現有 3D 主檔與 {mainPath} 內容不同。 <button type="button" disabled={busy}
        onClick={()=>select({acceptPrimaryReplacement:true,conflictingPrimaryBindingId:pkg.conflictingPrimaryBindingId})}>改用包內主檔</button></p>}
      {choices.length>0 && editable ? <details open={pkg.status==="needs_input" || undefined}><summary>交付組態{pkg.deliveryConfigurations.length>0 && " · "+pkg.deliveryConfigurations.join("、")}</summary>
        {choices.map(name=><label key={name}><input type="checkbox" disabled={busy || (pkg.deliveryConfigurations.length===1 && pkg.deliveryConfigurations[0]===name)}
          checked={pkg.deliveryConfigurations.includes(name)} onChange={e=>select({deliveryConfigurations:e.target.checked?[...pkg.deliveryConfigurations,name]:pkg.deliveryConfigurations.filter(n=>n!==name)})}/>{name}</label>)}</details>:null}
      {issueGroups.size>0 && <ul>{Array.from(issueGroups,([key,group])=>{
        const issue=group.find(item=>item.code==="assembly_component_reference_ambiguous" || item.code==="assembly_reference_missing")??group[0];
        const parent=issue.parentPath??issue.parentKey;
        const label=`${issue.configuration} · ${parent} → ${issue.reference}（${diagnostics[issue.code]??issue.code}）`;
        const details=Array.from(new Set(group.map(item=>`${item.parentPath??item.parentKey} · ${diagnostics[item.code]??item.code}`)));
        return <li key={key}>{details.length===1?label:<details><summary>{label}</summary><ul>{details.map(line=><li key={line}>{line}</li>)}</ul></details>}</li>;
      })}</ul>}
      {bomOpen && configs.length>0 && <AssemblyBomDraft key={pkg.packageId+":"+pkg.selectionVersion} url={url(pkg)+"/bom"} configurations={configs} editable={editable} mainEntryKey={pkg.mainEntryKey} mainLabel={mainPath} onSaved={()=>setDraftRevision(value=>value+1)}/>}
    </div>}
  </section>;
}
