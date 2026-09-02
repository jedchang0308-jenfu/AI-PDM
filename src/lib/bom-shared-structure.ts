import crypto from "node:crypto";
import { normalizeBomUomCode, parseBomQuantity, type BomUomCode } from "@/lib/bom-unit-of-measure";

export const SHARED_BOM_LIMITS = {
  parents: 250,
  candidatesPerLine: 250,
  nodes: 5000,
  resolvedRows: 100_000
} as const;

export type SharedBomNodeInput = {
  id: string;
  logicalLineId: string;
  parentLineId?: string | null;
  parentFloatingTopicId?: string | null;
  nodeType: "item" | "group";
  partNumber?: string | null;
  groupName?: string | null;
  quantity?: number | string | null;
  quantityUomCode?: BomUomCode | null;
  sequenceNo?: number | null;
};

export type SharedBomComponentInput = {
  nodeId: string;
  logicalLineId: string;
  nodeLocation: "tree" | "floating";
  componentMode: "fixed" | "by_parent";
  childPartNumberIds: string[];
  parentSelections: Array<{ parentPartNumberId: string; childPartNumberId: string }>;
};

export class SharedBomError extends Error {
  constructor(public readonly code: string, public readonly status = 409, public readonly details: Record<string, unknown> = {}) {
    super(code);
    this.name = "SharedBomError";
  }
}

export function normalizeStableIds(values: readonly string[], limit: number, code = "BOM_SHARED_STRUCTURE_LIMIT_EXCEEDED") {
  const normalized = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
  if (normalized.length > limit) throw new SharedBomError(code, 413, { limit });
  return normalized;
}

export function assertMajorBomRevision(value: string) {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/u.test(normalized)) throw new SharedBomError("BOM_DEFINITION_REVISION_CONFLICT", 409);
  return normalized;
}

export function assertUuid(value: string, code = "BOM_LOGICAL_LINE_ID_INVALID") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new SharedBomError(code, 422);
  }
  return value.toLowerCase();
}

export function validateSharedGraph(input: {
  lines: SharedBomNodeInput[];
  floatingTopics: SharedBomNodeInput[];
  components: SharedBomComponentInput[];
  parentPartNumberIds: string[];
}) {
  const nodes = [...input.lines.map((node) => ({ ...node, location: "tree" as const })), ...input.floatingTopics.map((node) => ({ ...node, location: "floating" as const }))];
  if (nodes.length > SHARED_BOM_LIMITS.nodes) throw new SharedBomError("BOM_SHARED_STRUCTURE_LIMIT_EXCEEDED", 413, { limit: SHARED_BOM_LIMITS.nodes });
  if (nodes.length * input.parentPartNumberIds.length > SHARED_BOM_LIMITS.resolvedRows) {
    throw new SharedBomError("BOM_SHARED_STRUCTURE_LIMIT_EXCEEDED", 413, { limit: SHARED_BOM_LIMITS.resolvedRows });
  }
  const nodeIds = new Set<string>();
  const logicalIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new SharedBomError("BOM_EDITOR_DUPLICATE_NODE_ID", 422);
    nodeIds.add(node.id);
    const logical = assertUuid(node.logicalLineId);
    if (logicalIds.has(logical)) throw new SharedBomError("BOM_LOGICAL_LINE_ID_CONFLICT", 422);
    logicalIds.add(logical);
    if (node.nodeType === "item") {
      try { parseBomQuantity(typeof node.quantity === "number" ? String(node.quantity) : node.quantity); } catch (error) {
        if (error instanceof Error && error.message.startsWith("BOM_QUANTITY")) throw new SharedBomError(error.message, 422);
        throw new SharedBomError("BOM_ITEM_QUANTITY_INVALID", 422);
      }
      if (!node.quantityUomCode) throw new SharedBomError("BOM_ITEM_UOM_REQUIRED", 422);
      try { normalizeBomUomCode(node.quantityUomCode); } catch { throw new SharedBomError("BOM_ITEM_UOM_INVALID", 422); }
    }
    if (node.nodeType === "group" && ((node.quantity !== null && node.quantity !== undefined) || node.quantityUomCode)) throw new SharedBomError("BOM_GROUP_QUANTITY_FORBIDDEN", 422);
  }
  const componentByLogical = new Map<string, SharedBomComponentInput>();
  for (const component of input.components) {
    const logical = assertUuid(component.logicalLineId);
    if (componentByLogical.has(logical)) throw new SharedBomError("BOM_COMPONENT_DUPLICATE", 422);
    const node = nodes.find((candidate) => candidate.id === component.nodeId && candidate.logicalLineId.toLowerCase() === logical);
    if (!node || node.location !== component.nodeLocation || node.nodeType !== "item") throw new SharedBomError("BOM_COMPONENT_NODE_MISMATCH", 422);
    component.childPartNumberIds = normalizeStableIds(component.childPartNumberIds, SHARED_BOM_LIMITS.candidatesPerLine);
    if (!component.childPartNumberIds.length) throw new SharedBomError("BOM_COMPONENT_CANDIDATE_REQUIRED", 422);
    if (component.componentMode === "fixed") {
      if (component.childPartNumberIds.length !== 1 || component.parentSelections.length) throw new SharedBomError("BOM_FIXED_COMPONENT_INVALID", 422);
    }
    componentByLogical.set(logical, component);
  }
  for (const node of nodes) {
    if (node.nodeType === "item" && !componentByLogical.has(node.logicalLineId.toLowerCase())) throw new SharedBomError("BOM_COMPONENT_REQUIRED", 422);
    if (node.nodeType === "group" && componentByLogical.has(node.logicalLineId.toLowerCase())) throw new SharedBomError("BOM_GROUP_COMPONENT_FORBIDDEN", 422);
  }
  const parents = new Set(input.parentPartNumberIds);
  const unresolved: Array<{ logicalLineId: string; parentPartNumberId: string }> = [];
  for (const component of componentByLogical.values()) {
    if (component.componentMode !== "by_parent") continue;
    const selections = new Map<string, string>();
    for (const selection of component.parentSelections) {
      if (!parents.has(selection.parentPartNumberId) || !component.childPartNumberIds.includes(selection.childPartNumberId)) {
        throw new SharedBomError("BOM_VARIANT_MAPPING_INVALID", 422);
      }
      if (selections.has(selection.parentPartNumberId)) throw new SharedBomError("BOM_VARIANT_MAPPING_DUPLICATE", 422);
      selections.set(selection.parentPartNumberId, selection.childPartNumberId);
    }
    for (const parent of input.parentPartNumberIds) if (!selections.has(parent)) unresolved.push({ logicalLineId: component.logicalLineId, parentPartNumberId: parent });
  }
  return { nodes, componentByLogical, unresolved };
}

/** Sales-kit BOMs are intentionally narrower than manufacturing shared BOMs. */
export function validateSalesKitGraph(input: {
  lines: SharedBomNodeInput[];
  floatingTopics: SharedBomNodeInput[];
  components: SharedBomComponentInput[];
  parentPartNumberIds: string[];
}) {
  if (input.parentPartNumberIds.length !== 1) throw new SharedBomError("BOM_SALES_KIT_PARENT_COUNT_INVALID", 422);
  if (input.floatingTopics.length) throw new SharedBomError("BOM_SALES_KIT_FLOATING_TOPIC_FORBIDDEN", 422);
  validateSharedGraph(input);
  const childIds = new Set<string>();
  for (const node of input.lines) {
    if (node.nodeType !== "item") continue;
    const quantity = Number(node.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new SharedBomError("BOM_SALES_KIT_QUANTITY_INTEGER_REQUIRED", 422);
  }
  for (const component of input.components) {
    if (component.componentMode !== "fixed" || component.parentSelections.length !== 0 || component.childPartNumberIds.length !== 1) {
      throw new SharedBomError("BOM_SALES_KIT_FIXED_COMPONENT_REQUIRED", 422, { logicalLineId: component.logicalLineId });
    }
    const childId = component.childPartNumberIds[0];
    if (childIds.has(childId)) throw new SharedBomError("BOM_SALES_KIT_DUPLICATE_CHILD", 422, { childPartNumberId: childId });
    childIds.add(childId);
  }
}

// Domain-facing name kept alongside the graph-oriented implementation name.
export const validateSalesKitStructure = validateSalesKitGraph;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && !Number.isFinite(value)) throw new SharedBomError("BOM_SNAPSHOT_NUMBER_INVALID", 422);
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalSha256(value: unknown) {
  const json = canonicalJson(value);
  return { json, hash: crypto.createHash("sha256").update(json, "utf8").digest("hex") };
}

export function deterministicDev096Id(entityKind: string, stableSourceId: string) {
  const bytes = crypto.createHash("sha256").update(`ai-pdm/dev096/v1|${entityKind}|${stableSourceId}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
