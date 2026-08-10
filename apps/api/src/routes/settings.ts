import { Router } from "express";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelReminderCron, scheduleRecurringCron } from "../services/openclawCron.js";

// 9am el día 1 de cada mes (hora Costa Rica, explícito en scheduleRecurringCron).
const MILEAGE_CRON_EXPR = "0 9 1 * *";
const MILEAGE_CRON_MESSAGE =
  "Es el aviso mensual de kilometraje de Focusbrain: usá `listar_vehiculos` para ver los vehículos " +
  "del usuario y preguntale el kilometraje actual de cada uno. Por cada uno que te responda, " +
  "guardalo con `registrar_kilometraje`. Si no tiene vehículos registrados, no hace falta que digas nada.";

export const settingsRouter = Router();

settingsRouter.get("/mileage-reminder", requireScope("settings:read"), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("mileage_reminder_enabled")
      .eq("id", req.auth!.userId)
      .maybeSingle();
    if (error) throw error;
    res.json({ enabled: data?.mileage_reminder_enabled ?? false });
  } catch (err) {
    next(err);
  }
});

const toggleSchema = z.object({ enabled: z.boolean() });

settingsRouter.post("/mileage-reminder", requireScope("settings:write"), async (req, res, next) => {
  try {
    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const userId = req.auth!.userId;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("mileage_reminder_cron_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    if (!parsed.data.enabled) {
      await cancelReminderCron(profile?.mileage_reminder_cron_id ?? null);
      // upsert, no update: la fila en profiles puede no existir todavía (no
      // hay trigger que la cree al registrarse, y hoy nada más la toca).
      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: userId, mileage_reminder_enabled: false, mileage_reminder_cron_id: null });
      if (error) throw error;
      return res.json({ enabled: false });
    }

    // Cancela cualquier job viejo antes de crear uno nuevo — evita duplicar
    // el aviso mensual si el usuario apaga y prende el toggle varias veces.
    await cancelReminderCron(profile?.mileage_reminder_cron_id ?? null);
    const jobId = await scheduleRecurringCron({
      displayName: `brainfocus:mileage-reminder:${userId}`,
      cronExpr: MILEAGE_CRON_EXPR,
      message: MILEAGE_CRON_MESSAGE,
      channel: null,
    });

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, mileage_reminder_enabled: true, mileage_reminder_cron_id: jobId });
    if (error) throw error;
    res.json({ enabled: true });
  } catch (err) {
    next(err);
  }
});
