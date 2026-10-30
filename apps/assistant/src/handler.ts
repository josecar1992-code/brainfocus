import { runTurn, type TurnResult } from "./agent.js";
import type { AttachmentStore, CaptureResult } from "./attachments.js";
import type { ToolContext } from "./toolset.js";
import type { InboundMessage } from "./kapso/webhook.js";
import { CR_OFFSET, hoyEnCR } from "@brainfocus/shared-time";
import { resolveRoute, type RouteDeps } from "./router.js";

export interface Store {
  lookupUser: RouteDeps["lookupUser"];
  /** Guarda el mensaje del usuario; false si ese wa_message_id ya se procesó (reintento del webhook). */
  saveUserMessage(userId: string, content: string, waMessageId: string): Promise<boolean>;
  saveAssistantMessage(userId: string, content: string): Promise<void>;
  /** Mensajes del usuario guardados desde sinceIso (para el tope diario). */
  countUserMessagesSince(userId: string, sinceIso: string): Promise<number>;
  /** Módulos opcionales habilitados del usuario (null = todos). */
  enabledModules(userId: string): Promise<string[] | null>;
  /** Límite diario propio de la persona (null = el general). */
  dailyMessageLimit?(userId: string): Promise<number | null>;
  /** Nombre con el que Quicks llama a la persona (null si todavía no lo dio). */
  displayName(userId: string): Promise<string | null>;
  setDisplayName(userId: string, name: string): Promise<void>;
  history(userId: string, limit: number): Promise<Array<{ role: "user" | "assistant"; content: string }>>;
  logUsage(userId: string, model: string, usage: TurnResult["usage"]): Promise<void>;
  touchInbound(userId: string, atMs: number): Promise<void>;
}

export interface HandlerDeps {
  routing: Pick<RouteDeps, "dropNumbers" | "forwardNumbers">;
  store: Store;
  runAgent: (
    userId: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    text: string,
    ctx: ToolContext,
  ) => Promise<TurnResult>;
  /** Para documentos: bajar y guardar el adjunto recibido, y mandar un archivo de vuelta. Sin esto, los adjuntos no se soportan. */
  attachments?: AttachmentStore;
  sendMedia?: (to: string, doc: { url: string; name: string; mimeType: string | null }) => Promise<void>;
  /** Tope de mensajes por persona y por día (día de Costa Rica). Sin valor = sin tope. */
  dailyMessageLimit?: number;
  model: string;
  send: (to: string, text: string) => Promise<unknown>;
  forward: (msg: InboundMessage) => Promise<void>;
  log?: (msg: string, extra?: unknown) => void;
}

// El historial se reenvía completo en cada llamada al modelo: menos mensajes = menos tokens por llamada.
const HISTORY_LIMIT = 10;
export const MAX_INPUT_CHARS = 1500;
export const TOO_LONG_TEXT = "Ese mensaje es muy largo para mí. ¿Me lo resumes o me lo mandas en partes más cortas?";
export const limitText = (limit: number) =>
  `Has excedido el límite de peticiones diarias (${limit}). Tu corte se restablece a la medianoche (hora de Costa Rica).`;
export const UNSUPPORTED_TEXT = "Por ahora solo puedo leer mensajes de texto y notas de voz. ¿Me lo escribís?";
export const MEDIA_FAILED_TEXT: Record<Extract<CaptureResult, { ok: false }>["reason"], string> = {
  "no-url": "No pude recibir ese archivo. ¿Me lo mandás de nuevo?",
  "too-large": "Ese archivo es demasiado grande (el máximo es 20 MB). ¿Podés mandarlo más liviano?",
  "download-failed": "No pude descargar ese archivo. ¿Me lo mandás de nuevo?",
};
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
            let text = msg.text.trim();
            const media = msg.media;
            if (media && (media.kind === "image" || media.kind === "document") && deps.attachments && deps.sendMedia) {
              const cap = await deps.attachments.capture(userId, media);
              if (!cap.ok) {
                await deps.send(msg.from, MEDIA_FAILED_TEXT[cap.reason]);
                return;
              }
              const what = media.kind === "image" ? "imagen" : "documento";
              const note = `[Adjunto recibido: ${what}${media.filename ? ` "${media.filename}"` : ""}. Si lo piden, guardalo con guardar_documento; no lo leas ni lo describas.]`;
              text = text ? `${text}
${note}` : note;
            }
            if (!text) {
              await deps.send(msg.from, UNSUPPORTED_TEXT);
              return;
            }
            if (text.length > MAX_INPUT_CHARS) {
              await deps.send(msg.from, TOO_LONG_TEXT);
              return;
            }
            const limit = (await deps.store.dailyMessageLimit?.(userId)) ?? deps.dailyMessageLimit;
            if (limit) {
              const dayStart = `${hoyEnCR()}T00:00:00${CR_OFFSET}`;
              if ((await deps.store.countUserMessagesSince(userId, dayStart)) >= limit) {
                log("tope diario alcanzado", { userId });
                await deps.send(msg.from, limitText(limit));
                return;
              }
            }
            const history = await deps.store.history(userId, HISTORY_LIMIT);
            if (!(await deps.store.saveUserMessage(userId, text, msg.messageId))) return; // duplicado
            const ctx: ToolContext = {
              attachment: () => deps.attachments?.latest(userId) ?? null,
              setName: (name) => deps.store.setDisplayName(userId, name),
              sendDocument: async (doc) => {
                if (!deps.sendMedia) throw new Error("No se pueden enviar archivos desde aquí");
                await deps.sendMedia(msg.from, doc);
              },
            };
            const result = await deps.runAgent(userId, history, text, ctx);
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
