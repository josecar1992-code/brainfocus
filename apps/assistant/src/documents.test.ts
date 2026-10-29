import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createAttachmentStore, filenameFor } from "./attachments.js";
import { buildToolset, type ToolContext, type ToolTable } from "./toolset.js";
import { createHandler, MEDIA_FAILED_TEXT, type Store } from "./handler.js";
import { parseWebhook } from "./kapso/webhook.js";

const USER = "11111111-1111-4111-8111-111111111111";
const res = (body: BodyInit, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe("attachments", () => {
  it("baja el archivo, lo guarda por usuario y caduca", async () => {
    let t = 1000;
    const f = vi.fn(async () => res(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    const s = createAttachmentStore({ fetchImpl: f as any, now: () => t, ttlMs: 60_000 });
    const r = await s.capture("a", { kind: "image", url: "https://files.example.com/x.jpg" });
    expect(r.ok).toBe(true);
    expect(s.latest("a")?.mimeType).toBe("image/jpeg");
    expect(s.latest("b")).toBeNull(); // nunca se mezcla entre usuarios
    t += 61_000;
    expect(s.latest("a")).toBeNull();
  });

  it("manda la credencial de Kapso solo a hosts de kapso.ai", async () => {
    const f = vi.fn(async () => res("x"));
    const s = createAttachmentStore({ fetchImpl: f as any, kapsoApiKey: "SECRET" });
    await s.capture("a", { kind: "document", url: "https://files.kapso.ai/a.pdf" });
    await s.capture("a", { kind: "document", url: "https://evil.example.com/a.pdf" });
    await s.capture("a", { kind: "document", url: "https://notkapso.ai.evil.com/a.pdf" });
    const sent = f.mock.calls.map((c: any) => c[1].headers["X-API-Key"]);
    expect(sent).toEqual(["SECRET", undefined, undefined]);
  });

  it("rechaza http, archivos grandes y descargas fallidas", async () => {
    const big = createAttachmentStore({ fetchImpl: (async () => res(new Uint8Array(10))) as any, maxBytes: 5 });
    expect(await big.capture("a", { kind: "image", url: "https://x.com/a" })).toEqual({ ok: false, reason: "too-large" });
    const bad = createAttachmentStore({ fetchImpl: (async () => res("no", { status: 500 })) as any });
    expect(await bad.capture("a", { kind: "image", url: "https://x.com/a" })).toEqual({ ok: false, reason: "download-failed" });
    expect(await bad.capture("a", { kind: "image", url: "http://x.com/a" })).toEqual({ ok: false, reason: "download-failed" });
    expect(await bad.capture("a", { kind: "image" })).toEqual({ ok: false, reason: "no-url" });
  });

  it("filenameFor agrega la extensión que falta", () => {
    expect(filenameFor("cédula", "image/jpeg")).toBe("cédula.jpg");
    expect(filenameFor("contrato.pdf", "application/pdf")).toBe("contrato.pdf");
    expect(filenameFor("x", null)).toBe("x");
  });
});

describe("webhook: adjuntos", () => {
  it("extrae el adjunto de una imagen", () => {
    const [m] = parseWebhook({
      event: "whatsapp.message.received",
      message: {
        id: "m1",
        from: "50688888888",
        type: "image",
        image: { id: "i1", mime_type: "image/jpeg", caption: "mi cédula" },
        kapso: { media_url: "https://files.kapso.ai/i1.jpg" },
      },
    });
    expect(m.media).toMatchObject({ kind: "image", url: "https://files.kapso.ai/i1.jpg", contentType: "image/jpeg" });
  });

  it("un texto no trae adjunto", () => {
    const [m] = parseWebhook({
      event: "whatsapp.message.received",
      message: { id: "m2", from: "50688888888", type: "text", text: { body: "hola" } },
    });
    expect(m.media).toBeUndefined();
  });
});

function table(handlers: { enviar?: any } = {}): ToolTable {
  return {
    guardar_documento: { description: "x", inputSchema: {}, argsSchema: z.object({}), handler: async () => ({}) },
    enviar_documento: {
      description: "Envía.",
      inputSchema: {},
      argsSchema: z.object({ nombre: z.string() }),
      handler: handlers.enviar ?? (async () => ({})),
    },
  };
}
const API = { baseUrl: "http://api:3001", serviceKey: "k" };

describe("toolset: documentos", () => {
  it("guardar_documento sin adjunto reciente pide reenviarlo", async () => {
    const ts = buildToolset(table(), API);
    const ctx: ToolContext = { attachment: () => null, sendDocument: async () => {} };
    expect(await ts.execute(USER, "guardar_documento", '{"nombre":"cédula"}', ctx)).toContain("vuelva a mandar");
  });

  it("guardar_documento ya no pide rutas de disco", () => {
    const spec = buildToolset(table(), API).specs().find((s) => s.function.name === "guardar_documento")!;
    expect(JSON.stringify(spec.function.parameters)).not.toContain("media_path");
  });

  it("enviar_documento manda el archivo y el modelo solo recibe la confirmación (no la URL)", async () => {
    const sendDocument = vi.fn(async () => {});
    const ts = buildToolset(table({ enviar: async () => ({ url: "https://signed/x", name: "cédula", mime_type: "image/jpeg" }) }), API);
    const out = await ts.execute(USER, "enviar_documento", '{"nombre":"ced"}', { attachment: () => null, sendDocument });
    expect(sendDocument).toHaveBeenCalledWith({ url: "https://signed/x", name: "cédula", mimeType: "image/jpeg" });
    expect(JSON.parse(out)).toEqual({ enviado: true, nombre: "cédula" });
  });

  it("enviar_documento con varias coincidencias no manda nada", async () => {
    const sendDocument = vi.fn(async () => {});
    const amb = { ambiguo: true, coincidencias: ["a", "b"] };
    const ts = buildToolset(table({ enviar: async () => amb }), API);
    const out = await ts.execute(USER, "enviar_documento", '{"nombre":"a"}', { attachment: () => null, sendDocument });
    expect(JSON.parse(out)).toEqual(amb);
    expect(sendDocument).not.toHaveBeenCalled();
  });
});

describe("handler: adjuntos", () => {
  const msg = (media: any, text = "") => ({ messageId: "m1", from: "+50688888888", type: "image", text, timestampMs: 1, media, rawEvent: {} });

  function setup(capture: any) {
    const store: Store = {
      lookupUser: async () => ({ userId: USER, status: "active" }),
      saveUserMessage: vi.fn(async () => true),
      saveAssistantMessage: vi.fn(async () => {}),
      history: async () => [],
      logUsage: async () => {},
      touchInbound: async () => {},
    };
    const send = vi.fn(async () => {});
    const runAgent = vi.fn(async () => ({ reply: "ok", usage: { promptTokens: 0, completionTokens: 0, llmCalls: 1 } }));
    const h = createHandler({
      routing: { dropNumbers: new Set(), forwardNumbers: new Set() },
      store,
      runAgent,
      model: "m",
      send,
      forward: async () => {},
      attachments: { capture, latest: () => null },
      sendMedia: async () => {},
    });
    return { h, send, runAgent };
  }

  it("imagen sin texto: avisa al modelo del adjunto y no lo pierde", async () => {
    const t = setup(async () => ({ ok: true, attachment: {} }));
    await t.h.handle(msg({ kind: "image", url: "https://x" }) as any);
    expect(t.runAgent.mock.calls[0][2]).toContain("Adjunto recibido: imagen");
  });

  it("si no se puede bajar, avisa y no corre el agente", async () => {
    const t = setup(async () => ({ ok: false, reason: "too-large" }));
    await t.h.handle(msg({ kind: "document", url: "https://x" }) as any);
    expect(t.send).toHaveBeenCalledWith("+50688888888", MEDIA_FAILED_TEXT["too-large"]);
    expect(t.runAgent).not.toHaveBeenCalled();
  });

  it("un video sin texto sigue sin soportarse", async () => {
    const t = setup(async () => ({ ok: true, attachment: {} }));
    await t.h.handle(msg({ kind: "video", url: "https://x" }) as any);
    expect(t.runAgent).not.toHaveBeenCalled();
  });
});
