import { createClient } from "@supabase/supabase-js";
import { normalizePhone } from "./kapso/webhook.js";
import type { Store } from "./handler.js";

// Service role: salta RLS, así que TODA consulta filtra por user_id explícitamente.
export function createStore(url: string, serviceRoleKey: string): Store {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  return {
    async lookupUser(phone) {
      const { data, error } = await db.from("profiles").select("id, status").eq("whatsapp_phone", normalizePhone(phone) ?? phone).maybeSingle();
      check(error);
      return data ? { userId: data.id as string, status: data.status as string } : null;
    },

    async enabledModules(userId) {
      const { data, error } = await db.from("profiles").select("enabled_modules").eq("id", userId).maybeSingle();
      check(error);
      return (data?.enabled_modules as string[] | null | undefined) ?? null;
    },

    async dailyMessageLimit(userId) {
      const { data, error } = await db.from("profiles").select("daily_message_limit").eq("id", userId).maybeSingle();
      check(error);
      return (data?.daily_message_limit as number | null | undefined) ?? null;
    },

    async displayName(userId) {
      const { data, error } = await db.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      check(error);
      return (data?.display_name as string | null | undefined) ?? null;
    },

    async setDisplayName(userId, name) {
      check((await db.from("profiles").update({ display_name: name }).eq("id", userId)).error);
    },

    async countUserMessagesSince(userId, sinceIso) {
      const { count, error } = await db
        .from("assistant_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user")
        .gte("created_at", sinceIso);
      check(error);
      return count ?? 0;
    },

    async saveUserMessage(userId, content, waMessageId) {
      const { error } = await db.from("assistant_messages").insert({ user_id: userId, role: "user", content, wa_message_id: waMessageId });
      if (error?.code === "23505") return false;
      check(error);
      return true;
    },

    async saveAssistantMessage(userId, content) {
      check((await db.from("assistant_messages").insert({ user_id: userId, role: "assistant", content })).error);
    },

    async history(userId, limit) {
      const { data, error } = await db
        .from("assistant_messages")
        .select("role, content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      check(error);
      return (data ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));
    },

    async logUsage(userId, model, usage) {
      check(
        (
          await db.from("assistant_usage").insert({
            user_id: userId,
            model,
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            llm_calls: usage.llmCalls,
          })
        ).error,
      );
    },

    async touchInbound(userId, atMs) {
      check((await db.from("profiles").update({ whatsapp_last_inbound_at: new Date(atMs).toISOString() }).eq("id", userId)).error);
    },
  };
}
