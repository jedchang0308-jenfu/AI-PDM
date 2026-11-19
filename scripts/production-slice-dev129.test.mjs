import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyProductionPath,createProductionSlicePlan} from "./lib/production-slice-plan.mjs";
test("assembly native builder and bounded UI/archive probes select their owning responsibilities",()=>{
  assert.ok(classifyProductionPath("scripts/build-dev129-assembly-analyzer.ps1").includes("worker"));
  for(const path of ["scripts/qc-dev129-assembly-browser.mjs","scripts/qc-dev129-assembly-zip.mjs"]){
    const plan=createProductionSlicePlan([path]);assert.ok(plan.gates.application);assert.equal(plan.gates.infrastructure,false);assert.equal(plan.classification,"AFFECTED_SLICES");
  }
  assert.deepEqual(classifyProductionPath("scripts/unreviewed-assembly-helper.mjs"),["unknown"]);
});
