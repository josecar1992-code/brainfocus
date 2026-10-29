import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake mínimo del cliente de Supabase: guarda filas por tabla y resuelve
// select().eq().eq().maybeSingle() contra ellas. Basta para probar que el
// aislamiento depende SIEMPRE de user_id.
const tables: Record<string, Array<Record<string, unknown>>> = {};

vi.mock("./supabaseClient.js", () => {
  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => (filters.push([col, val]), b),
      maybeSingle: async () => {
        const row = (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v));
        return { data: row ?? null, error: null };
      },
    };
    return b;
  }
  return { supabaseAdmin: { from: (t: string) => builder(t) } };
});

vi.mock("./env.js", () => ({ env: { allowedEmails: [], supabaseUrl: "http://x", supabaseServiceRoleKey: "x" } }));

const { findForeignRef } = await import("./utils/ownedRefs.js");
const { isModuleAllowed, moduleForResource } = await import("./utils/modules.js");
const { requireScope, requireAdmin } = await import("./middleware/auth.js");

const A = "user-a";
const B = "user-b";

beforeEach(() => {
  tables.tasks = [{ id: "task-a", user_id: A }, { id: "task-b", user_id: B }];
  tables.events = [{ id: "event-b", user_id: B }];
  tables.projects = [{ id: "proj-a", user_id: A }];
});

describe("findForeignRef: un usuario no puede referenciar filas de otro", () => {
  it("acepta referencias propias", async () => {
    expect(await findForeignRef(A, { task_id: "task-a", project_id: "proj-a" })).toBeNull();
  });
  it("rechaza el task_id de otro usuario", async () => {
    expect(await findForeignRef(A, { task_id: "task-b" })).toBe("task_id");
  });
  it("rechaza el event_id de otro usuario", async () => {
    expect(await findForeignRef(A, { event_id: "event-b" })).toBe("event_id");
  });
  it("rechaza un id que no existe", async () => {
    expect(await findForeignRef(A, { project_id: "fantasma" })).toBe("project_id");
  });
  it("ignora null, vacío y campos que no son referencias", async () => {
    expect(await findForeignRef(A, { task_id: null, project_id: "", title: "x" })).toBeNull();
  });
});

describe("módulos por usuario", () => {
  it("null = todos los módulos", () => {
    expect(isModuleAllowed(null, "vehiculos")).toBe(true);
  });
  it("solo los listados", () => {
    expect(isModuleAllowed(["notas"], "notas")).toBe(true);
    expect(isModuleAllowed(["notas"], "vehiculos")).toBe(false);
  });
  it("el núcleo (tareas, eventos, recordatorios) no depende de módulos", () => {
    for (const r of ["tasks", "events", "reminders", "subtasks", "lists", "settings"]) {
      expect(moduleForResource(r)).toBeNull();
    }
  });
  it("los recursos opcionales sí están ligados a su módulo", () => {
    expect(moduleForResource("vehicle_mileage")).toBe("vehiculos");
    expect(moduleForResource("routine_completions")).toBe("rutinas");
    expect(moduleForResource("documents")).toBe("documentos");
  });
});

function run(mw: any, auth: any) {
  const req: any = { auth };
  const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { status: nexted ? 200 : res.statusCode, nexted };
}

describe("requireScope / requireAdmin", () => {
  const user = (over: object = {}) => ({ type: "user", userId: A, isAdmin: false, modules: null, ...over });
  const agent = (scopes: string[], over: object = {}) => ({ type: "agent", userId: A, apiKeyId: "k", scopes, isAdmin: false, modules: null, ...over });

  it("usuario con módulo deshabilitado recibe 403", () => {
    expect(run(requireScope("vehicles:read"), user({ modules: ["notas"] })).status).toBe(403);
  });
  it("usuario con el módulo habilitado pasa", () => {
    expect(run(requireScope("vehicles:read"), user({ modules: ["vehiculos"] })).nexted).toBe(true);
  });
  it("un agente con scope pero con el módulo deshabilitado también recibe 403", () => {
    expect(run(requireScope("notes:read"), agent(["notes:*"], { modules: ["vehiculos"] })).status).toBe(403);
  });
  it("un agente sin el scope recibe 403 aunque el módulo esté habilitado", () => {
    expect(run(requireScope("notes:write"), agent(["notes:read"])).status).toBe(403);
  });
  it("un agente con comodín pasa", () => {
    expect(run(requireScope("tasks:write"), agent(["tasks:*"])).nexted).toBe(true);
  });
  it("requireAdmin: un usuario no administrador recibe 403", () => {
    expect(run(requireAdmin, user()).status).toBe(403);
    expect(run(requireAdmin, agent(["consumos:*"])).status).toBe(403);
  });
  it("requireAdmin: el administrador pasa", () => {
    expect(run(requireAdmin, user({ isAdmin: true })).nexted).toBe(true);
  });
});
