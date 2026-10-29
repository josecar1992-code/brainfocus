import { describe, expect, it } from "vitest";
import { MESSAGE_RECEIVED_EVENT, normalizePhone, parseWebhook, signBody, verifySignature } from "./kapso/webhook.js";
import { parseNumberList, resolveRoute, type RouteDeps } from "./router.js";

const SECRET = "secreto-de-prueba";

describe("firma del webhook", () => {
  const body = Buffer.from(JSON.stringify({ hola: "mundo" }));
  it("acepta la firma correcta, con o sin prefijo sha256=", () => {
    const sig = signBody(body, SECRET);
    expect(verifySignature(body, sig, SECRET)).toBe(true);
    expect(verifySignature(body, `sha256=${sig}`, SECRET)).toBe(true);
  });
  it("rechaza firma ausente, mal formada, de otro secreto o con cuerpo alterado", () => {
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
    expect(verifySignature(body, "zzzz", SECRET)).toBe(false);
    expect(verifySignature(body, signBody(body, "otro"), SECRET)).toBe(false);
    expect(verifySignature(Buffer.from("alterado"), signBody(body, SECRET), SECRET)).toBe(false);
  });
});

describe("lectura del webhook", () => {
  const evento = (from: string, text: string) => ({
    event: MESSAGE_RECEIVED_EVENT,
    message: { id: `wamid.${from}`, from, type: "text", text: { body: text }, timestamp: "1790000000" },
    conversation: { id: "c1" },
  });
  it("lee un evento suelto y normaliza el teléfono a E.164", () => {
    const [m] = parseWebhook(evento("50687686207", "hola"));
    expect(m.from).toBe("+50687686207");
    expect(m.text).toBe("hola");
    expect(m.timestampMs).toBe(1790000000 * 1000);
  });
  it("lee un lote y conserva el evento original de cada mensaje", () => {
    const lote = { data: [evento("50611112222", "a"), evento("50633334444", "b")] };
    const msgs = parseWebhook(lote, undefined, "true");
    expect(msgs.map((m) => m.from)).toEqual(["+50611112222", "+50633334444"]);
    expect(msgs[0].rawEvent).toBe(lote.data[0]);
  });
  it("ignora otros eventos, lotes sin data y basura", () => {
    expect(parseWebhook(evento("50611112222", "x"), "whatsapp.message.sent")).toEqual([]);
    expect(parseWebhook(evento("50611112222", "x"), undefined, "true")).toEqual([]);
    expect(parseWebhook("nada")).toEqual([]);
    expect(parseWebhook({ event: MESSAGE_RECEIVED_EVENT, message: { type: "text" } })).toEqual([]);
  });
  it("toma la transcripción de una nota de voz", () => {
    const e = {
      event: MESSAGE_RECEIVED_EVENT,
      message: { id: "a", from: "50611112222", type: "audio", kapso: { transcript: { text: "recordame llamar a Ana" } } },
    };
    expect(parseWebhook(e)[0].text).toBe("recordame llamar a Ana");
  });
  it("normalizePhone acepta prefijos de canal y rechaza lo que no es teléfono", () => {
    expect(normalizePhone("whatsapp:+506 8768-6207")).toBe("+50687686207");
    expect(normalizePhone("abc")).toBeUndefined();
  });
});

describe("enrutador por número", () => {
  const usuarios: Record<string, { userId: string; status: string }> = {
    "+50611112222": { userId: "u-ana", status: "active" },
    "+50633334444": { userId: "u-pend", status: "pending" },
    "+50687686207": { userId: "u-owner", status: "active" },
  };
  const deps: RouteDeps = {
    dropNumbers: parseNumberList("+506 6308 3397, 50660740401"),
    forwardNumbers: parseNumberList("+50687686207"),
    lookupUser: async (p) => usuarios[p] ?? null,
  };
  it("usuario activo -> su user_id", async () => {
    expect(await resolveRoute("+50611112222", deps)).toEqual({ kind: "user", userId: "u-ana" });
  });
  it("cuenta pendiente o número desconocido -> no registrado (sin datos)", async () => {
    expect(await resolveRoute("+50633334444", deps)).toEqual({ kind: "unregistered" });
    expect(await resolveRoute("+50699999999", deps)).toEqual({ kind: "unregistered" });
  });
  it("personal de QuickWash -> descartar", async () => {
    expect(await resolveRoute("+50663083397", deps)).toEqual({ kind: "drop" });
    expect(await resolveRoute("+50660740401", deps)).toEqual({ kind: "drop" });
  });
  it("el dueño va a OpenClaw aunque también esté registrado aquí", async () => {
    expect(await resolveRoute("+50687686207", deps)).toEqual({ kind: "forward" });
  });
  it("descartar tiene prioridad sobre todo", async () => {
    const d: RouteDeps = { ...deps, forwardNumbers: parseNumberList("+50663083397") };
    expect(await resolveRoute("+50663083397", d)).toEqual({ kind: "drop" });
  });
});
