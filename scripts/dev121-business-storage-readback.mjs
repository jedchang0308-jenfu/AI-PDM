import fs from 'node:fs';
import path from 'node:path';
import {collectDev121BusinessStorageReadback} from './lib/dev121-business-storage-readback.mjs';
if(process.argv.length!==4 || process.argv[2]!=='--output' || !path.isAbsolute(process.argv[3]))throw new Error('Required: --output <absolute new receipt path>');
const token=process.env.DEV121_STORAGE_OPERATOR_TOKEN;
if(typeof token!=='string' || token.length<20)throw new Error('A memory-only authorized operator OAuth token is required; no ADC or key file fallback');
const receipt=await collectDev121BusinessStorageReadback({getJson:async url=>{
  const response=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`}});
  return {status:response.status,body:response.status===200?await response.json():null};
}});
fs.writeFileSync(process.argv[3],JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:receipt.status,ownResourcesVerified:receipt.ownResourcesVerified,releaseAuthority:false,output:process.argv[3]}));
