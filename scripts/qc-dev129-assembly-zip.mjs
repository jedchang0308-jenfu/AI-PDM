import assert from "node:assert/strict";
import {mkdtemp,readFile,mkdir,rm,open,stat} from "node:fs/promises";
import {createReadStream} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {LocalAssemblyStorageAdapter} from "../src/lib/assembly-storage.ts";
import {validateAssemblyArchive} from "../src/lib/assembly-archive.ts";
import {stageAssembly} from "../windows-service/service/assembly-analysis.mjs";

const archivePath=process.argv[2];
if (!archivePath) throw new Error("Supply the ZIP to verify");
const root=await mkdtemp(path.join(tmpdir(),"aipdm-dev129-transport-"));
const started=performance.now();
try {
  const {size}=await stat(archivePath);
  const storage=new LocalAssemblyStorageAdapter(root);
  const session=await storage.startUpload({key:"sample/source.zip",byteSize:size});
  const chunk=Buffer.allocUnsafe(8*1024*1024);
  const sourceHash=createHash("sha256");
  const source=await open(archivePath,"r");
  try {
    for(let offset=0;offset<size;) {
      const length=Math.min(chunk.length,size-offset);
      let received=0;
      while(received<length) {
        const {bytesRead}=await source.read(chunk,received,length-received,offset+received);
        assert.ok(bytesRead>0);
        received+=bytesRead;
      }
      const bytes=chunk.subarray(0,length);
      sourceHash.update(bytes);
      await storage.putChunk(session,offset,bytes);
      offset+=length;
      if(offset===chunk.length) assert.equal((await storage.getUploadStatus(session)).nextOffset,offset);
    }
  } finally {await source.close();}
  const {object}=await storage.getUploadStatus(session);
  const archive=await storage.openObject(object);
  const manifest=await validateAssemblyArchive(archive);
  assert.equal(manifest.sha256,sourceHash.digest("hex"));
  const downloaded=createHash("sha256");
  for await (const bytes of archive.stream()) downloaded.update(bytes);
  assert.equal(downloaded.digest("hex"),manifest.sha256);
  const directory=path.join(root,"worker-job");
  await mkdir(directory);
  const job={byteSize:manifest.byteSize,archiveSha256:manifest.sha256,entries:manifest.entries.filter(entry=>!entry.directory),
    deliveryConfigurations:[],mainEntryKey:null};
  const requestPath=await stageAssembly(job,archive.stream(),directory);
  const request=JSON.parse(await readFile(requestPath,"utf8"));
  for(const entry of request.entries) {
    const digest=createHash("sha256");
    for await (const chunk of createReadStream(path.join(request.root,entry.relativePath))) digest.update(chunk);
    assert.equal(digest.digest("hex"),entry.sha256);
  }
  console.log(JSON.stringify({archiveBytes:size,archiveSha256:manifest.sha256,files:request.entries.length,
    assemblies:manifest.assemblyEntryKeys.length,downloadEqual:true,workerStageEqual:true,
    elapsedMs:Math.round(performance.now()-started),peakProcessRssKiB:process.resourceUsage().maxRSS}));
} finally {
  await rm(root,{recursive:true,force:true});
}
