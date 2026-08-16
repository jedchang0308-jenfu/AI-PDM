#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isUnifiedPartRelationWorkbenchV1Enabled,
  unifiedPartRelationWorkbenchV1ClientStatus
} from "@/lib/number-state-flow-feature";
import { resolveNumberStateLegacyRedirect } from "@/lib/number-state-flow-legacy-route";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (id, run) => {
  try {
    run();
    checks.push({ id, passed: true });
  } catch (error) {
    checks.push({ id, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
};

check("COMPAT-01 umbrella flag is off by default and dependency-bound", () => {
  assert.equal(isUnifiedPartRelationWorkbenchV1Enabled({}), false);
  assert.equal(isUnifiedPartRelationWorkbenchV1Enabled({ PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true", PDM_NUMBER_STATE_FLOW_V1: "false" }), false);
  assert.equal(isUnifiedPartRelationWorkbenchV1Enabled({ PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true", PDM_NUMBER_STATE_FLOW_V1: "true" }), true);
  assert.deepEqual(unifiedPartRelationWorkbenchV1ClientStatus({ PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true", PDM_NUMBER_STATE_FLOW_V1: "false" }), {
    enabled: false,
    requested: true,
    flag: "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
    dependency: "PDM_NUMBER_STATE_FLOW_V1",
    phase: "DEV-062"
  });
});

check("COMPAT-02 legacy Part URL canonicalizes only when flag is on", () => {
  const off = resolveNumberStateLegacyRedirect("/numbering/part-drafts", new URLSearchParams("detail=ws-1"), false);
  assert.equal(off?.pathname, "/parts");
  assert.equal(off?.searchParams.get("tab"), "drafts");
  assert.equal(off?.searchParams.get("detail"), "ws-1");
  const on = resolveNumberStateLegacyRedirect("/numbering/part-drafts", new URLSearchParams("detail=ws-1"), true);
  assert.equal(on?.pathname, "/parts");
  assert.equal(on?.searchParams.get("view"), "work");
  assert.equal(on?.searchParams.get("detail"), "candidate:ws-1");
  assert.equal(on?.searchParams.has("tab"), false);
});

check("COMPAT-03 request URL preserves creation intent and rejects unsafe returnTo", () => {
  const safe = resolveNumberStateLegacyRedirect("/numbering/request", new URLSearchParams("returnTo=%2Fnumbering%2Fsearch%3Fquery%3DA"), true);
  assert.equal(safe?.pathname, "/numbering/search");
  assert.equal(safe?.searchParams.get("view"), "work");
  assert.equal(safe?.searchParams.get("create"), "new_bundle");
  assert.equal(safe?.searchParams.get("returnTo"), "/numbering/search?query=A");
  const unsafe = resolveNumberStateLegacyRedirect("/numbering/request", new URLSearchParams("returnTo=https%3A%2F%2Fevil.invalid"), true);
  assert.equal(unsafe?.searchParams.has("returnTo"), false);
});

check("COMPAT-04 workbench read endpoints are feature-gated and private", () => {
  for (const file of [
    "src/app/api/parts/workbench/route.ts",
    "src/app/api/parts/workbench/[rowKey]/route.ts",
    "src/app/api/numbering/relations/route.ts",
    "src/app/api/numbering/relations/[rowKey]/route.ts"
  ]) {
    const source = read(file);
    assert.match(source, /isUnifiedPartRelationWorkbenchV1Enabled/u, `${file} is not gated`);
    assert.match(source, /private, no-store/u, `${file} lacks private no-store`);
  }
});

check("COMPAT-05 new GET surfaces do not introduce mutation handlers", () => {
  for (const file of [
    "src/app/api/parts/workbench/route.ts",
    "src/app/api/parts/workbench/[rowKey]/route.ts",
    "src/app/api/numbering/relations/[rowKey]/route.ts"
  ]) {
    assert.doesNotMatch(read(file), /export async function (?:POST|PUT|PATCH|DELETE)/u, `${file} exposes a mutation`);
  }
  const relationRoute = read("src/app/api/numbering/relations/route.ts");
  assert.match(relationRoute, /export async function POST/u, "canonical relation mutation was removed");
});

check("COMPAT-06 flag-off pages keep legacy modules; flag-on pages use owner workbenches", () => {
  const partModule = read("src/components/part-detail-content.tsx");
  const searchPage = read("src/app/numbering/search/page.tsx");
  assert.match(partModule, /if \(!workbenchEnabled\) return <LegacyPartsPage/u);
  assert.match(partModule, /return <PartWorkbench/u);
  assert.match(searchPage, /if \(!workbenchEnabled\) return <LegacyNumberingSearchPage/u);
  assert.match(searchPage, /return <RelationWorkbench/u);
});

check("COMPAT-07 opening formal Part detail keeps required-MA resolution read-only", () => {
  const partModule = read("src/components/part-detail-content.tsx");
  const resolverRoute = read("src/app/api/manufacturing-baselines/resolve/route.ts");
  assert.match(partModule, /fetch\(`\/api\/manufacturing-baselines\/resolve\?\$\{resolverParams\.toString\(\)\}`/u);
  assert.doesNotMatch(partModule, /fetch\("\/api\/manufacturing-baselines\/resolve",\s*\{\s*method:\s*"POST"/u);
  assert.match(resolverRoute, /export async function GET/u);
  assert.match(resolverRoute, /private, no-store/u);
});

check("COMPAT-08 Relation deep link reconciles domain target from authoritative detail", () => {
  const relationWorkbench = read("src/components/relation-workbench.tsx");
  assert.match(relationWorkbench, /if \(!detail\?\.rootDetail\) return/u);
  assert.match(relationWorkbench, /setDetailTarget\(\(current\)/u);
  assert.match(relationWorkbench, /entityType: "part_root", rootCode/u);
});

const failed = checks.filter((item) => !item.passed);
if (process.env.DEV062_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.DEV062_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.DEV062_EVIDENCE_DIR, "compat-results.json"),
    `${JSON.stringify({ suite: "DEV-062 Compatibility", passed: failed.length === 0, checks }, null, 2)}\n`,
    "utf8"
  );
}
console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exit(1);
