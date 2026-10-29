// Envío por el mismo proxy de Kapso que ya usa whatsapp-template-http (Graph API
// de Meta vía Kapso): Kapso registra el mensaje y el estado real de entrega
// (sent/delivered/failed). Un envío directo a graph.facebook.com no tendría ese
// seguimiento.
export interface KapsoConfig {
  apiKey: string;
  phoneNumberId: string;
  baseUrl?: string; // default https://api.kapso.ai/meta/whatsapp/v24.0
}

const DEFAULT_BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

async function post(cfg: KapsoConfig, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`${cfg.baseUrl ?? DEFAULT_BASE}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
  if (!res.ok) throw new Error(`Kapso ${res.status}: ${JSON.stringify(data)}`);
  return data?.messages?.[0]?.id ?? null;
}

const digits = (e164: string) => e164.replace(/[^\d]/g, "");

/** Texto libre: solo válido dentro de la ventana de 24 h desde el último mensaje del usuario. */
export function sendText(cfg: KapsoConfig, to: string, text: string): Promise<string | null> {
  return post(cfg, { to: digits(to), type: "text", text: { body: text } });
}

/** Plantilla aprobada (para cuando la ventana de 24 h está cerrada). Los parámetros van en orden del cuerpo. */
export function sendTemplate(cfg: KapsoConfig, to: string, name: string, params: string[], language = "es"): Promise<string | null> {
  return post(cfg, {
    to: digits(to),
    type: "template",
    template: {
      name,
      language: { code: language },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  });
}

/** Imagen o documento por enlace (la URL firmada la baja Meta). Solo dentro de la ventana de 24 h. */
export function sendMedia(
  cfg: KapsoConfig,
  to: string,
  media: { kind: "image" | "document"; url: string; filename?: string; caption?: string },
): Promise<string | null> {
  const payload = media.kind === "image"
    ? { link: media.url, ...(media.caption ? { caption: media.caption } : {}) }
    : { link: media.url, ...(media.filename ? { filename: media.filename } : {}), ...(media.caption ? { caption: media.caption } : {}) };
  return post(cfg, { to: digits(to), type: media.kind, [media.kind]: payload });
}
