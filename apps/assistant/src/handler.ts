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
  now?: () => number;
}

const HISTORY_LIMIT = 20;
const INVITE_EVERY_MS = 24 * 3600_000;
export const INVITE_TEXT =
  "Hola, soy Quicks. Este número todavía no está registrado en Focusbrain. Pedí acceso a quien te invitó y, cuando te activen, escribime de nuevo.";
export const UNSUPPORTED_TEXT = "Por ahora solo puedo leer mensajes de texto y notas de voz. ¿Me lo escribís?";
export const ERROR_TEXT = "Tuve un problema procesando tu mensaje. Probá de nuevo en un momento.";

export function createHandler(deps: HandlerDeps) {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? Date.now;
  const lastInvite = new Map<string, number>();
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
      case "unregistered": {
        const last = lastInvite.get(msg.from) ?? 0;
        if (now() - last < INVITE_EVERY_MS) return;
        lastInvite.set(msg.from, now());
        await deps.send(msg.from, INVITE_TEXT);
        return;
      }
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
