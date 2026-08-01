import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { supabaseAdmin } from "../supabaseClient.js";
import { requireScope } from "../middleware/auth.js";
import { logAgentAction } from "../services/agentActions.js";

interface ResourceConfig {
  table: string;
  resourceName: string; // usado para los scopes: `${resourceName}:read` / `${resourceName}:write`
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
  orderBy?: { column: string; ascending?: boolean };
}

/** CRUD genérico con scoping por user_id y auditoría de escrituras de agentes. */
export function createResourceRouter(config: ResourceConfig): Router {
  const router = Router();
  const { table, resourceName, createSchema, updateSchema } = config;
  const orderBy = config.orderBy ?? { column: "created_at", ascending: false };

  router.get("/", requireScope(`${resourceName}:read`), async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("user_id", req.auth!.userId)
        .order(orderBy.column, { ascending: orderBy.ascending ?? false });
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

  router.post("/", requireScope(`${resourceName}:write`), async (req, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const { data, error } = await supabaseAdmin
        .from(table)
        .insert({ ...parsed.data, user_id: req.auth!.userId })
        .select()
        .single();
      if (error) throw error;

      await logAgentAction(req.auth!, `${resourceName}.create`, table, data.id, parsed.data);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", requireScope(`${resourceName}:write`), async (req, res, next) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

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
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", requireScope(`${resourceName}:write`), async (req, res, next) => {
    try {
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

  return router;
}
