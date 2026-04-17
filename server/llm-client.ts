import type { LlmInsight } from "./types.js";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type LocalLlmOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
};

type HealthPayload = {
  configured: boolean;
  reachable: boolean;
  provider: string;
  model: string;
  modelPresent: boolean;
  baseUrl: string;
  availableModels: string[];
  error?: string;
};

const DEFAULT_BASE_URL = process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:18320/v1";
const DEFAULT_API_KEY = process.env.LOCAL_LLM_API_KEY ?? "pandaclient";
const DEFAULT_MODEL = process.env.LOCAL_LLM_MODEL ?? "gpt-5.4";
const DEFAULT_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? 60_000);
const PROVIDER_NAME = "Local OpenAI-Compatible";

function defaultInsight(overrides?: Partial<LlmInsight>): LlmInsight {
  return {
    enabled: true,
    status: "degraded",
    provider: PROVIDER_NAME,
    model: DEFAULT_MODEL,
    generatedAt: null,
    summary: "AI 辅助结论暂时不可用，当前先按规则引擎分数与预警执行。",
    regime: "neutral",
    confidence: null,
    buildSignalStrength: null,
    dumpSignalStrength: null,
    cooldownAssessment: "unknown",
    alertDecision: "unavailable",
    expected7dRange: {
      lowPct: null,
      basePct: null,
      highPct: null,
    },
    evidence: [],
    counterSignals: [],
    actionPlan: [],
    nextCheckMinutes: null,
    shouldPushAlert: false,
    pushReason: "本地 LLM 尚未返回可解析结果。",
    ...overrides,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizePercentValue(value: unknown) {
  const parsed = toNumber(value);
  if (parsed == null) {
    return null;
  }

  if (Math.abs(parsed) <= 1) {
    return Number((parsed * 100).toFixed(2));
  }

  return Number(parsed.toFixed(2));
}

function normalizeListItem(text: string) {
  return text
    .replace(/\\u0027/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

function splitSuspiciousListItem(text: string) {
  const normalized = normalizeListItem(text);
  if (!normalized) {
    return [] as string[];
  }

  const quoted = normalized
    .split(/\s*['"]\s*,\s*['"]\s*/g)
    .map((item) => normalizeListItem(item))
    .filter(Boolean);
  if (quoted.length > 1) {
    return quoted;
  }

  const sentences = normalized
    .split(/(?<=[。！？；])/g)
    .map((item) => normalizeListItem(item))
    .filter(Boolean);
  if (normalized.length >= 80 && sentences.length >= 3) {
    return sentences;
  }

  return [normalized];
}

function toStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .flatMap((entry) => splitSuspiciousListItem(String(entry ?? "")))
      .filter(Boolean),
  )].slice(0, maxItems);
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("aborted")
  );
}

function extractMessageText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return "";
        }

        const typed = entry as { type?: unknown; text?: unknown };
        if (typed.type === "text" && typeof typed.text === "string") {
          return typed.text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function parseJsonObject(text: string) {
  const normalized = stripCodeFence(text);
  if (!normalized) {
    throw new Error("LLM 返回了空内容。");
  }

  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }

    throw new Error("LLM 返回的文本内未找到可解析的 JSON。");
  }
}

function pickField(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (key in payload) {
      return payload[key];
    }
  }

  return undefined;
}

function buildMessages(featurePayload: Record<string, unknown>, historyContext: Record<string, unknown>) {
  const systemPrompt = `
You are a conservative CS2 skin monitoring analyst.

Return JSON only in Simplified Chinese with these keys:
- summary
- regime: accumulation | distribution | breakout_watch | panic | neutral
- confidence: 0-100
- build_signal_strength: 0-100
- dump_signal_strength: 0-100
- cooldown_assessment: favorable | mixed | unfavorable
- alert_decision: push_alert | watch_closely | observe_only
- expected_7d_range: { low_pct, base_pct, high_pct }
- evidence: string[]
- counter_signals: string[]
- action_plan: string[]
- next_check_minutes
- should_push_alert
- push_reason

Rules:
- do not invent insider information or hidden groups
- holder concentration only supports probabilistic inference
- if signals conflict, lower confidence
- prefer conservative alerts
- keep summary concise
- keep evidence and action_plan concise
  `.trim();

  const userPayload = {
    task: "Review whether this item deserves a push alert, close watch, or simple observation.",
    cooldownDays: 7,
    currentItem: featurePayload,
    historyContext: {
      snapshotCount: historyContext.snapshotCount ?? 0,
      recentSnapshots: Array.isArray(historyContext.recentSnapshots)
        ? historyContext.recentSnapshots
        : [],
    },
  };

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: `Analyze the payload and return JSON only.\n${JSON.stringify(userPayload)}`,
    },
  ] satisfies ChatMessage[];
}

function sanitizeInsight(parsed: unknown, model: string): LlmInsight {
  if (!parsed || typeof parsed !== "object") {
    return defaultInsight({
      model,
      error: "LLM 返回了非对象结构。",
    });
  }

  const payload = parsed as Record<string, unknown>;
  const rangeValue = pickField(payload, "expected_7d_range", "expected7dRange");
  const range =
    rangeValue && typeof rangeValue === "object"
      ? (rangeValue as Record<string, unknown>)
      : {};

  const regimeValue = pickField(payload, "regime");
  const regime =
    regimeValue === "accumulation" ||
    regimeValue === "distribution" ||
    regimeValue === "breakout_watch" ||
    regimeValue === "panic" ||
    regimeValue === "neutral"
      ? regimeValue
      : "neutral";

  const cooldownValue = pickField(payload, "cooldown_assessment", "cooldownAssessment");
  const cooldownAssessment =
    cooldownValue === "favorable" ||
    cooldownValue === "mixed" ||
    cooldownValue === "unfavorable"
      ? cooldownValue
      : "unknown";

  const alertValue = pickField(payload, "alert_decision", "alertDecision");
  const alertDecision =
    alertValue === "push_alert" ||
    alertValue === "watch_closely" ||
    alertValue === "observe_only"
      ? alertValue
      : "unavailable";

  const confidence = normalizePercentValue(pickField(payload, "confidence"));
  const buildSignalStrength = normalizePercentValue(
    pickField(payload, "build_signal_strength", "buildSignalStrength"),
  );
  const dumpSignalStrength = normalizePercentValue(
    pickField(payload, "dump_signal_strength", "dumpSignalStrength"),
  );
  const nextCheckMinutes = clamp(
    toNumber(pickField(payload, "next_check_minutes", "nextCheckMinutes")) ?? 30,
    5,
    1440,
  );
  const shouldPushAlertValue = pickField(payload, "should_push_alert", "shouldPushAlert");
  const shouldPushAlert =
    typeof shouldPushAlertValue === "boolean"
      ? shouldPushAlertValue
      : alertDecision === "push_alert";

  return {
    enabled: true,
    status: "ok",
    provider: PROVIDER_NAME,
    model,
    generatedAt: new Date().toISOString(),
    summary: String(pickField(payload, "summary") ?? "AI 暂未产出结论。"),
    regime,
    confidence,
    buildSignalStrength,
    dumpSignalStrength,
    cooldownAssessment,
    alertDecision,
    expected7dRange: {
      lowPct: toNumber(pickField(range, "low_pct", "lowPct")),
      basePct: toNumber(pickField(range, "base_pct", "basePct")),
      highPct: toNumber(pickField(range, "high_pct", "highPct")),
    },
    evidence: toStringArray(pickField(payload, "evidence"), 6),
    counterSignals: toStringArray(pickField(payload, "counter_signals", "counterSignals"), 4),
    actionPlan: toStringArray(pickField(payload, "action_plan", "actionPlan"), 4),
    nextCheckMinutes,
    shouldPushAlert,
    pushReason: String(
      pickField(payload, "push_reason", "pushReason") ?? "AI 未给出推送原因。",
    ),
  };
}

export class LocalMonitorLlmClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly provider = PROVIDER_NAME;

  constructor(options: LocalLlmOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = (options.apiKey ?? DEFAULT_API_KEY).trim();
    this.model = (options.model ?? DEFAULT_MODEL).trim();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isEnabled() {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "cs2-monitor-platform/llm",
    };
  }

  private async request(path: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...this.headers(),
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error(`LLM 返回了非 JSON 响应：${text.slice(0, 220)}`);
        }
      }

      if (!response.ok) {
        throw new Error(`LLM HTTP ${response.status}: ${text.slice(0, 260)}`);
      }

      return payload;
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new Error(`LLM request timed out after ${this.timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<HealthPayload> {
    if (!this.isEnabled()) {
      return {
        configured: false,
        reachable: false,
        provider: this.provider,
        model: this.model,
        modelPresent: false,
        baseUrl: this.baseUrl,
        availableModels: [],
      };
    }

    try {
      const payload = (await this.request("/models", {
        method: "GET",
      })) as {
        data?: Array<{ id?: unknown }>;
      };
      const models = Array.isArray(payload.data)
        ? payload.data.map((entry) => String(entry.id ?? "")).filter(Boolean)
        : [];

      return {
        configured: true,
        reachable: true,
        provider: this.provider,
        model: this.model,
        modelPresent: models.includes(this.model),
        baseUrl: this.baseUrl,
        availableModels: models.slice(0, 24),
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        provider: this.provider,
        model: this.model,
        modelPresent: false,
        baseUrl: this.baseUrl,
        availableModels: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async analyzeItem(
    featurePayload: Record<string, unknown>,
    historyContext: Record<string, unknown>,
  ): Promise<LlmInsight> {
    if (!this.isEnabled()) {
      return defaultInsight({
        enabled: false,
        status: "disabled",
        provider: this.provider,
        model: this.model,
        summary: "本地 LLM 未启用，当前仅使用规则引擎。",
        pushReason: "本地 LLM 未启用。",
      });
    }

    const messages = buildMessages(featurePayload, historyContext);
    const baseBody = {
      model: this.model,
      messages,
      temperature: 0.2,
    };

    try {
      const completion = (await this.request("/chat/completions", {
        method: "POST",
        body: JSON.stringify(baseBody),
      })) as {
        model?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      const messageText = extractMessageText(completion.choices?.[0]?.message?.content ?? "");
      return sanitizeInsight(parseJsonObject(messageText), String(completion.model ?? this.model));
    } catch (error) {
      return defaultInsight({
        provider: this.provider,
        model: this.model,
        error: error instanceof Error ? error.message : String(error),
        summary: "AI 辅助分析暂时不可用，当前继续使用规则引擎与盘口预警。",
        pushReason:
          error instanceof Error
            ? error.message
            : "本地 LLM 本轮未返回可解析结果。",
      });
    }
  }
}
