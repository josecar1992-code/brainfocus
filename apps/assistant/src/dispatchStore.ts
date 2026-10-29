import { createClient } from "@supabase/supabase-js";
import { WINDOW_MS, KEEPALIVE_AFTER_MS, type DispatchStore } from "./dispatcher.js";

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
      if (!due?.length) return [];

      const ids = [...new Set(due.map((r) => r.user_id as string))];
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
        reminders: due
          .filter((r) => r.user_id === p.id)
          .map((r) => ({ id: r.id as string, title: r.title as string, remindAt: r.remind_at as string })),
      }));
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
