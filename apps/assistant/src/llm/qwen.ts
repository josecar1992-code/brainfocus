// Cliente de Qwen por el endpoint OpenAI-compatible de DashScope (el mismo proveedor y modelo que usa
// Quicks en OpenClaw hoy). Sin SDK: un solo POST a /chat/completions con herramientas.
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}

export interface LlmResult {
  message: { content: string | null; tool_calls?: ToolCall[] };
  usage: { promptTokens: number; completionTokens: number };
}

export interface LlmClient {
  model: string;
  chat(messages: ChatMessage[], tools: ToolSpec[]): Promise<LlmResult>;
}

export interface QwenConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const DEFAULT_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3.7-plus";

export function createQwenClient(cfg: QwenConfig): LlmClient {
  const model = cfg.model ?? DEFAULT_MODEL;
  return {
    model,
    async chat(messages, tools) {
      const res = await fetch(`${cfg.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          ...(tools.length ? { tools, tool_choice: "auto" } : {}),
          temperature: 0.3,
          // Qwen3 en modo "thinking" exige streaming; para respuestas de WhatsApp (cortas y con herramientas)
          // se apaga: más rápido y más barato.
          enable_thinking: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(`Qwen ${res.status}: ${JSON.stringify(data?.error ?? data)}`);
      const message = data?.choices?.[0]?.message;
      if (!message) throw new Error("Qwen respondió sin mensaje");
      return {
        message: { content: message.content ?? null, tool_calls: message.tool_calls?.length ? message.tool_calls : undefined },
        usage: { promptTokens: data?.usage?.prompt_tokens ?? 0, completionTokens: data?.usage?.completion_tokens ?? 0 },
      };
    },
  };
}
