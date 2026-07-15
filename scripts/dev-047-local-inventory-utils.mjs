import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const IDENTIFIER_PART = '(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)';
const QUALIFIED_IDENTIFIER = `${IDENTIFIER_PART}(?:\\s*\\.\\s*${IDENTIFIER_PART})?`;
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".ps1"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toProjectPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function readProjectFile(root, relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function lineNumberAt(value, index) {
  return value.slice(0, index).split("\n").length;
}

function unquoteIdentifier(value) {
  const normalized = value.trim();
  return normalized.startsWith('"') && normalized.endsWith('"')
    ? normalized.slice(1, -1).replaceAll('""', '"')
    : normalized;
}

function normalizeQualifiedIdentifier(value, defaultSchema) {
  const parts = value.split(".").map(unquoteIdentifier);
  return parts.length === 1
    ? { schema: defaultSchema, name: parts[0], qualifiedName: `${defaultSchema}.${parts[0]}` }
    : { schema: parts[0], name: parts[1], qualifiedName: `${parts[0]}.${parts[1]}` };
}

function redactExcerpt(value) {
  return value
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/giu, "[REDACTED_POSTGRES_URL]")
    .replace(/\b(?:password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']+["']/giu, "$1=[REDACTED]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
}

function sourceEvidence(sourcePath, sql, index) {
  return {
    path: sourcePath,
    line: lineNumberAt(sql, index)
  };
}

function aggregateByKey(entries, keyFor) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = keyFor(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...entry, definitions: [entry.definition] });
      continue;
    }
    existing.definitions.push(entry.definition);
  }
  return [...byKey.values()]
    .map(({ definition: _definition, ...entry }) => ({
      ...entry,
      definitions: entry.definitions.sort((left, right) =>
        left.path.localeCompare(right.path) || left.line - right.line
      )
    }))
    .sort((left, right) => keyFor(left).localeCompare(keyFor(right)));
}

function findCreateTableRanges(sql, sourcePath, defaultSchema) {
  const ranges = [];
  const pattern = new RegExp(`\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED_IDENTIFIER})\\s*\\(`, "giu");
  for (const match of sql.matchAll(pattern)) {
    const openIndex = sql.indexOf("(", match.index + match[0].length - 1);
    let depth = 0;
    let quote = null;
    let end = sql.length;
    for (let index = openIndex; index < sql.length; index += 1) {
      const character = sql[index];
      const next = sql[index + 1];
      if (quote === "'") {
        if (character === "'" && next === "'") index += 1;
        else if (character === "'") quote = null;
        continue;
      }
      if (quote === '"') {
        if (character === '"' && next === '"') index += 1;
        else if (character === '"') quote = null;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    ranges.push({
      ...normalizeQualifiedIdentifier(match[1], defaultSchema),
      start: match.index,
      bodyStart: openIndex + 1,
      end,
      definition: sourceEvidence(sourcePath, sql, match.index)
    });
  }
  return ranges;
}

function contextTableFor(sql, index, tableRanges, defaultSchema) {
  const createRange = tableRanges.find((range) => index >= range.start && index <= range.end);
  if (createRange) return createRange;

  const prefix = sql.slice(0, index);
  const alterPattern = new RegExp(`\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${QUALIFIED_IDENTIFIER})`, "giu");
  const alterMatches = [...prefix.matchAll(alterPattern)];
  const nearest = alterMatches.at(-1);
  if (!nearest) return null;
  const statementEnd = sql.indexOf(";", nearest.index);
  if (statementEnd >= 0 && index > statementEnd) return null;
  return normalizeQualifiedIdentifier(nearest[1], defaultSchema);
}

function declarationEntries(sql, sourcePath, defaultSchema, pattern, mapMatch) {
  return [...sql.matchAll(pattern)].map((match) => ({
    ...mapMatch(match),
    definition: sourceEvidence(sourcePath, sql, match.index)
  }));
}

function extractSqlArtifact(sql, sourcePath, defaultSchema) {
  const tableRanges = findCreateTableRanges(sql, sourcePath, defaultSchema);
  const tables = tableRanges.map(({ start: _start, bodyStart: _bodyStart, end: _end, ...entry }) => entry);

  const indexes = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bCREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED_IDENTIFIER})[\\s\\S]*?\\bON\\s+(${QUALIFIED_IDENTIFIER})`, "giu"),
    (match) => {
      const index = normalizeQualifiedIdentifier(match[2], defaultSchema);
      const table = normalizeQualifiedIdentifier(match[3], defaultSchema);
      return { ...index, unique: Boolean(match[1]), table: table.qualifiedName };
    }
  );
  const sequences = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bCREATE\\s+SEQUENCE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED_IDENTIFIER})`, "giu"),
    (match) => normalizeQualifiedIdentifier(match[1], defaultSchema)
  );
  const materializedViews = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?MATERIALIZED\\s+VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED_IDENTIFIER})`, "giu"),
    (match) => normalizeQualifiedIdentifier(match[1], defaultSchema)
  );
  const views = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED_IDENTIFIER})`, "giu"),
    (match) => normalizeQualifiedIdentifier(match[1], defaultSchema)
  );
  const functions = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(${QUALIFIED_IDENTIFIER})\\s*\\(`, "giu"),
    (match) => normalizeQualifiedIdentifier(match[1], defaultSchema)
  );
  const triggers = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bCREATE\\s+TRIGGER\\s+(${IDENTIFIER_PART})[\\s\\S]*?\\bON\\s+(${QUALIFIED_IDENTIFIER})`, "giu"),
    (match) => {
      const table = normalizeQualifiedIdentifier(match[2], defaultSchema);
      return { schema: table.schema, name: unquoteIdentifier(match[1]), qualifiedName: `${table.schema}.${unquoteIdentifier(match[1])}`, table: table.qualifiedName };
    }
  );
  const policies = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bCREATE\\s+POLICY\\s+(${IDENTIFIER_PART})\\s+ON\\s+(${QUALIFIED_IDENTIFIER})`, "giu"),
    (match) => {
      const table = normalizeQualifiedIdentifier(match[2], defaultSchema);
      return { schema: table.schema, name: unquoteIdentifier(match[1]), qualifiedName: `${table.schema}.${unquoteIdentifier(match[1])}`, table: table.qualifiedName };
    }
  );

  const constraints = [];
  for (const table of tableRanges) {
    const body = sql.slice(table.bodyStart, table.end - 1);
    const constraintPattern = /(?:\bCONSTRAINT\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s+)?\b(PRIMARY\s+KEY|UNIQUE|CHECK\s*\(|NOT\s+NULL)\b/giu;
    let ordinal = 0;
    for (const match of body.matchAll(constraintPattern)) {
      ordinal += 1;
      const kind = match[2].toUpperCase().replace(/\s+/gu, "_").replace("(", "");
      const name = match[1] ? unquoteIdentifier(match[1]) : `${table.name}__${kind.toLowerCase()}__${ordinal}`;
      constraints.push({
        schema: table.schema,
        name,
        qualifiedName: `${table.schema}.${name}`,
        table: table.qualifiedName,
        kind,
        generatedName: !match[1],
        definition: sourceEvidence(sourcePath, sql, table.bodyStart + match.index)
      });
    }
  }

  const foreignKeys = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bREFERENCES\\s+(${QUALIFIED_IDENTIFIER})\\s*\\(([^)]+)\\)`, "giu"),
    (match) => {
      const sourceTable = contextTableFor(sql, match.index, tableRanges, defaultSchema);
      const targetTable = normalizeQualifiedIdentifier(match[1], defaultSchema);
      return {
        sourceTable: sourceTable?.qualifiedName ?? "unknown",
        targetTable: targetTable.qualifiedName,
        targetColumns: match[2].split(",").map((column) => unquoteIdentifier(column)).sort()
      };
    }
  );

  const rls = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    new RegExp(`\\bALTER\\s+TABLE\\s+(${QUALIFIED_IDENTIFIER})\\s+(ENABLE|DISABLE|FORCE|NO\\s+FORCE)\\s+ROW\\s+LEVEL\\s+SECURITY`, "giu"),
    (match) => ({
      table: normalizeQualifiedIdentifier(match[1], defaultSchema).qualifiedName,
      action: match[2].toUpperCase().replace(/\s+/gu, "_")
    })
  );

  const grants = declarationEntries(
    sql,
    sourcePath,
    defaultSchema,
    /\b(GRANT|REVOKE)\b[^;]*;/giu,
    (match) => ({ action: match[1].toUpperCase(), statement: redactExcerpt(match[0]) })
  );

  return { tables, sequences, indexes, constraints, foreignKeys, views, materializedViews, functions, triggers, policies, grants, rls };
}

function mergeSqlArtifacts(artifacts) {
  const all = (category) => artifacts.flatMap((artifact) => artifact[category]);
  return {
    tables: aggregateByKey(all("tables"), (entry) => entry.qualifiedName),
    sequences: aggregateByKey(all("sequences"), (entry) => entry.qualifiedName),
    indexes: aggregateByKey(all("indexes"), (entry) => `${entry.qualifiedName}:${entry.table}`),
    constraints: all("constraints").sort((left, right) => left.table.localeCompare(right.table) || left.definition.path.localeCompare(right.definition.path) || left.definition.line - right.definition.line),
    foreignKeys: aggregateByKey(all("foreignKeys"), (entry) => `${entry.sourceTable}:${entry.targetTable}:${entry.targetColumns.join(",")}`),
    views: aggregateByKey(all("views"), (entry) => entry.qualifiedName),
    materializedViews: aggregateByKey(all("materializedViews"), (entry) => entry.qualifiedName),
    functions: aggregateByKey(all("functions"), (entry) => entry.qualifiedName),
    triggers: aggregateByKey(all("triggers"), (entry) => `${entry.qualifiedName}:${entry.table}`),
    policies: aggregateByKey(all("policies"), (entry) => `${entry.qualifiedName}:${entry.table}`),
    grants: all("grants").sort((left, right) => left.definition.path.localeCompare(right.definition.path) || left.definition.line - right.definition.line),
    rls: aggregateByKey(all("rls"), (entry) => `${entry.table}:${entry.action}`)
  };
}

function walkSourceFiles(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) found.push(...walkSourceFiles(root, toProjectPath(root, absolutePath)));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const relativePath = toProjectPath(root, absolutePath);
      if (!/^scripts\/(?:dev-047-local-inventory-utils|generate-dev-047-local-inventory|qc-dev-047-local-inventory)\.mjs$/u.test(relativePath)) {
        found.push(relativePath);
      }
    }
  }
  return found;
}

function dependencyRole(relativePath) {
  if (relativePath.startsWith("src/lib/repositories/") || /^src\/lib\/(?:db|drawing-revision-workbench)/u.test(relativePath)) return "repository_or_db_runtime";
  if (relativePath.startsWith("scripts/qc-")) return "qc_script";
  if (relativePath.startsWith("scripts/")) return "operational_script";
  return "application_runtime";
}

function extractCodeDependencies(root, tableNames) {
  const sourceFiles = [...walkSourceFiles(root, "src"), ...walkSourceFiles(root, "scripts")].sort();
  const escapedNames = [...new Set(tableNames)].sort((left, right) => right.length - left.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const tablePattern = new RegExp(`\\b(${escapedNames.join("|")})\\b`, "giu");
  const dependencies = [];
  const dynamicSqlCandidates = [];
  const sourceHashes = [];

  for (const relativePath of sourceFiles) {
    const value = readProjectFile(root, relativePath);
    sourceHashes.push(`${relativePath}:${sha256(value)}`);
    const lines = value.split(/\r?\n/u);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const matches = [...line.matchAll(tablePattern)];
      if (matches.length === 0) continue;
      const context = lines.slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 3)).join(" ");
      const evidenceKind = /\b(?:SELECT|FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|REFERENCES|PRAGMA)\b|\.(?:prepare|query|queryOne|execute|exec)\s*\(/iu.test(context)
        ? "raw_sql_candidate"
        : "identifier_reference";
      for (const table of [...new Set(matches.map((match) => match[1].toLowerCase()))].sort()) {
        dependencies.push({
          table: `public.${table}`,
          path: relativePath,
          line: lineIndex + 1,
          role: dependencyRole(relativePath),
          evidenceKind,
          excerpt: redactExcerpt(context)
        });
      }
    }
    if (/\b(?:tableName|table_name)\b[\s\S]{0,160}\b(?:prepare|query|execute|exec)\b|\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+\$\{/iu.test(value)) {
      dynamicSqlCandidates.push({ path: relativePath, status: "manual_review_required" });
    }
  }

  dependencies.sort((left, right) => left.table.localeCompare(right.table) || left.path.localeCompare(right.path) || left.line - right.line);
  dynamicSqlCandidates.sort((left, right) => left.path.localeCompare(right.path));
  return {
    dependencies,
    dynamicSqlCandidates,
    sourceFileCount: sourceFiles.length,
    sourceFingerprintSha256: sha256(sourceHashes.join("\n"))
  };
}

function summarizeObjects(objects) {
  return Object.fromEntries(Object.entries(objects).map(([category, values]) => [category, values.length]));
}

export function buildDev047LocalInventory(root = process.cwd()) {
  const postgresRelativePaths = fs.readdirSync(path.join(root, "db", "postgres"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => `db/postgres/${name}`);
  const sqliteRelativePath = "db/schema.sql";
  const manifestRelativePath = "supabase/migrations/manifest.json";
  const catalogQueryRelativePath = "scripts/sql/dev-047-postgres-catalog-read-only.sql";

  const postgresSources = postgresRelativePaths.map((relativePath) => {
    const value = readProjectFile(root, relativePath);
    return {
      relativePath,
      value,
      artifact: extractSqlArtifact(value, relativePath, "public")
    };
  });
  const sqliteValue = readProjectFile(root, sqliteRelativePath);
  const postgresObjects = mergeSqlArtifacts(postgresSources.map((source) => source.artifact));
  const sqliteObjects = mergeSqlArtifacts([extractSqlArtifact(sqliteValue, sqliteRelativePath, "main")]);
  const postgresTableNames = postgresObjects.tables.map((table) => table.name);
  const sqliteTableNames = new Set(sqliteObjects.tables.map((table) => table.name));
  const postgresTableNameSet = new Set(postgresTableNames);
  const allTableNames = [...new Set([...postgresTableNames, ...sqliteTableNames])].sort();
  const codeInventory = extractCodeDependencies(root, allTableNames);
  const migrationManifest = JSON.parse(readProjectFile(root, manifestRelativePath));
  const catalogQuery = readProjectFile(root, catalogQueryRelativePath);
  const sourceArtifacts = [
    ...postgresSources.map(({ relativePath, value }) => ({ path: relativePath, sha256: sha256(value), bytes: Buffer.byteLength(value), kind: "postgres_sql_artifact" })),
    { path: sqliteRelativePath, sha256: sha256(sqliteValue), bytes: Buffer.byteLength(sqliteValue), kind: "sqlite_canonical_schema" },
    {
      path: manifestRelativePath,
      sha256: sha256(readProjectFile(root, manifestRelativePath)),
      bytes: Buffer.byteLength(readProjectFile(root, manifestRelativePath)),
      kind: "supabase_compatibility_manifest"
    },
    { path: catalogQueryRelativePath, sha256: sha256(catalogQuery), bytes: Buffer.byteLength(catalogQuery), kind: "future_read_only_catalog_query_contract" }
  ];
  const mirror = allTableNames.map((table) => ({
    table,
    sqlitePresent: sqliteTableNames.has(table),
    postgresPresent: postgresTableNameSet.has(table),
    status: sqliteTableNames.has(table) && postgresTableNameSet.has(table) ? "mirrored_by_name" : "provider_specific_or_missing"
  }));

  const inventory = {
    schemaVersion: 1,
    dev: "DEV-047",
    phase: "Phase-A0-local-inventory-tooling",
    generatedAt: "deterministic-from-source-hashes",
    authority: {
      classification: "pre_pilot_non_authoritative",
      toolingComplete: true,
      authoritativePhaseAComplete: false,
      pilotStableEvidenceObserved: false,
      runtimeCatalogObserved: false,
      representativeSnapshotObserved: false
    },
    safety: {
      mode: "read_only_local_artifacts",
      credentialLookupPerformed: false,
      networkAccessPerformed: false,
      databaseConnectionPerformed: false,
      databaseMutationPerformed: false,
      cloudResourceActionPerformed: false,
      productionOrStagingTargetUsed: false,
      schemaMoveSqlGenerated: false
    },
    sourceArtifacts,
    migrationHistory: Array.isArray(migrationManifest.migrations)
      ? migrationManifest.migrations.map((migration) => ({
          source: migration.source,
          target: migration.target,
          sourceSha256: migration.sourceSha256,
          targetSha256: migration.targetSha256,
          description: migration.description
        }))
      : [],
    objects: {
      postgresArtifactDeclarations: postgresObjects,
      sqliteCanonicalDeclarations: sqliteObjects
    },
    sqlitePostgresMirror: mirror,
    codeDependencies: codeInventory.dependencies,
    dynamicSqlCandidates: codeInventory.dynamicSqlCandidates,
    externalConsumers: [
      {
        id: "external-consumer-discovery",
        status: "unknown_pending_stable_pilot_confirmation",
        effect: "blocks_only_the_future_candidate_batch_that_contains_an_unclassified_dependency"
      }
    ],
    candidateBatches: [],
    blockers: [
      "DEV046_PHASE3A_PILOT_STABILITY_EVIDENCE_MISSING",
      "REPRESENTATIVE_POSTGRES_SNAPSHOT_NOT_AUTHORIZED_OR_OBSERVED",
      "RUNTIME_PG_CATALOG_METADATA_NOT_COLLECTED",
      "EXTERNAL_CONSUMER_CONFIRMATION_PENDING",
      "OWNER_DOMAIN_CLASSIFICATION_PENDING"
    ],
    limitations: [
      "SQL objects are declarations found in repository artifacts, not a PostgreSQL runtime catalog snapshot.",
      "Code dependencies are conservative lexical candidates and require owner confirmation after the pilot stabilizes.",
      "Dynamic SQL candidates require manual review before a migration batch can be proposed.",
      "No bounded-schema destination or migration batch is inferred before authoritative Phase A evidence."
    ],
    summary: {
      postgresArtifactObjects: summarizeObjects(postgresObjects),
      sqliteCanonicalObjects: summarizeObjects(sqliteObjects),
      mirrorTableCount: mirror.length,
      mirrorMismatchCount: mirror.filter((entry) => entry.status !== "mirrored_by_name").length,
      codeDependencyCount: codeInventory.dependencies.length,
      repositoryOrDbDependencyCount: codeInventory.dependencies.filter((entry) => entry.role === "repository_or_db_runtime").length,
      scriptOrQcDependencyCount: codeInventory.dependencies.filter((entry) => entry.role === "qc_script" || entry.role === "operational_script").length,
      dynamicSqlCandidateCount: codeInventory.dynamicSqlCandidates.length,
      scannedCodeFileCount: codeInventory.sourceFileCount,
      scannedCodeFingerprintSha256: codeInventory.sourceFingerprintSha256,
      proposedBatchCount: 0
    }
  };

  inventory.sourceFingerprintSha256 = sha256(JSON.stringify({
    sourceArtifacts: inventory.sourceArtifacts,
    scannedCodeFingerprintSha256: inventory.summary.scannedCodeFingerprintSha256
  }));
  return inventory;
}
