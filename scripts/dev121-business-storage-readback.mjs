import fs from 'node:fs';
import path from 'node:path';
import {readGcsObject} from './lib/dev012-production-migration-runner.mjs';
import {collectDev121BusinessStorageReadback,collectDev121MigrationImageReadback} from './lib/dev121-business-storage-readback.mjs';
const args=process.argv.slice(2);
const migrationMode=args.length===4 && args[0]==='--infra-ref-json' && path.isAbsolute(args[1]) && args[2]==='--output';
if(!(migrationMode || args.length===2 && args[0]==='--output') || !path.isAbsolute(args.at(-1)))throw new Error('Required: [--infra-ref-json <absolute bound ref file>] --output <absolute new receipt path>');
const output=args.at(-1);
const token=process.env.DEV121_STORAGE_OPERATOR_TOKEN;
if(typeof token!=='string' || token.length<20)throw new Error('A memory-only authorized operator OAuth token is required; no ADC or key file fallback');
const getJson=async url=>{
  const response=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`}});
  return {status:response.status,body:response.status===200?await response.json():null};
};
const receipt=migrationMode?await collectDev121MigrationImageReadback({infraRef:JSON.parse(fs.readFileSync(args[1],'utf8').replace(/^\uFEFF/u,'')),getJson,readObject:options=>readGcsObject({...options,token})}):await collectDev121BusinessStorageReadback({getJson});
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:receipt.status,ownResourcesVerified:receipt.ownResourcesVerified??false,releaseAuthority:false,output:output}));
