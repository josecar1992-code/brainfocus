import { describe, it, expect, vi } from "vitest";
import { createDispatcher, windowOpen, templateParams, formatCR, TEMPLATE_NAME, type DispatchStore, type DueUser } from "./dispatcher.js";

const H = 3600_000;
const NOW = Date.parse("2026-10-29T16:00:00Z"); // 10:00 en Costa Rica
const rem = (id: string, title: string, at = "2026-10-29T15:50:00Z") => ({ id, title, remindAt: at });

function setup(users: DueUser[], over: Partial<DispatchStore> = {}) {
  const store: DispatchStore = {
    dueUsers: async () => users,
    claimReminder: vi.fn(async () => true),
    releaseReminder: vi.fn(async () => {}),
    markTemplateSent: vi.fn(async () => {}),
    keepaliveCandidates: async () => [],
    markKeepaliveSent: vi.fn(async () => {}),
    ...over,
  };
  const sendText = vi.fn(async () => {});
  const sendTemplate = vi.fn(async () => {});
  return { d: createDispatcher({ store, sendText, sendTemplate, now: () => NOW }), store, sendText, sendTemplate };
}
const user = (o: Partial<DueUser> = {}): DueUser => ({
  userId: "u", phone: "+506999", lastInboundAt: NOW - 2 * H, templateSentAt: null, reminders: [rem("r1", "Pagar luz")], ...o,
});

describe("ventana de 24 h", () => {
  it("windowOpen", () => {
    expect(windowOpen(NOW - 23 * H, NOW)).toBe(true);
    expect(windowOpen(NOW - 25 * H, NOW)).toBe(false);
    expect(windowOpen(null, NOW)).toBe(false);
  });

  it("ventana abierta: entrega texto libre y no usa plantilla", async () => {
    const t = setup([user()]);
    await t.d.tick();
    expect(t.sendText).toHaveBeenCalledWith("+506999", expect.stringContaining("Pagar luz"));
    expect(t.sendTemplate).not.toHaveBeenCalled();
  });

  it("ventana cerrada: una plantilla y el recordatorio queda pendiente", async () => {
    const t = setup([user({ lastInboundAt: NOW - 30 * H, reminders: [rem("r1", "Pagar luz"), rem("r2", "Llamar")] })]);
    await t.d.tick();
    expect(t.sendTemplate).toHaveBeenCalledWith("+506999", TEMPLATE_NAME, ["Pagar luz y 1 más", expect.any(String)]);
    expect(t.store.markTemplateSent).toHaveBeenCalledOnce();
    expect(t.store.claimReminder).not.toHaveBeenCalled();
    expect(t.sendText).not.toHaveBeenCalled();
  });

  it("no repite la plantilla en la misma ventana cerrada, pero sí tras una nueva", async () => {
    const closed = NOW - 30 * H;
    const again = setup([user({ lastInboundAt: closed, templateSentAt: closed + 25 * H })]);
    await again.d.tick();
    expect(again.sendTemplate).not.toHaveBeenCalled();
    const fresh = setup([user({ lastInboundAt: closed, templateSentAt: closed - 5 * H })]);
    await fresh.d.tick();
    expect(fresh.sendTemplate).toHaveBeenCalledOnce();
  });

  it("si el envío falla, libera el recordatorio y no frena a otros usuarios", async () => {
    const t = setup([user({ userId: "a" }), user({ userId: "b", phone: "+506888" })]);
    t.sendText.mockRejectedValueOnce(new Error("kapso"));
    await t.d.tick();
    expect(t.store.releaseReminder).toHaveBeenCalledWith("r1", "a");
    expect(t.sendText).toHaveBeenCalledWith("+506888", expect.any(String));
  });

  it("no entrega dos veces si otro ciclo ya lo tomó", async () => {
    const t = setup([user()], { claimReminder: vi.fn(async () => false) });
    await t.d.tick();
    expect(t.sendText).not.toHaveBeenCalled();
  });

  it("keep-alive entre 23 h y 24 h", async () => {
    const t = setup([], { keepaliveCandidates: async () => [{ userId: "u", phone: "+506999", lastInboundAt: NOW - 23.5 * H }] });
    await t.d.tick();
    expect(t.sendText).toHaveBeenCalledWith("+506999", expect.stringContaining("Respondeme"));
    expect(t.store.markKeepaliveSent).toHaveBeenCalledOnce();
  });
});

describe("formato", () => {
  it("usa hora de Costa Rica, no la del proceso", () => {
    expect(formatCR("2026-10-29T16:00:00Z")).toMatch(/10:00/);
  });
  it("plantilla sin saltos de línea", () => {
    expect(templateParams([rem("r", "a\nb")])[0]).toBe("a b");
  });
});
