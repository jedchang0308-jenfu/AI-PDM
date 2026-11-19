import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";

function integrityStream(expectedSize, expectedHash) {
  let count = 0;
  const hash = createHash("sha256");
  return new Transform({
    transform(chunk, encoding, done) {
      count += chunk.length;
      if (count > expectedSize) return done(new Error("ASSEMBLY_CONTENT_SIZE_INVALID"));
      hash.update(chunk);
      done(null,chunk);
    },
    flush(done) {
      done(count === expectedSize && hash.digest("hex") === expectedHash ? null : new Error("ASSEMBLY_CONTENT_DIGEST_INVALID"));
    }
  });
}
export async function stageAssembly(job, input, directory, signal) {
  if (!Number.isSafeInteger(job.byteSize) || job.byteSize < 22 || job.byteSize > 268435456 ||
      !Array.isArray(job.entries) || job.entries.length > 10000) throw new Error("ASSEMBLY_JOB_INVALID");
  const zip = path.join(directory,"source.zip");
  await pipeline(input, integrityStream(job.byteSize, job.archiveSha256), createWriteStream(zip,{flags:"wx"}), {signal});
  const root = path.join(directory,"cad");
  await fs.mkdir(root);
  let expanded = 0;
  for (const entry of job.entries) {
    const pieces = entry.relativePath.split("/");
    if (pieces.some(p=> !p || p==="." || p===".." || /[\\:*?"<>|\u0000-\u001f]/u.test(p) ||
        /[. ]$/u.test(p) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(p))) throw new Error("ASSEMBLY_PATH_INVALID");
    expanded += entry.byteSize;
    if (![entry.byteSize,entry.dataOffset,entry.compressedSize].every(n=>Number.isSafeInteger(n) && n>=0) ||
        expanded>2147483648 || entry.dataOffset + entry.compressedSize > job.byteSize ||
        ![0,8].includes(entry.method)) throw new Error("ASSEMBLY_ENTRY_INVALID");
    const target = path.join(root,...pieces);
    await fs.mkdir(path.dirname(target),{recursive:true});
    const source = entry.compressedSize ? createReadStream(zip,{start:entry.dataOffset,end:entry.dataOffset+entry.compressedSize-1}) : Readable.from([]);
    const streams = [source];
    if (entry.method===8) streams.push(createInflateRaw());
    await pipeline(...streams,integrityStream(entry.byteSize,entry.sha256),createWriteStream(target,{flags:"wx"}),{signal});
  }
  const requestPath = path.join(directory,"request.json");
  await fs.writeFile(requestPath,JSON.stringify({root,mainEntryKey:job.mainEntryKey,deliveryConfigurations:job.deliveryConfigurations,
    entries:job.entries.map(({entryKey,relativePath,sha256,byteSize})=>({entryKey,relativePath,sha256,byteSize}))}),{flag:"wx"});
  return requestPath;
}
