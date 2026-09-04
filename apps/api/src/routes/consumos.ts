import { Router } from "express";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { logAgentAction } from "../services/agentActions.js";
import { parseLimit } from "../utils/pagination.js";

// Gasto real por proveedor (IA, mensajería, hosting, ...). Esquema genérico
// a propósito — ver comentario en supabase/schema.sql — así que este router
// es a medida (no createResourceRouter) para exponer el contrato de query
// exacto pedido (?desde=&hasta=&proveedor=) en vez del genérico `_gte/_lte`.
//
// `fecha` es la fecha calendario de Costa Rica del gasto (día local CR, corte
// 06:00Z-06:00Z, igual que OpenClaw) — quien alimenta este endpoint (el cron
// de reporte de uso) calcula esa fecha explícitamente antes de mandarla; acá
// no se hace ningún cálculo de zona horaria, solo se guarda el string
// YYYY-MM-DD tal cual llega.
const createSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  proveedor: z.string().min(1),
  categoria: z.enum(["ia", "mensajeria", "hosting", "otro"]),
  cantidad: z.number().optional(),
  unidad: z.string().optional(),
  costo_usd: z.number(),
  detalle: z.record(z.any()).optional(),
  origen: z.enum(["openclaw-export", "kapso-api", "manual", "aliyun-billing-api"]),
});

export const consumosRouter = Router();

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

consumosRouter.get("/", requireScope("consumos:read"), async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, { max: MAX_LIMIT, defaultValue: DEFAULT_LIMIT });
    let query = supabaseAdmin.from("consumos").select("*").eq("user_id", req.auth!.userId);

    if (typeof req.query.desde === "string" && req.query.desde) query = query.gte("fecha", req.query.desde);
    if (typeof req.query.hasta === "string" && req.query.hasta) query = query.lte("fecha", req.query.hasta);
    if (typeof req.query.proveedor === "string" && req.query.proveedor) query = query.eq("proveedor", req.query.proveedor);
    if (typeof req.query.categoria === "string" && req.query.categoria) query = query.eq("categoria", req.query.categoria);

    const { data, error } = await query.order("fecha", { ascending: false }).limit(limit);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

consumosRouter.post("/", requireScope("consumos:write"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { data, error } = await supabaseAdmin
      .from("consumos")
      .insert({
        ...parsed.data,
        user_id: req.auth!.userId,
        created_by: req.auth!.type === "agent" ? "agent" : "user",
      })
      .select()
      .single();
    if (error) throw error;

    await logAgentAction(req.auth!, "consumos.create", "consumos", data.id, parsed.data);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

consumosRouter.delete("/:id", requireScope("consumos:write"), async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from("consumos")
      .delete()
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id);
    if (error) throw error;

    await logAgentAction(req.auth!, "consumos.delete", "consumos", req.params.id, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
