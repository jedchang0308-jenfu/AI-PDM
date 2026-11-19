import assert from "node:assert/strict";
import {mkdtemp,readFile,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {LocalAssemblyStorageAdapter} from "../src/lib/assembly-storage.ts";
import {validateAssemblyArchive} from "../src/lib/assembly-archive.ts";
import {stageAssembly} from "../windows-service/service/assembly-analysis.mjs";

const archivePath=process.argv[2];
if (!archivePath) throw new Error("Supply the ZIP to verify");
const root=await mkdtemp(path.join(tmpdir(),"aipdm-dev129-transport-"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
try {
  const source=await readFile(archivePath);
  const storage=new LocalAssemblyStorageAdapter(root);
  const session=await storage.startUpload({key:"sample/source.zip",byteSize:source.length});
  for (let offset=0;offset<source.length;offset+=8*1024*1024) {
    await storage.putChunk(session,offset,source.subarray(offset,offset+8*1024*1024));
  }
  const {object}=await storage.getUploadStatus(session);
  const archive=await storage.openObject(object);
  const manifest=await validateAssemblyArchive(archive);
  assert.equal(manifest.sha256,hash(source));
  const downloaded=createHash("sha256");
  for await (const bytes of archive.stream()) downloaded.update(bytes);
  assert.equal(downloaded.digest("hex"),manifest.sha256);
  const directory=path.join(root,"worker-job");
  await mkdir(directory);
  const job={byteSize:manifest.byteSize,archiveSha256:manifest.sha256,entries:manifest.entries.filter(entry=>!entry.directory),
    deliveryConfigurations:[],mainEntryKey:null};
  const requestPath=await stageAssembly(job,archive.stream(),directory);
  const request=JSON.parse(await readFile(requestPath,"utf8"));
  for(const entry of request.entries) assert.equal(hash(await readFile(path.join(request.root,entry.relativePath))),entry.sha256);
  console.log(JSON.stringify({archiveBytes:source.length,archiveSha256:manifest.sha256,files:request.entries.length,
    assemblies:manifest.assemblyEntryKeys.length,downloadEqual:true,workerStageEqual:true}));
} finally {
  await rm(root,{recursive:true,force:true});
}
