import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./normalize.mjs";
import { boundedProcess } from "./process.mjs";
const source = { sha256: "a".repeat(64), bytes: 100, fileName: "A.SLDPRT", extension: ".SLDPRT" };
const opened = (overrides = {}) => ({ schemaVersion: "aipdm.openswx-public-api.v1", status: "opened",
  documentType: "part", version: 12155, globalProperties: {}, configurations: [], sheetCount: 0, ...overrides });
test("Unicode, quotes, linked-looking strings and empty values stay stored-only", () => {
  const r = normalize(opened({ globalProperties: { "品名": "本體_右", "公式": '$PRP:"SW-Mass"', "空": "" } }), source);
  assert.equal(r.outcome, "partial");
  assert.deepEqual(r.properties.map(p => [p.name, p.storedValue]), [["品名","本體_右"],["公式",'$PRP:"SW-Mass"'],["空",""]]);
  for (const p of r.properties) for (const field of ["propertyType","linkedExpression","evaluatedValue"])
    assert.deepEqual(p[field], { availability: "unsupported_by_public_api" });
});
test("effective config overrides are never labeled pure config-owned", () => {
  const r=normalize(opened({globalProperties:{material:"steel"},configurations:[
    {name:"展開",index:2,effectiveProperties:{material:"aluminum", inherited:"X"}}]}),source);
  assert.equal(r.properties[0].scope,"document_global");
  assert.equal(r.configurations[0].nameAvailability,"library_resolved_source_unknown");
  assert.deepEqual(r.properties.slice(1).map(p=>[p.scope,p.configurationName,p.storedValue]),
    [["configuration_effective_merged","展開","aluminum"],["configuration_effective_merged","展開","X"]]);
});
test("unknown names, version and empty properties preserve ambiguity", () => {
  const r=normalize(opened({version:0,configurations:[{name:"",index:0,effectiveProperties:{}}]}),source);
  assert.equal(r.version.availability,"absent_or_unparsed");
  assert.equal(r.configurations[0].nameAvailability,"unknown");
  assert.equal(r.coverage.storedValues,"empty_unknown");
  assert.ok(r.diagnostics.includes("empty_properties_not_proof_of_absence"));
});
test("drawing scopes are distinct from parse failures", () => {
  const r=normalize(opened({documentType:"drawing"}),{...source,extension:".SLDDRW"});
  assert.equal(r.documentTypeProvenance,"extension_inferred");
  assert.equal(r.configurations.length,0);
  const fail=normalize({schemaVersion:"aipdm.openswx-public-api.v1",status:"failed",diagnostics:["library_open_rejected"]},source);
  assert.equal(fail.outcome,"failed");
});
test("wrong type, malformed payload, schema and source binding fail closed", () => {
  for(const payload of [opened({documentType:"assembly"}),opened({globalProperties:[]}),
    opened({globalProperties:{x:2}}),opened({version:-1}),opened({configurations:[{name:null,index:0}]}),
    {...opened(),schemaVersion:"solidworks-native-properties.v1"}])
    assert.throws(()=>normalize(payload,source));
  assert.throws(()=>normalize(opened(),{...source,sha256:"unknown"}));
});
test("property type/linked/evaluated values cannot be manufactured by extra fields", () => {
  const r=normalize(opened({globalProperties:{x:"1"},evaluatedValue:"2",propertyType:"number"}),source);
  assert.equal(r.properties[0].storedValue,"1");
  assert.deepEqual(r.properties[0].evaluatedValue,{availability:"unsupported_by_public_api"});
});
test("bounded output is enforced across repeated chunks", async () => {
  const r=await boundedProcess(process.execPath,["-e","process.stdout.write('x'.repeat(10000))"],{maxBytes:100});
  assert.equal(r.reason,"output_limit_exceeded");
  assert.ok(r.stdoutBytes>100);
});
test("timeout ends only the spawned finite child", async () => {
  const r=await boundedProcess(process.execPath,["-e","setInterval(()=>{},1000)"],{timeoutMs:100});
  assert.equal(r.reason,"timeout");
  assert.throws(()=>process.kill(r.pid,0));
});
test("invalid UTF8 is rejected instead of replacing stored text", async () => {
  const r=await boundedProcess(process.execPath,["-e","process.stdout.write(Buffer.from([255]))"]);
  assert.equal(r.reason,"invalid_utf8");
});
test("pre-aborted parse does not spawn a child", async () => {
  const c = new AbortController(); c.abort();
  const r = await boundedProcess(process.execPath, ["-e", "throw Error('must-not-run')"], { signal: c.signal });
  assert.equal(r.reason, "aborted"); assert.equal(r.pid, undefined); assert.equal(r.cleanupVerified, true);
});
test("abort tears down only the own finite child", async () => {
  const c = new AbortController(); const timer = setTimeout(() => c.abort(), 100);
  try {
    const r = await boundedProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { signal: c.signal });
    assert.equal(r.reason, "aborted"); assert.equal(r.cleanupVerified, true); assert.throws(() => process.kill(r.pid, 0));
  } finally { clearTimeout(timer); }
});
test("Linux ignores SIGTERM and descendant stdout are bounded by own group KILL", { skip: process.platform !== "linux" }, async () => {
  const code = "const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:['ignore',1,2]});setInterval(()=>{},1000)";
  const start = Date.now();
  const r = await boundedProcess(process.execPath, ["-e", code], { timeoutMs: 300 });
  assert.equal(r.reason, "timeout"); assert.equal(r.cleanupVerified, true); assert.ok(Date.now() - start < 2500);
  assert.throws(() => process.kill(-r.pid, 0));
});
