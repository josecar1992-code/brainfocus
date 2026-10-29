import express from "express";
import { env } from "./env.js";
import { tools } from "@brainfocus/focusbrain-tools";
import { horaActualCR } from "@brainfocus/shared-time";
import { runTurn } from "./agent.js";
import { createHandler } from "./handler.js";
import { createForwarder } from "./forward.js";
import { createDispatcher } from "./dispatcher.js";
import { createDispatchStore } from "./dispatchStore.js";
import { createAttachmentStore, filenameFor } from "./attachments.js";
import { sendMedia, sendText, sendTemplate } from "./kapso/client.js";
import { parseWebhook, verifySignature } from "./kapso/webhook.js";
import { createQwenClient } from "./llm/qwen.js";
import { buildSystemPrompt } from "./prompt.js";
import { parseNumberList } from "./router.js";
import { createStore } from "./store.js";
import { buildToolset, type ToolTable } from "./toolset.js";

const llm = createQwenClient(env.qwen);
const toolset = buildToolset(tools as unknown as ToolTable, { baseUrl: env.apiBaseUrl, serviceKey: env.serviceKey });
const log = (msg: string, extra?: unknown) => console.error(`[assistant] ${msg}`, extra ?? "");

const store = createStore(env.supabaseUrl, env.supabaseServiceRoleKey);
const handler = createHandler({
  routing: { dropNumbers: parseNumberList(env.dropNumbers), forwardNumbers: parseNumberList(env.forwardNumbers) },
  store,
  runAgent: (userId, history, text, ctx) =>
    runTurn(llm, toolset, { userId, systemPrompt: buildSystemPrompt(horaActualCR()), history, userText: text, ctx }),
  attachments: createAttachmentStore({ kapsoApiKey: env.kapso.apiKey }),
  sendMedia: async (to, doc) => {
    const kind = doc.mimeType?.startsWith("image/") ? "image" : "document";
    await sendMedia(env.kapso, to, { kind, url: doc.url, filename: filenameFor(doc.name, doc.mimeType) });
  },
  model: llm.model,
  send: (to, text) => sendText(env.kapso, to, text),
  forward: createForwarder(env.openclawWebhookUrl, env.webhookSecret),
  log,
});

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/kapso/webhook", express.raw({ type: "*/*", limit: "2mb" }), (req, res) => {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifySignature(raw, req.header("x-webhook-signature"), env.webhookSecret)) {
    return res.status(401).json({ error: "firma inválida" });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "JSON inválido" });
  }
  // Se responde ya: Kapso reintenta si tarda, y el agente puede demorar varios segundos.
  res.status(200).json({ ok: true });
  for (const msg of parseWebhook(payload, req.header("x-webhook-event"), req.header("x-webhook-batch"))) {
    handler.handle(msg).catch((err) => log("fallo manejando mensaje", err instanceof Error ? err.message : err));
  }
});

// Entrega de recordatorios con la política de ventana de 24 h (ver dispatcher.ts). Cada minuto.
const dispatcher = createDispatcher({
  store: createDispatchStore(env.supabaseUrl, env.supabaseServiceRoleKey),
  sendText: (to, text) => sendText(env.kapso, to, text),
  sendTemplate: (to, name, params) => sendTemplate(env.kapso, to, name, params),
  runJob: async (userId, prompt) => {
    const r = await runTurn(llm, toolset, { userId, systemPrompt: buildSystemPrompt(horaActualCR()), history: [], userText: prompt });
    await store.logUsage(userId, llm.model, r.usage);
    return r.reply;
  },
  record: (userId, text) => store.saveAssistantMessage(userId, text),
  log,
});
setInterval(() => dispatcher.tick().catch((err) => log("fallo el ciclo de recordatorios", err instanceof Error ? err.message : err)), 60_000);

app.listen(env.port, () => log(`escuchando en :${env.port}`));
