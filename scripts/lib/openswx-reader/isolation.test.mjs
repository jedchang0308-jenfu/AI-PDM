import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyInspectResponse, containsPath, verifyInputRoot, checkedOutputRoot, checkedInputRoot, parseFlags } from "./isolation.mjs";
test("only exact Engine 404 proves absent; disconnect and other failures stay unknown", () => {
  assert.deepEqual(classifyInspectResponse(404, '{"message":"No such container: exact"}', "exact"), {status:"absent"});
  for(const [code,body] of [[500,'{"message":"daemon unavailable"}'],[404,'{"message":"page not found"}'],
    [404,'{"message":"No such container: other"}'],[403,'{"message":"No such container: exact"}'],
    [200,'{}'],[404,'not JSON']]) assert.throws(()=>classifyInspectResponse(code,body,"exact"));
});
test("case insensitive Windows containment rejects alternate spelling and descendants", () => {
  assert.equal(containsPath("C:\\Stage","c:\\STAGE\\child","win32"),true);
  assert.equal(containsPath("C:\\Stage","c:\\StageOther","win32"),false);
  assert.equal(containsPath("/tmp/stage","/tmp/stage/child","linux"),true);
});
test("input binds only exact manifest files; extra files/directories are rejected", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aipdm-dev122-input-test-"));
  try{
    await fs.writeFile(path.join(root,"A.SLDPRT"),"fixture");
    await verifyInputRoot(root,new Set(["A.SLDPRT"]));
    await fs.writeFile(path.join(root,"extra"),"fixture");
    await assert.rejects(verifyInputRoot(root,new Set(["A.SLDPRT"])));
    await fs.rm(path.join(root,"extra"));
    await fs.mkdir(path.join(root,"sub"));
    await assert.rejects(verifyInputRoot(root,new Set(["A.SLDPRT"])));
  }finally{await fs.rm(root,{recursive:true});}
});
test("output must preexist and cannot overlap input", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aipdm-dev122-overlap-test-"));
  try{
    const input=path.join(root,"input"), output=path.join(root,"output");
    await fs.mkdir(input);await fs.mkdir(output);
    assert.equal(await checkedOutputRoot(output,input),await fs.realpath(output));
    await assert.rejects(checkedOutputRoot(input,input));
    await assert.rejects(checkedOutputRoot(root,input));
    await assert.rejects(checkedOutputRoot(path.join(root,"missing"),input));
  }finally{await fs.rm(root,{recursive:true});}
});

test("exact CLI rejects duplicate and extra flags instead of last-value overwrite", () => {
  const args=["--image","x","--input-root","i","--manifest","m","--output-dir","o"];
  assert.equal(parseFlags(args)["--manifest"],"m");
  assert.throws(()=>parseFlags([...args,"--image","other"]));
  assert.throws(()=>parseFlags(["--image","x","--image","y","--manifest","m","--output-dir","o"]));
  assert.throws(()=>parseFlags(args.slice(0,-1)));
});
test("junction/symlink aliases cannot overlap the input or hide extra scope", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aipdm-dev122-alias-test-"));
  try {
    const input=path.join(root,"input"), output=path.join(root,"output"), alias=path.join(root,"alias");
    await fs.mkdir(input); await fs.mkdir(output);
    await fs.symlink(input,alias,process.platform==="win32"?"junction":"dir");
    await assert.rejects(checkedOutputRoot(alias,input));
    await assert.rejects(verifyInputRoot(alias,new Set()));
  } finally { await fs.rm(root,{recursive:true}); }
});

test("original input parent junction is checked before canonicalization", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aipdm-dev122-parent-alias-test-"));
  try {
    const actual=path.join(root,"actual"), alias=path.join(root,"alias");
    await fs.mkdir(actual);await fs.mkdir(path.join(actual,"input"));
    await fs.symlink(actual,alias,process.platform==="win32"?"junction":"dir");
    await assert.rejects(checkedInputRoot(path.join(alias,"input")));
    assert.equal(await checkedInputRoot(path.join(actual,"input")),await fs.realpath(path.join(actual,"input")));
  }finally{await fs.rm(root,{recursive:true});}
});
