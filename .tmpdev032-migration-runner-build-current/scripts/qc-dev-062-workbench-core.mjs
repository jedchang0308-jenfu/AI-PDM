#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  decodePdmWorkbenchCursor,
  encodePdmWorkbenchCursor,
  pdmWorkbenchFilterHash,
  PdmWorkbenchCursorError
} from "@/lib/pdm-workbench-cursor";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = async (id, run) => {
  try {
    await run();
    checks.push({ id, passed: true });
  } catch (error) {
    checks.push({ id, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
};

await check("CORE-01 shared core stays mechanics-only", () => {
  const files = [
    "src/lib/pdm-workbench-contract.ts",
    "src/lib/pdm-workbench-cursor.ts",
    "src/lib/repositories/pdm-workbench-read-snapshot.ts",
    "src/components/use-pdm-workbench-controller.ts"
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /switch\s*\(\s*module\s*\)|module\s*===/u, `${file} contains a module switch`);
    assert.doesNotMatch(source, /<(?:Part|Drawing|Relation)[A-Z]/u, `${file} renders a domain component`);
  }
});

await check("CORE-02 cursor is signed, deterministic and scope-bound", () => {
  const env = { NODE_ENV: "test", PDM_AUTH_SECRET: "dev062-core-secret" };
  const base = {
    namespace: "part-v1",
    filters: { view: "all", query: "P01", history: false },
    companyId: "company-a",
    actorId: "actor-a"
  };
  const filterHash = pdmWorkbenchFilterHash(base);
  const payload = { version: 1, filterHash, updatedAt: "2026-08-10T00:00:00.000Z", rowKey: "part:stable-id" };
  const cursor = encodePdmWorkbenchCursor(payload, env);
  assert.equal(encodePdmWorkbenchCursor(payload, env), cursor);
  assert.deepEqual(decodePdmWorkbenchCursor(cursor, filterHash, env), payload);
  const mismatches = [
    pdmWorkbenchFilterHash({ ...base, filters: { ...base.filters, query: "P02" } }),
    pdmWorkbenchFilterHash({ ...base, actorId: "actor-b" }),
    pdmWorkbenchFilterHash({ ...base, companyId: "company-b" }),
    pdmWorkbenchFilterHash({ ...base, namespace: "relation-v1" })
  ];
  for (const expectedHash of mismatches) {
    assert.throws(() => decodePdmWorkbenchCursor(cursor, expectedHash, env), PdmWorkbenchCursorError);
  }
  assert.throws(() => decodePdmWorkbenchCursor(`${cursor}x`, filterHash, env), PdmWorkbenchCursorError);
});

await check("CORE-03 PostgreSQL snapshot is repeatable-read and read-only", async () => {
  const trace = [];
  const snapshot = { kind: "postgres", execute: async (sql) => { trace.push(sql); } };
  const client = {
    kind: "postgres",
    transaction: async (run) => {
      trace.push("BEGIN");
      const result = await run(snapshot);
      trace.push("COMMIT");
      return result;
    }
  };
  const value = await withPdmWorkbenchReadSnapshot(client, async () => {
    trace.push("READ");
    return 62;
  });
  assert.equal(value, 62);
  assert.deepEqual(trace, ["BEGIN", "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", "READ", "COMMIT"]);
});

await check("CORE-04 SQLite uses one transaction and hydration failure is atomic", async () => {
  const trace = [];
  const snapshot = { kind: "sqlite", execute: async (sql) => { trace.push(sql); } };
  const client = {
    kind: "sqlite",
    transaction: async (run) => {
      trace.push("BEGIN");
      try {
        const result = await run(snapshot);
        trace.push("COMMIT");
        return result;
      } catch (error) {
        trace.push("ROLLBACK");
        throw error;
      }
    }
  };
  await assert.rejects(
    withPdmWorkbenchReadSnapshot(client, async () => {
      trace.push("IDENTITY");
      throw new Error("hydrate_failed");
    }),
    /hydrate_failed/u
  );
  assert.deepEqual(trace, ["BEGIN", "IDENTITY", "ROLLBACK"]);
});

await check("CORE-05 Part and Relation reuse controller, cursor and snapshot", () => {
  for (const file of ["src/components/part-workbench.tsx", "src/components/relation-workbench.tsx"]) {
    const source = read(file);
    assert.match(source, /usePdmWorkbenchController/u);
    assert.doesNotMatch(source, /new AbortController|addEventListener\(["']popstate|decodePdmWorkbenchCursor|encodePdmWorkbenchCursor/u);
  }
  for (const file of ["src/lib/part-workbench.ts", "src/lib/relation-workbench.ts"]) {
    const source = read(file);
    assert.match(source, /pdm-workbench-cursor/u);
  }
  for (const file of ["src/lib/repositories/part-workbench-async-repository.ts", "src/lib/repositories/relation-workbench-async-repository.ts"]) {
    assert.match(read(file), /withPdmWorkbenchReadSnapshot/u);
  }
});

await check("CORE-06 routes and owner content keep bounded responsibilities", () => {
  const relationDetailRoute = read("src/app/api/numbering/relations/[rowKey]/route.ts");
  assert.match(relationDetailRoute, /export async function GET/u);
  assert.doesNotMatch(relationDetailRoute, /export async function (?:POST|PATCH|PUT|DELETE)/u);
  const searchPage = read("src/app/numbering/search/page.tsx");
  assert.doesNotMatch(searchPage, /@\/app\/parts\/page/u);
  assert.match(searchPage, /@\/components\/part-detail-content/u);
  assert.match(read("src/components/part-detail-content.tsx"), /export function PartDetailPanel/u);
  assert.match(read("src/components/part-module.tsx"), /from "@\/components\/part-detail-content"/u);
  assert.doesNotMatch(read("src/app/parts/page.tsx"), /NumberStateModuleTabs|activeTab/u);
  assert.doesNotMatch(read("src/components/part-workbench.tsx"), /NumberStateModuleTabs|activeTab/u);
  assert.doesNotMatch(read("src/components/relation-workbench.tsx"), /NumberStateModuleTabs|activeTab/u);
  assert.doesNotMatch(
    read("src/components/use-pdm-workbench-controller.ts"),
    /setQueryState\(\(current\)\s*=>\s*\{[\s\S]*?writeCurrentLocation/u,
    "location writes must not run inside a React state updater"
  );
});

const failed = checks.filter((item) => !item.passed);
if (process.env.DEV062_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.DEV062_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.DEV062_EVIDENCE_DIR, "core-results.json"),
    `${JSON.stringify({ suite: "DEV-062 Workbench Core", passed: failed.length === 0, checks }, null, 2)}\n`,
    "utf8"
  );
}
console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exit(1);
