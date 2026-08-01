import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Service-role client: úsalo SOLO server-side. Bypassa RLS a propósito —
// esta API es el único punto de entrada de confianza, y cada query filtra
// manualmente por user_id (ver services/resource.ts).
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
