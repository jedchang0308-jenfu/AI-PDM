import {
  AI_TOOL_WHITELIST,
  executeAiTool,
  isAllowedAiToolName,
  parseExplicitToolRequest,
  type AiSource
} from "@/lib/ai-tools";
import type { DbUser } from "@/lib/db";

export type AiAnswer = {
  answer: string;
  sources: AiSource[];
};

export async function answerPdmQuestion(
  message: string,
  context?: { currentSubmissionId?: string },
  user?: DbUser
): Promise<AiAnswer> {
  const text = message.trim();

  if (isDestructivePdmActionRequest(text)) {
    return {
      answer: [
        "AI_ACTION_BLOCKED",
        "AI 助手是唯讀工具，不能核准、駁回、刪除、改版、發布或變更任何 PDM 紀錄。",
        "請使用 PDM 正式流程與角色權限按鈕執行受控變更。"
      ].join("\n"),
      sources: []
    };
  }

  const requestedTool = parseExplicitToolRequest(text);
  if (requestedTool && !isAllowedAiToolName(requestedTool)) {
    return {
      answer: [
        "AI_TOOL_BLOCKED",
        `工具 '${requestedTool}' 不在 AI 工具白名單中。`,
        `允許的工具：${AI_TOOL_WHITELIST.join(", ")}`
      ].join("\n"),
      sources: []
    };
  }

  const openAiApiKey = getOpenAiApiKey();
  const llmProvider = process.env.LLM_PROVIDER ?? "local";
  if (openAiApiKey && llmProvider.toLowerCase() === "openai") {
    return answerWithOpenAi(text, context, user);
  }

  if (!user) {
    return { answer: "需要登入後才能使用 AI 助手。", sources: [] };
  }

  if (requestedTool && isAllowedAiToolName(requestedTool)) {
    const result = executeAiTool({ toolName: requestedTool, user, currentSubmissionId: context?.currentSubmissionId, query: text });
    return { answer: result.text, sources: result.sources };
  }

  if (context?.currentSubmissionId) {
    const result = executeAiTool({ toolName: "get_submission_detail", user, currentSubmissionId: context.currentSubmissionId });
    return { answer: result.text, sources: result.sources };
  }

  if (/\b(pending|dashboard|summary)\b/i.test(text) || /待審|工作台|統計|摘要/.test(text)) {
    const result = executeAiTool({ toolName: "list_pending_reviews", user });
    if (/\b(dashboard|summary)\b/i.test(text) || /工作台|統計|摘要/.test(text)) {
      const metricsResult = executeAiTool({ toolName: "get_dashboard_metrics", user });
      return { answer: metricsResult.text, sources: metricsResult.sources };
    }
    return { answer: result.text, sources: result.sources };
  }

  if (/\b(policy|rule|drawing|part|revision)\b/i.test(text) || /管理辦法|規則|圖號|料號|版次/.test(text)) {
    const result = executeAiTool({ toolName: "explain_policy", user, query: text });
    return { answer: result.text, sources: result.sources };
  }

  return {
    answer: [
      "我可以使用下列唯讀工具回答 PDM 問題：",
      AI_TOOL_WHITELIST.join(", "),
      "你可以詢問待審清單、工作台統計、目前送審內容，或 PDM 管理規則。"
    ].join("\n"),
    sources: []
  };
}

function isDestructivePdmActionRequest(text: string) {
  const normalized = text.toLowerCase();
  const actionPattern = /\b(approve|approval|reject|delete|remove|revise|revision|release|publish|change status)\b/i;
  const intentPattern = /\b(please|do it|make it|run|submit)\b/i;
  const zhActionPattern = /核准|駁回|刪除|移除|改版|變更版次|發布|改狀態/;
  const zhIntentPattern = /請|幫我|執行|送出|直接/;
  return (actionPattern.test(normalized) && intentPattern.test(normalized)) || (zhActionPattern.test(text) && zhIntentPattern.test(text));
}

async function answerWithOpenAi(
  message: string,
  context?: { currentSubmissionId?: string },
  user?: DbUser
): Promise<AiAnswer> {
  const metrics = user
    ? executeAiTool({ toolName: "get_dashboard_metrics", user })
    : { text: "需要登入後才能使用 AI 助手。", sources: [] as AiSource[] };
  const currentSubmission = user
    ? executeAiTool({ toolName: "get_submission_detail", user, currentSubmissionId: context?.currentSubmissionId })
    : { text: "需要登入後才能使用 AI 助手。", sources: [] as AiSource[] };
  const sources = [...metrics.sources, ...currentSubmission.sources];
  const openAiApiKey = getOpenAiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getOpenAiTimeoutMs());

  try {
    const response = await fetch(`${getOpenAiApiBaseUrl().replace(/\/$/, "")}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${openAiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        input: [
          {
            role: "system",
            content: [
              "你是 AI PDM 助手，預設使用繁體中文回答。",
              "你是唯讀工具，不可核准、駁回、刪除、改版、發布或變更任何 PDM 紀錄。",
              `Allowed read-only tools: ${AI_TOOL_WHITELIST.join(", ")}.`,
              "只能使用提供的 metadata，不可聲稱已經執行寫入動作。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              question: message,
              allowedTools: AI_TOOL_WHITELIST,
              metrics: metrics.text,
              currentSubmission: currentSubmission.text,
              sources
            })
          }
        ]
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        answer: `LLM 請求失敗：${body?.error?.message ?? response.status}`,
        sources
      };
    }

    return {
      answer: extractOpenAiText(body),
      sources
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      answer: `LLM 請求失敗：${message}`,
      sources
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY ?? "";
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function getOpenAiApiBaseUrl() {
  return process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1";
}

function getOpenAiTimeoutMs() {
  const parsed = Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function extractOpenAiText(body: unknown) {
  if (typeof body !== "object" || body === null) return "LLM 沒有回傳文字。";
  const outputText = (body as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) return outputText;

  const output = (body as { output?: unknown }).output;
  if (Array.isArray(output)) {
    const chunks = [];
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
