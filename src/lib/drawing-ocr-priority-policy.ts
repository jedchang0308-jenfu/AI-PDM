import type {
  DrawingRecognitionCategory,
  DrawingRecognitionConfidence,
  DrawingRecognitionObservationInput
} from "@/lib/drawing-recognition-contract";
import rawPolicy from "../../config/drawing-ocr-field-priorities.json" with { type: "json" };

export type DrawingOcrFieldTier = 0 | 1 | 2 | 3;

type DrawingOcrFieldPolicy = {
  key: string;
  label: string;
  tier: Exclude<DrawingOcrFieldTier, 3>;
  businessWeight: number;
  category: DrawingRecognitionCategory;
  aliases: string[];
};

type DrawingOcrPolicy = {
  schemaVersion: "drawing-ocr-field-priorities.v1";
  policyVersion: string;
  limits: {
    observationsPerSource: number;
    observationsPerSession: number;
    tier3PerSource: number;
    requiredDistinctValues: number;
    maxValueCharacters: number;
  };
  textLayer: {
    minimumPrintableCharactersPerPage: number;
    minimumPrintableCharactersPerDocument: number;
    requiresKnownLabelPerPage: boolean;
  };
  utility: {
    tierWeights: Record<"0" | "1" | "2" | "3", number>;
    labelExact: number;
    labelPrefix: number;
    textLayerConfidence: number;
    ocrConfidence: number;
    titleBlockOrTable: number;
    corroboration: number;
    duplicatePenalty: number;
    noisePenalty: number;
  };
  fields: DrawingOcrFieldPolicy[];
  tier3EngineeringKeywords: string[];
};

export type DrawingOcrTextBlock = {
  text: string;
  pageNumber: number;
  readingOrder: number;
  source: "text_layer" | "ocr";
  confidence?: number | null;
  geometry?: { coordinateSpace?: "normalized_page"; origin?: "top_left"; x?: number; y?: number; width?: number; height?: number; pageWidth?: number; pageHeight?: number; pageRotation?: number; producerSpace?: string } | null;
  titleBlockOrTable?: boolean;
};

export type DrawingOcrRequiredOutcome = {
  fieldKey: string;
  fieldLabel: string;
  outcome: "found" | "conflict" | "not_found";
  distinctValueCount: number;
  overflow: boolean;
};

export type DrawingOcrSelection = {
  policyVersion: string;
  observations: DrawingRecognitionObservationInput[];
  diagnostics: string[];
  requiredOutcomes: DrawingOcrRequiredOutcome[];
  counts: {
    potential: number;
    selected: number;
    discarded: number;
    selectedByTier: Record<"0" | "1" | "2" | "3", number>;
  };
};

type PotentialObservation = {
  observation: DrawingRecognitionObservationInput;
  fieldKey: string;
  fieldLabel: string;
  tier: DrawingOcrFieldTier;
  normalizedValue: string;
  score: number;
  pageNumber: number;
  readingOrder: number;
};

const VALID_CATEGORIES = new Set<DrawingRecognitionCategory>([
  "identity_relation",
  "part_attribute",
  "drawing_revision",
  "controlled_note",
  "engineering_evidence",
  "unclassified"
]);

function positiveInteger(value: unknown, name: string, maximum = 10_000) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > maximum) throw new Error(`DRAWING_OCR_POLICY_INVALID:${name}`);
  return numeric;
}

function finiteNumber(value: unknown, name: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`DRAWING_OCR_POLICY_INVALID:${name}`);
  return numeric;
}

function normalizedText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedMatchText(value: unknown) {
  return normalizedText(value).toLocaleLowerCase("en-US");
}

function safeFieldKey(value: unknown) {
  return normalizedMatchText(value).replace(/[^a-z0-9_]+/gu, "_").replace(/^_+|_+$/gu, "");
}

export function validateDrawingOcrPolicy(value: unknown): DrawingOcrPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DRAWING_OCR_POLICY_INVALID:root");
  const policy = value as Record<string, unknown>;
  if (policy.schemaVersion !== "drawing-ocr-field-priorities.v1") throw new Error("DRAWING_OCR_POLICY_INVALID:schemaVersion");
  const limits = policy.limits as Record<string, unknown> | undefined;
  const textLayer = policy.textLayer as Record<string, unknown> | undefined;
  const utility = policy.utility as Record<string, unknown> | undefined;
  const tierWeights = utility?.tierWeights as Record<string, unknown> | undefined;
  if (!limits || !textLayer || !utility || !tierWeights) throw new Error("DRAWING_OCR_POLICY_INVALID:sections");
  const fields = Array.isArray(policy.fields) ? policy.fields : [];
  const seenKeys = new Set<string>();
  const seenAliases = new Set<string>();
  const validatedFields = fields.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`DRAWING_OCR_POLICY_INVALID:field:${index}`);
    const field = entry as Record<string, unknown>;
    const key = safeFieldKey(field.key);
    const label = normalizedText(field.label);
    const tier = Number(field.tier);
    const category = field.category as DrawingRecognitionCategory;
    const aliases = Array.isArray(field.aliases) ? [...new Set(field.aliases.map(normalizedMatchText).filter(Boolean))] : [];
    if (!key || seenKeys.has(key) || !label || ![0, 1, 2].includes(tier) || !VALID_CATEGORIES.has(category) || aliases.length === 0) {
      throw new Error(`DRAWING_OCR_POLICY_INVALID:field:${index}`);
    }
    seenKeys.add(key);
    for (const alias of aliases) {
      const aliasKey = `${tier}:${alias}`;
      if (seenAliases.has(aliasKey)) throw new Error(`DRAWING_OCR_POLICY_INVALID:duplicateAlias:${alias}`);
      seenAliases.add(aliasKey);
    }
    return {
      key,
      label,
      tier: tier as 0 | 1 | 2,
      businessWeight: finiteNumber(field.businessWeight, `businessWeight:${key}`),
      category,
      aliases
    };
  });
  const requiredKeys = new Set(validatedFields.filter((field) => field.tier === 0).map((field) => field.key));
  for (const required of ["drawing_number", "revision", "part_number", "title", "material", "scale", "drawn_by"]) {
    if (!requiredKeys.has(required)) throw new Error(`DRAWING_OCR_POLICY_INVALID:required:${required}`);
  }
  const observationsPerSource = positiveInteger(limits.observationsPerSource, "observationsPerSource", 100);
  const requiredDistinctValues = positiveInteger(limits.requiredDistinctValues, "requiredDistinctValues", 10);
  if (requiredKeys.size * requiredDistinctValues > observationsPerSource) throw new Error("DRAWING_OCR_POLICY_INVALID:requiredQuota");
  return {
    schemaVersion: "drawing-ocr-field-priorities.v1",
    policyVersion: normalizedText(policy.policyVersion),
    limits: {
      observationsPerSource,
      observationsPerSession: positiveInteger(limits.observationsPerSession, "observationsPerSession", 500),
      tier3PerSource: positiveInteger(limits.tier3PerSource, "tier3PerSource", 25),
      requiredDistinctValues,
      maxValueCharacters: positiveInteger(limits.maxValueCharacters, "maxValueCharacters", 1_000)
    },
    textLayer: {
      minimumPrintableCharactersPerPage: positiveInteger(textLayer.minimumPrintableCharactersPerPage, "minimumPrintableCharactersPerPage", 10_000),
      minimumPrintableCharactersPerDocument: positiveInteger(textLayer.minimumPrintableCharactersPerDocument, "minimumPrintableCharactersPerDocument", 100_000),
      requiresKnownLabelPerPage: textLayer.requiresKnownLabelPerPage !== false
    },
    utility: {
      tierWeights: {
        "0": finiteNumber(tierWeights["0"], "tierWeight:0"),
        "1": finiteNumber(tierWeights["1"], "tierWeight:1"),
        "2": finiteNumber(tierWeights["2"], "tierWeight:2"),
        "3": finiteNumber(tierWeights["3"], "tierWeight:3")
      },
      labelExact: finiteNumber(utility.labelExact, "labelExact"),
      labelPrefix: finiteNumber(utility.labelPrefix, "labelPrefix"),
      textLayerConfidence: finiteNumber(utility.textLayerConfidence, "textLayerConfidence"),
      ocrConfidence: finiteNumber(utility.ocrConfidence, "ocrConfidence"),
      titleBlockOrTable: finiteNumber(utility.titleBlockOrTable, "titleBlockOrTable"),
      corroboration: finiteNumber(utility.corroboration, "corroboration"),
      duplicatePenalty: finiteNumber(utility.duplicatePenalty, "duplicatePenalty"),
      noisePenalty: finiteNumber(utility.noisePenalty, "noisePenalty")
    },
    fields: validatedFields,
    tier3EngineeringKeywords: Array.isArray(policy.tier3EngineeringKeywords)
      ? [...new Set(policy.tier3EngineeringKeywords.map(normalizedMatchText).filter(Boolean))]
      : []
  };
}

export const DRAWING_OCR_POLICY = validateDrawingOcrPolicy(rawPolicy);
export const DRAWING_OCR_ADAPTER_CODE = "browser-pdf-ocr.v1";
export const DRAWING_OCR_REQUIRED_KEYS = DRAWING_OCR_POLICY.fields.filter((field) => field.tier === 0).map((field) => field.key);

type LabelMatch = { field: DrawingOcrFieldPolicy; alias: string; start: number; end: number; exact: boolean };

function asciiWord(character: string | undefined) {
  return Boolean(character && /[a-z0-9]/iu.test(character));
}

function findLabelMatches(line: string) {
  const normalized = normalizedMatchText(line);
  const matches: LabelMatch[] = [];
  for (const field of DRAWING_OCR_POLICY.fields) {
    for (const alias of field.aliases) {
      let start = normalized.indexOf(alias);
      while (start >= 0) {
        const end = start + alias.length;
        const requiresLeftBoundary = asciiWord(alias[0]);
        const requiresRightBoundary = asciiWord(alias.at(-1));
        if ((!requiresLeftBoundary || !asciiWord(normalized[start - 1])) && (!requiresRightBoundary || !asciiWord(normalized[end]))) {
          matches.push({ field, alias, start, end, exact: normalized === alias });
        }
        start = normalized.indexOf(alias, start + Math.max(alias.length, 1));
      }
    }
  }
  return matches
    .sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start) || left.field.key.localeCompare(right.field.key))
    .filter((match, index, list) => !list.slice(0, index).some((prior) => prior.start === match.start || (prior.start <= match.start && prior.end >= match.end)));
}

export function hasKnownDrawingOcrLabel(text: string) {
  return normalizedText(text).split(/\r?\n/gu).some((line) => findLabelMatches(line).length > 0);
}

export function drawingOcrTextLayerIsSufficient(pageText: string, documentPrintableCharacters: number) {
  const printable = normalizedText(pageText).replace(/\s+/gu, "").length;
  const labelPass = !DRAWING_OCR_POLICY.textLayer.requiresKnownLabelPerPage || hasKnownDrawingOcrLabel(pageText);
  const pagePass = printable >= DRAWING_OCR_POLICY.textLayer.minimumPrintableCharactersPerPage && labelPass;
  const documentAssistedPass = printable >= Math.max(8, Math.floor(DRAWING_OCR_POLICY.textLayer.minimumPrintableCharactersPerPage / 3))
    && documentPrintableCharacters >= DRAWING_OCR_POLICY.textLayer.minimumPrintableCharactersPerDocument
    && labelPass;
  return pagePass || documentAssistedPass;
}

function confidenceBand(block: DrawingOcrTextBlock): DrawingRecognitionConfidence {
  if (block.source === "text_layer") return "high";
  const confidence = Number(block.confidence ?? 0);
  return confidence >= 85 ? "high" : confidence >= 65 ? "medium" : confidence > 0 ? "low" : "unknown";
}

function trimCandidateValue(value: string) {
  return normalizedText(value)
    .replace(/^[\s:：#№=|/\\\-]+/gu, "")
    .replace(/[|]+$/gu, "")
    .trim()
    .slice(0, DRAWING_OCR_POLICY.limits.maxValueCharacters);
}

function noisePenalty(value: string) {
  if (!value || /^[\W_]+$/u.test(value)) return DRAWING_OCR_POLICY.utility.noisePenalty * 2;
  if (value.length > 180 || value.split(/\s+/gu).length > 24) return DRAWING_OCR_POLICY.utility.noisePenalty;
  return 0;
}

function locationKind(block: DrawingOcrTextBlock) {
  if (block.titleBlockOrTable) return block.source === "text_layer" ? "pdf_title_block" : "ocr_title_block";
  return block.source === "text_layer" ? "pdf_text_layer" : "ocr_text";
}

function buildPotential(block: DrawingOcrTextBlock, field: DrawingOcrFieldPolicy, alias: string, rawLine: string, value: string, exact: boolean): PotentialObservation | null {
  const rawValue = trimCandidateValue(field.key === "revision" ? value.replace(/(?:修改歷程|revision\s*history).*$/iu, "") : value);
  const normalizedValue = normalizedText(rawValue);
  if (!normalizedValue || normalizedValue.length > DRAWING_OCR_POLICY.limits.maxValueCharacters) return null;
  const utility = DRAWING_OCR_POLICY.utility;
  const score = utility.tierWeights[String(field.tier) as "0" | "1" | "2"]
    + field.businessWeight
    + (exact ? utility.labelExact : utility.labelPrefix)
    + (block.source === "text_layer" ? utility.textLayerConfidence : utility.ocrConfidence * Math.max(0, Math.min(Number(block.confidence ?? 0), 100)) / 100)
    + (block.titleBlockOrTable ? utility.titleBlockOrTable : 0)
    - noisePenalty(normalizedValue);
  return {
    observation: {
      rawText: normalizedText(rawLine).slice(0, 1_000),
      rawValue,
      normalizedValue,
      locationKind: locationKind(block),
      pageNumber: block.pageNumber,
      geometry: block.geometry ?? null,
      confidenceBand: confidenceBand(block),
      category: field.category,
      fieldKey: field.key,
      fieldLabel: field.label,
      applicabilityScope: "overall"
    },
    fieldKey: field.key,
    fieldLabel: field.label,
    tier: field.tier,
    normalizedValue,
    score,
    pageNumber: block.pageNumber,
    readingOrder: block.readingOrder
  };
}

function potentialFromBlocks(blocks: DrawingOcrTextBlock[]) {
  const potentials: PotentialObservation[] = [];
  let tier3Index = 0;
  for (const block of blocks) {
    const lines = block.text.split(/\r?\n/gu).map(normalizedText).filter(Boolean);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const rawLine = lines[lineIndex];
      const matches = findLabelMatches(rawLine);
      for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
        const match = matches[matchIndex];
        const nextStart = matches[matchIndex + 1]?.start ?? normalizedMatchText(rawLine).length;
        let value = rawLine.slice(match.end, nextStart);
        if (!trimCandidateValue(value) && match.field.tier === 0 && matches.length === 1 && lines[lineIndex + 1] && findLabelMatches(lines[lineIndex + 1]).length === 0) {
          value = lines[lineIndex + 1];
        }
        const potential = buildPotential(block, match.field, match.alias, rawLine, value, match.exact);
        if (potential) potentials.push(potential);
      }
      if (matches.length === 0) {
        const normalizedLine = normalizedMatchText(rawLine);
        const keyword = DRAWING_OCR_POLICY.tier3EngineeringKeywords.find((item) => normalizedLine.includes(item));
        if (keyword && rawLine.length >= 4 && rawLine.length <= DRAWING_OCR_POLICY.limits.maxValueCharacters) {
          const fieldKey = `engineering_keyword_${safeFieldKey(keyword) || "text"}`;
          potentials.push({
            observation: {
              rawText: rawLine.slice(0, 1_000),
              rawValue: rawLine,
              normalizedValue: rawLine,
              locationKind: locationKind(block),
              pageNumber: block.pageNumber,
              geometry: block.geometry ?? null,
              confidenceBand: confidenceBand(block),
              category: "unclassified",
              fieldKey,
              fieldLabel: "其他工程關鍵字",
              applicabilityScope: "overall"
            },
            fieldKey,
            fieldLabel: "其他工程關鍵字",
            tier: 3,
            normalizedValue: rawLine,
            score: DRAWING_OCR_POLICY.utility.tierWeights["3"]
              + (block.titleBlockOrTable ? DRAWING_OCR_POLICY.utility.titleBlockOrTable : 0)
              - noisePenalty(rawLine),
            pageNumber: block.pageNumber,
            readingOrder: block.readingOrder + tier3Index / 1_000
          });
          tier3Index += 1;
        }
      }
    }
  }
  return potentials;
}

function deterministicOrder(left: PotentialObservation, right: PotentialObservation) {
  return right.score - left.score
    || left.pageNumber - right.pageNumber
    || left.readingOrder - right.readingOrder
    || left.fieldKey.localeCompare(right.fieldKey)
    || left.normalizedValue.localeCompare(right.normalizedValue);
}

export function selectDrawingOcrObservations(blocks: DrawingOcrTextBlock[]): DrawingOcrSelection {
  const rawPotentials = potentialFromBlocks(blocks);
  const grouped = new Map<string, PotentialObservation[]>();
  for (const potential of rawPotentials) {
    const key = `${potential.fieldKey}\u0000${normalizedMatchText(potential.normalizedValue)}`;
    const list = grouped.get(key) ?? [];
    list.push(potential);
    grouped.set(key, list);
  }
  const unique = [...grouped.values()].map((items) => {
    const best = [...items].sort(deterministicOrder)[0];
    return {
      ...best,
      score: best.score + Math.max(0, items.length - 1) * DRAWING_OCR_POLICY.utility.corroboration,
      observation: {
        ...best.observation,
        geometry: {
          ...(best.observation.geometry ?? {}),
          corroborationCount: items.length
        }
      }
    } satisfies PotentialObservation;
  });
  const selected: PotentialObservation[] = [];
  const requiredOutcomes: DrawingOcrRequiredOutcome[] = [];
  const diagnostics: string[] = [];
  for (const field of DRAWING_OCR_POLICY.fields.filter((item) => item.tier === 0)) {
    const values = unique.filter((item) => item.fieldKey === field.key).sort(deterministicOrder);
    const overflow = values.length > DRAWING_OCR_POLICY.limits.requiredDistinctValues;
    selected.push(...values.slice(0, DRAWING_OCR_POLICY.limits.requiredDistinctValues));
    const outcome = values.length === 0 ? "not_found" : values.length === 1 && !overflow ? "found" : "conflict";
    requiredOutcomes.push({ fieldKey: field.key, fieldLabel: field.label, outcome, distinctValueCount: values.length, overflow });
    diagnostics.push(`required_field_${outcome}:${field.key}`);
    if (overflow) diagnostics.push(`required_field_conflict_overflow:${field.key}`);
  }
  const selectedKeys = new Set(selected.map((item) => `${item.fieldKey}\u0000${normalizedMatchText(item.normalizedValue)}`));
  let tier3Count = 0;
  for (const potential of unique.filter((item) => item.tier > 0).sort(deterministicOrder)) {
    if (selected.length >= DRAWING_OCR_POLICY.limits.observationsPerSource) break;
    if (potential.tier === 3 && tier3Count >= DRAWING_OCR_POLICY.limits.tier3PerSource) continue;
    const key = `${potential.fieldKey}\u0000${normalizedMatchText(potential.normalizedValue)}`;
    if (selectedKeys.has(key)) continue;
    selected.push(potential);
    selectedKeys.add(key);
    if (potential.tier === 3) tier3Count += 1;
  }
  const selectedByTier = { "0": 0, "1": 0, "2": 0, "3": 0 };
  for (const item of selected) selectedByTier[String(item.tier) as "0" | "1" | "2" | "3"] += 1;
  const discarded = Math.max(0, unique.length - selected.length);
  diagnostics.push(`selection_counts:selected=${selected.length},discarded=${discarded},tier0=${selectedByTier["0"]},tier1=${selectedByTier["1"]},tier2=${selectedByTier["2"]},tier3=${selectedByTier["3"]}`);
  return {
    policyVersion: DRAWING_OCR_POLICY.policyVersion,
    observations: selected.map((item) => item.observation),
    diagnostics: diagnostics.slice(0, 20),
    requiredOutcomes,
    counts: {
      potential: unique.length,
      selected: selected.length,
      discarded,
      selectedByTier
    }
  };
}
