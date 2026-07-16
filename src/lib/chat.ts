import {
  AI_TOOL_WHITELIST,
  executeAiTool,
  isAllowedAiToolName,
  parseExplicitToolRequest,
  type AiSource
} from "@/lib/ai-tools";
import type { DbUser } from "@/lib/db";
import { llmConfig } from "@/lib/llm-config";
import { estimateTokensFromChars, hashText, logLlmUsage } from "@/lib/llm-usage";

export type AiAnswer = {
  answer: string;
  sources: AiSource[];
};

type OpenAiContextPayload = {
  question: string;
  allowedTools: readonly string[];
  metrics: string;
  currentSubmission: string;
  sources: AiSource[];
};

const openAiCache = new Map<string, { expiresAt: number; answer: AiAnswer }>();
const openAiRateLimit = new Map<string, number[]>();

export async function answerPdmQuestion(
  message: string,
  context?: { currentSubmissionId?: string },
  user?: DbUser
): Promise<AiAnswer> {
  const text = message.trim();
  const startedAt = Date.now();

  if (isDestructivePdmActionRequest(text)) {
    return recordUsage(
      {
        answer: [
          "AI_ACTION_BLOCKED",
          "AI assistant is read-only and cannot approve, reject, delete, revise, release, publish, or change PDM records.",
          "請改用正式 PDM 操作流程，由具權限的人員執行並留下審核紀錄。"
        ].join("\n"),
        sources: []
      },
      { provider: "local", message: text, user, startedAt, toolHit: false, errorReason: "destructive_action_blocked" }
    );
  }

  const requestedTool = parseExplicitToolRequest(text);
  if (requestedTool && !isAllowedAiToolName(requestedTool)) {
    return recordUsage(
      {
        answer: ["AI_TOOL_BLOCKED", `Tool '${requestedTool}' is not allowed.`, `Allowed tools: ${AI_TOOL_WHITELIST.join(", ")}`].join("\n"),
        sources: []
      },
      { provider: "local", message: text, user, startedAt, toolHit: false, errorReason: "tool_blocked" }
    );
  }

  if (!user) {
    return recordUsage(
      { answer: "必須先登入才能使用 AI assistant。", sources: [] },
      { provider: "local", message: text, startedAt, toolHit: false, errorReason: "missing_user" }
    );
  }

  const local = answerWithLocalTools(text, context, user, requestedTool);
  if (local) {
    return recordUsage(local, { provider: "local", message: text, user, startedAt, toolHit: local.sources.length > 0 });
  }

  if (llmConfig.openAiApiKey && llmConfig.provider.toLowerCase() === "openai") {
    return answerWithOpenAi(text, context, user, startedAt);
  }

  return recordUsage(
    {
      answer: [
        "目前可用本地 PDM 工具回答：",
        AI_TOOL_WHITELIST.join(", "),
        "可詢問 pending、dashboard summary、目前送審內容、PDM policy/rule/drawing/part/revision 規則；未設定 OpenAI 時不會呼叫外部 LLM。"
      ].join("\n"),
      sources: []
    },
    { provider: "local", message: text, user, startedAt, toolHit: false }
  );
}

function answerWithLocalTools(
  text: string,
  context: { currentSubmissionId?: string } | undefined,
  user: DbUser,
  requestedTool: string | null
): AiAnswer | null {
  if (requestedTool && isAllowedAiToolName(requestedTool)) {
    const result = executeAiTool({ toolName: requestedTool, user, currentSubmissionId: context?.currentSubmissionId, query: text });
    return { answer: result.text, sources: result.sources };
  }

  if (context?.currentSubmissionId) {
    const result = executeAiTool({ toolName: "get_submission_detail", user, currentSubmissionId: context.currentSubmissionId });
    return { answer: result.text, sources: result.sources };
  }

  if (/\b(pending|dashboard|summary)\b/i.test(text) || /待審|待審核|儀表板|摘要|總覽/.test(text)) {
    const toolName = /\b(dashboard|summary)\b/i.test(text) || /儀表板|摘要|總覽/.test(text)
      ? "get_dashboard_metrics"
      : "list_pending_reviews";
    const result = executeAiTool({ toolName, user });
    return { answer: result.text, sources: result.sources };
  }

  if (/\b(policy|rule|drawing|part|revision)\b/i.test(text) || /政策|規則|圖號|料號|版次/.test(text)) {
    const result = executeAiTool({ toolName: "explain_policy", user, query: text });
    return { answer: result.text, sources: result.sources };
  }

  return null;
}

function isDestructivePdmActionRequest(text: string) {
  const normalized = text.toLowerCase();
  const actionPattern = /\b(approve|approval|reject|delete|remove|revise|revision|release|publish|change status)\b/i;
  const intentPattern = /\b(please|do it|make it|run|submit)\b/i;
  const zhActionPattern = /核准|駁回|刪除|移除|升版|發布|改狀態|變更狀態/;
  const zhIntentPattern = /幫我|請你|直接|執行|送出/;
  return (actionPattern.test(normalized) && intentPattern.test(normalized)) || (zhActionPattern.test(text) && zhIntentPattern.test(text));
}

async function answerWithOpenAi(
  message: string,
  context: { currentSubmissionId?: string } | undefined,
  user: DbUser,
  startedAt: number
): Promise<AiAnswer> {
  const metrics = executeAiTool({ toolName: "get_dashboard_metrics", user });
  const currentSubmission = executeAiTool({ toolName: "get_submission_detail", user, currentSubmissionId: context?.currentSubmissionId });
  const sources = [...metrics.sources, ...currentSubmission.sources];
  const model = llmConfig.openAiModel;
  const payload = limitOpenAiContext({
    question: message,
    allowedTools: AI_TOOL_WHITELIST,
    metrics: metrics.text,
    currentSubmission: currentSubmission.text,
    sources
  });
  const contextChars = JSON.stringify(payload).length;
  const cacheKey = hashText(JSON.stringify({ model, userId: user.id, context, payload }));
  const cached = openAiCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    logLlmUsage({
      provider: "openai",
      model,
      userId: user.id,
      promptHash: hashText(message),
      promptChars: message.length,
      contextChars,
      estimatedInputTokens: estimateTokensFromChars(message.length + contextChars),
      estimatedOutputTokens: estimateTokensFromChars(cached.answer.answer.length),
      cacheHit: true,
      toolHit: false,
      apiCall: false,
      durationMs: Date.now() - startedAt
    });
    return cached.answer;
  }

  if (!consumeOpenAiRateLimit(user.id)) {
    return recordUsage(
      {
        answer: "AI_RATE_LIMITED\nLLM request was skipped because the per-minute rate limit was reached.",
        sources
      },
      {
        provider: "openai",
        message,
        user,
        startedAt,
        model,
        contextChars,
        toolHit: false,
        errorReason: "rate_limited"
      }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), llmConfig.openAiTimeoutMs);

  try {
    const response = await fetch(`${llmConfig.openAiApiBaseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${llmConfig.openAiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              "You are an AI PDM assistant. You are read-only.",
              "Use only the supplied PDM context and allowed read-only tools as grounding.",
              "Never approve, reject, delete, revise, release, publish, or mutate PDM records.",
              `Allowed read-only tools: ${AI_TOOL_WHITELIST.join(", ")}.`,
              "Answer concisely in Traditional Chinese unless the user asks otherwise."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return recordUsage(
        {
          answer: `LLM 請求失敗：${extractOpenAiError(body) ?? response.status}`,
          sources
        },
        {
          provider: "openai",
          message,
          user,
          startedAt,
          model,
          contextChars,
          toolHit: false,
          apiCall: true,
          errorReason: `http_${response.status}`
        }
      );
    }

    const answer = { answer: extractOpenAiText(body), sources };
    rememberOpenAiCache(cacheKey, answer);
    return recordUsage(answer, {
      provider: "openai",
      message,
      user,
      startedAt,
      model,
      contextChars,
      toolHit: false,
      apiCall: true
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return recordUsage(
      {
        answer: `LLM 請求失敗：${errorMessage}`,
        sources
      },
      {
        provider: "openai",
        message,
        user,
        startedAt,
        model,
        contextChars,
        toolHit: false,
        apiCall: true,
        errorReason: errorMessage
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function recordUsage(
  answer: AiAnswer,
  input: {
    provider: "local" | "openai";
    message: string;
    user?: DbUser;
    startedAt: number;
    model?: string;
    contextChars?: number;
    toolHit: boolean;
    apiCall?: boolean;
    errorReason?: string;
  }
) {
  logLlmUsage({
    provider: input.provider,
    model: input.model,
    userId: input.user?.id,
    promptHash: hashText(input.message),
    promptChars: input.message.length,
    contextChars: input.contextChars,
    estimatedInputTokens: estimateTokensFromChars(input.message.length + (input.contextChars ?? 0)),
    estimatedOutputTokens: estimateTokensFromChars(answer.answer.length),
    cacheHit: false,
    toolHit: input.toolHit,
    apiCall: input.apiCall ?? false,
    durationMs: Date.now() - input.startedAt,
    errorReason: input.errorReason
  });
  return answer;
}

function rememberOpenAiCache(cacheKey: string, answer: AiAnswer) {
  if (llmConfig.openAiCacheTtlMs <= 0) return;
  openAiCache.set(cacheKey, { answer, expiresAt: Date.now() + llmConfig.openAiCacheTtlMs });
}

function consumeOpenAiRateLimit(userId: string) {
  if (llmConfig.openAiRateLimitPerMinute <= 0) return true;
  const now = Date.now();
  const windowStart = now - 60_000;
  const events = (openAiRateLimit.get(userId) ?? []).filter((timestamp) => timestamp >= windowStart);
  if (events.length >= llmConfig.openAiRateLimitPerMinute) {
    openAiRateLimit.set(userId, events);
    return false;
  }
  events.push(now);
  openAiRateLimit.set(userId, events);
  return true;
}

function limitOpenAiContext(payload: OpenAiContextPayload): OpenAiContextPayload {
  if (llmConfig.openAiMaxContextChars <= 0 || JSON.stringify(payload).length <= llmConfig.openAiMaxContextChars) {
    return payload;
  }

  const textBudget = Math.max(1000, Math.floor(llmConfig.openAiMaxContextChars / 3));
  return {
    ...payload,
    metrics: truncateText(payload.metrics, textBudget),
    currentSubmission: truncateText(payload.currentSubmission, textBudget),
    sources: payload.sources.slice(0, 10)
  };
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated]`;
}

function extractOpenAiText(body: unknown) {
  if (typeof body !== "object" || body === null) return "LLM 沒有回傳文字。";
  const outputText = (body as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) return outputText;

  const output = (body as { output?: unknown }).output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      if (typeof item !== "object" || item === null) continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part !== "object" || part === null) continue;
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) chunks.push(text);
      }
    }
    if (chunks.length > 0) return chunks.join("\n");
  }

  return "LLM 沒有回傳文字。";
}

function extractOpenAiError(body: unknown) {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return typeof error === "string" ? error : null;
}
