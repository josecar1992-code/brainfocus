import { createHmac, timingSafeEqual } from "node:crypto";

// Formato del webhook de Kapso, tomado del plugin kapso-whatsapp de OpenClaw
// (dist/webhook.js) que ya lo consume en producción: firma HMAC-SHA256 del
// cuerpo crudo en `x-webhook-signature` (hex, a veces con prefijo `sha256=`),
// evento `whatsapp.message.received`, y el cuerpo es un evento suelto o un
// lote `{ data: [...] }`.
export const MESSAGE_RECEIVED_EVENT = "whatsapp.message.received";

export function signBody(rawBody: Buffer | string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  const signature = header?.replace(/^sha256=/i, "").trim();
  if (!signature || !secret) return false;
  const expected = Buffer.from(signBody(rawBody, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export interface InboundMessage {
  messageId: string;
  /** E.164 con "+", ej. +50687686207 */
  from: string;
  type: string;
  /** Texto del usuario (o transcripción de una nota de voz); vacío si el tipo no trae texto. */
  text: string;
  timestampMs: number;
  contactName?: string;
  /** El evento original tal cual llegó, por si hay que reenviarlo a OpenClaw. */
  rawEvent: Record<string, unknown>;
}

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : undefined);
const str = (r: Rec | undefined, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = r?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
};

export function normalizePhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/^(kapso-whatsapp|kapso|whatsapp|wa):/i, "").replace(/[^\d]/g, "");
  return digits.length >= 8 ? `+${digits}` : undefined;
}

function extractText(message: Rec, type: string): string {
  const direct = str(asRec(message.text), "body");
  if (direct) return direct;
  const button = str(asRec(message.button), "text", "payload");
  if (button) return button;
  const interactive = asRec(message.interactive);
  const reply =
    asRec(interactive?.buttonReply) ?? asRec(interactive?.button_reply) ?? asRec(interactive?.listReply) ?? asRec(interactive?.list_reply);
  const replyText = str(reply, "title", "id", "description");
  if (replyText) return replyText;
  if (type === "audio") {
    const kapso = asRec(message.kapso);
    const transcript = asRec(kapso?.transcript) ?? asRec(kapso?.transcription);
    const t = str(transcript, "text", "body", "content") ?? str(kapso, "transcript", "transcription");
    if (t) return t;
  }
  return "";
}

/** Eventos de mensaje recibido de un webhook de Kapso (suelto o en lote). */
export function parseWebhook(payload: unknown, eventHeader?: string, batchHeader?: string): InboundMessage[] {
  if (eventHeader && eventHeader !== MESSAGE_RECEIVED_EVENT) return [];
  const root = asRec(payload);
  if (!root) return [];
  let events: Rec[];
  if (Array.isArray(root.data)) events = root.data.map(asRec).filter((e): e is Rec => Boolean(e));
  else if (batchHeader === "true") return [];
  else events = [root];

  const out: InboundMessage[] = [];
  for (const event of events) {
    const name = str(event, "event", "type") ?? eventHeader ?? MESSAGE_RECEIVED_EVENT;
    if (name !== MESSAGE_RECEIVED_EVENT) continue;
    const message = asRec(event.message);
    if (!message) continue;
    const conversation = asRec(event.conversation);
    const from = normalizePhone(str(message, "from")) ?? normalizePhone(str(conversation, "phone_number", "phoneNumber"));
    if (!from) continue;
    const type = str(message, "type") ?? "unknown";
    const ts = Number(str(message, "timestamp"));
    out.push({
      messageId: str(message, "id") ?? `${from}:${Date.now()}`,
      from,
      type,
      text: extractText(message, type),
      timestampMs: Number.isFinite(ts) && ts > 0 ? (ts < 1e12 ? ts * 1000 : ts) : Date.now(),
      contactName: str(asRec(message.kapso), "contactName", "contact_name") ?? str(asRec(conversation?.kapso), "contactName", "contact_name"),
      rawEvent: event,
    });
  }
  return out;
}
