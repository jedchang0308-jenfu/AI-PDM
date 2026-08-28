import crypto from "node:crypto";

function assertPrimitive(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPrimitive(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (typeof key !== "string") throw new Error(`ORACLE_NON_PRIMITIVE_KEY:${path}`);
      assertPrimitive(item, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`ORACLE_NON_PRIMITIVE:${path}`);
}

function stableValue(value) {
  assertPrimitive(value);
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256Json(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function tupleSort(a, b) {
  return canonicalJson(a).localeCompare(canonicalJson(b));
}

export function oracleAffectedParts({ companyId, drawingId, revisionId, relationTuples }) {
  const facts = (relationTuples ?? []).filter((tuple) => {
    if (!Array.isArray(tuple)) return false;
    const [company, drawing, revision] = tuple;
    return company === companyId && drawing === drawingId && (revisionId == null || revision === revisionId);
  }).map((tuple) => [...tuple]).sort(tupleSort);
  const partIds = [...new Set(facts.map((tuple) => tuple[3]).filter((value) => value != null))].sort();
  const result = { companyId, drawingId, revisionId: revisionId ?? null, partIds, relationTuples: facts };
  return { ...result, fingerprint: sha256Json(result) };
}

export function oracleObsoleteFingerprint({ entityType, entityCode, status, dependencyTuples }) {
  const dependencies = (dependencyTuples ?? []).map((tuple) => Array.isArray(tuple) ? [...tuple] : tuple).sort(tupleSort);
  const result = { entityType, entityCode, status, dependencyTuples: dependencies };
  return { ...result, fingerprint: sha256Json(result) };
}

const severityRank = { critical: 0, warning: 1, info: 2 };

export function oracleTaskOrder(tasks) {
  const normalized = (tasks ?? []).map((task) => ({ ...task, severity: String(task.severity ?? "info").toLowerCase() }));
  normalized.sort((left, right) => {
    const severity = (severityRank[left.severity] ?? 99) - (severityRank[right.severity] ?? 99);
    if (severity) return severity;
    const leftDue = left.dueAt && !Number.isNaN(Date.parse(left.dueAt)) ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt && !Number.isNaN(Date.parse(right.dueAt)) ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;
    const created = Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "");
    if (created) return created;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  return normalized;
}

function compareRow(left, right, field, direction) {
  const a = left?.[field] ?? "";
  const b = right?.[field] ?? "";
  const base = String(a).localeCompare(String(b));
  return direction === "desc" ? -base : base;
}

export function oracleGroupedCursor({ rows, filters = {}, sort = { field: "id", direction: "asc" }, limit = 20, direction = "after", anchor = null }) {
  let filtered = (rows ?? []).filter((row) => Object.entries(filters).every(([key, expected]) => expected == null || expected === "" || row?.[key] === expected));
  filtered = filtered.map((row) => ({ ...row }));
  filtered.sort((left, right) => compareRow(left, right, sort.field ?? "id", sort.direction === "desc" ? "desc" : "asc") || String(left.id ?? "").localeCompare(String(right.id ?? "")));
  if (anchor != null) {
    const index = filtered.findIndex((row) => String(row.id) === String(anchor));
    if (index >= 0) filtered = direction === "before" ? filtered.slice(0, index) : filtered.slice(index + 1);
  }
  const groups = [];
  for (const row of filtered) {
    const groupKey = String(row.groupKey ?? row.id ?? "");
    const group = groups.at(-1);
    if (!group || group.key !== groupKey) groups.push({ key: groupKey, rows: [row] });
    else group.rows.push(row);
  }
  const selectedGroups = groups.slice(0, Math.max(1, Number(limit) || 1));
  const pageRows = selectedGroups.flatMap((group) => group.rows);
  return {
    rows: pageRows,
    nextAnchor: pageRows.at(-1)?.id ?? null,
    previousAnchor: pageRows.at(0)?.id ?? null,
    hasNext: groups.length > selectedGroups.length,
    hasPrevious: Boolean(anchor),
    filterFingerprint: sha256Json({ filters, sort, limit, direction, anchor })
  };
}

export const oracleNames = [
  "oracleAffectedParts",
  "oracleObsoleteFingerprint",
  "oracleTaskOrder",
  "oracleGroupedCursor"
];
