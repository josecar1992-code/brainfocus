import { supabaseAdmin } from "../supabaseClient.js";
import type { AuthContext } from "../types/auth.js";

export async function logAgentAction(
  auth: AuthContext,
  action: string,
  resourceTable: string,
  resourceId: string | null,
  payload: unknown,
) {
  if (auth.type !== "agent") return; // solo se audita lo que hace un agente, no al dueño
  await supabaseAdmin.from("agent_actions").insert({
    user_id: auth.userId,
    api_key_id: auth.apiKeyId,
    action,
    resource_table: resourceTable,
    resource_id: resourceId,
    payload,
  });
}
