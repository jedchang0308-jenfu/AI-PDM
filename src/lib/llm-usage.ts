import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type LlmUsageEvent = {
  provider: "local" | "openai";
  model?: string;
  userId?: string;
  promptHash: string;
  promptChars: number;
  contextChars?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  cacheHit: boolean;
  toolHit: boolean;
  apiCall: boolean;
  durationMs: number;
  errorReason?: string;
};

export function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function estimateTokensFromChars(chars: number) {
  return Math.max(1, Math.ceil(chars / 4));
}

export function logLlmUsage(event: LlmUsageEvent) {
  if (process.env.PDM_AI_USAGE_LOG === "off") return;

  const configuredDir = process.env.PDM_AI_USAGE_DIR?.trim();
  const usageDir = configuredDir
    ? path.isAbsolute(configuredDir)
      ? configuredDir
      : path.resolve(/*turbopackIgnore: true*/ process.cwd(), configuredDir)
    : path.join(resolveDataDir(), "usage");

  const record = {
    createdAt: new Date().toISOString(),
    ...event
  };

  try {
    fs.mkdirSync(usageDir, { recursive: true });
    fs.appendFileSync(path.join(usageDir, "llm-usage.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    console.warn("Unable to write LLM usage log", error instanceof Error ? error.message : String(error));
  }
}

function resolveDataDir() {
  const configured = process.env.PDM_DATA_DIR?.trim();
  if (!configured) return path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}
