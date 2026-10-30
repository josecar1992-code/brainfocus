import { describe, it, expect, vi } from "vitest";

vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: {} }));
vi.mock("./env.js", () => ({ env: { allowedEmails: [], supabaseUrl: "http://x", supabaseServiceRoleKey: "x" } }));

const { userPatchSchema, normalizePhone, adminRouter } = await import("./routes/admin.js");

describe("normalizePhone", () => {
  it("deja formato E.164", () => {
    expect(normalizePhone("+506 8888-8888")).toBe("+50688888888");
    expect(normalizePhone("50688888888")).toBe("+50688888888");
  });
  it("rechaza lo que no parece teléfono", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("userPatchSchema", () => {
  it("acepta cambios válidos", () => {
    const r = userPatchSchema.parse({ status: "active", enabled_modules: ["notas"], whatsapp_phone: "+506 8888 8888" });
    expect(r).toEqual({ status: "active", enabled_modules: ["notas"], whatsapp_phone: "+50688888888" });
  });
  it("null en módulos = todos; teléfono vacío = desvincular", () => {
    expect(userPatchSchema.parse({ enabled_modules: null, whatsapp_phone: "" })).toEqual({ enabled_modules: null, whatsapp_phone: null });
  });
  it("no deja tocar is_admin ni campos desconocidos (escalada de privilegios)", () => {
    expect(userPatchSchema.safeParse({ is_admin: true }).success).toBe(false);
    expect(userPatchSchema.safeParse({ id: "x" }).success).toBe(false);
  });
  it("límite diario: entero entre 1 y 5000, o null para el general", () => {
    expect(userPatchSchema.parse({ daily_message_limit: 80 })).toEqual({ daily_message_limit: 80 });
    expect(userPatchSchema.parse({ daily_message_limit: null })).toEqual({ daily_message_limit: null });
    for (const bad of [0, -1, 5001, 1.5, "50"]) expect(userPatchSchema.safeParse({ daily_message_limit: bad }).success).toBe(false);
  });
  it("rechaza módulos que no existen, estado inválido y teléfono inválido", () => {
    expect(userPatchSchema.safeParse({ enabled_modules: ["consumos"] }).success).toBe(false);
    expect(userPatchSchema.safeParse({ status: "root" }).success).toBe(false);
    expect(userPatchSchema.safeParse({ whatsapp_phone: "12" }).success).toBe(false);
  });
});

describe("acceso al router", () => {
  const run = (auth: unknown) =>
    new Promise<{ status: number; passed: boolean }>((resolve) => {
      const layer = (adminRouter as any).stack.slice(0, 2); // requireAdmin, onlyWebAdmin
      const req: any = { auth };
      let status = 200;
      const res: any = { status: (s: number) => ((status = s), res), json: () => resolve({ status, passed: false }) };
      layer[0].handle(req, res, () => layer[1].handle(req, res, () => resolve({ status: 200, passed: true })));
    });

  it("solo el administrador desde la sesión web", async () => {
    expect((await run({ type: "user", userId: "a", isAdmin: true, modules: null })).passed).toBe(true);
    expect((await run({ type: "user", userId: "b", isAdmin: false, modules: null })).status).toBe(403);
    expect((await run({ type: "agent", userId: "a", apiKeyId: null, scopes: [], isAdmin: true, modules: null })).status).toBe(403);
    expect((await run(undefined)).status).toBe(401);
  });
});
