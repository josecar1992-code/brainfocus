import { describe, it, expect, vi } from "vitest";
import { createHandler, UNSUPPORTED_TEXT, ERROR_TEXT, type Store } from "./handler.js";
import type { InboundMessage } from "./kapso/webhook.js";

const OWNER = "+50611111111";
const STAFF = "+50622222222";
const FRIEND = "+50633333333";
const STRANGER = "+50644444444";

const msg = (from: string, text = "hola", id = "m1"): InboundMessage => ({
  messageId: id, from, type: "text", text, timestampMs: 1, rawEvent: {},
});

function setup(over: Partial<Store> = {}) {
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
    store, runAgent, model: "m", send, forward,
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
});
