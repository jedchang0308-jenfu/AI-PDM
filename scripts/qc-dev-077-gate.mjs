#!/usr/bin/env node

const {
  isProductionNumberingLifecycleGateOpen,
  isProductionSliceAllowedApiMutation,
  isProductionSliceOpenPagePath
} = await import("../src/lib/production-slice.ts");

const base = { NODE_ENV: "production", PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft" };
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const containment = { ...base, PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE: "containment" };
const unknown = { ...base, PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE: "unexpected-value" };
const draft = { ...base, PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE: "draft-obsolete" };
const formal = { ...base, PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE: "formal-obsolete" };
const local = { NODE_ENV: "development", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true" };

record("Containment blocks direct and formal lifecycle writes", !isProductionSliceAllowedApiMutation("POST", "/api/numbering/records/A0001/obsolete", containment) && !isProductionSliceAllowedApiMutation("POST", "/api/lifecycle/obsolete-requests", containment));
record("Unknown gate fails closed as containment", !isProductionNumberingLifecycleGateOpen("draft-obsolete", unknown) && !isProductionNumberingLifecycleGateOpen("formal-obsolete", unknown));
record("Draft-obsolete opens direct draft obsolete only", isProductionNumberingLifecycleGateOpen("draft-obsolete", draft) && !isProductionNumberingLifecycleGateOpen("formal-obsolete", draft));
record("Formal-obsolete opens formal lifecycle and approvals workbench", isProductionNumberingLifecycleGateOpen("formal-obsolete", formal) && isProductionSliceOpenPagePath("/approvals", formal));
record("Local full validation remains fully open", isProductionNumberingLifecycleGateOpen("draft-obsolete", local) && isProductionNumberingLifecycleGateOpen("formal-obsolete", local));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
