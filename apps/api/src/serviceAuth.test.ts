import { beforeEach, describe, expect, it, vi } from "vitest";

const profiles: Record<string, { status: string; isAdmin: boolean; modules: string[] | null }> = {};

vi.mock("./env.js", () => ({
  env: { allowedEmails: [], supabaseUrl: "http://x", supabaseServiceRoleKey: "x", assistantServiceKey: "clave-de-servicio-de-prueba" },
}));
vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: {} }));
vi.mock("./services/profiles.js", () => ({ getProfileAccess: async (id: string) => profiles[id] ?? null }));

const { authenticate } = await import("./middleware/auth.js");

const ANA = "11111111-1111-4111-8111-111111111111";
const PENDIENTE = "22222222-2222-4222-8222-222222222222";
const GOOD_KEY = "clave-de-servicio-de-prueba";

async function call(headers: Record<string, string>) {
  const req: any = { header: (n: string) => headers[n.toLowerCase()] };
  const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  let nexted = false;
  await authenticate(req, res, () => { nexted = true; });
  return { req, status: nexted ? 200 : res.statusCode, body: res.body };
}

beforeEach(() => {
  profiles[ANA] = { status: "active", isAdmin: false, modules: ["notas"] };
  profiles[PENDIENTE] = { status: "pending", isAdmin: false, modules: null };
});

describe("autenticación servicio-a-servicio (asistente)", () => {
  it("acepta clave correcta + usuario activo, y fija el user_id desde X-On-Behalf-Of", async () => {
    const r = await call({ "x-service-key": GOOD_KEY, "x-on-behalf-of": ANA });
    expect(r.status).toBe(200);
    expect(r.req.auth).toMatchObject({ type: "agent", userId: ANA, apiKeyId: null, isAdmin: false, modules: ["notas"] });
  });
  it("sus scopes excluyen consumos", async () => {
    const r = await call({ "x-service-key": GOOD_KEY, "x-on-behalf-of": ANA });
    expect(r.req.auth.scopes).toContain("tasks:*");
    expect(r.req.auth.scopes.some((s: string) => s.startsWith("consumos"))).toBe(false);
  });
  it("clave incorrecta -> 401", async () => {
    expect((await call({ "x-service-key": "otra", "x-on-behalf-of": ANA })).status).toBe(401);
  });
  it("clave correcta pero la petición pasó por un proxy público (X-Forwarded-For) -> 401", async () => {
    expect((await call({ "x-service-key": GOOD_KEY, "x-on-behalf-of": ANA, "x-forwarded-for": "1.2.3.4" })).status).toBe(401);
  });
  it("X-On-Behalf-Of que no es un uuid -> 400", async () => {
    expect((await call({ "x-service-key": GOOD_KEY, "x-on-behalf-of": "no-soy-uuid" })).status).toBe(400);
  });
  it("usuario pendiente o inexistente -> 403, nunca acceso", async () => {
    expect((await call({ "x-service-key": GOOD_KEY, "x-on-behalf-of": PENDIENTE })).status).toBe(403);
    expect((await call({ "x-service-key": GOOD_KEY, "x-on-behalf-of": "33333333-3333-4333-8333-333333333333" })).status).toBe(403);
  });
  it("sin la cabecera de servicio no hay acceso por esta vía (cae a 'falta autenticación')", async () => {
    expect((await call({ "x-on-behalf-of": ANA })).status).toBe(401);
  });
});

describe("clave de servicio no configurada", () => {
  it("con ASSISTANT_SERVICE_KEY vacía la vía queda cerrada aunque se mande un valor", async () => {
    vi.resetModules();
    vi.doMock("./env.js", () => ({ env: { allowedEmails: [], supabaseUrl: "http://x", supabaseServiceRoleKey: "x", assistantServiceKey: "" } }));
    const { authenticate: auth2 } = await import("./middleware/auth.js");
    const req: any = { header: (n: string) => ({ "x-service-key": "", "x-on-behalf-of": ANA } as Record<string, string>)[n.toLowerCase()] };
    const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json() { return this; } };
    let nexted = false;
    await auth2(req, res, () => { nexted = true; });
    expect(nexted).toBe(false);
  });
});
