import type { NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { getProfileAccess } from "../services/profiles.js";
import { isModuleAllowed, moduleForResource } from "../utils/modules.js";

// Recursos que el asistente multiusuario puede tocar en nombre de un usuario. Quedan fuera
// 'consumos' (administración del servidor) y las API keys (solo las administra el dueño por JWT).
const ASSISTANT_SCOPES = [
  "tasks", "subtasks", "lists", "projects", "reminders", "recurring_reminders", "events", "notes",
  "documents", "nutrition", "exercise", "vehicles", "vehicle_maintenance", "vehicle_mileage",
  "routines", "routine_completions", "settings",
].map((r) => `${r}:*`);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceKeyMatches(provided: string): boolean {
  if (!env.assistantServiceKey) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.assistantServiceKey);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Resuelve la identidad de la petición: JWT de Supabase (usuario dueño, acceso total)
 * o API key de agente (X-Api-Key, con scopes acotados). Ninguna de las dos = 401.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  const apiKey = req.header("x-api-key");

  try {
    if (authHeader?.startsWith("Bearer ")) {
      const jwt = authHeader.slice("Bearer ".length);
      // getClaims() verifica la firma localmente con la clave pública (JWKS,
      // cacheada) — getUser() hacía un viaje a Supabase Auth en CADA petición
      // y ese endpoint tardaba 22-74s de forma intermitente (medido
      // 19-oct-2026), dejando la web en "Cargando..." eterno.
      const { data, error } = await supabaseAdmin.auth.getClaims(jwt);
      const userId = data?.claims?.sub;
      if (error || !userId) return res.status(401).json({ error: "Token inválido" });

      const email = typeof data.claims.email === "string" ? data.claims.email.toLowerCase() : undefined;
      // Entra quien está en ALLOWED_EMAILS (el dueño original) o quien tiene un
      // perfil con status 'active'. Un perfil 'blocked' bloquea incluso al que
      // esté en la lista. Sin ninguna de las dos, aunque Supabase le haya dejado
      // crear la cuenta, no tiene acceso.
      const inAllowlist = Boolean(email && env.allowedEmails.includes(email));
      const profile = await getProfileAccess(userId);
      if (profile?.status === "blocked" || !(inAllowlist || profile?.status === "active")) {
        return res.status(403).json({ error: "Esta cuenta no tiene acceso a Focusbrain" });
      }

      req.auth = { type: "user", userId, isAdmin: inAllowlist || Boolean(profile?.isAdmin), modules: profile?.modules ?? null };
      return next();
    }

    // Servicio-a-servicio (apps/assistant): el servicio ya identificó al usuario por su número de
    // WhatsApp y pide actuar en su nombre. Se acepta SOLO si: (1) la clave coincide, (2) la petición
    // no pasó por un proxy público (Caddy siempre agrega X-Forwarded-For; el servicio llama directo por
    // la red interna de Docker) y (3) el usuario existe con perfil 'active'.
    const serviceKey = req.header("x-service-key");
    if (serviceKey) {
      if (!serviceKeyMatches(serviceKey) || req.header("x-forwarded-for")) {
        return res.status(401).json({ error: "Credencial de servicio inválida" });
      }
      const onBehalfOf = req.header("x-on-behalf-of") ?? "";
      if (!UUID_RE.test(onBehalfOf)) return res.status(400).json({ error: "X-On-Behalf-Of inválido" });
      const profile = await getProfileAccess(onBehalfOf);
      if (!profile || profile.status !== "active") {
        return res.status(403).json({ error: "Esta cuenta no tiene acceso a Focusbrain" });
      }
      req.auth = {
        type: "agent",
        userId: onBehalfOf,
        apiKeyId: null,
        scopes: ASSISTANT_SCOPES,
        isAdmin: false,
        modules: profile.modules,
      };
      return next();
    }

    if (apiKey) {
      const keyHash = hashApiKey(apiKey);
      const { data, error } = await supabaseAdmin
        .from("api_keys")
        .select("id, user_id, scopes, revoked_at")
        .eq("key_hash", keyHash)
        .is("revoked_at", null)
        .maybeSingle();

      // `error` (la consulta a Supabase falló) y `!data` (la consulta funcionó
      // pero no hay fila para esa key) son casos muy distintos — antes se
      // devolvían los dos como el mismo 401 "API key inválida", lo cual le
      // hizo creer a Quicks que su key había sido revocada cuando en
      // realidad fue un fallo transitorio de la consulta (confirmado
      // 03-sep-2026: la misma key, en la llamada inmediatamente siguiente un
      // segundo después, funcionó sin problema — ver PENDIENTES.md). Un
      // error real de consulta no dice nada sobre si la key es válida, así
      // que no debe reportarse como 401.
      if (error) {
        console.error("[auth] fallo consultando api_keys (posible error transitorio, no confundir con key inválida):", error.message);
        return res.status(503).json({ error: "Error temporal validando la API key, reintentá" });
      }
      if (!data) return res.status(401).json({ error: "API key inválida" });

      // Sin await: es solo informativo y una escritura colgada (ver
      // supabaseClient.ts) no debe frenar la petición real.
      void supabaseAdmin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id)
        .then(({ error: updateError }) => {
          if (updateError) console.warn("[auth] no se pudo actualizar last_used_at:", updateError.message);
        });

      // La key actúa en nombre de su dueño: si ese usuario fue bloqueado o aún no
      // está activo, la key deja de servir. Sin fila de perfil (instalación de un
      // solo dueño, o migración multiusuario sin correr) se mantiene el
      // comportamiento anterior: acceso completo del dueño.
      const profile = await getProfileAccess(data.user_id);
      if (profile && profile.status !== "active") {
        return res.status(403).json({ error: "Esta cuenta no tiene acceso a Focusbrain" });
      }

      req.auth = {
        type: "agent",
        userId: data.user_id,
        apiKeyId: data.id,
        scopes: data.scopes ?? [],
        isAdmin: profile ? profile.isAdmin : true,
        modules: profile?.modules ?? null,
      };
      return next();
    }

    return res.status(401).json({ error: "Falta autenticación (Bearer token o X-Api-Key)" });
  } catch (err) {
    next(err);
  }
}

/**
 * Dos comprobaciones: (1) el módulo del recurso está habilitado para este usuario
 * (aplica a usuarios y a sus agentes), y (2) para un agente, el scope exacto o su
 * comodín `<recurso>:*`. El dueño por JWT no necesita scope, solo el módulo.
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "No autenticado" });

    const [resource] = scope.split(":");
    const moduleKey = moduleForResource(resource);
    if (moduleKey && !isModuleAllowed(req.auth.modules, moduleKey)) {
      return res.status(403).json({ error: `Módulo no habilitado para esta cuenta: ${moduleKey}` });
    }

    if (req.auth.type === "user") return next();

    const hasScope = req.auth.scopes.includes(scope) || req.auth.scopes.includes(`${resource}:*`);
    if (!hasScope) return res.status(403).json({ error: `Falta el scope requerido: ${scope}` });
    next();
  };
}

/** Recursos de operación del servidor (ej. Consumos) que solo ve el administrador. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "No autenticado" });
  if (!req.auth.isAdmin) return res.status(403).json({ error: "Solo el administrador puede acceder a este recurso" });
  next();
}
