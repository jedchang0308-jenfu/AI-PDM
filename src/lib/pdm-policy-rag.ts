import fs from "node:fs";
import path from "node:path";
import { PDM_POLICY_CHUNKS, PDM_POLICY_SOURCE } from "@/lib/pdm-policy-rag-data";
import type { AiSource } from "@/lib/ai-tools";
import type { PdmPolicyChunk } from "@/lib/pdm-policy-rag-data";

const KEYWORD_ALIASES: Record<string, string[]> = {
  root: ["root", "root_code", "主根號", "主根", "圖料"],
  drawing: ["drawing", "drawing_number", "圖號"],
  part: ["part", "part_number", "料號"],
  revision: ["revision", "版次", "rev"],
  development: ["npd", "新產品", "開發", "技術移轉", "設計變更", "eco"],
  validation: ["evt", "dvt", "pvt", "驗證", "工程驗證", "設計驗證", "製程驗證"],
  file: ["file", "檔案", "pdf", "dwg", "sldprt", "sldasm", "slddrw", "sha256"],
  approval: ["approval", "approve", "review", "審核", "核准"],
  release: ["release", "released", "發布", "發佈", "同名", "filename"],
  ai: ["ai", "assistant", "read-only", "唯讀"]
};

export function searchPdmPolicy(query: string) {
  const terms = expandTerms(query);
  const policyChunks = loadPolicyChunks();
  const ranked = policyChunks.map((chunk) => {
    const haystack = `${chunk.title}\n${chunk.content}`.toLowerCase();
    const score = terms.reduce((total, term) => total + countMatches(haystack, term), 0);
    return { chunk, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const selected = ranked.length > 0 ? ranked.map((entry) => entry.chunk) : policyChunks.slice(0, 3);
  const answer = [
    "PDM policy lookup:",
    ...selected.map((chunk) => `${chunk.title}\n${chunk.content}`)
  ].join("\n\n");

  const sources: AiSource[] = selected.map((chunk) => ({
    type: "policy",
    label: chunk.title,
    detail: `${PDM_POLICY_SOURCE}#${chunk.id}`
  }));

  return { answer, sources };
}

function loadPolicyChunks(): PdmPolicyChunk[] {
  const policyPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    ".ai-doc",
    "reference",
    "pdm-management-policy-draft.md"
  );
  try {
    const markdown = fs.readFileSync(policyPath, "utf8");
    const chunks = parsePolicyMarkdown(markdown);
    return chunks.length > 0 ? chunks : PDM_POLICY_CHUNKS;
  } catch {
    return PDM_POLICY_CHUNKS;
  }
}

function parsePolicyMarkdown(markdown: string): PdmPolicyChunk[] {
  const chunks: PdmPolicyChunk[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  function flush() {
    const content = currentLines.join("\n").trim();
    if (!currentTitle || !content) return;
    chunks.push({
      id: currentTitle
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, ""),
      title: currentTitle,
      content
    });
  }

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      flush();
      currentTitle = heading[1].trim();
      currentLines = [];
      continue;
    }
    if (currentTitle) currentLines.push(line);
  }
  flush();

  return chunks;
}

function expandTerms(query: string) {
  const normalized = query.toLowerCase();
  const terms = new Set(
    normalized
      .split(/[^\p{L}\p{N}_-]+/u)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
  );

  for (const aliases of Object.values(KEYWORD_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias.toLowerCase()))) {
      for (const alias of aliases) terms.add(alias.toLowerCase());
    }
  }

  return [...terms];
}

function countMatches(text: string, term: string) {
  if (!term) return 0;
  let count = 0;
  let index = text.indexOf(term);
  while (index >= 0) {
    count++;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}
