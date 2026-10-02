import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { materializeClaimedPreviewSource } from "./preview-worker-source.mjs";
const bytes = Buffer.from("synthetic preview source");
const digest = crypto.createHash("sha256").update(bytes).digest("hex");
const input = { baseUrl:"https://owner.example", token:"synthetic-token", workerId:"worker-one",
  claim:{jobId:"job-one",sourceExtension:"slddrw",sourceContentHash:digest,originalPath:"gcs://ignored?generation=1"} };
test("fetches only the owner holder endpoint, verifies bytes and cleans its directory", async () => {
  const result = await materializeClaimedPreviewSource({...input, request:async (url, options)=>{
    assert.equal(String(url),"https://owner.example/api/preview-jobs/job-one/content");
    assert.equal(options.redirect,"error");
    assert.equal(options.headers["x-pdm-preview-worker-id"],"worker-one");
    return new Response(bytes,{headers:{"content-hash":digest,"content-length":String(bytes.length)}});
  }});
  const directory = path.dirname(result.sourcePath);
  try { assert.deepEqual(await fs.readFile(result.sourcePath),bytes); }
  finally { await result.cleanup(); }
  await assert.rejects(fs.stat(directory), {code:"ENOENT"});
});
test("rejects corrupt content before materializing a source", async ()=> {
  await assert.rejects(materializeClaimedPreviewSource({...input,request:async()=>new Response("wrong",{headers:{"content-hash":digest,"content-length":"5"}})}),/CONTENT_MISMATCH/);
});
test("never falls back to a local path after holder access denial", async ()=> {
  await assert.rejects(materializeClaimedPreviewSource({...input,request:async()=>new Response(null,{status:403})}),/READ_FAILED:403/);
});
test("rejects unsafe extensions before sending a token", async ()=> {
  await assert.rejects(materializeClaimedPreviewSource({...input,claim:{...input.claim,sourceExtension:"../slddrw"},request:()=>{throw new Error("must not call")}}),/METADATA_INVALID/);
});
