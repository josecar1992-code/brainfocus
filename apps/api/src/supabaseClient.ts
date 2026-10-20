import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Desde el VPS, ~10% de las llamadas a Supabase (cualquier tabla/endpoint) se
// quedaban colgadas entre 7 y 108 s sin error (medido 20-oct-2026; `curl` al
// mismo host siempre responde en <150 ms, no es IPv6 ni DNS). Un timeout corto
// aborta la conexión trabada y el reintento abre una conexión nueva, que sí
// responde. Solo se reintentan GET/HEAD (idempotentes); las escrituras solo
// llevan un timeout más largo, sin reintento, para no arriesgar duplicados.
const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 20000;
const READ_ATTEMPTS = 3;

async function resilientFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const attempts = isRead ? READ_ATTEMPTS : 1;
  const timeoutMs = isRead ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;

  for (let attempt = 1; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await fetch(input, { ...init, signal });
    } catch (err) {
      if (init.signal?.aborted || attempt >= attempts) throw err;
      console.warn(`[supabase] ${method} sin respuesta en ${timeoutMs}ms, reintento ${attempt}/${attempts - 1}`);
    }
  }
}

// Service-role client: úsalo SOLO server-side. Bypassa RLS a propósito —
// esta API es el único punto de entrada de confianza, y cada query filtra
// manualmente por user_id (ver services/resource.ts).
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: resilientFetch },
});
