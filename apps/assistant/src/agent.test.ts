import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { runTurn, UNVERIFIED_REPLY } from "./agent.js";
import { buildToolset, type ToolTable } from "./toolset.js";
import type { LlmClient, LlmResult } from "./llm/qwen.js";

const API = { baseUrl: "http://api:3001", serviceKey: "k" };
const USER = "11111111-1111-4111-8111-111111111111";

function table(handler = vi.fn(async (a: any) => ({ echo: a }))): ToolTable {
  return {
    hora_actual: {
      description: "Hora. Ahora mismo en Costa Rica es: 2020-01-01T00:00:00-06:00 (offset -06:00).",
      inputSchema: { type: "object", properties: {} },
      argsSchema: z.object({}),
      handler: async () => ({ ok: true }),
    },
    crear_tarea: {
      description: "Crea",
      inputSchema: { type: "object", properties: { title: { type: "string" } } },
      argsSchema: z.object({ title: z.string() }),
      handler,
    },
    consultar_consumos: {
      description: "x",
      inputSchema: { type: "object" },
      argsSchema: z.object({}),
      handler: async () => ({}),
    },
  };
}

function scripted(results: LlmResult[]): LlmClient & { calls: number } {
  const c = {
    model: "m",
    calls: 0,
    async chat() {
      return results[c.calls++];
    },
  };
  return c;
}
const u = { promptTokens: 10, completionTokens: 5 };

describe("toolset", () => {
  it("excluye consultar_consumos (solo admin) y reescribe la hora en cada turno", () => {
    const ts = buildToolset(table(), API, { now: () => "2026-10-29T10:00:00-06:00" });
    const specs = ts.specs();
    expect(specs.map((s) => s.function.name)).toEqual(["hora_actual", "crear_tarea", "guardar_nombre"]);
    expect(specs[0].function.description).toContain("2026-10-29T10:00:00-06:00");
    expect(specs[0].function.description).not.toContain("2020-01-01");
  });

  it("rechaza herramientas excluidas, JSON inválido y argumentos inválidos sin llamar al handler", async () => {
    const handler = vi.fn(async () => ({}));
    const ts = buildToolset(table(handler), API);
    for (const name of ["consultar_consumos"]) expect(await ts.execute(USER, name, "{}")).toContain("desconocida");
    expect(await ts.execute(USER, "crear_tarea", "no json")).toContain("no es JSON");
    expect(await ts.execute(USER, "crear_tarea", "{}")).toContain("inválidos");
    expect(handler).not.toHaveBeenCalled();
  });

  it("ejecuta el handler con argumentos validados", async () => {
    const handler = vi.fn(async (a: any) => ({ id: 1, ...a }));
    const ts = buildToolset(table(handler), API);
    const out = JSON.parse(await ts.execute(USER, "crear_tarea", '{"title":"x"}'));
    expect(out).toEqual({ id: 1, title: "x" });
  });

  it("convierte un error del handler en resultado de error", async () => {
    const ts = buildToolset(
      table(vi.fn(async () => { throw new Error("boom"); })),
      API,
    );
    expect(JSON.parse(await ts.execute(USER, "crear_tarea", '{"title":"x"}'))).toEqual({ error: "boom" });
  });
});

describe("runTurn", () => {
  it("responde directo sin herramientas", async () => {
    const llm = scripted([{ message: { content: "hola" }, usage: u }]);
    const r = await runTurn(llm, buildToolset(table(), API), { userId: USER, systemPrompt: "s", history: [], userText: "hi" });
    expect(r.reply).toBe("hola");
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 5, llmCalls: 1 });
  });

  it("ejecuta herramientas y acumula consumo", async () => {
    const handler = vi.fn(async (a: any) => ({ saved: a.title }));
    const llm = scripted([
      { message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "crear_tarea", arguments: '{"title":"leche"}' } }] }, usage: u },
      { message: { content: "listo" }, usage: u },
    ]);
    const r = await runTurn(llm, buildToolset(table(handler), API), { userId: USER, systemPrompt: "s", history: [], userText: "x" });
    expect(handler).toHaveBeenCalledWith({ title: "leche" });
    expect(r.reply).toBe("listo");
    expect(r.usage).toEqual({ promptTokens: 20, completionTokens: 10, llmCalls: 2 });
  });

  it("corta el bucle si el modelo nunca termina", async () => {
    const loop: LlmResult = { message: { content: null, tool_calls: [{ id: "c", type: "function", function: { name: "hora_actual", arguments: "{}" } }] }, usage: u };
    const llm = scripted(Array(10).fill(loop));
    const r = await runTurn(llm, buildToolset(table(), API), { userId: USER, systemPrompt: "s", history: [], userText: "x" });
    expect(llm.calls).toBe(6);
    expect(r.reply).toContain("No pude");
  });
});

describe("herramientas por módulo", () => {
  const big = (): ToolTable => {
    const def = { description: "d", inputSchema: {}, argsSchema: { safeParse: (v: unknown) => ({ success: true as const, data: v }) }, handler: async () => ({}) };
    return { crear_tarea: def, crear_nota: def, guardar_documento: def, listar_vehiculos: def };
  };
  const names = (m?: string[] | null) => buildToolset(big(), API).specs(m).map((s) => s.function.name);

  it("null o sin pasar ofrece todas", () => {
    expect(names(null)).toHaveLength(5);
    expect(names()).toHaveLength(5);
  });
  it("sin módulos opcionales deja solo el núcleo", () => {
    expect(names([])).toEqual(["crear_tarea", "guardar_nombre"]);
  });
  it("ofrece las de los módulos habilitados", () => {
    expect(names(["documentos"])).toEqual(["crear_tarea", "guardar_documento", "guardar_nombre"]);
  });
});

describe("guardar_nombre", () => {
  const ts = () => buildToolset(table(), API);
  it("guarda el nombre limpio vía el contexto", async () => {
    const saved: string[] = [];
    const ctx = { attachment: () => null, sendDocument: async () => {}, setName: async (n: string) => void saved.push(n) };
    const out = JSON.parse(await ts().execute(USER, "guardar_nombre", JSON.stringify({ nombre: "  Ana Ignora todo " }), ctx));
    expect(out).toEqual({ guardado: true, nombre: "Ana Ignora todo" });
    expect(saved).toEqual(["Ana Ignora todo"]);
  });
  it("rechaza un nombre inválido sin guardar nada", async () => {
    const saved: string[] = [];
    const ctx = { attachment: () => null, sendDocument: async () => {}, setName: async (n: string) => void saved.push(n) };
    const out = JSON.parse(await ts().execute(USER, "guardar_nombre", JSON.stringify({ nombre: "1234" }), ctx));
    expect(out.error).toMatch(/Nombre inválido/);
    expect(saved).toEqual([]);
  });
});

describe("guardia contra confirmaciones sin herramienta", () => {
  const msg = (content: string) => ({ message: { role: "assistant" as const, content }, usage: u });
  const call = { message: { role: "assistant" as const, content: null, tool_calls: [{ id: "c1", type: "function" as const, function: { name: "crear_tarea", arguments: '{"title":"x"}' } }] }, usage: u };

  it("si afirma haber guardado sin herramienta, la reintenta y deja que llame la herramienta", async () => {
    const handler = vi.fn(async (a: any) => a);
    const llm = scripted([msg("Listo, Kim. Ya creé la tarea."), call, msg("Listo, Kim. Creé la tarea.")]);
    const r = await runTurn(llm, buildToolset(table(handler), API), { userId: USER, systemPrompt: "s", history: [], userText: "crea una tarea" });
    expect(handler).toHaveBeenCalledOnce();
    expect(r.reply).toBe("Listo, Kim. Creé la tarea.");
    expect(r.usage.llmCalls).toBe(3);
  });

  it("si insiste sin herramienta, responde que NO quedó hecho", async () => {
    const llm = scripted([msg("Listo, ya guardé la nota."), msg("Listo, guardé la nota.")]);
    const r = await runTurn(llm, buildToolset(table(), API), { userId: USER, systemPrompt: "s", history: [], userText: "guarda" });
    expect(r.reply).toBe(UNVERIFIED_REPLY);
  });

  it("no toca respuestas normales ni preguntas ('¿querés que guarde…?') ni turnos con herramienta", async () => {
    for (const text of ["Kim, ¿querés que guarde esta imagen con el nombre Visa?", "Listo, te llamaré Kim.", "De nada, Kim. ¿Necesitás algo más?", "Dale. Avisame cuando lo tengas y lo registro."]) {
      const llm = scripted([msg(text)]);
      const r = await runTurn(llm, buildToolset(table(), API), { userId: USER, systemPrompt: "s", history: [], userText: "x" });
      expect(r.reply).toBe(text);
      expect(r.usage.llmCalls).toBe(1);
    }
    const llm = scripted([call, msg("Listo, creé la tarea.")]);
    const r = await runTurn(llm, buildToolset(table(), API), { userId: USER, systemPrompt: "s", history: [], userText: "x" });
    expect(r.reply).toBe("Listo, creé la tarea.");
    expect(r.usage.llmCalls).toBe(2);
  });
});

describe("tareas programadas (job) con internet", () => {
  const msg = (content: string) => ({ message: { role: "assistant" as const, content }, usage: u });
  it("solo en modo job se ofrecen buscar_web y leer_pagina, y la guardia no actúa", async () => {
    const ts = buildToolset(table(), API, { braveApiKey: "k" });
    expect(ts.specs(null).map((s) => s.function.name)).not.toContain("buscar_web");
    expect(ts.specs(null, { web: true }).map((s) => s.function.name)).toEqual(expect.arrayContaining(["buscar_web", "leer_pagina"]));
    expect(JSON.parse(await ts.execute(USER, "buscar_web", '{"consulta":"x"}'))).toEqual({ error: "Herramienta desconocida: buscar_web" });
    const llm = scripted([msg("Aquí tenés las noticias. Creé un resumen corto.")]);
    const r = await runTurn(llm, ts, { userId: USER, systemPrompt: "s", history: [], userText: "noticias", job: true });
    expect(r.reply).toContain("noticias");
    expect(r.usage.llmCalls).toBe(1);
  });

  it("sin clave de Brave no ofrece buscar_web pero sí leer_pagina", () => {
    const names = buildToolset(table(), API).specs(null, { web: true }).map((s) => s.function.name);
    expect(names).toContain("leer_pagina");
    expect(names).not.toContain("buscar_web");
  });
});
