import { runTurn, type TurnResult } from "./agent.js";
import type { InboundMessage } from "./kapso/webhook.js";
import { resolveRoute, type RouteDeps } from "./router.js";

export interface Store {
  lookupUser: RouteDeps["lookupUser"];
  /** Guarda el mensaje del usuario; false si ese wa_message_id ya se procesó (reintento del webhook). */
  saveUserMessage(userId: string, content: string, waMessageId: string): Promise<boolean>;
  saveAssistantMessage(userId: string, content: string): Promise<void>;
  history(userId: string, limit: number): Promise<Array<{ role: "user" | "assistant"; content: string }>>;
  logUsage(userId: string, model: string, usage: TurnResult["usage"]): Promise<void>;
  touchInbound(userId: string, atMs: number): Promise<void>;
}

export interface HandlerDeps {
  routing: Pick<RouteDeps, "dropNumbers" | "forwardNumbers">;
  store: Store;
  runAgent: (userId: string, history: Array<{ role: "user" | "assistant"; content: string }>, text: string) => Promise<TurnResult>;
  model: string;
  send: (to: string, text: string) => Promise<unknown>;
  forward: (msg: InboundMessage) => Promise<void>;
  log?: (msg: string, extra?: unknown) => void;
}

const HISTORY_LIMIT = 20;
export const UNSUPPORTED_TEXT = "Por ahora solo puedo leer mensajes de texto y notas de voz. ¿Me lo escribís?";
export const ERROR_TEXT = "Tuve un problema procesando tu mensaje. Probá de nuevo en un momento.";

export function createHandler(deps: HandlerDeps) {
  const log = deps.log ?? (() => {});
  // Un mensaje a la vez por usuario: si manda varios seguidos se procesan en orden y no se pisan.
  const queues = new Map<string, Promise<unknown>>();

  function serialize(userId: string, job: () => Promise<void>): Promise<void> {
    const prev = queues.get(userId) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(job);
    queues.set(userId, next);
    void next.finally(() => { if (queues.get(userId) === next) queues.delete(userId); }).catch(() => {});
    return next;
  }

  async function handle(msg: InboundMessage): Promise<void> {
    const route = await resolveRoute(msg.from, { ...deps.routing, lookupUser: deps.store.lookupUser });
    switch (route.kind) {
      case "drop":
        return;
      case "forward":
        return deps.forward(msg);
      case "unregistered":
        // El alta de usuarios es interna (la hace el administrador): a un número no registrado no se le
        // responde nada, ni siquiera una invitación, para no incentivar registros ni revelar que el servicio existe.
        log("mensaje de número no registrado descartado");
        return;
      case "user": {
        const userId = route.userId;
        return serialize(userId, async () => {
          try {
            await deps.store.touchInbound(userId, msg.timestampMs);
            if (!msg.text.trim()) {
              await deps.send(msg.from, UNSUPPORTED_TEXT);
              return;
            }
            const history = await deps.store.history(userId, HISTORY_LIMIT);
            if (!(await deps.store.saveUserMessage(userId, msg.text, msg.messageId))) return; // duplicado
            const result = await deps.runAgent(userId, history, msg.text);
            await deps.store.saveAssistantMessage(userId, result.reply);
            await deps.store.logUsage(userId, deps.model, result.usage);
            await deps.send(msg.from, result.reply);
          } catch (err) {
            log("error procesando mensaje", err instanceof Error ? err.message : err);
            await deps.send(msg.from, ERROR_TEXT).catch(() => {});
          }
        });
      }
    }
  }
  return { handle };
}

export { runTurn };
