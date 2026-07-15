#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { buildDev047LocalInventory } from "./dev-047-local-inventory-utils.mjs";

const root = process.cwd();
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const read = (relativePath) => fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");

const first = buildDev047LocalInventory(root);
const second = buildDev047LocalInventory(root);
const serialized = JSON.stringify(first);
const categories = ["tables", "sequences", "indexes", "constraints", "foreignKeys", "views", "materializedViews", "functions", "triggers", "policies", "grants", "rls"];
const utilitySource = read("scripts/dev-047-local-inventory-utils.mjs");
const generatorSource = read("scripts/generate-dev-047-local-inventory.mjs");
const catalogQuery = read("scripts/sql/dev-047-postgres-catalog-read-only.sql");
const executableCatalogQuery = catalogQuery.split(/\r?\n/u).filter((line) => !line.trim().startsWith("--")).join("\n");
const packageJson = JSON.parse(read("package.json"));

record("DEV047-A0-001 deterministic inventory is byte stable", JSON.stringify(first) === JSON.stringify(second));
record("DEV047-A0-002 artifact is explicitly non-authoritative", first.authority.classification === "pre_pilot_non_authoritative" && first.authority.authoritativePhaseAComplete === false);
record("DEV047-A0-003 pilot/runtime/snapshot evidence is not fabricated", first.authority.pilotStableEvidenceObserved === false && first.authority.runtimeCatalogObserved === false && first.authority.representativeSnapshotObserved === false);
record("DEV047-A0-004 local execution is read-only and offline", Object.entries(first.safety).filter(([key]) => key !== "mode").every(([, value]) => value === false) && first.safety.mode === "read_only_local_artifacts");
record("DEV047-A0-005 every PostgreSQL SQL artifact is hashed", first.sourceArtifacts.filter((item) => item.kind === "postgres_sql_artifact").length === fs.readdirSync(path.join(root, "db", "postgres")).filter((name) => name.endsWith(".sql")).length && first.sourceArtifacts.every((item) => /^[a-f0-9]{64}$/u.test(item.sha256)));
record("DEV047-A0-006 PostgreSQL inventory exposes every required category", categories.every((category) => Array.isArray(first.objects.postgresArtifactDeclarations[category])));
record("DEV047-A0-007 SQLite inventory exposes every required category", categories.every((category) => Array.isArray(first.objects.sqliteCanonicalDeclarations[category])));
record("DEV047-A0-008 local table declarations were discovered", first.summary.postgresArtifactObjects.tables > 0 && first.summary.sqliteCanonicalObjects.tables > 0);
record("DEV047-A0-009 migration history is sourced from the compatibility manifest", first.migrationHistory.length > 0 && first.migrationHistory.every((item) => item.source && item.target && /^[a-f0-9]{64}$/u.test(item.sourceSha256)));
record("DEV047-A0-010 SQLite/PostgreSQL mirror status is explicit", first.sqlitePostgresMirror.length > 0 && first.sqlitePostgresMirror.every((item) => ["mirrored_by_name", "provider_specific_or_missing"].includes(item.status)));
record("DEV047-A0-011 repository and database SQL candidates are indexed", first.summary.repositoryOrDbDependencyCount > 0 && first.codeDependencies.some((item) => item.role === "repository_or_db_runtime" && item.evidenceKind === "raw_sql_candidate"));
record("DEV047-A0-012 scripts and QC dependencies are indexed", first.summary.scriptOrQcDependencyCount > 0 && first.codeDependencies.some((item) => item.role === "qc_script" || item.role === "operational_script"));
record("DEV047-A0-013 dynamic SQL receives manual-review status", first.dynamicSqlCandidates.every((item) => item.status === "manual_review_required"));
record("DEV047-A0-014 external consumers remain unknown", first.externalConsumers.length === 1 && first.externalConsumers[0].status === "unknown_pending_stable_pilot_confirmation");
record("DEV047-A0-015 unknown consumers have bounded blocking semantics", first.externalConsumers[0].effect === "blocks_only_the_future_candidate_batch_that_contains_an_unclassified_dependency");
record("DEV047-A0-016 no migration batch or destination schema is inferred", first.candidateBatches.length === 0 && first.summary.proposedBatchCount === 0);
record("DEV047-A0-017 stable-pilot and runtime metadata blockers remain open", ["DEV046_PHASE3A_PILOT_STABILITY_EVIDENCE_MISSING", "RUNTIME_PG_CATALOG_METADATA_NOT_COLLECTED", "EXTERNAL_CONSUMER_CONFIRMATION_PENDING"].every((blocker) => first.blockers.includes(blocker)));
record("DEV047-A0-018 tooling has no credential/network/database client path", !/process\.env|from\s+["']pg["']|fetch\s*\(|https?:\/\/|child_process|spawn(?:Sync)?\s*\(/u.test(`${utilitySource}\n${generatorSource}`));
record("DEV047-A0-019 output contains no credential material", !/postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH) PRIVATE KEY|AIza[0-9A-Za-z_-]{20,}|sb_[a-z0-9_]+_[a-z0-9]{20,}/iu.test(serialized));
record("DEV047-A0-020 package commands expose generator and QC", packageJson.scripts["inventory:dev-047-local"] === "node scripts/generate-dev-047-local-inventory.mjs" && packageJson.scripts["qc:dev-047-local-inventory"] === "node scripts/qc-dev-047-local-inventory.mjs");
record("DEV047-A0-021 future catalog contract covers required runtime metadata", ["pg_class", "pg_index", "pg_constraint", "pg_proc", "pg_trigger", "role_table_grants", "role_routine_grants", "pg_policy", "relrowsecurity", "relforcerowsecurity"].every((token) => catalogQuery.includes(token)));
record("DEV047-A0-022 future catalog contract is one read-only statement", /^\s*WITH\b/iu.test(executableCatalogQuery) && !/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/iu.test(executableCatalogQuery));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-047 Phase A0 local inventory QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
