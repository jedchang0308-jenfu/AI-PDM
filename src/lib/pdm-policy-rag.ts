import { PDM_POLICY_CHUNKS, PDM_POLICY_SOURCE } from "@/lib/pdm-policy-rag-data";
import type { AiSource } from "@/lib/ai-tools";

const KEYWORD_ALIASES: Record<string, string[]> = {
  drawing: ["drawing", "drawing_number", "圖號"],
  part: ["part", "part_number", "料號"],
  revision: ["revision", "版次", "rev"],
  file: ["file", "檔案", "pdf", "dwg", "sldprt", "sldasm", "slddrw", "sha256"],
  approval: ["approval", "approve", "review", "審核", "核准"],
  release: ["release", "released", "發布", "發佈", "同名", "filename"],
  ai: ["ai", "assistant", "read-only", "唯讀"]
};

export function searchPdmPolicy(query: string) {
  const terms = expandTerms(query);
  const ranked = PDM_POLICY_CHUNKS.map((chunk) => {
    const haystack = `${chunk.title}\n${chunk.content}`.toLowerCase();
    const score = terms.reduce((total, term) => total + countMatches(haystack, term), 0);
    return { chunk, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const selected = ranked.length > 0 ? ranked.map((entry) => entry.chunk) : PDM_POLICY_CHUNKS.slice(0, 3);
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
