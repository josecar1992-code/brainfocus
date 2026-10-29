import { MESSAGE_RECEIVED_EVENT, signBody, type InboundMessage } from "./kapso/webhook.js";

// Reenvía a OpenClaw SOLO los eventos de los números "forward" (el dueño), uno por uno y firmados
// de nuevo con el mismo secreto: OpenClaw valida la firma sobre el cuerpo exacto que recibe.
export function createForwarder(url: string, secret: string) {
  return async (msg: InboundMessage): Promise<void> => {
    const body = JSON.stringify(msg.rawEvent);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-event": MESSAGE_RECEIVED_EVENT,
        "x-webhook-batch": "false",
        "x-webhook-signature": signBody(body, secret),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`OpenClaw respondió ${res.status} al reenviar`);
  };
}
