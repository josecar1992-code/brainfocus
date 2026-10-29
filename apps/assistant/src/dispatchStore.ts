import { createClient } from "@supabase/supabase-js";
import { WINDOW_MS, KEEPALIVE_AFTER_MS, type DispatchStore, type DueJob } from "./dispatcher.js";
import { dueOccurrence, mileageOccurrence, type RecurringRow } from "./occurrence.js";

// Instrucciones que ve el agente cuando un aviso programado le toca ejecutarse (no hay mensaje del usuario).
const AGENT_JOB_PREFIX = "[Tarea programada por el usuario, ejecutala ahora y respondele con el resultado]: ";
// Mismo contenido que MILEAGE_CRON_MESSAGE de la API: solo pregunta, nunca guarda ni inventa una lectura.
const MILEAGE_PROMPT =
  "[Aviso de kilometraje, corre cada 2 días] Usá listar_vehiculos para ver los vehículos del usuario. Para cada uno, " +
  "revisá con listar_kilometrajes si ya hay una lectura de este mes-calendario. Si ya hay, no preguntes por ese vehículo. " +
  "Si no hay ninguna de este mes, preguntale el kilometraje actual de ese vehículo, nada más. No llames " +
  "registrar_kilometraje en este turno ni inventes un valor: se guarda después, cuando el usuario responda. Si no " +
  "tiene vehículos o todos tienen lectura de este mes, respondé exactamente: NADA";

// Service role: salta RLS, así que cada consulta filtra por user_id explícitamente.
export function createDispatchStore(url: string, serviceRoleKey: string): DispatchStore {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  const ms = (v: unknown) => (typeof v === "string" ? new Date(v).getTime() : null);
  const iso = (n: number) => new Date(n).toISOString();

  return {
    async dueUsers(nowMs) {
      // cron_job_id null = no lo maneja OpenClaw (los del dueño tienen cron y se entregan por ahí).
      const { data: due, error } = await db
        .from("reminders")
        .select("id, user_id, title, remind_at")
        .is("sent_at", null)
        .is("cron_job_id", null)
        .lte("remind_at", iso(nowMs))
        .order("remind_at", { ascending: true })
        .limit(500);
      check(error);

      const { data: rec, error: rErr } = await db
        .from("recurring_reminders")
        .select("id, user_id, title, schedule_type, scheduled_at, is_instruction, frequency, interval_hours, time_of_day, day_of_week, active, created_at, last_fired_at")
        .is("cron_job_id", null)
        .limit(1000);
      check(rErr);

      const { data: mil, error: mErr } = await db
        .from("profiles")
        .select("id, mileage_reminder_last_fired_at")
        .eq("mileage_reminder_enabled", true)
        .is("mileage_reminder_cron_id", null);
      check(mErr);

      const jobsByUser = new Map<string, DueJob[]>();
      const push = (userId: string, job: DueJob) => jobsByUser.set(userId, [...(jobsByUser.get(userId) ?? []), job]);
      for (const r of (rec ?? []) as Array<RecurringRow & { user_id: string }>) {
        const occ = dueOccurrence(r, nowMs);
        if (occ === null) continue;
        push(r.user_id, {
          source: "recurring",
          id: r.id,
          kind: r.is_instruction ? "agent" : "text",
          label: r.title,
          prompt: AGENT_JOB_PREFIX + r.title,
          dueAt: iso(occ),
          prevFired: r.last_fired_at,
        });
      }
      // Sin vehículos no hay nada que preguntar: no se gasta ni una plantilla.
      const milIds = (mil ?? []).map((p) => p.id as string);
      const { data: veh, error: vErr } = milIds.length
        ? await db.from("vehicles").select("user_id").in("user_id", milIds)
        : { data: [], error: null };
      check(vErr);
      const withVehicles = new Set((veh ?? []).map((v) => v.user_id as string));
      for (const p of (mil ?? []).filter((p) => withVehicles.has(p.id as string))) {
        const occ = mileageOccurrence(nowMs, (p.mileage_reminder_last_fired_at as string | null) ?? null);
        if (occ === null) continue;
        push(p.id as string, {
          source: "mileage",
          id: p.id as string,
          kind: "agent",
          label: "Kilometraje de tus vehículos",
          prompt: MILEAGE_PROMPT,
          dueAt: iso(occ),
          prevFired: (p.mileage_reminder_last_fired_at as string | null) ?? null,
        });
      }

      const ids = [...new Set([...(due ?? []).map((r) => r.user_id as string), ...jobsByUser.keys()])];
      if (!ids.length) return [];
      const { data: profiles, error: pErr } = await db
        .from("profiles")
        .select("id, whatsapp_phone, whatsapp_last_inbound_at, whatsapp_template_sent_at")
        .in("id", ids)
        .eq("status", "active")
        .not("whatsapp_phone", "is", null);
      check(pErr);

      return (profiles ?? []).map((p) => ({
        userId: p.id as string,
        phone: p.whatsapp_phone as string,
        lastInboundAt: ms(p.whatsapp_last_inbound_at),
        templateSentAt: ms(p.whatsapp_template_sent_at),
        reminders: (due ?? [])
          .filter((r) => r.user_id === p.id)
          .map((r) => ({ id: r.id as string, title: r.title as string, remindAt: r.remind_at as string })),
        jobs: jobsByUser.get(p.id as string) ?? [],
      }));
    },

    async claimJob(job, userId) {
      // Solo avanza si nadie más lo tomó: last_fired_at debe seguir siendo el valor que se leyó.
      const q = job.source === "mileage"
        ? db.from("profiles").update({ mileage_reminder_last_fired_at: job.dueAt }).eq("id", userId)
        : db.from("recurring_reminders").update({ last_fired_at: job.dueAt }).eq("id", job.id).eq("user_id", userId);
      const col = job.source === "mileage" ? "mileage_reminder_last_fired_at" : "last_fired_at";
      const { data, error } = await (job.prevFired === null ? q.is(col, null) : q.eq(col, job.prevFired)).select("id");
      check(error);
      return (data?.length ?? 0) > 0;
    },

    async releaseJob(job, userId) {
      const q = job.source === "mileage"
        ? db.from("profiles").update({ mileage_reminder_last_fired_at: job.prevFired }).eq("id", userId)
        : db.from("recurring_reminders").update({ last_fired_at: job.prevFired }).eq("id", job.id).eq("user_id", userId);
      check((await q).error);
    },

    async claimReminder(id, userId, nowMs) {
      const { data, error } = await db
        .from("reminders")
        .update({ sent_at: iso(nowMs) })
        .eq("id", id)
        .eq("user_id", userId)
        .is("sent_at", null)
        .select("id");
      check(error);
      return (data?.length ?? 0) > 0;
    },

    async releaseReminder(id, userId) {
      check((await db.from("reminders").update({ sent_at: null }).eq("id", id).eq("user_id", userId)).error);
    },

    async markTemplateSent(userId, nowMs) {
      check((await db.from("profiles").update({ whatsapp_template_sent_at: iso(nowMs) }).eq("id", userId)).error);
    },

    async keepaliveCandidates(nowMs) {
      const { data, error } = await db
        .from("profiles")
        .select("id, whatsapp_phone, whatsapp_last_inbound_at, whatsapp_keepalive_sent_at")
        .eq("status", "active")
        .not("whatsapp_phone", "is", null)
        .gt("whatsapp_last_inbound_at", iso(nowMs - WINDOW_MS))
        .lte("whatsapp_last_inbound_at", iso(nowMs - KEEPALIVE_AFTER_MS));
      check(error);
      return (data ?? [])
        .filter((p) => {
          const last = ms(p.whatsapp_last_inbound_at)!;
          const sent = ms(p.whatsapp_keepalive_sent_at);
          return sent === null || sent < last; // un solo aviso por ventana
        })
        .map((p) => ({ userId: p.id as string, phone: p.whatsapp_phone as string, lastInboundAt: ms(p.whatsapp_last_inbound_at)! }));
    },

    async markKeepaliveSent(userId, nowMs) {
      check((await db.from("profiles").update({ whatsapp_keepalive_sent_at: iso(nowMs) }).eq("id", userId)).error);
    },
  };
}
