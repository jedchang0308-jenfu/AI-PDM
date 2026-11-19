import { describe,expect,it } from "vitest";
import { validateAssemblyAnalysisResult } from "./assembly-analysis-result";
import type { AssemblyArchiveManifest } from "./assembly-archive";

const manifest={assemblyEntryKeys:["main"],entries:[{entryKey:"main"},{entryKey:"part"}]} as AssemblyArchiveManifest;
const result=()=>({version:1,status:"complete",parserVersion:"solidworks-document-manager.assembly.v2",mainEntryKey:"main",mainCandidates:["main"],
  configurationNames:["Standard","Service"],configurations:[{name:"Standard",references:{status:"passed",issues:[]},
    bom:{rows:[{entryKey:"part",parentKey:"main",occurrenceKey:"bolt-1",configuration:"Default",quantity:"1",unit:"EA",disposition:"pending"}]}}]});
describe("assembly CAD results",()=>{
  it("accepts checked geometry even when material is awaiting matching",()=>{
    expect(validateAssemblyAnalysisResult(result(),manifest,"main",["Standard"]).status).toBe("complete");
  });
  it.each(["solidworks-document-manager.assembly.v1","unknown-parser","latest",""])("rejects unsupported parser %s",parserVersion=>{
    const value={...result(),parserVersion};expect(()=>validateAssemblyAnalysisResult(value,manifest,"main",[])).toThrow("ASSEMBLY_RESULT_INVALID");
  });
  it("keeps incomplete delivery configurations from passing",()=>{
    expect(()=>validateAssemblyAnalysisResult(result(),manifest,"main",["Standard","Service"])).toThrow("ASSEMBLY_RESULT_INVALID");
  });
  it("rejects a row bound to a different package",()=>{
    const value=result();value.configurations[0].bom.rows[0].entryKey="missing";
    expect(()=>validateAssemblyAnalysisResult(value,manifest,"main",[])).toThrow();
  });
  it.each(["C:\\private\\part.SLDPRT","/private/part.SLDPRT","\\\\server\\part.SLDPRT","part\nsecret"])("rejects unsafe native component label %s",componentName=>{
    const value=result();Object.assign(value.configurations[0].bom.rows[0],{componentName});expect(()=>validateAssemblyAnalysisResult(value,manifest,"main",[])).toThrow();
  });
  it("requires missing-reference diagnostics for a blocked configuration",()=>{
    const value=result();value.status="blocked";value.configurations[0].references.status="blocked";
    expect(()=>validateAssemblyAnalysisResult(value,manifest,"main",[])).toThrow();
  });
});
