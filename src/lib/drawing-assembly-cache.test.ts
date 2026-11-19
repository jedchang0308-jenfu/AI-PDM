import {describe,it,expect,vi} from "vitest";
import {readAssemblyRawCache,mergeAssemblyRawCache,deriveAssemblySelectionFromCache} from "./drawing-assembly-cache";
import type {AsyncDatabaseClient} from "./db-async-provider";
import type {AssemblyPackageRow,AssemblyAnalysisRow} from "./drawing-assembly-package";
import type {AssemblyAnalysisResult} from "./assembly-analysis-result";
vi.mock("@/lib/jenfu-principal-permission-service",()=>({evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot:vi.fn(async()=>[{allowed:true}])}));
vi.mock("@/lib/principal-job-authority",()=>({parsePrincipalJobInitiator:()=>null}));
const pkg={id:"pkg",company_id:"c",main_entry_key:"main",archive_sha256:"hash",configurations_json:'["A"]',selection_version:3} as AssemblyPackageRow;
const config=(name:string)=>({name,references:{status:"passed" as const,issues:[]},bom:{rows:[]}});
const raw=(main="main",parser="parser1",names=["A"]):AssemblyAnalysisResult=>({version:1,parserVersion:parser,status:"complete",mainEntryKey:main,mainCandidates:[main],configurationNames:names,configurations:names.map(config)});
describe("source/main/parser bound raw configuration cache",()=>{
  it("rejects another main/parser and keeps only passed configuration results",async()=>{
    const invalid=raw();invalid.configurations[0].references.status="blocked";invalid.configurations[0].references.issues=[{code:"missing",parentKey:"root",reference:"x"}];
    const client={query:vi.fn(async()=>[raw("other"),raw("main","other-parser"),invalid,raw("main","parser1",["B"])].map(value=>({raw_result_json:JSON.stringify(value)})))} as unknown as AsyncDatabaseClient;
    const cache=await readAssemblyRawCache(client,pkg,"parser1");expect(cache.configurations.map(value=>value.name)).toEqual(["B"]);
    const fresh=raw("main","parser1",["A"]);expect(mergeAssemblyRawCache(cache,fresh,["A","B"]).configurations.map(value=>value.name)).toEqual(["A","B"]);
    const newParser=raw("main","new-parser",["A"]);expect(mergeAssemblyRawCache(cache,newParser,["A","B"])).toBe(newParser);
  });
  it("derives fully cached selection without a device job and carries manual overrides independently",async()=>{
    const execute=vi.fn(),client={query:vi.fn(async()=>[{raw_result_json:JSON.stringify(raw())}]),queryOne:vi.fn(async()=>({id:"new-analysis"})),execute} as unknown as AsyncDatabaseClient;
    const previous={raw_result_json:JSON.stringify(raw()),overrides_json:'{"A":{"row":{"quantity":"2"}},"Other":{"row":{"quantity":"9"}}}',draft_version:7} as AssemblyAnalysisRow;
    expect(await deriveAssemblySelectionFromCache(client,pkg,previous)).toBe(true);
    const saved=execute.mock.calls.find(([sql])=>String(sql).includes("status='complete'"))?.[1];
    expect(saved).toMatchObject({draftVersion:7,parser:"parser1"});expect(JSON.parse(saved.overrides)).toEqual({A:{row:{quantity:"2"}}});
    expect(JSON.parse(saved.raw).configurations[0].bom.rows).toEqual([]);
  });
  it("keeps manual edits when a new selection still needs an uncached configuration",async()=>{
    const execute=vi.fn(),client={query:vi.fn(async()=>[{raw_result_json:JSON.stringify(raw())}]),queryOne:vi.fn(async()=>({id:"new-analysis"})),execute} as unknown as AsyncDatabaseClient;
    const previous={raw_result_json:JSON.stringify(raw()),overrides_json:'{"A":{"row":{"quantity":"2"}}}',draft_version:3} as AssemblyAnalysisRow;
    expect(await deriveAssemblySelectionFromCache(client,{...pkg,configurations_json:'["A","B"]'},previous)).toBe(false);
    expect(execute.mock.calls[0]?.[1]).toMatchObject({version:3,overrides:'{"A":{"row":{"quantity":"2"}}}'});
    expect(execute.mock.calls.some(([sql])=>String(sql).includes("status='complete'"))).toBe(false);
  });
});
