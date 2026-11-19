"use client";

import { useCallback, useEffect, useState } from "react";
import { assemblyRequest, AssemblyHttpError } from "@/lib/assembly-package-upload-client";

type Row={rowKey:string;parentKey:string|null;entryKey:string|null;configuration:string;occurrenceKey?:string;reference?:string;componentName?:string;occurrences?:unknown[];
  cadPartNumber?:string;drawingNumber?:string;quantity:string|null;unit:string|null;partNumber?:string;disposition:string};
type Draft={rows:Row[];draftVersion:number;configuration:string};
const statuses:Record<string,string>={matched:"實際用料（已配對）",excluded:"輔助繪圖（排除 BOM，保留檔案）",needs_record:"實際用料（待建檔）",needs_number:"實際用料（待編號）",
  quantity_unknown:"用量待確認",conflict:"配對衝突",needs_purpose:"用途待確認",needs_mapping:"待配對",material:"實際用料"};
function rowLabel(row:Row) {
  const instanceName = row.occurrences?.length ? null : row.componentName;
  const cadNumber = row.cadPartNumber?.trim();
  const fileName = row.reference?.split(/[\\/]/u).at(-1);
  const placeholder = cadNumber && /^(?:TBD|TBC|N\/A|NA|未定|待定)$/iu.test(cadNumber);
  return row.partNumber || (placeholder ? fileName : cadNumber) || row.drawingNumber || instanceName || row.reference || row.occurrenceKey || row.entryKey || "內嵌件";
}
type Save=(rowKey:string,patch:Record<string,string|null>)=>Promise<void>;
type Part={entityId:string;displayCode:string;displayName:string};

function BomPurpose({row,save}:{row:Row;save:Save}) {
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  async function choose(disposition:string) {
    setSaving(true);setError("");
    try {await save(row.rowKey,{disposition});}
    catch(reason){setError(reason instanceof Error?reason.message:"用途儲存失敗，請重新選擇");}
    finally{setSaving(false);}
  }
  const material=row.partNumber?"matched":"material";
  const options=[material,"needs_number","excluded"];
  return <><label>BOM 用途 <select aria-label={`${rowLabel(row)} 的 BOM 用途`} value={row.disposition} disabled={saving}
    onChange={event=>void choose(event.target.value)}>
    {!options.includes(row.disposition) && <option value={row.disposition}>{statuses[row.disposition]??row.disposition}</option>}
    {options.map(value=><option key={value} value={value}>{statuses[value]}</option>)}
  </select></label>{saving && <span role="status">儲存中…</span>}{error && <p role="alert">{error}</p>}</>;
}

function EditRow({row,save}:{row:Row;save:Save}) {
  const [quantity,setQuantity]=useState(row.quantity??"");
  const [unit,setUnit]=useState(row.unit??"");
  const [query,setQuery]=useState("");
  const [matches,setMatches]=useState<Part[]>([]);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  async function persist(patch:Record<string,string|null>) {
    if (saving) return;
    setSaving(true);setError("");
    try {await save(row.rowKey,patch);}
    catch (reason) {setError(reason instanceof Error?reason.message:"儲存失敗");}
    finally {setSaving(false);}
  }
  useEffect(()=>{
    const abort=new AbortController();
    if (!query.trim()) return;
    const timer=setTimeout(()=>{
      void assemblyRequest<{results:Part[]}>("/api/numbering/search?entityType=part_number&limit=12&query="+encodeURIComponent(query.trim()),{signal:abort.signal})
        .then(res=>{if (!abort.signal.aborted) setMatches(res.results);})
        .catch(()=>{if (!abort.signal.aborted) setError("無法查詢料號");});
    },200);
    return ()=>{clearTimeout(timer);abort.abort();};
  },[query]);
  return <fieldset disabled={saving}>
    <legend>更正 {rowLabel(row)}</legend>
    <label>用量<input inputMode="decimal" value={quantity} onChange={e=>setQuantity(e.target.value)}
      onBlur={()=>{if (quantity!==(row.quantity??"")) void persist({quantity:quantity||null});}} /></label>
    <label>單位<input value={unit} onChange={e=>setUnit(e.target.value)}
      onBlur={()=>{if (unit!==(row.unit??"")) void persist({unit:unit||null});}} /></label>
    <label>查找料號<input value={query} onChange={e=>{setQuery(e.target.value);setMatches([]);}}/></label>
    {matches.map(part=><button type="button" key={part.entityId} onClick={()=>void persist({partId:part.entityId,disposition:"matched"})}>
      {part.displayCode} {part.displayName}</button>)}
    {error && <p role="alert">{error} <button type="button" onClick={()=>void persist({quantity:quantity||null,unit:unit||null})}>重試用量與單位</button></p>}
  </fieldset>;
}

export function AssemblyBomDraft({url,configurations,editable,mainEntryKey,mainLabel,onSaved}:{
  url:string;configurations:string[];editable:boolean;mainEntryKey?:string|null;mainLabel?:string;onSaved?:()=>void;
}) {
  const [name,setName]=useState(configurations[0]);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [editing,setEditing]=useState<string|null>(null);
  const [error,setError]=useState("");
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const result=await assemblyRequest<{data:Draft}>(url+"?configuration="+encodeURIComponent(name),{signal});
    if (!signal?.aborted) setDraft(result.data);
  },[url,name]);
  useEffect(()=>{
    const abort=new AbortController();
    void refresh(abort.signal).catch(reason=>{if (!abort.signal.aborted) setError(reason instanceof Error?reason.message:"草稿讀取失敗");});
    return ()=>abort.abort();
  },[refresh]);
  const save:Save=async(rowKey,patch)=>{
    if (!draft) return;
    try {
      const response=await assemblyRequest<{data:Draft}>(url,{method:"PATCH",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},
        body:JSON.stringify({configuration:name,rowKey,draftVersion:draft.draftVersion,...patch})});
      setDraft(response.data);
      onSaved?.();
    } catch (reason) {
      if (reason instanceof AssemblyHttpError && reason.status===409) await refresh();
      throw reason;
    }
  };
  const exceptions=draft?.rows.filter(row=>!["excluded","matched"].includes(row.disposition)).length??0;
  const parents=new Map(draft?.rows.map(row=>[row.rowKey,rowLabel(row)])??[]);
  if (mainEntryKey && mainLabel) parents.set(mainEntryKey,mainLabel);
  return <div className="dev129-bom">
    <label>草稿組態 <select value={name} onChange={e=>{setName(e.target.value);setEditing(null);setDraft(null);setError("");}}>
      {configurations.map(n=><option key={n}>{n}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}
    {draft && <><p>{draft.rows.length} 列 · {exceptions} 列待處理</p><ul className="canonical-record-list">
      {draft.rows.map(row=><li key={row.rowKey}><strong>{rowLabel(row)}</strong> <span>{row.quantity??"用量待確認"} {row.unit}{!editable && ` · ${statuses[row.disposition]??row.disposition}`}</span>
        <small>{row.reference && rowLabel(row)!==row.reference && `${row.reference} · `}{row.parentKey && `父件 ${parents.get(row.parentKey)??row.parentKey} · `}組態 {row.configuration}</small>
        {editable && <BomPurpose row={row} save={save}/>}
        {editable && <button className="ghost-button" type="button" onClick={()=>setEditing(editing===row.rowKey?null:row.rowKey)}>更正</button>}
        {editing===row.rowKey && <EditRow row={row} save={save}/>}</li>)}</ul></>}
  </div>;
}
