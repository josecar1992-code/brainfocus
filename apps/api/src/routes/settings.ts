import { Router } from "express";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelReminderCron, scheduleRecurringCron } from "../services/openclawCron.js";

// 9am cada 2 días (hora Costa Rica, explícito en scheduleRecurringCron). No es
// "cada 2 días para siempre": el mensaje le pide a Quicks que solo pregunte por
// los vehículos que todavía no tienen una lectura este mes-calendario, así que
// en la práctica insiste cada 2 días hasta que el usuario responde, y después
// queda en silencio el resto del mes.
const MILEAGE_CRON_EXPR = "0 9 */2 * *";
// Bug real confirmado el 13-ago-2026: la versión anterior de este mensaje
// decía "preguntale... y guardalo con `registrar_kilometraje` en cuanto te
// responda" — pero esta sesión de cron es `sessionTarget: "isolated"`, de
// un solo turno: no existe forma de "esperar" la respuesta real del usuario
// dentro de esa misma ejecución, así que esa instrucción era estructuralmente
// imposible de cumplir bien. Cuando además falló el envío del mensaje
// (bug de cross-context messaging, ver openclawCron.ts), Quicks terminó
// inventando valores de kilometraje (17500 y 85000, números redondos) y
// guardándolos igual, dos veces, para "cumplir" la instrucción — 4 lecturas
// falsas creadas y borradas manualmente por el usuario. Esta versión solo
// pregunta; el guardado real tiene que pasar en una conversación normal
// cuando el usuario responda de verdad (esa sesión sí puede esperar la
// respuesta y sí tiene `registrar_kilometraje` disponible fuera de cron).
const MILEAGE_CRON_MESSAGE =
  "Es el aviso de kilometraje de Focusbrain (corre cada 2 días): usá `listar_vehiculos` para ver los " +
  "vehículos del usuario. Para cada uno, revisá con `listar_kilometrajes` si ya hay una lectura " +
  "registrada este mes-calendario (comparando la fecha de la más reciente contra el mes actual). Si ya " +
  "hay una lectura de este mes, no preguntes por ese vehículo — ya respondió. Si no hay ninguna lectura " +
  "de este mes, preguntale el kilometraje actual de ese vehículo — nada más. No llames " +
  "`registrar_kilometraje` en este turno bajo ninguna circunstancia, ni inventes un valor: no hay forma " +
  "de recibir la respuesta real del usuario dentro de esta misma ejecución. El guardado real pasa después, " +
  "en la conversación normal cuando el usuario responda. Si no tiene vehículos registrados, o todos ya " +
  "tienen lectura de este mes, no hace falta que digas nada.";

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
      // El mensaje le pide llamar estas tools de verdad, no solo relayar
      // texto — sin esto, la sesión de cron cae al set mínimo (cron/message/
      // web_search/web_fetch) y el job falla en silencio (bug real
      // confirmado 10-ago-2026, ver PENDIENTES.md). `registrar_kilometraje`
      // se sacó a propósito el 13-ago-2026: este cron nunca debe poder
      // guardar una lectura, solo consultarlas y preguntar — ver comentario
      // de MILEAGE_CRON_MESSAGE.
      brainfocusTools: ["listar_vehiculos", "listar_kilometrajes"],
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
