import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { runTurn } from "./agent.js";
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
    expect(specs.map((s) => s.function.name)).toEqual(["hora_actual", "crear_tarea"]);
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
    expect(names(null)).toHaveLength(4);
    expect(names()).toHaveLength(4);
  });
  it("sin módulos opcionales deja solo el núcleo", () => {
    expect(names([])).toEqual(["crear_tarea"]);
  });
  it("ofrece las de los módulos habilitados", () => {
    expect(names(["documentos"])).toEqual(["crear_tarea", "guardar_documento"]);
  });
});
