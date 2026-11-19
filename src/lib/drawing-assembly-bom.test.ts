import { describe,it,expect,vi } from "vitest";
import { normalizeAssemblyQuantity,addAssemblyQuantities,assemblyBomRowKey,projectAssemblyAnalysisResult,assemblyBomProjection,aggregateAssemblyBomRows,type AssemblyBomRow } from "./drawing-assembly-bom";
import type { AssemblyPackageRow } from "./drawing-assembly-package";
import type { AsyncDatabaseClient } from "./db-async-provider";
import type { AssemblyAnalysisResult } from "./assembly-analysis-result";
vi.mock("@/lib/jenfu-principal-permission-service",()=>({evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot:vi.fn(async()=>[{allowed:true}])}));
vi.mock("@/lib/principal-job-authority",()=>({parsePrincipalJobInitiator:()=>({principalId:"p",employeeId:"e",identityIssuer:"issuer",identitySubject:"subject",pdmUserId:"u",companyId:"c"})}));
const pkg={id:"pkg",company_id:"c",archive_sha256:"a".repeat(64),main_entry_key:"main",initiator_authority_json:"{}"} as AssemblyPackageRow;
function result():AssemblyAnalysisResult{return {version:1,parserVersion:"fixture1",status:"complete",mainEntryKey:"main",mainCandidates:["main"],configurationNames:["Default"],configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:Array.from({length:12},(_,i)=>({occurrenceKey:`root/bolt${i}`,parentKey:"root",entryKey:"bolt",configuration:"Default",cadPartNumber:"P-BOLT",quantity:"1",unit:"EA",disposition:"material"}))}}]};}
describe("assembly BOM exact projection",()=>{
  it("keeps decimals exact and rejects zero, exponents, floats and negative quantities",()=>{
    expect(addAssemblyQuantities("9007199254740993.01","0.09")).toBe("9007199254740993.1");
    expect(normalizeAssemblyQuantity("12.000")).toBe("12");expect(normalizeAssemblyQuantity(null)).toBeNull();
    for(const value of ["0","0.000","-1","1e3",1.5,"01.2"])expect(()=>normalizeAssemblyQuantity(value)).toThrow();
  });
  it("binds row keys to archive, selected main, configuration and stable occurrence",()=>{
    const row={parentKey:"root",entryKey:"bolt",configuration:"Default",occurrenceKey:"root/bolt1"};
    const key=assemblyBomRowKey(pkg,"Default",row);
    expect(assemblyBomRowKey(pkg,"Default",{...row})).toBe(key);
    expect(assemblyBomRowKey({...pkg,archive_sha256:"b".repeat(64)},"Default",row)).not.toBe(key);
    expect(assemblyBomRowKey(pkg,"Other",row)).not.toBe(key);
  });
  it("combines twelve matched leaf instances under the same parent to 12 EA",async()=>{
    const client={query:vi.fn(async()=>[{id:"part",part_number:"P-BOLT",drawing_number:null}])} as unknown as AsyncDatabaseClient;
    const projected=await projectAssemblyAnalysisResult(client,pkg,result());
    expect(projected.configurations[0].bom.rows).toHaveLength(1);
    expect(projected.configurations[0].bom.rows[0]).toMatchObject({quantity:"12",unit:"EA",partId:"part",disposition:"matched"});
    expect(projected.configurations[0].bom.rows[0].occurrences).toHaveLength(12);
    const again=await projectAssemblyAnalysisResult(client,pkg,result());expect(again).toEqual(projected);
    const rowKey=projected.configurations[0].bom.rows[0].rowKey;
    expect(assemblyBomProjection(again,{Default:{[rowKey]:{quantity:"13",unit:"EA"}}},"Default")?.rows[0].quantity).toBe("13");
  });
  it("does not guess a material from filename, conflicting IDs, other units or unknown quantities",async()=>{
    const client={query:vi.fn(async()=>[{id:"one",part_number:"P-BOLT",drawing_number:null},{id:"two",part_number:"P-BOLT",drawing_number:null}])} as unknown as AsyncDatabaseClient;
    const raw=result();raw.configurations[0].bom.rows[0].quantity=null;
    const projected=await projectAssemblyAnalysisResult(client,pkg,raw);
    expect(projected.configurations[0].bom.rows).toHaveLength(12);
    expect(projected.configurations[0].bom.rows.every(row=>row.partId===null)).toBe(true);
    expect(projected.configurations[0].bom.rows[0].disposition).toBe("quantity_unknown");
    expect(projected.configurations[0].bom.rows[1].disposition).toBe("conflict");
  });
  it("merges equal subassemblies while keeping child quantities per direct parent",()=>{
    const row=(rowKey:string,parentKey:string|null,entryKey:string,quantity:string):AssemblyBomRow=>({rowKey,parentKey,entryKey,configuration:"Default",quantity,unit:"EA",partId:entryKey,disposition:"matched"});
    const rows=[row("assembly1",null,"sub","1"),row("bolt1","assembly1","bolt","2"),row("assembly2",null,"sub","1"),row("bolt2","assembly2","bolt","2")];
    const projected=aggregateAssemblyBomRows(rows,"source");expect(projected).toHaveLength(2);
    expect(projected[0]).toMatchObject({entryKey:"sub",quantity:"2"});expect(projected[1]).toMatchObject({entryKey:"bolt",quantity:"2",parentKey:projected[0].rowKey});
    const unequal=aggregateAssemblyBomRows([...rows.slice(0,3),{...rows[3],quantity:"3"}],"source");expect(unequal).toHaveLength(4);
  });
});
