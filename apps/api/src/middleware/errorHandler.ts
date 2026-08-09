import type { NextFunction, Request, Response } from "express";

// PostgrestError (supabase-js) trae `code` (ej. "42501", "PGRST116") — son
// errores crudos de Postgres/PostgREST, no pensados para mostrarse a un
// caller externo (agente con API key incluido). Un Error normal lanzado a
// mano en el código de la app (ej. "No hay destinatario configurado para el
// canal...") sí es un mensaje pensado para que el caller lo vea, así que ese
// se deja pasar tal cual.
function isRawDbError(err: unknown): err is { code: string; message: string } {
  return typeof err === "object" && err !== null && "code" in err && typeof (err as any).code === "string";
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  if (isRawDbError(err)) {
    return res.status(500).json({ error: "Error interno" });
  }
  const message = err instanceof Error ? err.message : "Error interno";
  res.status(500).json({ error: message });
}
