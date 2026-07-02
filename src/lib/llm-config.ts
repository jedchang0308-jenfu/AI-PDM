function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = parseStrictInteger(value);
  return parsed !== null && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = parseStrictInteger(value);
  return parsed !== null && parsed >= 0 ? parsed : fallback;
}

function parseStrictInteger(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseConfigString(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const llmConfig = {
  provider: parseConfigString(process.env.LLM_PROVIDER, "local"),
  openAiApiKey: parseConfigString(process.env.OPENAI_API_KEY, ""),
  openAiModel: parseConfigString(process.env.OPENAI_MODEL, "gpt-4.1-mini"),
  openAiApiBaseUrl: parseConfigString(process.env.OPENAI_API_BASE_URL, "https://api.openai.com/v1"),
  openAiTimeoutMs: parsePositiveInt(process.env.OPENAI_TIMEOUT_MS, 30000),
  openAiMaxContextChars: parseNonNegativeInt(process.env.OPENAI_MAX_CONTEXT_CHARS, 12000),
  openAiCacheTtlMs: parseNonNegativeInt(process.env.OPENAI_CACHE_TTL_MS, 300000),
  openAiRateLimitPerMinute: parseNonNegativeInt(process.env.OPENAI_RATE_LIMIT_PER_MINUTE, 20)
};
