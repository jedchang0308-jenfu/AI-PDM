import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtractorRuntimeProfile } from "@/lib/metadata-adapter-profile";
import type { PdmMetadata } from "@/lib/pdm-metadata";
import { flattenMetadataObject, pickAliasedMetadataFields } from "@/lib/pdm-metadata-field-mapping";

export type NativeMetadataExtraction = {
  metadata: Partial<PdmMetadata>;
  source: string;
  warnings: string[];
};

const execFileAsync = promisify(execFile);
const nativeSolidWorksExtensions = new Set(["sldprt", "sldasm", "slddrw"]);
const metadataMarker = "AI_PDM_METADATA:";
const maxEmbeddedProbeBytes = 2 * 1024 * 1024;

const aliases: Record<keyof PdmMetadata, string[]> = {
  drawing_number: ["drawing_number", "drawingnumber", "drawing_no", "drawingno", "drawing", "dwg_no", "dwgno"],
  part_number: ["part_number", "partnumber", "part_no", "partno", "part"],
  part_name: ["part_name", "partname", "name", "description"],
  revision: ["revision", "rev"],
  product_line: ["product_line", "productline", "line", "product_family"],
  customer: ["customer", "client"],
  project_code: ["project_code", "project", "projectcode"],
  process_name: ["process_name", "process", "manufacturing_process"],
  machine: ["machine", "machine_type", "equipment"],
  material: ["material"],
  surface_finish: ["surface_finish", "surfacefinish", "finish", "surface"],
  document_type: ["document_type", "documenttype", "type", "doctype", "doc_type"]
};

export async function extractNativeCadMetadata(
  files: File[],
  options: { extractor?: ExtractorRuntimeProfile } = {}
): Promise<NativeMetadataExtraction[]> {
  const nativeFiles = files.filter((file) => nativeSolidWorksExtensions.has(getFileExtension(file.name)));
  const results: NativeMetadataExtraction[] = [];

  for (const file of nativeFiles) {
    const external = await extractWithExternalCommand(file, options.extractor);
    if (hasMetadata(external.metadata)) {
      results.push(external);
      continue;
    }

    const embedded = await extractEmbeddedMetadata(file);
    if (hasMetadata(embedded.metadata)) {
      results.push(embedded);
    }
  }

  return results;
}

async function extractWithExternalCommand(file: File, extractor?: ExtractorRuntimeProfile): Promise<NativeMetadataExtraction> {
  const command = extractor?.command ?? process.env.PDM_METADATA_EXTRACTOR_CMD?.trim();
  if (!command) return { metadata: {}, source: file.name, warnings: [] };

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pdm-metadata-"));
  const tempPath = path.join(tempDir, sanitizeFilename(file.name));

  try {
    await fs.writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
    const args = parseExtractorArgs(tempPath, extractor);
    const { stdout } = await execFileAsync(command, args, {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return {
      metadata: parseAdapterOutput(stdout),
      source: `${file.name}:native-adapter`,
      warnings: []
    };
  } catch (error) {
    return {
      metadata: {},
      source: file.name,
      warnings: [`Native CAD metadata adapter failed for ${file.name}: ${error instanceof Error ? error.message : "unknown_error"}`]
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function parseExtractorArgs(filePath: string, extractor?: ExtractorRuntimeProfile) {
  const raw = extractor?.args ?? process.env.PDM_METADATA_EXTRACTOR_ARGS?.trim();
  if (!raw) return [filePath];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("PDM_METADATA_EXTRACTOR_ARGS must be a JSON string array");
  }
  return parsed.map((item) => item.replaceAll("{file}", filePath));
}

async function extractEmbeddedMetadata(file: File): Promise<NativeMetadataExtraction> {
  const text = await file.slice(0, maxEmbeddedProbeBytes).text();
  const line = text.split(/\r?\n/u).find((entry) => entry.includes(metadataMarker));
  if (!line) return { metadata: {}, source: file.name, warnings: [] };

  const jsonText = line.slice(line.indexOf(metadataMarker) + metadataMarker.length).trim();
  return {
    metadata: parseAdapterOutput(jsonText),
    source: `${file.name}:embedded-native-metadata`,
    warnings: []
  };
}

function parseAdapterOutput(text: string): Partial<PdmMetadata> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") return {};

  const value = parsed as Record<string, unknown>;
  if (value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)) {
    return pickKnownFields(flattenMetadataObject(value.metadata as Record<string, unknown>));
  }
  return pickKnownFields(flattenMetadataObject(value));
}

function pickKnownFields(values: Record<string, unknown>): Partial<PdmMetadata> {
  return pickAliasedMetadataFields(values, aliases);
}

function hasMetadata(metadata: Partial<PdmMetadata>) {
  return Object.values(metadata).some((value) => String(value ?? "").trim());
}

function getFileExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1 ? normalized.slice(index + 1) : "";
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_");
}
