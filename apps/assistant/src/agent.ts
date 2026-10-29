import type { ChatMessage, LlmClient, ToolCall } from "./llm/qwen.js";
import type { Toolset } from "./toolset.js";

const MAX_ITERATIONS = 6;
const FALLBACK_REPLY = "No pude completar eso. ¿Me lo repetís o lo intentamos de otra forma?";

export interface TurnInput {
  /** Fijado por el servidor a partir del número del remitente; el modelo no lo ve ni lo elige. */
  userId: string;
  systemPrompt: string;
  /** Conversación previa (solo mensajes del usuario y respuestas finales del asistente). */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userText: string;
}

export interface TurnResult {
  reply: string;
  usage: { promptTokens: number; completionTokens: number; llmCalls: number };
}

export async function runTurn(llm: LlmClient, toolset: Toolset, input: TurnInput): Promise<TurnResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: input.userText },
  ];
  const usage = { promptTokens: 0, completionTokens: 0, llmCalls: 0 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { message, usage: u } = await llm.chat(messages, toolset.specs());
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
    usage.llmCalls += 1;

    const calls: ToolCall[] = message.tool_calls ?? [];
    if (calls.length === 0) {
      return { reply: message.content?.trim() || FALLBACK_REPLY, usage };
    }

    messages.push({ role: "assistant", content: message.content, tool_calls: calls });
    for (const call of calls) {
      const content = await toolset.execute(input.userId, call.function.name, call.function.arguments);
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  return { reply: FALLBACK_REPLY, usage };
}
