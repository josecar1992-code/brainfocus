import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { supabaseAdmin } from "../supabaseClient.js";
import { requireScope } from "../middleware/auth.js";
import { logAgentAction } from "../services/agentActions.js";
import { parseLimit } from "../utils/pagination.js";

interface ResourceConfig {
  table: string;
  resourceName: string; // usado para los scopes: `${resourceName}:read` / `${resourceName}:write`
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
  orderBy?: { column: string; ascending?: boolean };
  // Columnas de texto sobre las que ?q= busca (ilike, OR entre todas). Sin
  // esto, ?q= se ignora — hoy solo lo usa `notes` (Quicks necesita poder
  // buscar una nota por palabra suelta, no solo listar todo).
  searchFields?: string[];
  // Efectos secundarios opcionales hacia sistemas externos (hoy: cron de
  // OpenClaw). afterUpdate/beforeDelete son best-effort — solo cancelan un
  // job externo, así que un fallo se registra en consola y no bloquea la
  // respuesta (no tiene sentido impedir completar una tarea porque no se
  // pudo cancelar un aviso). afterCreate SÍ propaga el error tal cual al
  // caller: si falla programar el aviso real, quien creó el recordatorio
  // debe enterarse en vez de quedarse con un recordatorio silenciosamente roto.
  hooks?: {
    // A diferencia de los demás hooks, beforeCreate SÍ puede bloquear la
    // creación — devolver un string es el mensaje de error (400) que corta
    // el POST antes de insertar nada. Pensado para guardas anti-duplicado
    // (ver reminders.ts): el agente a veces llama la misma tool dos veces en
    // el mismo turno (confirmado 08-ago-2026, "Tomar la proteína" x2 con 11s
    // de diferencia — dos POST /reminders reales, no un retry de red).
    beforeCreate?: (userId: string, input: any) => Promise<string | void>;
    afterCreate?: (userId: string, row: any) => Promise<void>;
    afterUpdate?: (userId: string, before: any, after: any) => Promise<void>;
    beforeDelete?: (userId: string, row: any) => Promise<void>;
  };
  // Si la tabla tiene columna `created_by` (text: "user" | "agent"), la llena
  // sola según quién autenticó la request — así la app puede mostrar un
  // badge de "creado por Quicks" sin que cada agente tenga que mandarlo.
  trackCreatedBy?: boolean;
  // Solo registra GET (lista + detalle) — sin POST/PATCH/DELETE. Pensado para
  // tablas que un proceso interno escribe directo con supabaseAdmin (ej.
  // routine_completions, que llena advanceRoutine()) y que no deberían
  // aceptar escritura de un agente con scope de solo lectura, ni por bug ni
  // porque alguien le dé el scope :write sin querer.
  readOnly?: boolean;
}

async function runHook(name: string, fn: (() => Promise<void>) | undefined) {
  if (!fn) return;
  try {
    await fn();
  } catch (err) {
    console.error(`[resourceRouter] hook ${name} falló:`, err);
  }
}

/** CRUD genérico con scoping por user_id y auditoría de escrituras de agentes. */
export function createResourceRouter(config: ResourceConfig): Router {
  const router = Router();
  const { table, resourceName, createSchema, updateSchema, hooks, trackCreatedBy } = config;
  const orderBy = config.orderBy ?? { column: "created_at", ascending: false };

  const MAX_LIMIT = 200;
  const DEFAULT_LIMIT = 50;
  const RESERVED_QUERY_PARAMS = new Set(["limit", "fields", "q"]);

  router.get("/", requireScope(`${resourceName}:read`), async (req, res, next) => {
    try {
      const limit = parseLimit(req.query.limit, { max: MAX_LIMIT, defaultValue: DEFAULT_LIMIT });

      // Solo lista de columnas simples separadas por coma (ej. "id,title"). Sin
      // esto, supabase-js interpreta acá sintaxis de embeds/joins
      // ("*,otra_tabla(*)") y el .eq("user_id", ...) de abajo solo filtra la
      // tabla raíz — un fields armado con un embed podría exponer filas de
      // otra tabla sin pasar por el scoping de usuario.
      const rawFields = typeof req.query.fields === "string" ? req.query.fields : "*";
      const fields = /^[a-zA-Z0-9_,\s*]+$/.test(rawFields) ? rawFields : "*";

      let query = supabaseAdmin.from(table).select(fields).eq("user_id", req.auth!.userId);

      // Filtro de igualdad simple por cualquier columna vía query string, ej.
      // ?status=pending, más rango con sufijo _gte/_lte, ej.
      // ?starts_at_gte=2026-01-01&starts_at_lte=2026-02-01 — sin esto, vistas
      // como Agenda tenían que traer hasta MAX_LIMIT filas (ordenadas por la
      // columna default, no acotadas por fecha) y filtrar en el cliente.
      // Confiado porque solo llega hasta acá el dueño (JWT) o un agente con scope de lectura.
      for (const [key, value] of Object.entries(req.query)) {
        if (RESERVED_QUERY_PARAMS.has(key) || typeof value !== "string") continue;
        if (key.endsWith("_gte")) {
          query = query.gte(key.slice(0, -"_gte".length), value);
        } else if (key.endsWith("_lte")) {
          query = query.lte(key.slice(0, -"_lte".length), value);
        } else {
          query = query.eq(key, value);
        }
      }

      if (config.searchFields?.length && typeof req.query.q === "string" && req.query.q.trim()) {
        const q = req.query.q.trim().replace(/[%,]/g, "");
        query = query.or(config.searchFields.map((f) => `${f}.ilike.%${q}%`).join(","));
      }

      const { data, error } = await query
        .order(orderBy.column, { ascending: orderBy.ascending ?? false })
        .limit(limit);
      if (error) throw error;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", requireScope(`${resourceName}:read`), async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("user_id", req.auth!.userId)
        .eq("id", req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "No encontrado" });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  if (!config.readOnly) {
  router.post("/", requireScope(`${resourceName}:write`), async (req, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      if (hooks?.beforeCreate) {
        const blockMessage = await hooks.beforeCreate(req.auth!.userId, parsed.data);
        if (blockMessage) return res.status(409).json({ error: blockMessage });
      }

      const { data, error } = await supabaseAdmin
        .from(table)
        .insert({
          ...parsed.data,
          user_id: req.auth!.userId,
          ...(trackCreatedBy ? { created_by: req.auth!.type === "agent" ? "agent" : "user" } : {}),
        })
        .select()
        .single();
      if (error) throw error;

      await logAgentAction(req.auth!, `${resourceName}.create`, table, data.id, parsed.data);
      if (hooks?.afterCreate) await hooks.afterCreate(req.auth!.userId, data);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", requireScope(`${resourceName}:write`), async (req, res, next) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const { data: before, error: beforeError } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("user_id", req.auth!.userId)
        .eq("id", req.params.id)
        .maybeSingle();
      if (beforeError) throw beforeError;
      if (!before) return res.status(404).json({ error: "No encontrado" });

      const { data, error } = await supabaseAdmin
        .from(table)
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq("user_id", req.auth!.userId)
        .eq("id", req.params.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "No encontrado" });

      await logAgentAction(req.auth!, `${resourceName}.update`, table, req.params.id, parsed.data);
      await runHook("afterUpdate", hooks?.afterUpdate && (() => hooks.afterUpdate!(req.auth!.userId, before, data)));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", requireScope(`${resourceName}:write`), async (req, res, next) => {
    try {
      let existing: any = null;
      if (hooks?.beforeDelete) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select("*")
          .eq("user_id", req.auth!.userId)
          .eq("id", req.params.id)
          .maybeSingle();
        if (error) throw error;
        existing = data;
        if (existing) await runHook("beforeDelete", () => hooks.beforeDelete!(req.auth!.userId, existing));
      }

      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq("user_id", req.auth!.userId)
        .eq("id", req.params.id);
      if (error) throw error;

      await logAgentAction(req.auth!, `${resourceName}.delete`, table, req.params.id, null);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
  }

  return router;
}
