import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const aliasDocument = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "solidworks-metadata-field-aliases.json"), "utf8"));
const aliases = new Map(aliasDocument.profiles[aliasDocument.fallbackProfile].aliases.flatMap((entry) =>
  entry.aliases.map((alias) => [normalize(alias), entry])));

function normalize(value) {
  return String(value ?? "").trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function propertyValue(property) {
  const evaluated = String(property.evaluatedValue ?? "").trim();
  if (evaluated) return evaluated;
  const linked = String(property.linkedExpression ?? "").trim();
  return /^\$(?:PRP|PRPSHEET|SW-)/iu.test(linked) ? null : linked || null;
}

function partOwner(job, scope, anchor) {
  const parts = Array.isArray(job.targetContext?.parts) ? job.targetContext.parts : [];
  const configuration = scope.startsWith("configuration:") ? scope.slice("configuration:".length) : "";
  const logical = normalize(anchor || configuration).toLocaleUpperCase("en-US");
  const exact = parts.filter((part) => normalize(part.partNumber).toLocaleUpperCase("en-US") === logical);
  if (exact.length === 1) return { id: exact[0].id, resolution: "resolved", confidence: "high" };
  if (!anchor && parts.length === 1) return { id: parts[0].id, resolution: "resolved", confidence: "medium" };
  return { id: null, resolution: exact.length > 1 ? "ambiguous" : "missing", confidence: "unknown" };
}

export function mapNativeProperties(job, source, payload) {
  const properties = Array.isArray(payload.properties) ? payload.properties : [];
  const anchors = new Map();
  for (const property of properties) {
    const entry = aliases.get(normalize(property.name));
    if (entry?.stableKey === "part_number" && propertyValue(property)) anchors.set(String(property.scope ?? "document"), propertyValue(property));
  }
  const observations = properties.map((property, index) => {
    const name = String(property.name ?? "").trim();
    const value = propertyValue(property);
    const scope = String(property.scope ?? "document").trim() || "document";
    const entry = aliases.get(normalize(name));
    const ownerType = entry?.owner ?? null;
    let ownerId = null, ownerResolution;
    let confidence = entry ? "high" : "unknown";
    if (ownerType === "drawing") { ownerId = job.targetContext?.drawingId ?? null; ownerResolution = ownerId ? "resolved" : "missing"; }
    if (ownerType === "drawing_revision") { ownerId = job.targetContext?.drawingRevisionId ?? null; ownerResolution = ownerId ? "resolved" : "missing"; }
    if (ownerType === "part_number") {
      const owner = partOwner(job, scope, anchors.get(scope)); ownerId = owner.id;
      ownerResolution = owner.resolution; confidence = owner.confidence;
    }
    const stableKey = entry?.stableKey ?? `sw_custom_${normalize(name).replace(/[^a-z0-9_]+/gu, "_").slice(0, 60) || "unnamed"}_${sha256(name).slice(0, 8)}`;
    return {
      rawText: `${name}${value === null ? "" : `=${value}`}`.slice(0, 8_000), rawValue: value,
      normalizedValue: value, locationKind: "cad_property",
      configurationName: scope.startsWith("configuration:") ? scope.slice("configuration:".length) : null,
      confidenceBand: confidence, category: entry?.category ?? "unclassified", fieldKey: stableKey,
      fieldLabel: name || "未命名 SolidWorks 屬性", proposedOwnerType: ownerType,
      proposedOwnerId: ownerId, proposedOwnerResolution: ownerResolution, applicabilityScope: scope,
      rawPayloadHash: sha256(canonical({ sourceId: source.id, name, value, scope, index }))
    };
  });
  const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics.slice(0, 20).map(String) : [];
  return { sourceId: source.id, adapterCode: "native-metadata-bridge.v1",
    adapterVersion: "solidworks-document-manager.v1", status: payload.status === "succeeded" ? "succeeded" : "failed",
    diagnostics, observations };
}

export function canonicalDigest(value) { return sha256(canonical(value)); }
