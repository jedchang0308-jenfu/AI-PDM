import { createHash } from "node:crypto";
import type { AssemblyArchiveManifest } from "./assembly-archive";
import { isSupportedAssemblyParserVersion } from "./assembly-parser-version";

export type AssemblyResultRow = {
  occurrenceKey: string; parentKey: string; entryKey: string | null; configuration: string;
  cadPartNumber?: string | null; drawingNumber?: string | null; quantity: string | null;
  unit: string | null; disposition: string; [field: string]: unknown;
  componentName?:string;
};
type Issue = { code: string; parentKey: string; reference: string };
export type AssemblyAnalysisResult = {
  version: 1; parserVersion: string; status: "complete" | "needs_input" | "blocked";
  mainEntryKey: string | null; mainCandidates: string[]; configurationNames: string[]; diagnostic?: string;
  configurations: { name: string; references: {status: "passed" | "blocked" | "unknown"; issues: Issue[]};
    bom: {rows: AssemblyResultRow[]} }[];
};
function invalid(): never { throw Object.assign(new Error("ASSEMBLY_RESULT_INVALID"), { status: 422 }); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function label(input: unknown, limit = 1024): string {
  if (typeof input !== "string" || !input.trim() || input.length > limit || /[\u0000-\u001f]/u.test(input)) invalid();
  return input;
}
function list(input: unknown, limit: number): unknown[] {
  if (!Array.isArray(input) || input.length > limit) invalid();
  return input;
}
function uniqueLabels(input: unknown, limit: number) {
  const values = list(input, limit).map(v => label(v));
  if (new Set(values).size !== values.length) invalid();
  return values;
}
export function validateAssemblyAnalysisResult(input: unknown, manifest: AssemblyArchiveManifest,
  selectedMain: string | null, selectedConfigurations: string[]): AssemblyAnalysisResult {
  const raw = record(input);
  if (raw.version !== 1 || !["complete", "needs_input", "blocked"].includes(String(raw.status))) invalid();
  if(!isSupportedAssemblyParserVersion(raw.parserVersion))invalid();
  const assemblies = new Set(manifest.assemblyEntryKeys);
  const entries = new Set(manifest.entries.filter(entry => !entry.directory).map(entry => entry.entryKey));
  const main = raw.mainEntryKey === null ? null : label(raw.mainEntryKey);
  const failedBeforeOpening = raw.status === "blocked" && main === null && typeof raw.diagnostic === "string";
  if (main && !assemblies.has(main) || selectedMain && selectedMain !== main && !failedBeforeOpening) invalid();
  for (const key of uniqueLabels(raw.mainCandidates, 10_000)) if (!assemblies.has(key)) invalid();
  const names = new Set(uniqueLabels(raw.configurationNames, 10_000));
  const results = list(raw.configurations, 10_000);
  const seen = new Set<string>();
  let allPassed = true;
  for (const value of results) {
    const config = record(value);
    const name = label(config.name);
    if (!main || !names.has(name) || seen.has(name)) invalid();
    seen.add(name);
    const refs = record(config.references);
    if (!["passed", "blocked", "unknown"].includes(String(refs.status))) invalid();
    const issues = list(refs.issues, 50_000);
    if (refs.status === "passed" && issues.length || refs.status !== "passed" && !issues.length) invalid();
    if (refs.status !== "passed") allPassed = false;
    for (const item of issues) {
      const issue = record(item);
      label(issue.code, 120);
      if (!entries.has(label(issue.parentKey))) invalid();
      if (/^(?:[a-z]:|[\\/])/iu.test(label(issue.reference))) invalid();
    }
    const occurrences = new Set<string>();
    for (const item of list(record(config.bom).rows, 100_000)) {
      const row = record(item);
      const occurrence = label(row.occurrenceKey, 4096);
      if (occurrences.has(occurrence)) invalid();
      occurrences.add(occurrence);
      label(row.parentKey, 4096); label(row.configuration); label(row.disposition, 64);
      if (row.entryKey !== null && !entries.has(label(row.entryKey))) invalid();
      if (row.quantity !== null && !/^(?:0|[1-9][0-9]{0,23})(?:\.[0-9]{1,12})?$/u.test(label(row.quantity, 40))) invalid();
      if (typeof row.quantity === "string" && !/[1-9]/u.test(row.quantity)) invalid();
      if (row.unit !== null) label(row.unit, 80);
      for (const key of ["cadPartNumber", "drawingNumber"]) if (row[key] != null) label(row[key], 256);
      if(row.componentName!=null && /^(?:[a-z]:|[\\/])/iu.test(label(row.componentName,1024)))invalid();
      if (row.reference != null && /^(?:[a-z]:|[\\/])/iu.test(label(row.reference))) invalid();
    }
    const parents = new Map((record(config.bom).rows as AssemblyResultRow[]).map(row => [row.occurrenceKey,row.parentKey]));
    const checked = new Set<string>();
    for (const start of occurrences) {
      const branch = new Set<string>();
      let cursor = start;
      while (cursor !== main && !checked.has(cursor)) {
        const parent = parents.get(cursor);
        if (parent === undefined || branch.has(cursor) || branch.size >= 128) invalid();
        branch.add(cursor);
        cursor = parent;
      }
      for (const key of branch) checked.add(key);
    }
  }
  if (raw.status === "complete" && (!main || !seen.size || !allPassed)) invalid();
  if (raw.status !== "needs_input" && seen.size && selectedConfigurations.length &&
      (seen.size !== selectedConfigurations.length || selectedConfigurations.some(name => !seen.has(name)))) invalid();
  if (raw.status === "needs_input" && !main && !(raw.mainCandidates as string[]).length) invalid();
  if (raw.diagnostic != null) label(raw.diagnostic, 2048);
  return raw as AssemblyAnalysisResult;
}
export function assemblyResultDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
