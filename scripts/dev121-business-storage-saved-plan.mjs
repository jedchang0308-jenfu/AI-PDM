import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareDev121BusinessStoragePlan} from './lib/dev121-business-storage-saved-plan.mjs';
const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--release-intent-ref-json'||args[2]!=='--output-directory'||!path.isAbsolute(args[1])||!path.isAbsolute(args[3]))throw new Error('Required: --release-intent-ref-json <absolute bound ref file> --output-directory <absolute NEW directory outside source>');
const receipt=await prepareDev121BusinessStoragePlan({root:fileURLToPath(new URL('../',import.meta.url)),intentRef:JSON.parse(fs.readFileSync(args[1],'utf8').replace(/^\uFEFF/u,'')),outputDirectory:args[3],token:process.env.DEV121_STORAGE_OPERATOR_TOKEN,githubToken:process.env.DEV121_STORAGE_GITHUB_TOKEN});
console.log(JSON.stringify({status:receipt.status,applyExecuted:false,releaseAuthority:false,outputDirectory:receipt.outputDirectory}));
