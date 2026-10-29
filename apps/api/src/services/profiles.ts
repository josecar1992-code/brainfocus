import { supabaseAdmin } from "../supabaseClient.js";

export interface ProfileAccess {
  status: "pending" | "active" | "blocked";
  isAdmin: boolean;
  modules: string[] | null;
}

// El perfil se consulta en cada petición autenticada; un caché corto evita un
// viaje a Supabase por request. Un usuario bloqueado deja de entrar como
// máximo CACHE_TTL_MS después (o al instante si se llama invalidateProfileAccess).
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: ProfileAccess | null }>();

export function invalidateProfileAccess(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * Perfil de acceso del usuario, o null si no existe fila o no se pudo leer
 * (ej. la migración multiusuario aún no se corrió). null = "sin datos", y el
 * llamador decide: el dueño original sigue entrando por ALLOWED_EMAILS.
 */
export async function getProfileAccess(userId: string): Promise<ProfileAccess | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("status, is_admin, enabled_modules")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[profiles] no se pudo leer el perfil de acceso:", error.message);
    return null; // no se cachea un error
  }

  const value: ProfileAccess | null = data
    ? {
        status: data.status,
        isAdmin: Boolean(data.is_admin),
        modules: Array.isArray(data.enabled_modules) ? data.enabled_modules : null,
      }
    : null;
  cache.set(userId, { at: Date.now(), value });
  return value;
}
