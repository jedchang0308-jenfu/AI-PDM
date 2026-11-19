import { describe,expect,it } from "vitest";
import { validateAssemblyAnalysisResult } from "./assembly-analysis-result";
import type { AssemblyArchiveManifest } from "./assembly-archive";

const manifest={assemblyEntryKeys:["main"],entries:[{entryKey:"main"},{entryKey:"part"}]} as AssemblyArchiveManifest;
const result=()=>({version:1,status:"complete",parserVersion:"test",mainEntryKey:"main",mainCandidates:["main"],
  configurationNames:["Standard","Service"],configurations:[{name:"Standard",references:{status:"passed",issues:[]},
    bom:{rows:[{entryKey:"part",parentKey:"main",occurrenceKey:"bolt-1",configuration:"Default",quantity:"1",unit:"EA",disposition:"pending"}]}}]});
describe("assembly CAD results",()=>{
  it("accepts checked geometry even when material is awaiting matching",()=>{
    expect(validateAssemblyAnalysisResult(result(),manifest,"main",["Standard"]).status).toBe("complete");
  });
  it("keeps incomplete delivery configurations from passing",()=>{
    expect(()=>validateAssemblyAnalysisResult(result(),manifest,"main",["Standard","Service"])).toThrow("ASSEMBLY_RESULT_INVALID");
  });
  it("rejects a row bound to a different package",()=>{
    const value=result();value.configurations[0].bom.rows[0].entryKey="missing";
    expect(()=>validateAssemblyAnalysisResult(value,manifest,"main",[])).toThrow();
  });
  it("requires missing-reference diagnostics for a blocked configuration",()=>{
    const value=result();value.status="blocked";value.configurations[0].references.status="blocked";
    expect(()=>validateAssemblyAnalysisResult(value,manifest,"main",[])).toThrow();
  });
});
