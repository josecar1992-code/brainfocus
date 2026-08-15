import { Router } from "express";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { logAgentAction } from "../services/agentActions.js";
import { createFirstOccurrence } from "../services/routines.js";

const baseSchema = z.object({
  title: z.string().min(1),
  list_id: z.string().uuid(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval_weeks: z.number().int().min(1).max(52).optional(),
  days_of_week: z.array(z.number().int().min(0).max(6)).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/, "Formato de hora inválido (HH:MM)"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  crear_recordatorio: z.boolean().optional(),
});

const createSchema = baseSchema.superRefine((data, ctx) => {
  if (data.frequency === "weekly" && !data.days_of_week?.length) {
    ctx.addIssue({ code: "custom", path: ["days_of_week"], message: "Elegí al menos un día de la semana" });
  }
  if (data.frequency === "monthly" && !data.day_of_month) {
    ctx.addIssue({ code: "custom", path: ["day_of_month"], message: "Elegí el día del mes" });
  }
});

// Solo se pueden editar los datos de la rutina (nombre/categoría/patrón) —
// no toca la ocurrencia ya pendiente, que sigue su curso tal como se creó.
const updateSchema = baseSchema.partial();

export const routinesRouter = Router();

routinesRouter.get("/", requireScope("routines:read"), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("routines")
      .select("*")
      .eq("user_id", req.auth!.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

routinesRouter.get("/:id", requireScope("routines:read"), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("routines")
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

routinesRouter.post("/", requireScope("routines:write"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { data: routine, error } = await supabaseAdmin
      .from("routines")
      .insert({
        user_id: req.auth!.userId,
        title: parsed.data.title,
        list_id: parsed.data.list_id,
        frequency: parsed.data.frequency,
        interval_weeks: parsed.data.interval_weeks ?? 1,
        days_of_week: parsed.data.days_of_week ?? [],
        day_of_month: parsed.data.frequency === "monthly" ? (parsed.data.day_of_month ?? null) : null,
        time_of_day: parsed.data.time_of_day,
        start_date: parsed.data.start_date,
        crear_recordatorio: parsed.data.crear_recordatorio ?? true,
      })
      .select()
      .single();
    if (error) throw error;

    // Si falla generar la primera ocurrencia, no dejamos una rutina "vacía"
    // sin tarea/evento — mejor que el caller se entere y pueda reintentar.
    try {
      await createFirstOccurrence(routine);
    } catch (err) {
      await supabaseAdmin.from("routines").delete().eq("id", routine.id);
      throw err;
    }

    const { data: full, error: fullError } = await supabaseAdmin
      .from("routines")
      .select("*")
      .eq("id", routine.id)
      .single();
    if (fullError) throw fullError;

    await logAgentAction(req.auth!, "routines.create", "routines", routine.id, parsed.data);
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

routinesRouter.patch("/:id", requireScope("routines:write"), async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { data, error } = await supabaseAdmin
      .from("routines")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No encontrado" });

    await logAgentAction(req.auth!, "routines.update", "routines", req.params.id, parsed.data);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

routinesRouter.delete("/:id", requireScope("routines:write"), async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from("routines")
      .delete()
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id);
    if (error) throw error;

    await logAgentAction(req.auth!, "routines.delete", "routines", req.params.id, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
