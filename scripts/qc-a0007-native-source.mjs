import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { readWindowsDpapiSecret } from '../src/lib/windows-dpapi-secret-provider.ts';

const cfg=JSON.parse(await fs.readFile('C:/VIBE CODING/.local/jenfu-shared-daily/profile/control/ai-pdm-runtime.json','utf8'));
const db=new pg.Client({connectionString:cfg.databaseUrl});
const out=path.resolve('output/qa/a0007-preview-recovery/native-source',new Date().toISOString().replace(/[:.]/gu,'-'));
await fs.mkdir(out,{recursive:true});
process.env.PDM_WINDOWS_DPAPI_SECRET_DIR='C:/Users/user/AppData/Local/AI-PDM/secret-store';
let key;
try {
  await db.connect();await db.query('BEGIN READ ONLY');
  const sources=(await db.query(`SELECT f.file_name,f.original_path,f.content_hash FROM ai_pdm_core.drawing_revision_files b JOIN ai_pdm_core.file_assets f ON f.id=b.source_file_asset_id WHERE b.drawing_revision_id='7b8dac18-e2f0-49e9-a739-97beb00b3401' AND b.removed_at IS NULL AND f.file_ext IN ('sldprt','slddrw')`)).rows;
  await db.query('ROLLBACK');
  key=await readWindowsDpapiSecret('solidworks_document_manager-a2ab3ec5-ecb5-4c3b-ba45-33434c595e06.dpapi');
  const env={...process.env,PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY:key};
  const probe=spawnSync('C:/Program Files/AI-PDM Windows Service/extractors/SolidWorksDocumentManagerCredentialProbe.exe',[],{windowsHide:true,encoding:'utf8',env,timeout:30000});
  if(probe.status!==0)throw new Error('LOCAL_LICENSE_PROBE_FAILED');
  const results=[];
  for(const source of sources) {
    const bytes=await fs.readFile(source.original_path);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==source.content_hash)throw new Error('SOURCE_HASH_MISMATCH');
    const imagePath=path.join(out,source.file_name+'.png');
    const staged=path.join(out,source.file_name);
    await fs.writeFile(staged,bytes,{flag:'wx'});
    const native=spawnSync('C:/Program Files/AI-PDM Windows Service/extractors/SolidWorksDocumentManagerPreviewExporter.exe',[staged,imagePath],{windowsHide:true,encoding:'utf8',env,timeout:120000});
    await fs.rm(staged);
    let png;try{png=await fs.readFile(imagePath)}catch{}
    const valid=native.status===0&&png?.subarray(0,8).toString('hex')==='89504e470d0a1a0a';
    results.push({file:source.file_name,sourceHash:source.content_hash,nativeExit:native.status,diagnostic:String(native.stderr||'').replaceAll(key,'[redacted]').slice(0,1000),valid,bytes:png?.length,width:valid?png.readUInt32BE(16):null,height:valid?png.readUInt32BE(20):null});
  }
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({layer:'real original CAD and installed native exporter; no API completion or business-data write',results},null,2));
  console.log(JSON.stringify(results));
  if(results.length!==2||results.some(result=>!result.valid))process.exitCode=1;
}finally{key=null;await db.end();}
