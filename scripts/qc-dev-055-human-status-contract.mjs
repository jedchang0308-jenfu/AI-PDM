#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const sourceFiles = [
  "src/lib/human-status-projection.ts",
  "src/lib/availability-scope.ts",
  "src/lib/numbering-human-status-viewer.ts",
  "src/lib/part-human-status.ts",
  "src/lib/drawing-part-relation-status.ts",
  "src/lib/drawing-workbench-status.ts",
  "src/components/human-status-badge.tsx",
  "src/components/drawing-workbench.tsx",
  "src/app/parts/page.tsx",
  "src/app/numbering/search/page.tsx",
  "src/app/api/parts/route.ts",
  "src/app/api/parts/[partNumber]/route.ts",
  "src/app/api/numbering/relations/route.ts",
  "src/app/api/numbering/roots/[rootCode]/route.ts"
];
const sources = sourceFiles.map(read).join("\n");

assert.ok(sources.includes("HumanStatusProjection"), "shared projection type must be present");
assert.ok(sources.includes("viewerStatusMatchesFilter"), "server-side viewer filter must be present");
assert.ok(sources.includes("humanStatus"), "API/UI must expose humanStatus");
assert.ok(sources.includes("viewerStatus"), "API/UI must expose viewer-specific status");
assert.ok(sources.includes("availabilityScope"), "API/UI must expose availability scope");
assert.ok(read("src/lib/availability-scope.ts").includes("projectPartAvailability"), "part availability must use dependency-aware projector");
assert.ok(read("src/lib/availability-scope.ts").includes("projectRelationRootAvailability"), "relation availability must use relationship-aware projector");
assert.equal(sources.includes("草稿確認"), false, "ambiguous 草稿確認 vocabulary must be removed from active UI/API source");
assert.ok(read("src/components/drawing-workbench.tsx").includes("viewerStatus={row.viewerStatus}"), "drawing list must use viewer-specific status");
assert.equal(read("src/components/drawing-workbench.tsx").includes('data-label="下一步"'), false, "drawing list must not repeat a next-step column");
assert.ok(read("src/app/parts/page.tsx").includes("viewerStatus={part.viewerStatus}"), "part list must use viewer-specific status");
assert.ok(read("src/app/numbering/search/page.tsx").includes("viewerStatus={root.viewerStatus}"), "relation list must use viewer-specific status");
assert.ok(read("src/components/drawing-workbench.tsx").includes("availabilityScope={row.availabilityScope}"), "drawing list must show availability scope when usable");
assert.ok(read("src/app/parts/page.tsx").includes("availabilityScope={part.availabilityScope}"), "part list must show availability scope when usable");
assert.ok(read("src/app/numbering/search/page.tsx").includes("availabilityScope={root.availabilityScope}"), "relation list must show availability scope when usable");
assert.equal(read("src/app/parts/page.tsx").includes("pdm-detail-drawer-floating-actions"), false, "part drawer must reuse shared overlay shell without floating controls");
assert.ok(read("src/app/api/parts/route.ts").indexOf(".filter((part) => viewerStatusMatchesFilter") < read("src/app/api/parts/route.ts").indexOf(".slice(0, requestedLimit)"), "part viewer filter must precede response limit");
assert.ok(read("src/app/api/numbering/relations/route.ts").indexOf(".filter((root) => viewerStatusMatchesFilter") < read("src/app/api/numbering/relations/route.ts").indexOf(".slice(0, requestedLimit)"), "relation viewer filter must precede response limit");
const relationRoute = read("src/app/api/numbering/relations/route.ts");
const rootDetailRoute = read("src/app/api/numbering/roots/[rootCode]/route.ts");
assert.ok(relationRoute.includes('import { projectNumberingRootStatus } from "@/lib/drawing-part-relation-status"'), "relation list must import the canonical root projector");
assert.ok(rootDetailRoute.includes('import { projectNumberingRootStatus } from "@/lib/drawing-part-relation-status"'), "root detail must import the same canonical root projector");
assert.ok(relationRoute.includes("const rootStatus = projectNumberingRootStatus(detail)"), "relation list must project each root before presentation");
assert.ok(rootDetailRoute.includes("const rootStatus = projectNumberingRootStatus(detail)"), "root detail must project the root before presentation");
assert.equal(relationRoute.includes("function relationshipHealth("), false, "relation route must not retain a competing private root health authority");
assert.ok(["src/app/api/parts/route.ts", "src/app/api/parts/[partNumber]/route.ts", "src/app/api/numbering/relations/route.ts", "src/app/api/numbering/roots/[rootCode]/route.ts"].every((file) => read(file).includes('"cache-control": "private, no-store"')), "viewer-specific APIs must disable shared caching");

console.log(JSON.stringify({ suite: "DEV-055 human status contract", passed: 13, failed: 0, sourceFiles }, null, 2));
