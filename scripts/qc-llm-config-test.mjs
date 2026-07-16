#!/usr/bin/env node

import ts from "typescript";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const configSource = readProjectFile(root, "src/lib/llm-config.ts");
const envKeys = [
  "LLM_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_API_BASE_URL",
  "OPENAI_TIMEOUT_MS",
  "OPENAI_MAX_CONTEXT_CHARS",
  "OPENAI_CACHE_TTL_MS",
  "OPENAI_RATE_LIMIT_PER_MINUTE"
];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function setEnv(overrides) {
  for (const key of envKeys) {
    if (Object.hasOwn(overrides, key)) {
      process.env[key] = overrides[key];
    } else {
      delete process.env[key];
    }
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadLlmConfig(overrides, caseName) {
  setEnv(overrides);
  const transpiled = ts.transpileModule(configSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    },
    fileName: "llm-config.ts"
  });
  const cacheBust = `${caseName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}#${cacheBust}`;
  const loaded = await import(moduleUrl);
  return loaded.llmConfig;
}

try {
  const defaults = await loadLlmConfig({}, "defaults");
  record("LLM-CONFIG-001 defaults to local provider", defaults.provider === "local", defaults.provider);
  record("LLM-CONFIG-002 defaults to empty OpenAI key", defaults.openAiApiKey === "", defaults.openAiApiKey);
  record("LLM-CONFIG-003 defaults to known OpenAI model", defaults.openAiModel === "gpt-4.1-mini", defaults.openAiModel);
  record(
    "LLM-CONFIG-004 defaults to OpenAI v1 base URL",
    defaults.openAiApiBaseUrl === "https://api.openai.com/v1",
    defaults.openAiApiBaseUrl
  );
  record("LLM-CONFIG-005 defaults timeout to 30000", defaults.openAiTimeoutMs === 30000, String(defaults.openAiTimeoutMs));
  record(
    "LLM-CONFIG-006 defaults context limit to 12000",
    defaults.openAiMaxContextChars === 12000,
    String(defaults.openAiMaxContextChars)
  );
  record("LLM-CONFIG-007 defaults cache TTL to 300000", defaults.openAiCacheTtlMs === 300000, String(defaults.openAiCacheTtlMs));
  record(
    "LLM-CONFIG-008 defaults rate limit to 20",
    defaults.openAiRateLimitPerMinute === 20,
    String(defaults.openAiRateLimitPerMinute)
  );

  const trimmed = await loadLlmConfig(
    {
      LLM_PROVIDER: " openai ",
      OPENAI_API_KEY: " sk-test ",
      OPENAI_MODEL: " gpt-test ",
      OPENAI_API_BASE_URL: " https://example.test/v1/ ",
      OPENAI_TIMEOUT_MS: " 45000 ",
      OPENAI_MAX_CONTEXT_CHARS: " 333 ",
      OPENAI_CACHE_TTL_MS: " 444 ",
      OPENAI_RATE_LIMIT_PER_MINUTE: " 55 "
    },
    "trimmed"
  );
  record("LLM-CONFIG-009 trims provider", trimmed.provider === "openai", trimmed.provider);
  record("LLM-CONFIG-010 trims OpenAI key", trimmed.openAiApiKey === "sk-test", trimmed.openAiApiKey);
  record("LLM-CONFIG-011 trims OpenAI model", trimmed.openAiModel === "gpt-test", trimmed.openAiModel);
  record("LLM-CONFIG-012 trims OpenAI base URL", trimmed.openAiApiBaseUrl === "https://example.test/v1/", trimmed.openAiApiBaseUrl);
  record("LLM-CONFIG-013 parses positive timeout", trimmed.openAiTimeoutMs === 45000, String(trimmed.openAiTimeoutMs));
  record("LLM-CONFIG-014 parses context limit", trimmed.openAiMaxContextChars === 333, String(trimmed.openAiMaxContextChars));
  record("LLM-CONFIG-015 parses cache TTL", trimmed.openAiCacheTtlMs === 444, String(trimmed.openAiCacheTtlMs));
  record("LLM-CONFIG-016 parses rate limit", trimmed.openAiRateLimitPerMinute === 55, String(trimmed.openAiRateLimitPerMinute));

  const invalid = await loadLlmConfig(
    {
      LLM_PROVIDER: " ",
      OPENAI_API_KEY: " ",
      OPENAI_MODEL: " ",
      OPENAI_API_BASE_URL: " ",
      OPENAI_TIMEOUT_MS: "0",
      OPENAI_MAX_CONTEXT_CHARS: "-1",
      OPENAI_CACHE_TTL_MS: "1.5",
      OPENAI_RATE_LIMIT_PER_MINUTE: "20x"
    },
    "invalid"
  );
  record("LLM-CONFIG-017 blank provider falls back", invalid.provider === "local", invalid.provider);
  record("LLM-CONFIG-018 blank API key falls back", invalid.openAiApiKey === "", invalid.openAiApiKey);
  record("LLM-CONFIG-019 blank model falls back", invalid.openAiModel === "gpt-4.1-mini", invalid.openAiModel);
  record(
    "LLM-CONFIG-020 blank base URL falls back",
    invalid.openAiApiBaseUrl === "https://api.openai.com/v1",
    invalid.openAiApiBaseUrl
  );
  record("LLM-CONFIG-021 rejects zero positive timeout", invalid.openAiTimeoutMs === 30000, String(invalid.openAiTimeoutMs));
  record("LLM-CONFIG-022 rejects negative context limit", invalid.openAiMaxContextChars === 12000, String(invalid.openAiMaxContextChars));
  record("LLM-CONFIG-023 rejects decimal cache TTL", invalid.openAiCacheTtlMs === 300000, String(invalid.openAiCacheTtlMs));
  record("LLM-CONFIG-024 rejects suffixed rate limit", invalid.openAiRateLimitPerMinute === 20, String(invalid.openAiRateLimitPerMinute));

  const disabled = await loadLlmConfig(
    {
      OPENAI_MAX_CONTEXT_CHARS: "0",
      OPENAI_CACHE_TTL_MS: "0",
      OPENAI_RATE_LIMIT_PER_MINUTE: "0"
    },
    "disabled"
  );
  record("LLM-CONFIG-025 allows zero context limit", disabled.openAiMaxContextChars === 0, String(disabled.openAiMaxContextChars));
  record("LLM-CONFIG-026 allows zero cache TTL", disabled.openAiCacheTtlMs === 0, String(disabled.openAiCacheTtlMs));
  record("LLM-CONFIG-027 allows zero rate limit", disabled.openAiRateLimitPerMinute === 0, String(disabled.openAiRateLimitPerMinute));
} finally {
  restoreEnv();
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
