import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeRecognitionKey,
  normalizeRecognitionValue,
  sha256Canonical,
  type DrawingRecognitionAdapterCompletion,
  type DrawingRecognitionCategory,
  type DrawingRecognitionConfidence,
  type DrawingRecognitionObservationInput
} from "./drawing-recognition-contract.ts";

export type NativeMetadataProperty = {
  scope?: string | null;
  configurationName?: string | null;
  name: string;
  propertyType?: string | null;
  linkedExpression?: string | null;
  evaluatedValue?: string | null;
};

export type NativeMetadataMappingContext = {
  sourceId: string;
  companyId?: string | null;
  companyCode?: string | null;
  fileName: string;
  fileExt: string;
  targetContext: {
    drawingId: string | null;
    drawingRevisionId: string | null;
    parts: Array<{ id: string; partNumber: string; partName: string; recordStatus: string }>;
  };
  properties: NativeMetadataProperty[];
  diagnostics?: string[];
};

type AliasEntry = {
  aliases: string[];
  stableKey: string;
  category: DrawingRecognitionCategory;
  owner: "part_number" | "drawing" | "drawing_revision";
  writePolicy: string;
};

type AliasConfig = { profiles: Record<string, { aliases: AliasEntry[] }>; fallbackProfile: string };

const aliasConfigPath = path.join(process.cwd(), "config", "solidworks-metadata-field-aliases.json");
const cachedAliases = new Map<string, Map<string, AliasEntry>>();

function normalizeAlias(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/[（）]/gu, (match) => (match === "（" ? "(" : ")"))
    .toLocaleLowerCase("en-US");
}

function aliases(companyId?: string | null, companyCode?: string | null) {
  const config = JSON.parse(fs.readFileSync(aliasConfigPath, "utf8")) as AliasConfig;
  const profileKey = [companyId, companyCode, config.fallbackProfile, "default"].map((value) => String(value ?? "").trim()).find((value) => value && config.profiles[value]);
  const profile = profileKey ? config.profiles[profileKey] : null;
  if (!profile) throw new Error("SOLIDWORKS_METADATA_ALIAS_PROFILE_MISSING");
  const cached = cachedAliases.get(profileKey!);
  if (cached) return cached;
  const map = new Map<string, AliasEntry>();
  for (const entry of profile.aliases) {
    for (const alias of entry.aliases) {
      const key = normalizeAlias(alias);
      if (!key || map.has(key)) throw new Error(`SOLIDWORKS_METADATA_ALIAS_DUPLICATE:${key}`);
      map.set(key, entry);
    }
  }
  cachedAliases.set(profileKey!, map);
  return map;
}

function extension(value: string) {
  return value.trim().toLowerCase().replace(/^\./u, "");
}

function scopeKey(property: NativeMetadataProperty) {
  const configuration = String(property.configurationName ?? "").trim();
  if (configuration) return `configuration:${configuration}`;
  return String(property.scope ?? "document").trim() || "document";
}

function valueOf(property: NativeMetadataProperty) {
  const evaluated = property.evaluatedValue === null || property.evaluatedValue === undefined ? "" : String(property.evaluatedValue);
  const evaluatedValue = normalizeRecognitionValue(evaluated);
  if (evaluatedValue) return evaluatedValue;
  const linkedOrRaw = normalizeRecognitionValue(property.linkedExpression ?? "");
  if (!linkedOrRaw || /^\$(?:PRP|PRPSHEET|SW-)/iu.test(linkedOrRaw)) return null;
  return linkedOrRaw;
}

function uniquePart(parts: NativeMetadataMappingContext["targetContext"]["parts"], predicate: (part: NativeMetadataMappingContext["targetContext"]["parts"][number]) => boolean) {
  const matches = parts.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function resolvePartOwner(input: NativeMetadataMappingContext, scope: string, anchor: string | null) {
  const parts = input.targetContext.parts;
  const normalizedAnchor = normalizeRecognitionValue(anchor ?? "");
  if (normalizedAnchor) {
    const exact = uniquePart(parts, (part) => normalizeRecognitionValue(part.partNumber) === normalizedAnchor);
    if (exact) return { part: exact, confidence: "high" as DrawingRecognitionConfidence, resolution: "resolved" as const };
  }
  if (scope.startsWith("configuration:")) {
    const configName = normalizeRecognitionValue(scope.slice("configuration:".length));
    const full = uniquePart(parts, (part) => normalizeRecognitionValue(part.partNumber) === configName);
    if (full) return { part: full, confidence: "medium" as DrawingRecognitionConfidence, resolution: "resolved" as const };
    const suffix = uniquePart(parts, (part) => normalizeRecognitionValue(part.partNumber).toLowerCase().endsWith(configName.toLowerCase()));
    if (suffix) return { part: suffix, confidence: "medium" as DrawingRecognitionConfidence, resolution: "resolved" as const };
  }
  if (extension(input.fileExt) === "sldprt") {
    const only = uniquePart(parts, () => true);
    if (only) return { part: only, confidence: "medium" as DrawingRecognitionConfidence, resolution: "resolved" as const };
  }
  return { part: null, confidence: "unknown" as DrawingRecognitionConfidence, resolution: "ambiguous" as const };
}

function mappedObservation(input: NativeMetadataMappingContext, property: NativeMetadataProperty, entry: AliasEntry | null, anchorByScope: Map<string, string>, index: number): DrawingRecognitionObservationInput {
  const scope = scopeKey(property);
  const value = valueOf(property);
  const name = normalizeRecognitionValue(property.name);
  const isUnknown = !entry;
  const stableKey = entry?.stableKey ?? `sw_custom_${normalizeRecognitionKey(name) || "unnamed"}_${crypto.createHash("sha256").update(name).digest("hex").slice(0, 8)}`;
  const category = entry?.category ?? "unclassified";
  let proposedOwnerType: string | null = entry?.owner ?? null;
  let proposedOwnerId: string | null = null;
  let proposedOwnerResolution: "resolved" | "ambiguous" | "missing" | undefined;
  let confidence: DrawingRecognitionConfidence = isUnknown ? "unknown" : "high";
  if (entry?.owner === "drawing") {
    proposedOwnerId = input.targetContext.drawingId;
    proposedOwnerResolution = proposedOwnerId ? "resolved" : "missing";
  } else if (entry?.owner === "drawing_revision") {
    proposedOwnerId = input.targetContext.drawingRevisionId;
    proposedOwnerResolution = proposedOwnerId ? "resolved" : "missing";
  } else if (entry?.owner === "part_number") {
    const owner = resolvePartOwner(input, scope, anchorByScope.get(scope) ?? (entry.stableKey === "part_number" ? value : null));
    proposedOwnerId = owner.part?.id ?? null;
    proposedOwnerResolution = owner.resolution;
    confidence = owner.confidence;
  }
  return {
    rawText: `${name}${value === null ? "" : `=${value}`}`.slice(0, 8_000),
    rawValue: value,
    normalizedValue: value,
    locationKind: "cad_property",
    configurationName: scope.startsWith("configuration:") ? scope.slice("configuration:".length) : null,
    confidenceBand: confidence,
    category,
    fieldKey: stableKey,
    fieldLabel: name || "未命名 SolidWorks 屬性",
    proposedOwnerType,
    proposedOwnerId,
    proposedOwnerResolution,
    applicabilityScope: scope,
    rawPayloadHash: sha256Canonical({ sourceId: input.sourceId, name, value, scope, index })
  };
}

export function mapNativePropertiesToAdapterResult(input: NativeMetadataMappingContext): DrawingRecognitionAdapterCompletion {
  const aliasMap = aliases(input.companyId, input.companyCode);
  const anchorByScope = new Map<string, string>();
  for (const property of input.properties) {
    const entry = aliasMap.get(normalizeAlias(property.name));
    if (entry?.stableKey === "part_number" && valueOf(property)) anchorByScope.set(scopeKey(property), valueOf(property)!);
  }
  const observations = input.properties.map((property, index) => mappedObservation(input, property, aliasMap.get(normalizeAlias(property.name)) ?? null, anchorByScope, index));
  const diagnostics = (input.diagnostics ?? []).filter(Boolean).slice(0, 20);
  return {
    sourceId: input.sourceId,
    adapterCode: "native-metadata-bridge.v1",
    adapterVersion: "solidworks-document-manager.v1",
    status: diagnostics.some((item) => item.startsWith("native_metadata_")) ? "partial" : "succeeded",
    diagnostics,
    observations
  };
}
