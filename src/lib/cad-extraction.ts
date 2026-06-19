import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtractorRuntimeProfile } from "@/lib/metadata-adapter-profile";
import type { FileRole } from "@/lib/types";

export type CadReferenceCandidate = {
  sourceFilename: string;
  sourceFileRole: FileRole;
  referencedFilename: string;
  referencedPartNumber?: string;
  referencedDrawingNumber?: string;
  referencedRevision?: string;
  referenceType: "assembly_component" | "drawing_model" | "derived" | "unknown";
  quantity: number;
  extractionMethod: string;
  confidence: "high" | "medium" | "low";
};

export type CadExtractionResult = {
  references: CadReferenceCandidate[];
  warnings: string[];
};

const nativeCadExtensions = new Set(["sldprt", "sldasm", "slddrw"]);
const referenceMarker = "AI_PDM_REFERENCES:";
const maxEmbeddedProbeBytes = 2 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export async function extractCadReferences(
  files: File[],
  options: { referenceExtractor?: ExtractorRuntimeProfile } = {}
): Promise<CadExtractionResult> {
  const nativeFiles = files.filter((file) => nativeCadExtensions.has(getFileExtension(file.name)));
  if (nativeFiles.length === 0) {
    return { references: [], warnings: [] };
  }

  const references: CadReferenceCandidate[] = [];
  const warnings: string[] = [];

  for (const file of nativeFiles) {
    const external = await extractWithExternalCommand(file, options.referenceExtractor);
    warnings.push(...external.warnings);
    if (external.references.length > 0) {
      references.push(...external.references);
      continue;
    }

    const embedded = await extractEmbeddedReferences(file);
    warnings.push(...embedded.warnings);
    references.push(...embedded.references);
  }

  if (references.length === 0) {
    warnings.push(
      "Native CAD file references require SolidWorks Document Manager or an equivalent reference adapter. This upload currently has no native CAD references."
    );
  }

  return { references, warnings };
}

async function extractWithExternalCommand(file: File, extractor?: ExtractorRuntimeProfile): Promise<CadExtractionResult> {
  const command = extractor?.command ?? process.env.PDM_CAD_REFERENCE_EXTRACTOR_CMD?.trim();
  if (!command) return { references: [], warnings: [] };

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pdm-cad-ref-"));
  const tempPath = path.join(tempDir, sanitizeFilename(file.name));

  try {
    await fs.writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
    const args = parseExtractorArgs(tempPath, extractor);
    const { stdout } = await execFileAsync(command, args, {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return { references: parseAdapterOutput(stdout, file), warnings: [] };
  } catch (error) {
    return {
      references: [],
      warnings: [`Native CAD reference adapter failed for ${file.name}: ${error instanceof Error ? error.message : "unknown_error"}`]
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function parseExtractorArgs(filePath: string, extractor?: ExtractorRuntimeProfile) {
  const raw = extractor?.args ?? process.env.PDM_CAD_REFERENCE_EXTRACTOR_ARGS?.trim();
  if (!raw) return [filePath];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("PDM_CAD_REFERENCE_EXTRACTOR_ARGS must be a JSON string array");
  }
  return parsed.map((item) => item.replaceAll("{file}", filePath));
}

async function extractEmbeddedReferences(file: File): Promise<CadExtractionResult> {
  const text = await file.slice(0, maxEmbeddedProbeBytes).text();
  const line = text.split(/\r?\n/u).find((entry) => entry.includes(referenceMarker));
  if (!line) return { references: [], warnings: [] };

  const jsonText = line.slice(line.indexOf(referenceMarker) + referenceMarker.length).trim();
  return { references: parseAdapterOutput(jsonText, file), warnings: [] };
}

function parseAdapterOutput(text: string, sourceFile: File): CadReferenceCandidate[] {
  const parsed = JSON.parse(text) as unknown;
  const rawReferences =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { references?: unknown[] }).references)
        ? (parsed as { references: unknown[] }).references
        : [];

  return rawReferences
    .map((entry) => normalizeReference(entry, sourceFile))
    .filter((entry): entry is CadReferenceCandidate => entry !== null);
}

function normalizeReference(entry: unknown, sourceFile: File): CadReferenceCandidate | null {
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Record<string, unknown>;
  const referencedFilename = stringValue(value.referencedFilename ?? value.referenced_filename ?? value.filename ?? value.name);
  if (!referencedFilename) return null;

  const referenceType = stringValue(value.referenceType ?? value.reference_type);
  const confidence = stringValue(value.confidence);
  const quantity = Number(value.quantity ?? 1);

  return {
    sourceFilename: stringValue(value.sourceFilename ?? value.source_filename) || sourceFile.name,
    sourceFileRole: fileRoleFromName(stringValue(value.sourceFilename ?? value.source_filename) || sourceFile.name),
    referencedFilename,
    referencedPartNumber: stringValue(value.referencedPartNumber ?? value.referenced_part_number ?? value.partNumber ?? value.part_number) || undefined,
    referencedDrawingNumber: stringValue(value.referencedDrawingNumber ?? value.referenced_drawing_number ?? value.drawingNumber ?? value.drawing_number) || undefined,
    referencedRevision: stringValue(value.referencedRevision ?? value.referenced_revision ?? value.revision) || undefined,
    referenceType: isReferenceType(referenceType) ? referenceType : "unknown",
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    extractionMethod: stringValue(value.extractionMethod ?? value.extraction_method) || "native_adapter",
    confidence: isConfidence(confidence) ? confidence : "medium"
  };
}

function fileRoleFromName(filename: string): FileRole {
  const ext = getFileExtension(filename);
  if (ext === "sldprt" || ext === "sldasm" || ext === "slddrw" || ext === "pdf" || ext === "dwg") return ext;
  return "other";
}

function isReferenceType(value: string): value is CadReferenceCandidate["referenceType"] {
  return value === "assembly_component" || value === "drawing_model" || value === "derived" || value === "unknown";
}

function isConfidence(value: string): value is CadReferenceCandidate["confidence"] {
  return value === "high" || value === "medium" || value === "low";
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function getFileExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1 ? normalized.slice(index + 1) : "";
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_");
}
