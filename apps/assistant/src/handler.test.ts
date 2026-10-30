import { describe, it, expect, vi } from "vitest";
import { createHandler, UNSUPPORTED_TEXT, ERROR_TEXT, TOO_LONG_TEXT, MAX_INPUT_CHARS, limitText, type Store } from "./handler.js";
import type { InboundMessage } from "./kapso/webhook.js";

const OWNER = "+50611111111";
const STAFF = "+50622222222";
const FRIEND = "+50633333333";
const STRANGER = "+50644444444";

const msg = (from: string, text = "hola", id = "m1"): InboundMessage => ({
  messageId: id, from, type: "text", text, timestampMs: 1, rawEvent: {},
});

function setup(over: Partial<Store> = {}, dailyMessageLimit?: number) {
  const seen = new Set<string>();
  const store: Store = {
    lookupUser: async (p) => (p === FRIEND ? { userId: "u-friend", status: "active" } : null),
    saveUserMessage: vi.fn(async (_u, _c, id) => (seen.has(id) ? false : (seen.add(id), true))),
    saveAssistantMessage: vi.fn(async () => {}),
    history: vi.fn(async () => []),
    logUsage: vi.fn(async () => {}),
    touchInbound: vi.fn(async () => {}),
    ...over,
  };
  const send = vi.fn(async () => {});
  const forward = vi.fn(async () => {});
  const runAgent = vi.fn(async () => ({ reply: "ok", usage: { promptTokens: 1, completionTokens: 1, llmCalls: 1 } }));
  const h = createHandler({
    routing: { dropNumbers: new Set([STAFF]), forwardNumbers: new Set([OWNER]) },
    store, runAgent, model: "m", send, forward, dailyMessageLimit,
  });
  return { h, store, send, forward, runAgent };
}

describe("handler", () => {
  it("descarta al personal sin responder ni procesar", async () => {
    const t = setup();
    await t.h.handle(msg(STAFF));
    expect(t.send).not.toHaveBeenCalled();
    expect(t.runAgent).not.toHaveBeenCalled();
    expect(t.forward).not.toHaveBeenCalled();
  });

  it("reenvía al dueño y no lo procesa aquí", async () => {
    const t = setup();
    await t.h.handle(msg(OWNER));
    expect(t.forward).toHaveBeenCalledOnce();
    expect(t.runAgent).not.toHaveBeenCalled();
  });

  it("no responde nada a un número no registrado", async () => {
    const t = setup();
    await t.h.handle(msg(STRANGER));
    expect(t.send).not.toHaveBeenCalled();
    expect(t.runAgent).not.toHaveBeenCalled();
    expect(t.store.saveUserMessage).not.toHaveBeenCalled();
  });

  it("procesa a un usuario registrado con su propio userId, guarda y registra consumo", async () => {
    const t = setup();
    await t.h.handle(msg(FRIEND));
    expect(t.runAgent).toHaveBeenCalledWith("u-friend", [], "hola", expect.anything());
    expect(t.store.saveAssistantMessage).toHaveBeenCalledWith("u-friend", "ok");
    expect(t.store.logUsage).toHaveBeenCalledWith("u-friend", "m", expect.objectContaining({ llmCalls: 1 }));
    expect(t.send).toHaveBeenCalledWith(FRIEND, "ok");
  });

  it("ignora un reintento del mismo mensaje", async () => {
    const t = setup();
    await t.h.handle(msg(FRIEND));
    await t.h.handle(msg(FRIEND));
    expect(t.runAgent).toHaveBeenCalledTimes(1);
  });

  it("pide texto cuando el mensaje no trae", async () => {
    const t = setup();
    await t.h.handle(msg(FRIEND, ""));
    expect(t.send).toHaveBeenCalledWith(FRIEND, UNSUPPORTED_TEXT);
    expect(t.runAgent).not.toHaveBeenCalled();
  });

  it("avisa del error sin filtrar detalles", async () => {
    const t = setup();
    t.runAgent.mockRejectedValueOnce(new Error("secreto interno"));
    await t.h.handle(msg(FRIEND));
    expect(t.send).toHaveBeenCalledWith(FRIEND, ERROR_TEXT);
  });

  it("corta al llegar al tope diario: avisa, no llama al modelo ni guarda el mensaje", async () => {
    const countUserMessagesSince = vi.fn(async () => 50);
    const t = setup({ countUserMessagesSince }, 50);
    await t.h.handle(msg(FRIEND, "otra más", "m9"));
    expect(t.send).toHaveBeenCalledWith(FRIEND, limitText(50));
    expect(t.runAgent).not.toHaveBeenCalled();
    expect(t.store.saveUserMessage).not.toHaveBeenCalled();
    // el conteo es del día de Costa Rica, con offset explícito
    expect(countUserMessagesSince).toHaveBeenCalledWith("u-friend", expect.stringMatching(/T00:00:00-06:00$/));
  });

  it("bajo el tope sigue atendiendo normal", async () => {
    const t = setup({ countUserMessagesSince: vi.fn(async () => 49) }, 50);
    await t.h.handle(msg(FRIEND, "hola", "m10"));
    expect(t.runAgent).toHaveBeenCalledOnce();
  });

  it("rechaza mensajes demasiado largos sin gastar modelo ni cuota", async () => {
    const t = setup({ countUserMessagesSince: vi.fn(async () => 0) }, 50);
    await t.h.handle(msg(FRIEND, "x".repeat(MAX_INPUT_CHARS + 1), "m11"));
    expect(t.send).toHaveBeenCalledWith(FRIEND, TOO_LONG_TEXT);
    expect(t.runAgent).not.toHaveBeenCalled();
    expect(t.store.saveUserMessage).not.toHaveBeenCalled();
  });

  it("el texto del límite dice el número y que se restablece a medianoche", () => {
    expect(limitText(50)).toContain("50");
    expect(limitText(50)).toContain("medianoche");
  });
});
