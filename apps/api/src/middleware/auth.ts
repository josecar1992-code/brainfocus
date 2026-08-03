import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { env } from "../env.js";
import { supabaseAdmin } from "../supabaseClient.js";

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
      const { data, error } = await supabaseAdmin.auth.getUser(jwt);
      if (error || !data.user) return res.status(401).json({ error: "Token inválido" });

      const email = data.user.email?.toLowerCase();
      if (env.allowedEmails.length > 0 && (!email || !env.allowedEmails.includes(email))) {
        return res.status(403).json({ error: "Esta cuenta no tiene acceso a Focusbrain" });
      }

      req.auth = { type: "user", userId: data.user.id };
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

      if (error || !data) return res.status(401).json({ error: "API key inválida" });

      await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

      req.auth = { type: "agent", userId: data.user_id, apiKeyId: data.id, scopes: data.scopes ?? [] };
      return next();
    }

    return res.status(401).json({ error: "Falta autenticación (Bearer token o X-Api-Key)" });
  } catch (err) {
    next(err);
  }
}

/** El dueño (JWT) siempre pasa; un agente necesita el scope exacto o su comodín `<recurso>:*`. */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "No autenticado" });
    if (req.auth.type === "user") return next();

    const [resource] = scope.split(":");
    const hasScope = req.auth.scopes.includes(scope) || req.auth.scopes.includes(`${resource}:*`);
    if (!hasScope) return res.status(403).json({ error: `Falta el scope requerido: ${scope}` });
    next();
  };
}
