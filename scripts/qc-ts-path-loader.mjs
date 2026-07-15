import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const basePath = path.join(process.cwd(), "src", specifier.slice(2));
  const candidates = [`${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, "index.ts")];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) throw new Error(`QC_TS_ALIAS_NOT_FOUND: ${specifier}`);
  return { url: pathToFileURL(match).href, shortCircuit: true };
}
