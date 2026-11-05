import type { ChatMessage, LlmClient, ToolCall } from "./llm/qwen.js";
import type { ToolContext, Toolset } from "./toolset.js";

const MAX_ITERATIONS = 6;
const FALLBACK_REPLY = "No pude completar eso. ¿Me lo repetís o lo intentamos de otra forma?";

// El modelo a veces responde "Listo, guardé…" sin haber llamado ninguna herramienta (confirmado el 4-nov-2026 con Kim:
// 6 de 31 turnos). Si en el turno no se ejecutó NINGUNA herramienta y la respuesta afirma que ya hizo algo, se le pide
// verificar una vez; si insiste sin herramienta, se reemplaza por una respuesta honesta en vez de dejar que mienta.
// Solo formas con tilde en pasado ("guardé"), para no confundirlas con "¿querés que guarde…?".
const CLAIM_RE =
  /(?:^|\n)\s*¡?listo\b|\b(?:guardé|creé|agregué|añadí|eliminé|borré|marqué|reemplacé|actualicé|programé|anoté|moví|quité|cambié|renombré|completé|registré|dejé)(?![a-zñáéíóú])|\bya (?:quedó|está) (?:guardad|cread|agregad|anotad|program|registrad|actualizad)/i;
const VERIFY_NUDGE =
  "[Sistema] En este turno no llamaste ninguna herramienta, pero tu respuesta afirma que ya hiciste algo. Eso solo es " +
  "válido si una herramienta lo hizo y viste su resultado. Si la persona pidió guardar, crear, editar o borrar algo, " +
  "llamá la herramienta correspondiente ahora; si en realidad no hizo falta, respondé de nuevo sin afirmar que hiciste algo.";
export const UNVERIFIED_REPLY = "No pude confirmar que eso quedara hecho, así que no lo guardé. ¿Me lo repetís?";

export interface TurnInput {
  /** Fijado por el servidor a partir del número del remitente; el modelo no lo ve ni lo elige. */
  userId: string;
  systemPrompt: string;
  /** Conversación previa (solo mensajes del usuario y respuestas finales del asistente). */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userText: string;
  /** Adjunto del mensaje actual y envío de archivos de vuelta (herramientas de documentos). */
  ctx?: ToolContext;
  /** Módulos habilitados del usuario (null = todos): solo se le ofrecen las herramientas de esos módulos. */
  modules?: string[] | null;
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
  let toolsRun = 0;
  let nudged = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { message, usage: u } = await llm.chat(messages, toolset.specs(input.modules));
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
    usage.llmCalls += 1;

    const calls: ToolCall[] = message.tool_calls ?? [];
    if (calls.length === 0) {
      const reply = message.content?.trim() || FALLBACK_REPLY;
      if (toolsRun === 0 && CLAIM_RE.test(reply)) {
        if (nudged) return { reply: UNVERIFIED_REPLY, usage };
        nudged = true;
        messages.push({ role: "assistant", content: reply }, { role: "user", content: VERIFY_NUDGE });
        continue;
      }
      return { reply, usage };
    }

    messages.push({ role: "assistant", content: message.content, tool_calls: calls });
    for (const call of calls) {
      toolsRun++;
      const content = await toolset.execute(input.userId, call.function.name, call.function.arguments, input.ctx);
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  return { reply: FALLBACK_REPLY, usage };
}
